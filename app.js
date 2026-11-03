const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const screens = $$('.screen');

let targets = [];

let draft = {
  photo: '',
  name: '',
  voice: '부드러운 목소리',
  relation: '',
  personality: '',
  memories: []
};

let currentTarget = null;
let history = [];

let listening = false;
let recognition = null;
let memoryRecognition = null;

let currentEmotion = 'neutral';
let currentIntensity = 0.3;


// =====================================
// RUNTIME STYLE
// =====================================

function installRuntimeStyles() {
  if ($('#avatarRuntimeStyle')) return;

  const style = document.createElement('style');

  style.id = 'avatarRuntimeStyle';

  style.textContent = `
    .avatarArea img {
      transition:
        filter .7s ease,
        transform .7s ease,
        opacity .5s ease;
      will-change: transform, filter;
    }

    .avatarArea.idle img {
      animation: avatarIdle 7s ease-in-out infinite !important;
    }

    .avatarArea.talking img {
      animation: avatarTalk 1.15s ease-in-out infinite !important;
    }

    .avatarArea.connecting img {
      animation: avatarConnect .9s ease-out both !important;
    }

    @keyframes avatarIdle {
      0% {
        transform:
          scale(1.030)
          translate3d(0,0,0);
      }

      30% {
        transform:
          scale(1.035)
          translate3d(-1px,-2px,0);
      }

      65% {
        transform:
          scale(1.032)
          translate3d(1px,1px,0);
      }

      100% {
        transform:
          scale(1.030)
          translate3d(0,0,0);
      }
    }

    @keyframes avatarTalk {
      0% {
        transform:
          scale(1.034)
          translate3d(0,0,0);
      }

      20% {
        transform:
          scale(1.041)
          translate3d(-1px,-2px,0);
      }

      42% {
        transform:
          scale(1.037)
          translate3d(1px,0,0);
      }

      64% {
        transform:
          scale(1.043)
          translate3d(0,-3px,0);
      }

      82% {
        transform:
          scale(1.038)
          translate3d(-1px,-1px,0);
      }

      100% {
        transform:
          scale(1.034)
          translate3d(0,0,0);
      }
    }

    @keyframes avatarConnect {
      from {
        opacity: .15;
        filter: blur(8px);
        transform: scale(1.08);
      }

      to {
        opacity: 1;
        filter: blur(0);
        transform: scale(1.03);
      }
    }

    .avatarArea.emotion-neutral img {
      filter:
        saturate(.95)
        brightness(1)
        contrast(1);
    }

    .avatarArea.emotion-warm img {
      filter:
        saturate(1.04)
        brightness(1.035)
        contrast(.98)
        sepia(.035);
    }

    .avatarArea.emotion-happy img {
      filter:
        saturate(1.10)
        brightness(1.055)
        contrast(1.01);
    }

    .avatarArea.emotion-calm img {
      filter:
        saturate(.92)
        brightness(1.015)
        contrast(.96);
    }

    .avatarArea.emotion-concerned img {
      filter:
        saturate(.88)
        brightness(.985)
        contrast(1.025);
    }

    .avatarArea.emotion-sad img {
      filter:
        saturate(.76)
        brightness(.94)
        contrast(.98);
    }

    .avatarArea.emotion-surprised img {
      filter:
        saturate(1.08)
        brightness(1.06)
        contrast(1.035);
    }

    .avatarArea.emotion-playful img {
      filter:
        saturate(1.12)
        brightness(1.035)
        contrast(1.02);
    }

    .avatarArea::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      transition: background .7s ease;
      background: transparent;
    }

    .avatarArea.emotion-warm::after {
      background:
        radial-gradient(
          circle at 50% 40%,
          rgba(255,220,185,.045),
          transparent 58%
        );
    }

    .avatarArea.emotion-happy::after,
    .avatarArea.emotion-playful::after {
      background:
        radial-gradient(
          circle at 50% 38%,
          rgba(255,235,185,.055),
          transparent 58%
        );
    }

    .avatarArea.emotion-sad::after,
    .avatarArea.emotion-concerned::after {
      background:
        linear-gradient(
          rgba(50,70,90,.035),
          rgba(20,30,40,.075)
        );
    }

    .callStatus {
      transition: opacity .2s ease;
    }

    #talkBtn {
      transition:
        transform .18s ease,
        background .18s ease;
    }

    #talkBtn.listening {
      transform: scale(1.08);
    }
  `;

  document.head.appendChild(style);
}


// =====================================
// BASIC UI
// =====================================

function show(id) {
  screens.forEach(screen => {
    screen.classList.toggle(
      'active',
      screen.id === id
    );
  });

  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $('#toast');

  t.textContent = msg;
  t.classList.add('show');

  setTimeout(() => {
    t.classList.remove('show');
  }, 1800);
}


// =====================================
// TARGET DATABASE
// =====================================

async function loadTargets() {
  try {
    const r = await fetch(
      '/api/targets',
      { cache: 'no-store' }
    );

    const d = await r.json();

    targets = d.targets || [];
  } catch {
    targets = [];
  }
}

async function saveNewTarget() {
  const r = await fetch(
    '/api/targets',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify(draft)
    }
  );

  if (!r.ok) {
    throw new Error(
      '저장 실패'
    );
  }

  const d = await r.json();

  await loadTargets();

  return d.target;
}


// =====================================
// TARGET CREATE
// =====================================

function resetDraft() {
  draft = {
    photo: '',
    name: '',
    voice:
      '부드러운 목소리',
    relation: '',
    personality: '',
    memories: []
  };

  $('#photoInput').value = '';

  $('#photoPreview').src = '';

  $('#photoPreview')
    .style.display = 'none';

  $('#photoPrompt')
    .style.display = 'block';

  $('#nameInput').value = '';

  $('#personalityInput')
    .value = '';

  $('#memoryInput')
    .value = '';

  $('#memoryList')
    .innerHTML = '';

  $$('#voiceChoices .choice')
    .forEach(
      (b, i) =>
        b.classList.toggle(
          'selected',
          i === 0
        )
    );

  $$('#relationChoices .relation')
    .forEach(
      b =>
        b.classList.remove(
          'selected'
        )
    );
}


$$('[data-go]').forEach(
  b =>
    b.addEventListener(
      'click',
      () => show(
        b.dataset.go
      )
    )
);


$('#createBtn')
  .addEventListener(
    'click',
    () => {
      resetDraft();
      show('create1');
    }
  );


$('#startCallBtn')
  .addEventListener(
    'click',
    async () => {
      await loadTargets();

      if (
        targets.length === 0
      ) {
        toast(
          '먼저 대상을 만들어주세요.'
        );

        resetDraft();

        show('create1');

        return;
      }

      if (
        targets.length === 1
      ) {
        startCall(
          targets[0]
        );

        return;
      }

      renderTargets();

      show(
        'chooseTarget'
      );
    }
  );


function renderTargets() {
  const box =
    $('#targetList');

  box.innerHTML = '';

  targets.forEach(
    target => {
      const button =
        document.createElement(
          'button'
        );

      button.className =
        'targetCard';

      const img =
        document.createElement(
          'img'
        );

      img.className =
        'targetPhoto';

      img.alt = '';

      if (target.photo) {
        img.src =
          target.photo;
      } else {
        img.src =
          'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(`
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="160"
              height="160"
            >
              <rect
                width="100%"
                height="100%"
                fill="#eee7db"
              />

              <text
                x="50%"
                y="58%"
                text-anchor="middle"
                font-size="70"
              >☺</text>
            </svg>
          `);
      }

      const txt =
        document.createElement(
          'div'
        );

      txt.innerHTML = `
        <div class="targetName">
          ${escapeHtml(
            target.name
          )}
        </div>

        <div class="targetRel">
          ${escapeHtml(
            target.relation ||
            '대화 상대'
          )}
        </div>
      `;

      button.append(
        img,
        txt
      );

      button.addEventListener(
        'click',
        () =>
          startCall(target)
      );

      box.appendChild(
        button
      );
    }
  );
}


// =====================================
// PHOTO
// =====================================

$('#photoInput')
  .addEventListener(
    'change',
    event => {
      const file =
        event.target.files?.[0];

      if (!file) return;

      const reader =
        new FileReader();

      reader.onload = () => {
        draft.photo =
          reader.result;

        $('#photoPreview')
          .src =
          reader.result;

        $('#photoPreview')
          .style.display =
          'block';

        $('#photoPrompt')
          .style.display =
          'none';
      };

      reader.readAsDataURL(
        file
      );
    }
  );


$('#toCreate2')
  .addEventListener(
    'click',
    () => {
      draft.name =
        $('#nameInput')
          .value
          .trim();

      if (!draft.name) {
        toast(
          '대상 이름을 입력해주세요.'
        );

        return;
      }

      show('create2');
    }
  );


// =====================================
// VOICE
// =====================================

$$('#voiceChoices .choice')
  .forEach(
    b =>
      b.addEventListener(
        'click',
        () => {
          $$('#voiceChoices .choice')
            .forEach(
              x =>
                x.classList.remove(
                  'selected'
                )
            );

          b.classList.add(
            'selected'
          );

          draft.voice =
            b.dataset.voice;

          trySpeakVoiceSample(
            draft.voice
          );
        }
      )
  );


function trySpeakVoiceSample(
  voice
) {
  if (
    !(
      'speechSynthesis'
      in window
    )
  ) {
    return;
  }

  speechSynthesis.cancel();

  const u =
    new SpeechSynthesisUtterance(
      '안녕하세요. 이렇게 이야기할게요.'
    );

  u.lang = 'ko-KR';

  if (
    voice.includes(
      '차분'
    )
  ) {
    u.rate = .82;
  } else if (
    voice.includes(
      '활기'
    )
  ) {
    u.rate = 1.08;
  } else {
    u.rate = .92;
  }

  speechSynthesis.speak(u);
}


$('#toCreate3')
  .addEventListener(
    'click',
    () =>
      show('create3')
  );


$$('#relationChoices .relation')
  .forEach(
    b =>
      b.addEventListener(
        'click',
        () => {
          $$('#relationChoices .relation')
            .forEach(
              x =>
                x.classList.remove(
                  'selected'
                )
            );

          b.classList.add(
            'selected'
          );

          draft.relation =
            b.dataset.rel;
        }
      )
  );


$('#toCreate4')
  .addEventListener(
    'click',
    () => {
      draft.personality =
        $('#personalityInput')
          .value
          .trim();

      if (
        !draft.relation
      ) {
        toast(
          '관계를 하나 선택해주세요.'
        );

        return;
      }

      if (
        !draft.personality
      ) {
        toast(
          '성격을 간단히 알려주세요.'
        );

        return;
      }

      show('create4');
    }
  );


// =====================================
// MEMORIES
// =====================================

function addMemory() {
  const value =
    $('#memoryInput')
      .value
      .trim();

  if (!value) {
    toast(
      '이야기를 입력해주세요.'
    );

    return;
  }

  draft.memories.push(
    value
  );

  $('#memoryInput')
    .value = '';

  renderMemories();
}


$('#addMemory')
  .addEventListener(
    'click',
    addMemory
  );


function renderMemories() {
  $('#memoryList')
    .innerHTML =
    draft.memories
      .map(
        (memory, i) => `
          <div
            style="
              padding:12px 14px;
              margin-top:8px;
              background:#f1eee8;
              border-radius:14px;
              font-size:17px;
              line-height:1.45
            "
          >
            ${i + 1}.
            ${escapeHtml(
              memory
            )}
          </div>
        `
      )
      .join('');
}


$('#saveTarget')
  .addEventListener(
    'click',
    async () => {
      const remaining =
        $('#memoryInput')
          .value
          .trim();

      if (remaining) {
        draft.memories.push(
          remaining
        );
      }

      if (
        draft.memories
          .length === 0
      ) {
        toast(
          '기억이나 에피소드를 하나 알려주세요.'
        );

        return;
      }

      try {
        await saveNewTarget();

        show('saved');
      } catch {
        toast(
          '저장하지 못했습니다. 다시 시도해주세요.'
        );
      }
    }
  );


// =====================================
// SPEECH RECOGNITION
// =====================================

function createRecognition(
  onText,
  onState,
  onError
) {
  const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SR) return null;

  const r = new SR();

  r.lang = 'ko-KR';

  r.interimResults =
    false;

  r.continuous =
    false;

  r.maxAlternatives = 1;

  r.onstart = () =>
    onState?.(true);

  r.onend = () =>
    onState?.(false);

  r.onerror = event => {
    onState?.(false);

    onError?.(
      event.error
    );
  };

  r.onresult = event => {
    const text =
      event.results?.[0]?.[0]
        ?.transcript;

    if (text) {
      onText(text);
    }
  };

  return r;
}


$('#memoryMic')
  .addEventListener(
    'click',
    () => {
      if (
        !memoryRecognition
      ) {
        memoryRecognition =
          createRecognition(
            text => {
              $('#memoryInput')
                .value =
                (
                  $('#memoryInput')
                    .value +
                  ' ' +
                  text
                ).trim();
            },

            on =>
              $('#memoryMic')
                .classList
                .toggle(
                  'listening',
                  on
                ),

            () =>
              toast(
                '음성을 인식하지 못했습니다.'
              )
          );
      }

      if (
        !memoryRecognition
      ) {
        toast(
          '이 브라우저에서는 음성 입력을 지원하지 않습니다.'
        );

        return;
      }

      try {
        memoryRecognition
          .start();
      } catch {}
    }
  );


// =====================================
// EMOTION
// =====================================

const EMOTIONS = [
  'neutral',
  'warm',
  'happy',
  'calm',
  'concerned',
  'sad',
  'surprised',
  'playful'
];


function applyEmotion(
  emotion = 'neutral',
  intensity = .3
) {
  if (
    !EMOTIONS.includes(
      emotion
    )
  ) {
    emotion =
      'neutral';
  }

  currentEmotion =
    emotion;

  currentIntensity =
    Math.max(
      0,
      Math.min(
        1,
        Number(
          intensity
        ) || 0
      )
    );

  const area =
    $('#avatarArea');

  EMOTIONS.forEach(
    name =>
      area.classList.remove(
        `emotion-${name}`
      )
  );

  area.classList.add(
    `emotion-${emotion}`
  );

  area.style.setProperty(
    '--emotion-intensity',
    currentIntensity
  );
}


// =====================================
// CALL
// =====================================

function ensureAvatarVideo() {
  let video = $('#callVideo');

  if (!video) {
    video = document.createElement('video');
    video.id = 'callVideo';
    video.src = '/motions/idle.mp4';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';

    $('#avatarArea').appendChild(video);
  }

  return video;
}

async function startCall(
  target
) {
  currentTarget =
    target;

  history = [];

  recognition = null;

  listening = false;

  $('#callName')
    .textContent =
    target.name;

  $('#callStatus')
    .textContent =
    '연결 중';

  $('#caption')
    .textContent =
    '연결하고 있어요…';

  const area =
    $('#avatarArea');

  area.classList.remove(
    'talking',
    'idle',
    'connecting'
  );

  applyEmotion(
    'neutral',
    .2
  );

  if (
    target.photo
  ) {
    $('#callPhoto')
      .src =
      target.photo;

    $('#callPhoto')
      .style.display =
      'block';

    $('#avatarFallback')
      .style.display =
      'none';
  } else {
    $('#callPhoto')
      .style.display =
      'none';

    $('#avatarFallback')
      .style.display =
      'grid';
  }

  show('call');

  area.classList.add(
    'connecting'
  );

  setTimeout(
    () => {
      area.classList.remove(
        'connecting'
      );

      area.classList.add(
        'idle'
      );

      $('#callStatus')
        .textContent =
        '연결됨';

      $('#caption')
        .textContent =
        '마이크 버튼을 누르고 말씀해주세요.';
    },
    850
  );
}


function setTalking(on) {
  const area = $('#avatarArea');
  const photo = $('#callPhoto');
  const video = ensureAvatarVideo();

  area.classList.toggle(
    'talking',
    on
  );

  area.classList.toggle(
    'idle',
    !on
  );

  if (on) {
    // AI가 말하기 시작하면
    // 정지 사진 → LivePortrait 영상
    video.currentTime = 0;

    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.display = 'block';
    video.style.zIndex = '1';

    photo.style.visibility = 'hidden';

    video.play().catch(() => {});
  } else {
    // AI가 말을 끝내면
    // LivePortrait 영상 → 정지 사진
    video.pause();
    video.currentTime = 0;
    video.style.display = 'none';

    if (currentTarget?.photo) {
      photo.style.visibility = 'visible';
    }
  }

  $('#callStatus')
    .textContent =
    on
      ? '말하는 중'
      : '연결됨';
}

// =====================================
// TTS
// =====================================

function speak(text) {
  if (
    !(
      'speechSynthesis'
      in window
    )
  ) {
    setTalking(false);

    return;
  }

  speechSynthesis.cancel();

  const u =
    new SpeechSynthesisUtterance(
      text
    );

  u.lang = 'ko-KR';

  const voice =
    currentTarget?.voice ||
    '';

  if (
    voice.includes(
      '차분'
    )
  ) {
    u.rate = .82;
    u.pitch = .94;
  } else if (
    voice.includes(
      '활기'
    )
  ) {
    u.rate = 1.05;
    u.pitch = 1.04;
  } else {
    u.rate = .92;
    u.pitch = 1;
  }

  if (
    currentEmotion ===
      'sad' ||
    currentEmotion ===
      'concerned'
  ) {
    u.rate *= .92;
    u.pitch *= .96;
  }

  if (
    currentEmotion ===
      'happy' ||
    currentEmotion ===
      'playful'
  ) {
    u.rate *= 1.04;
    u.pitch *= 1.025;
  }

  u.onstart = () =>
    setTalking(true);

  u.onend = () =>
    setTalking(false);

  u.onerror = () =>
    setTalking(false);

  speechSynthesis.speak(u);
}


// =====================================
// CHAT
// =====================================

function compactTarget() {
  return {
    name:
      currentTarget?.name ||
      '',

    relation:
      currentTarget?.relation ||
      '',

    personality:
      currentTarget
        ?.personality ||
      '',

    voice:
      currentTarget?.voice ||
      '',

    memories:
      Array.isArray(
        currentTarget
          ?.memories
      )
        ? currentTarget
            .memories
            .slice(0, 50)
        : []
  };
}


async function sendUserText(
  text
) {
  text =
    String(text || '')
      .trim();

  if (!text) return;

  history.push({
    role: 'user',
    text
  });

  // 오래된 대화 무한 누적 방지
  history =
    history.slice(-14);

  $('#caption')
    .textContent =
    '잠시만요…';

  $('#callStatus')
    .textContent =
    '생각하는 중';

  try {
    const r =
      await fetch(
        '/api/chat',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          cache: 'no-store',

          body:
            JSON.stringify({
              target:
                compactTarget(),

              text,

              history
            })
        }
      );

    const d =
      await r.json();

    if (!r.ok) {
      throw new Error(
        d?.error ||
        '대화 요청 실패'
      );
    }

    const reply =
      String(
        d.text || ''
      ).trim();

    if (!reply) {
      throw new Error(
        '빈 AI 응답'
      );
    }

    const emotion =
      d.emotion ||
      'neutral';

    const intensity =
      Number(
        d.intensity ?? .3
      );

    history.push({
      role:
        'assistant',
      text: reply
    });

    history =
      history.slice(-14);

    applyEmotion(
      emotion,
      intensity
    );

    $('#caption')
      .textContent =
      reply;

    speak(reply);

  } catch (e) {
    console.error(
      'CHAT ERROR:',
      e
    );

    applyEmotion(
      'neutral',
      .2
    );

    $('#caption')
      .textContent =
      '연결이 잠시 불안정합니다. 다시 말씀해주세요.';

    $('#callStatus')
      .textContent =
      '연결됨';

    $('#avatarArea')
      .classList
      .add('idle');
  }
}


// =====================================
// CALL MICROPHONE
// =====================================

$('#talkBtn')
  .addEventListener(
    'click',
    () => {
      if (
        !recognition
      ) {
        recognition =
          createRecognition(
            sendUserText,

            on => {
              listening = on;

              $('#talkBtn')
                .classList
                .toggle(
                  'listening',
                  on
                );

              if (on) {
                $('#callStatus')
                  .textContent =
                  '듣고 있어요';

                $('#caption')
                  .textContent =
                  '말씀해주세요.';
              }
            },

            error => {
              console.warn(
                'STT:',
                error
              );

              if (
                error !==
                'no-speech'
              ) {
                toast(
                  '음성을 다시 말씀해주세요.'
                );
              }

              $('#callStatus')
                .textContent =
                '연결됨';
            }
          );
      }

      if (
        !recognition
      ) {
        const text =
          prompt(
            '말씀하실 내용을 입력해주세요.'
          );

        if (text) {
          sendUserText(text);
        }

        return;
      }

      if (listening) {
        recognition.stop();

        return;
      }

      try {
        recognition.start();
      } catch {}
    }
  );


// =====================================
// HANG UP
// =====================================

$('#hangBtn')
  .addEventListener(
    'click',
    () => {
      try {
        recognition?.stop();
      } catch {}

      try {
        memoryRecognition
          ?.stop();
      } catch {}

      try {
        speechSynthesis
          .cancel();
      } catch {}

      $('#avatarArea')
        .classList
        .remove(
          'talking',
          'idle',
          'connecting'
        );

      currentTarget =
        null;

      history = [];

      listening =
        false;

      recognition =
        null;

      applyEmotion(
        'neutral',
        .2
      );

      show('home');
    }
  );


// =====================================
// HTML ESCAPE
// =====================================

function escapeHtml(
  text = ''
) {
  return String(text)
    .replace(
      /[&<>'"]/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char])
    );
}


// =====================================
// INIT
// =====================================

const caption = $('#caption');

if (caption) {
  caption.style.display = 'none';
}

installRuntimeStyles();

loadTargets();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch(err => {
        console.error('Service Worker 등록 실패:', err);
      });
  });
}