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

          toast('실시간 통화에서는 현재 연결된 복제 목소리를 공통으로 사용합니다.');
        }
      )
  );





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

// LiveKit real-time calling replaces the old browser TTS / prerecorded MP4.
// Target create, storage and voice-input-for-memories remain unchanged.
let activeRoom = null;
let callGeneration = 0;
let micEnabled = false;
let remoteTrackReceived = false;
let connectionWatchdog = null;

function stopConnectionWatchdog() {
  if (connectionWatchdog !== null) clearTimeout(connectionWatchdog);
  connectionWatchdog = null;
}

function callMessage(message, state = '') {
  $('#caption').textContent = message;
  $('#callStatus').textContent = state || message;
}

function clearRemoteMedia() {
  $('#avatarArea').querySelectorAll('.remoteLivekitVideo').forEach(el => {
    try { el.pause(); } catch {}
    el.remove();
  });
  document.querySelectorAll('.remoteLivekitAudio').forEach(el => {
    try { el.pause(); } catch {}
    el.remove();
  });
  if (currentTarget?.photo) $('#callPhoto').style.visibility = 'visible';
}

async function disconnectLivekit() {
  const old = activeRoom;
  activeRoom = null;
  micEnabled = false;
  remoteTrackReceived = false;
  stopConnectionWatchdog();
  const mic = $('#talkBtn');
  mic.classList.remove('listening');
  mic.textContent = '🎙️';
  mic.setAttribute('aria-label', '마이크 켜기');
  if (old) {
    try { await old.disconnect(); } catch (e) { console.warn('LiveKit disconnect:', e); }
  }
  clearRemoteMedia();
}

function displayRemoteTrack(track) {
  const lk = window.LivekitClient;
  if (!lk) return;
  remoteTrackReceived = true;
  stopConnectionWatchdog();
  if (track.kind === lk.Track.Kind.Video) {
    const el = track.attach();
    el.className = 'remoteLivekitVideo';
    el.autoplay = true;
    el.playsInline = true;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.objectFit = 'cover';
    $('#avatarArea').appendChild(el);
    $('#callPhoto').style.visibility = 'hidden';
    $('#avatarFallback').style.display = 'none';
    callMessage('편하게 말씀해 주세요.', '영상통화 중');
  } else if (track.kind === lk.Track.Kind.Audio) {
    const el = track.attach();
    el.className = 'remoteLivekitAudio';
    el.autoplay = true;
    document.body.appendChild(el);
    el.play().catch(() => {
      callMessage('소리가 안 들리면 화면을 한 번 눌러 주세요.', '소리 재생 대기');
    });
  }
}

async function startCall(target) {
  // Invalidate any previous asynchronous connection attempt.
  const generation = ++callGeneration;
  await disconnectLivekit();
  if (generation !== callGeneration) return;

  remoteTrackReceived = false;
  currentTarget = target;
  $('#callName').textContent = target.name;
  $('#callPhoto').src = target.photo || '';
  $('#callPhoto').style.display = target.photo ? 'block' : 'none';
  $('#callPhoto').style.visibility = 'visible';
  $('#avatarFallback').style.display = target.photo ? 'none' : 'grid';
  $('#avatarArea').classList.remove('talking', 'idle', 'connecting');
  applyEmotion('neutral', 0.2);
  $('#talkBtn').disabled = true;
  callMessage('실시간 영상통화에 연결하고 있어요…', '연결 중');
  show('call');

  let room = null;
  try {
    const lk = window.LivekitClient;
    if (!lk) throw new Error('영상통화 프로그램을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const response = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ target_id: target.id }),
      cache: 'no-store'
    });
    const connection = await response.json();
    if (!response.ok) throw new Error(connection.error || `접속 준비 실패 (${response.status})`);
    if (generation !== callGeneration) return;

    room = new lk.Room({ adaptiveStream: true, autoSubscribe: true });
    activeRoom = room;
    room.on(lk.RoomEvent.TrackSubscribed, track => {
      if (generation !== callGeneration) return;
      if (track.kind === lk.Track.Kind.Video || track.kind === lk.Track.Kind.Audio) {
        displayRemoteTrack(track);
      }
    });
    room.on(lk.RoomEvent.TrackUnsubscribed, track => {
      for (const el of track.detach()) el.remove();
      if (generation !== callGeneration) return;
      if (track.kind === lk.Track.Kind.Video) {
        $('#callPhoto').style.visibility = 'visible';
        callMessage('영상이 다시 연결되기를 기다리고 있어요…', '영상 연결 대기');
      }
    });
    room.on(lk.RoomEvent.Disconnected, () => {
      if (generation !== callGeneration || activeRoom !== room) return;
      stopConnectionWatchdog();
      activeRoom = null;
      micEnabled = false;
      $('#talkBtn').disabled = false;
      $('#talkBtn').textContent = '🎙️';
      clearRemoteMedia();
      callMessage('연결이 끊어졌어요. 마이크 버튼을 누르면 다시 연결합니다.', '연결 끊김');
    });

    await room.connect(connection.server_url, connection.participant_token);
    if (generation !== callGeneration) { await room.disconnect(); return; }
    callMessage('AI 아바타 영상과 음성을 준비하고 있어요…', '영상 준비 중');

    // Joining a LiveKit room alone does not mean an AI worker joined it.
    // Surface a useful diagnostic instead of leaving the user at 'mic on'.
    connectionWatchdog = setTimeout(() => {
      connectionWatchdog = null;
      if (generation !== callGeneration || activeRoom !== room || remoteTrackReceived) return;
      console.warn('[VOICE] 18초 동안 AI 음성/영상 트랙을 받지 못함. Railway 에이전트 로그 확인 필요.');
      callMessage(
        '마이크는 연결됐지만 AI 음성·영상이 아직 도착하지 않았어요. Railway에서 avatar-agent 실행 로그를 확인해 주세요.',
        'AI 연결 지연'
      );
    }, 18000);

    try { await room.startAudio(); } catch (_) {}
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      micEnabled = true;
      $('#talkBtn').classList.add('listening');
      $('#talkBtn').setAttribute('aria-label', '마이크 끄기');
      if ($('#avatarArea .remoteLivekitVideo')) {
        callMessage('편하게 말씀해 주세요.', '영상통화 중');
      } else {
        callMessage('아바타 영상이 나타나면 편하게 말씀해 주세요.', '마이크 켜짐');
      }
    } catch (e) {
      micEnabled = false;
      $('#talkBtn').textContent = '🔇';
      callMessage('마이크 권한을 허용해 주세요. 버튼을 누르면 다시 시도합니다.', '마이크 꺼짐');
    }
    $('#talkBtn').disabled = false;
  } catch (e) {
    console.error('LIVEKIT CALL ERROR:', e);
    stopConnectionWatchdog();
    if (room) { try { await room.disconnect(); } catch (_) {} }
    if (generation !== callGeneration) return;
    activeRoom = null;
    $('#talkBtn').disabled = false;
    $('#talkBtn').textContent = '🎙️';
    clearRemoteMedia();
    callMessage('연결 실패: ' + (e.message || '다시 시도해 주세요.') + ' 마이크 버튼으로 재시도할 수 있어요.', '연결 실패');
  }
}

$('#talkBtn').addEventListener('click', async () => {
  if (!currentTarget) return;
  if (!activeRoom) { await startCall(currentTarget); return; }
  const button = $('#talkBtn');
  button.disabled = true;
  try {
    const enabled = !micEnabled;
    await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
    micEnabled = enabled;
    button.classList.toggle('listening', enabled);
    button.textContent = enabled ? '🎙️' : '🔇';
    button.setAttribute('aria-label', enabled ? '마이크 끄기' : '마이크 켜기');
    $('#callStatus').textContent = enabled ? '마이크 켜짐' : '마이크 꺼짐';
  } catch (e) {
    toast('마이크 권한을 확인해 주세요.');
  } finally {
    button.disabled = false;
  }
});

$('#hangBtn').addEventListener('click', async () => {
  ++callGeneration;
  $('#talkBtn').disabled = false;
  await disconnectLivekit();
  currentTarget = null;
  history = [];
  try { speechSynthesis.cancel(); } catch (_) {}
  show('home');
});

window.addEventListener('pagehide', () => {
  ++callGeneration;
  activeRoom?.disconnect().catch(() => {});
});

// Browsers sometimes suspend remote audio until a user gesture.
$('#avatarArea').addEventListener('click', () => {
  activeRoom?.startAudio().catch(() => {});
  document.querySelectorAll('.remoteLivekitAudio').forEach(el => el.play().catch(() => {}));
});

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

installRuntimeStyles();

loadTargets();

// Development build: prevent old offline service-worker caches from serving
// the previous voice-only app while this real-time integration is tested.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => Promise.all(regs.map(reg => reg.unregister())))
    .catch(err => console.warn('이전 앱 캐시 해제:', err));
}