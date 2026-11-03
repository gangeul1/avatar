const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'targets.json');

// =========================
// ENV
// =========================
function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;

  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;

    const i = s.indexOf('=');
    if (i < 0) continue;

    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim();

    if (!(k in process.env)) {
      process.env[k] = v;
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 3030);
const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

// =========================
// LIVEKIT CONNECTION (development only)
// Keys remain on this server and are never sent to the browser.
// =========================
const livekitTokenLimits = new Map();
const livekitServerUrl = process.env.LIVEKIT_URL || '';

function isLivekitConfigured() {
  try {
    const u = new URL(livekitServerUrl);
    return (
      u.protocol === 'wss:' &&
      Boolean(u.hostname) &&
      Boolean(process.env.LIVEKIT_API_KEY) &&
      Boolean(process.env.LIVEKIT_API_SECRET)
    );
  } catch {
    return false;
  }
}

function safeLivekitRequest(req) {
  // Development server: accept only direct local/private-network clients.
  // Do NOT expose the HTTP server to the public internet without authentication.
  const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const privateIp = /^(127\.|10\.|192\.168\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i;
  const is172Private = /^172\.(1[6-9]|2[0-9]|3[01])\./.test(remote);
  if (!privateIp.test(remote) && !is172Private) return false;

  if (!req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function withinLivekitTokenLimit(req) {
  const remote = String(req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const previous = livekitTokenLimits.get(remote) || [];
  const recent = previous.filter(t => now - t < 5 * 60 * 1000);
  if (recent.length >= 8) {
    livekitTokenLimits.set(remote, recent);
    return false;
  }
  recent.push(now);
  livekitTokenLimits.set(remote, recent);
  if (livekitTokenLimits.size > 1000) livekitTokenLimits.clear();
  return true;
}

async function issueLivekitToken(targetId = null) {
  // The server SDK is ESM-compatible; dynamic import also works in this CJS server.
  const { AccessToken } = await import('livekit-server-sdk');
  const { randomUUID } = require('node:crypto');
  // The target ID is an opaque lookup hint, not the target's name or memories.
  // The worker loads the actual profile locally (never embedded in the token).
  const room = targetId
    ? `target-${targetId}-${randomUUID()}`
    : `avatar-${randomUUID()}`;
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: `user-${randomUUID()}`, name: '영상통화 이용자', ttl: '10m' }
  );
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return {
    server_url: livekitServerUrl,
    participant_token: await token.toJwt(),
    room
  };
}

// =========================
// COMMON
// =========================
function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(body));
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', chunk => {
      total += chunk.length;

      if (total > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

// =========================
// TARGET DATABASE
// =========================
function getTargets() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveTargets(targets) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(targets, null, 2),
    'utf8'
  );
}

function sanitizeTarget(t) {
  return {
    id: String(t.id || Date.now()),

    name: String(t.name || '대상'),

    relation: String(t.relation || ''),

    personality: String(t.personality || ''),

    voice: String(
      t.voice ||
      '부드러운 목소리'
    ),

    memories: Array.isArray(t.memories)
      ? t.memories
          .slice(0, 100)
          .map(String)
      : [],

    photo:
      typeof t.photo === 'string'
        ? t.photo
        : '',

    createdAt:
      t.createdAt ||
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString()
  };
}

// =========================
// FALLBACK
// =========================
function fallbackReply(target, userText) {
  const memory =
    target?.memories?.length
      ? target.memories[0]
      : '';

  let text = `응, "${userText}"라고 했구나.`;

  if (memory) {
    text += ` 전에 이야기해준 "${memory}"도 생각나네.`;
  }

  text += ` 조금 더 이야기해줄래?`;

  return {
    text,
    emotion: 'warm',
    intensity: 0.35,
    ai: false
  };
}

// =========================
// OPENAI
// =========================
async function aiReply(
  target,
  userText,
  history = []
) {
  if (!API_KEY) {
    return fallbackReply(
      target,
      userText
    );
  }

  const profile = {
    name: target?.name || '',
    relation:
      target?.relation || '',
    personality:
      target?.personality || '',
    memories:
      target?.memories || []
  };

  const recent = history
    .slice(-12)
    .map(item => {
      const speaker =
        item.role === 'user'
          ? '사용자'
          : '아바타';

      return `${speaker}: ${item.text}`;
    })
    .join('\n');

  const instructions = `
너는 사용자가 직접 설정한
맞춤형 AI 아바타다.

[대상 데이터]
${JSON.stringify(profile, null, 2)}

가장 중요한 목표는
"AI처럼 설명하는 것"이 아니라
실제 해당 인물과 영상통화하는 것처럼
자연스럽게 대화하는 것이다.

규칙:

1.
대상 데이터와 현재 대화에서
확인된 사실만 인물의 사실로 사용한다.

존재하지 않는 과거,
사건,
추억을 임의로 만들어내지 않는다.

2.
관계, 성격, 말투,
기억과 구체적인 에피소드를
자연스럽게 반영한다.

단,
"나는 너에게 배우자로 설정되어 있어"
"내 설정에 따르면"
같이 AI 설정을 직접 설명하는 말은
절대 하지 않는다.

3.
실제 영상통화처럼 대답한다.

너무 길게 설명하지 않는다.

대부분 1~3문장으로
짧고 자연스럽게 말한다.

4.
상대가 한 말을
매번 그대로 반복하지 않는다.

"그렇구나",
"많이 힘들었겠다"
같은 표현도
기계적으로 반복하지 않는다.

5.
성격 데이터가 있다면
말투와 반응 방식에 자연스럽게 반영한다.

6.
저장된 기억은
관련 있는 상황에서만 사용한다.

억지로 매번 꺼내지 않는다.

7.
사용자의 감정을
임의로 단정하지 않는다.

필요하면 자연스럽게 질문한다.

8.
심리극이나 역할 대화가 필요한 경우에도
사용자가 제공한 상황과 데이터의
범위 안에서만 역할을 수행한다.

9.
치료 효과를 주장하거나
의료적 진단을 하지 않는다.

10.
한국어로 대화한다.

대상의 관계, 성격, 저장된 기억과
현재까지의 대화 맥락을 바탕으로
실제 그 사람이 사용할 법한 말투로 대화한다.

특히 존댓말과 반말을 임의로 바꾸지 않는다.

현재 대화에서 사용하던 높임말 수준을
최우선으로 유지한다.

가족, 형제, 친구, 연인처럼
일반적으로 친밀한 관계이고
기존 대화가 반말이라면 계속 자연스러운 반말을 사용한다.

사용자가 반말로 말한다고 해서
무조건 반말을 따라 하는 것이 아니라,
설정된 관계와 지금까지 형성된 말투를 기준으로 판단한다.

"말씀해주세요",
"이야기해주실래요?",
"도와드릴까요?",
"그렇게 느끼셨군요"
같은 상담사, 고객센터, AI 비서식 표현을
습관적으로 사용하지 않는다.

실제 영상통화 중인 사람처럼
짧고 구어체로 반응한다.

불필요하게 사용자의 말을 요약하거나
감정을 분석해서 설명하지 않는다.

매 답변마다 질문으로 끝내지 않는다.

저장된 성격과 관계가 허용하는 범위에서
농담, 장난, 맞장구, 짧은 반응,
말버릇 등을 자연스럽게 섞는다.

11.
답변의 감정도 판단한다.

emotion은 다음 중 하나다.

neutral
warm
happy
calm
concerned
sad
surprised
playful

intensity는
감정 표현의 강도를
0부터 1 사이 숫자로 나타낸다.

과장된 감정은 피하고
실제 영상통화처럼 자연스럽게 설정한다.
`.trim();

  const input = `
${recent
  ? `[최근 대화]
${recent}

`
  : ''}[현재 사용자 발화]
${userText}
`.trim();

  const response = await fetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${API_KEY}`,

        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        model: MODEL,

        instructions,

        input,

        max_output_tokens: 250,

        text: {
          format: {
            type: 'json_schema',

            name: 'avatar_response',

            strict: true,

            schema: {
              type: 'object',

              properties: {
                text: {
                  type: 'string'
                },

                emotion: {
                  type: 'string',
                  enum: [
                    'neutral',
                    'warm',
                    'happy',
                    'calm',
                    'concerned',
                    'sad',
                    'surprised',
                    'playful'
                  ]
                },

                intensity: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1
                }
              },

              required: [
                'text',
                'emotion',
                'intensity'
              ],

              additionalProperties: false
            }
          }
        }
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenAI error ${response.status}`
    );
  }

  let raw =
    data.output_text || '';

  if (
    !raw &&
    Array.isArray(data.output)
  ) {
    for (
      const item of data.output
    ) {
      if (
        !Array.isArray(
          item.content
        )
      ) {
        continue;
      }

      for (
        const part of item.content
      ) {
        if (
          part.type ===
            'output_text' &&
          part.text
        ) {
          raw += part.text;
        }
      }
    }
  }

  if (!raw) {
    throw new Error(
      'OpenAI 응답 텍스트 없음'
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'AI 응답 JSON 해석 실패'
    );
  }

  return {
    text:
      String(
        parsed.text || ''
      ).trim(),

    emotion:
      String(
        parsed.emotion ||
        'neutral'
      ),

    intensity:
      Number.isFinite(
        Number(parsed.intensity)
      )
        ? Math.min(
            1,
            Math.max(
              0,
              Number(
                parsed.intensity
              )
            )
          )
        : 0.3,

    ai: true
  };
}

// =========================
// STATIC FILES
// =========================
function serveStatic(
  req,
  res,
  pathname
) {
 let rel =
  pathname === '/'
    ? 'index.html'
    : pathname.replace(/^\/+/, '');

  rel = path
    .normalize(rel)
    .replace(
      /^([.][.][/\\])+/,
      ''
    );

  const file =
    path.join(
      PUBLIC,
      rel
    );

  if (
    !file.startsWith(PUBLIC)
  ) {
    return false;
  }

  if (
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    return false;
  }

  const ext =
    path
      .extname(file)
      .toLowerCase();

  const types = {
    '.html':
      'text/html; charset=utf-8',

    '.js':
      'application/javascript; charset=utf-8',

    '.css':
      'text/css; charset=utf-8',

    '.json':
      'application/json; charset=utf-8',

    '.png':
      'image/png',

    '.jpg':
      'image/jpeg',

    '.jpeg':
      'image/jpeg',

'.svg':
  'image/svg+xml',

'.mp4':
  'video/mp4',

'.webmanifest':
  'application/manifest+json; charset=utf-8'
  };

  res.writeHead(200, {
    'Content-Type':
      types[ext] ||
      'application/octet-stream',

    'Cache-Control':
      'no-store'
  });

  fs
    .createReadStream(file)
    .pipe(res);

  return true;
}

// =========================
// SERVER
// =========================
const server =
  http.createServer(
    async (req, res) => {
      try {
        const u =
          new URL(
            req.url,
            `http://${
              req.headers.host ||
              'localhost'
            }`
          );

        const p =
          u.pathname;

        // STATUS
        if (
          p === '/api/status' &&
          req.method === 'GET'
        ) {
          return json(
            res,
            200,
            {
              ok: true,

              ai:
                Boolean(API_KEY),

              model:
                API_KEY
                  ? MODEL
                  : null
            }
          );
        }

        // LiveKit configuration check: returns booleans, NEVER private keys.
        if (p === '/api/livekit/status' && req.method === 'GET') {
          return json(res, 200, {
            configured: isLivekitConfigured(),
            lemonslice_key_present: Boolean(process.env.LEMONSLICE_API_KEY),
            note: 'Video agent not started yet; this endpoint checks configuration only.'
          });
        }

        // Development token endpoint. No change to current /api/chat flow.
        if (p === '/api/livekit/token' && req.method === 'POST') {
          if (!safeLivekitRequest(req)) {
            return json(res, 403, { error: 'Local, same-origin requests only.' });
          }
          if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
            return json(res, 415, { error: 'Content-Type must be application/json.' });
          }
          if (!isLivekitConfigured()) {
            return json(res, 503, { error: 'LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET settings are missing or invalid.' });
          }
          if (!withinLivekitTokenLimit(req)) {
            return json(res, 429, { error: 'Too many attempts. Wait a few minutes.' });
          }
          // Browser sends only the existing target ID. Never accept an arbitrary
          // photo, persona or voice key in this token endpoint.
          let targetId = null;
          try {
            const raw = await readBody(req, 8192);
            const body = JSON.parse(raw || '{}');
            if (body.target_id !== undefined && body.target_id !== null) {
              targetId = String(body.target_id);
              if (!/^\d{10,20}$/.test(targetId)) {
                return json(res, 400, { error: '잘못된 대상 ID입니다.' });
              }
              const target = getTargets().find(t => String(t.id) === targetId);
              if (!target) {
                return json(res, 404, { error: '저장된 대상을 찾을 수 없습니다.' });
              }
              if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(target.photo || '')) {
                return json(res, 422, { error: '대상 사진은 JPG, PNG 또는 WebP 형식으로 등록해주세요.' });
              }
            }
          } catch (e) {
            return json(res, 400, { error: '요청을 확인할 수 없습니다.' });
          }
          try {
            return json(res, 200, await issueLivekitToken(targetId));
          } catch (e) {
            console.error('LIVEKIT TOKEN ERROR:', e.message);
            return json(res, 500, { error: 'Could not create LiveKit token.' });
          }
        }

        // TARGET LIST
        if (
          p === '/api/targets' &&
          req.method === 'GET'
        ) {
          return json(
            res,
            200,
            {
              targets:
                getTargets()
            }
          );
        }

        // CREATE TARGET
        if (
          p === '/api/targets' &&
          req.method === 'POST'
        ) {
          const raw =
            await readBody(req);

          const body =
            JSON.parse(
              raw || '{}'
            );

          const targets =
            getTargets();

          const target =
            sanitizeTarget({
              ...body,

              id:
                Date.now()
                  .toString()
            });

          targets.push(target);

          saveTargets(targets);

          return json(
            res,
            201,
            { target }
          );
        }

        // UPDATE TARGET
        if (
          p.startsWith(
            '/api/targets/'
          ) &&
          req.method === 'PUT'
        ) {
          const id =
            decodeURIComponent(
              p
                .split('/')
                .pop()
            );

          const raw =
            await readBody(req);

          const body =
            JSON.parse(
              raw || '{}'
            );

          const targets =
            getTargets();

          const i =
            targets.findIndex(
              t =>
                String(t.id) ===
                id
            );

          if (i < 0) {
            return json(
              res,
              404,
              {
                error:
                  '대상을 찾을 수 없습니다.'
              }
            );
          }

          targets[i] =
            sanitizeTarget({
              ...targets[i],
              ...body,
              id
            });

          saveTargets(targets);

          return json(
            res,
            200,
            {
              target:
                targets[i]
            }
          );
        }

        // CHAT
        if (
          p === '/api/chat' &&
          req.method === 'POST'
        ) {
          // 사진은 이제
          // app.js에서 보내지 않으므로
          // 512KB면 충분하다.
          const raw =
            await readBody(
              req,
              512 * 1024
            );

          const body =
            JSON.parse(
              raw || '{}'
            );

          const target =
            body.target || {};

          const userText =
            String(
              body.text || ''
            ).trim();

          const history =
            Array.isArray(
              body.history
            )
              ? body.history
              : [];

          if (!userText) {
            return json(
              res,
              400,
              {
                error:
                  '말한 내용을 입력해주세요.'
              }
            );
          }

          try {
            const reply =
              await aiReply(
                target,
                userText,
                history
              );

            return json(
              res,
              200,
              reply
            );
          } catch (e) {
            console.error(
              'OPENAI ERROR:',
              e.message
            );

            const fallback =
              fallbackReply(
                target,
                userText
              );

            return json(
              res,
              200,
              {
                ...fallback,

                warning:
                  e.message
              }
            );
          }
        }

        // STATIC
        if (
          serveStatic(
            req,
            res,
            p
          )
        ) {
          return;
        }

        return json(
          res,
          404,
          {
            error:
              'Not found'
          }
        );
      } catch (e) {
        console.error(
          'SERVER ERROR:',
          e
        );

        return json(
          res,
          500,
          {
            error:
              e.message ||
              'server error'
          }
        );
      }
    }
  );

// =========================
// START
// =========================
server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `설계도 VER.1 앱 실행: http://127.0.0.1:${PORT}`
    );

    console.log(
      API_KEY
        ? `AI mode ON - ${MODEL}`
        : 'AI mode OFF - 로컬 데모 모드'
    );

    console.log(
      '종료: Ctrl+C'
    );
  }
);