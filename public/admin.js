'use strict';

// 대상 등록/수정/삭제 전용 화면. 일반 통화 화면에서는 이 스크립트를 로드하지 않습니다.
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const screens = $$('.screen');
  const PHOTO_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#eee7db"/><text x="50%" y="58%" text-anchor="middle" font-size="70">☺</text></svg>'
  );
  const EMPTY_DRAFT = () => ({
    photo: '',
    name: '',
    voice: '부드러운 목소리',
    relation: '',
    personality: '',
    memories: []
  });

  let targets = [];
  let draft = EMPTY_DRAFT();
  let editingId = null;
  let saving = false;
  let deletingId = null;
  let memoryRecognition = null;

  function show(id) {
    screens.forEach(screen => screen.classList.toggle('active', screen.id === id));
    window.scrollTo(0, 0);
  }

  let toastTimeout;
  function toast(message) {
    const box = $('#toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => box.classList.remove('show'), 2700);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options });
    let result = {};
    try {
      result = await response.json();
    } catch (_) {
      // Error handling below uses HTTP status if server has no JSON response.
    }
    if (!response.ok) {
      throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
    }
    return result;
  }

  async function loadTargets() {
    const result = await api('/api/targets');
    if (!Array.isArray(result.targets)) throw new Error('대상 목록 응답 형식을 확인해주세요.');
    targets = result.targets;
    renderTargets();
  }

  function setListMessage(message) {
    const container = $('#adminTargetList');
    container.replaceChildren();
    const notice = document.createElement('div');
    notice.className = 'emptyState';
    notice.textContent = message;
    container.appendChild(notice);
  }

  function renderTargets() {
    const container = $('#adminTargetList');
    container.replaceChildren();
    if (!targets.length) {
      setListMessage('등록된 대상이 없습니다. 위의 버튼에서 새 대상을 만들어주세요.');
      return;
    }

    for (const target of targets) {
      const card = document.createElement('div');
      card.className = 'adminCard';

      const photo = document.createElement('img');
      photo.className = 'targetPhoto';
      photo.alt = '';
      photo.src = target.photo || PHOTO_PLACEHOLDER;

      const info = document.createElement('div');
      info.className = 'adminInfo';
      const name = document.createElement('div');
      name.className = 'targetName';
      name.textContent = target.name || '이름 없는 대상';
      const relation = document.createElement('div');
      relation.className = 'targetRel';
      relation.textContent = target.relation || '대화 상대';
      info.append(name, relation);

      const actions = document.createElement('div');
      actions.className = 'adminActions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'adminAction';
      edit.textContent = '수정';
      edit.setAttribute('aria-label', `${target.name || '대상'} 수정`);
      edit.addEventListener('click', () => editTarget(target));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'adminAction danger';
      remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${target.name || '대상'} 삭제`);
      remove.addEventListener('click', () => deleteTarget(target, remove));

      actions.append(edit, remove);
      card.append(photo, info, actions);
      container.appendChild(card);
    }
  }

  function resetDraft() {
    draft = EMPTY_DRAFT();
    editingId = null;
    $('#photoInput').value = '';
    $('#photoPreview').removeAttribute('src');
    $('#photoPreview').style.display = 'none';
    $('#photoPrompt').style.display = 'block';
    $('#nameInput').value = '';
    $('#personalityInput').value = '';
    $('#memoryInput').value = '';
    renderMemories();
    refreshChoices();
  }

  function refreshChoices() {
    $$('#voiceChoices .choice').forEach(choice => {
      choice.classList.toggle('selected', choice.dataset.voice === draft.voice);
    });
    $$('#relationChoices .relation').forEach(choice => {
      choice.classList.toggle('selected', choice.dataset.rel === draft.relation);
    });
  }

  function refreshPhoto() {
    const preview = $('#photoPreview');
    if (draft.photo) {
      preview.src = draft.photo;
      preview.style.display = 'block';
      $('#photoPrompt').style.display = 'none';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      $('#photoPrompt').style.display = 'block';
    }
  }

  function createTarget() {
    resetDraft();
    $('#editorModeTitle').textContent = '새 대상 만들기';
    $('#saveTarget').textContent = '대상 저장';
    show('create1');
  }

  function editTarget(target) {
    resetDraft();
    editingId = String(target.id);
    draft = {
      photo: target.photo || '',
      name: target.name || '',
      voice: target.voice || '부드러운 목소리',
      relation: target.relation || '',
      personality: target.personality || '',
      memories: Array.isArray(target.memories) ? target.memories.map(String) : []
    };
    $('#nameInput').value = draft.name;
    $('#personalityInput').value = draft.personality;
    refreshPhoto();
    refreshChoices();
    renderMemories();
    $('#editorModeTitle').textContent = '기존 대상 수정';
    $('#saveTarget').textContent = '변경사항 저장';
    show('create1');
  }

  async function deleteTarget(target, button) {
    if (deletingId !== null) return;
    const confirmed = window.confirm(
      `"${target.name || '선택한 대상'}"을(를) 삭제할까요?\n저장된 사진, 성격, 기억도 함께 삭제되며 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;
    deletingId = String(target.id);
    button.disabled = true;
    button.textContent = '삭제 중';
    try {
      await api(`/api/targets/${encodeURIComponent(deletingId)}`, { method: 'DELETE' });
      targets = targets.filter(item => String(item.id) !== deletingId);
      renderTargets();
      toast('대상을 삭제했습니다.');
      loadTargets().catch(error => console.warn('삭제 후 목록 갱신 실패:', error));
    } catch (err) {
      toast(err.message || '삭제하지 못했습니다.');
      button.disabled = false;
      button.textContent = '삭제';
    } finally {
      deletingId = null;
    }
  }

  function renderMemories() {
    const list = $('#memoryList');
    list.replaceChildren();
    draft.memories.forEach((memory, index) => {
      const row = document.createElement('div');
      row.className = 'memoryRow';
      const textarea = document.createElement('textarea');
      textarea.className = 'field';
      textarea.value = memory;
      textarea.setAttribute('aria-label', `기억 ${index + 1}`);
      textarea.addEventListener('input', () => {
        draft.memories[index] = textarea.value;
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '삭제';
      remove.setAttribute('aria-label', `기억 ${index + 1} 삭제`);
      remove.addEventListener('click', () => {
        draft.memories.splice(index, 1);
        renderMemories();
      });
      row.append(textarea, remove);
      list.appendChild(row);
    });
  }

  function addMemory() {
    const input = $('#memoryInput');
    const value = input.value.trim();
    if (!value) return toast('추가할 이야기를 입력해주세요.');
    draft.memories.push(value);
    input.value = '';
    renderMemories();
  }

  async function saveTarget() {
    if (saving) return;
    const extraMemory = $('#memoryInput').value.trim();
    const memories = draft.memories.map(text => String(text).trim()).filter(Boolean);
    if (extraMemory) memories.push(extraMemory);
    if (!memories.length) return toast('기억이나 에피소드를 하나 알려주세요.');

    const payload = { ...draft, memories };
    const isEditing = editingId !== null;
    const url = isEditing ? `/api/targets/${encodeURIComponent(editingId)}` : '/api/targets';
    const button = $('#saveTarget');
    saving = true;
    button.disabled = true;
    button.textContent = '저장 중...';
    try {
      const response = await api(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // The server confirms persistence before the success screen is shown.
      if (response.target) {
        if (isEditing) {
          targets = targets.map(item => String(item.id) === editingId ? response.target : item);
        } else {
          targets.push(response.target);
        }
        renderTargets();
      }
      $('#savedHeading').textContent = isEditing ? '변경사항이 저장되었습니다.' : '대상이 저장되었습니다.';
      $('#savedSub').textContent = '대상 관리 화면에서 다시 확인할 수 있어요.';
      show('saved');
      loadTargets().catch(error => console.warn('저장 후 목록 갱신 실패:', error));
    } catch (err) {
      toast(err.message || '저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      saving = false;
      button.disabled = false;
      button.textContent = editingId !== null ? '변경사항 저장' : '대상 저장';
    }
  }

  function createRecognition(onText, onState, onError) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => onState?.(true);
    recognition.onend = () => onState?.(false);
    recognition.onerror = event => {
      onState?.(false);
      onError?.(event.error);
    };
    recognition.onresult = event => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text) onText(text);
    };
    return recognition;
  }

  // Event handlers
  $$('[data-go]').forEach(button => button.addEventListener('click', () => show(button.dataset.go)));
  $('#createBtn').addEventListener('click', createTarget);
  $('#photoInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('JPG, PNG, WebP 형식만 선택할 수 있습니다.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      draft.photo = String(reader.result || '');
      refreshPhoto();
    };
    reader.onerror = () => toast('사진을 읽지 못했습니다.');
    reader.readAsDataURL(file);
  });

  $('#toCreate2').addEventListener('click', () => {
    draft.name = $('#nameInput').value.trim();
    if (!draft.name) return toast('대상 이름을 입력해주세요.');
    show('create2');
  });
  $$('#voiceChoices .choice').forEach(button => button.addEventListener('click', () => {
    draft.voice = button.dataset.voice;
    refreshChoices();
    toast('실시간 통화에서는 현재 연결된 복제 목소리를 공통으로 사용합니다.');
  }));
  $('#toCreate3').addEventListener('click', () => show('create3'));
  $$('#relationChoices .relation').forEach(button => button.addEventListener('click', () => {
    draft.relation = button.dataset.rel;
    refreshChoices();
  }));
  $('#toCreate4').addEventListener('click', () => {
    draft.personality = $('#personalityInput').value.trim();
    if (!draft.relation) return toast('관계를 하나 선택해주세요.');
    if (!draft.personality) return toast('성격을 간단히 알려주세요.');
    show('create4');
  });
  $('#addMemory').addEventListener('click', addMemory);
  $('#saveTarget').addEventListener('click', saveTarget);
  $('#memoryMic').addEventListener('click', () => {
    if (!memoryRecognition) {
      memoryRecognition = createRecognition(
        text => { $('#memoryInput').value = ($('#memoryInput').value + ' ' + text).trim(); },
        listening => $('#memoryMic').classList.toggle('listening', listening),
        () => toast('음성을 인식하지 못했습니다.')
      );
    }
    if (!memoryRecognition) return toast('이 브라우저에서는 음성 입력을 지원하지 않습니다.');
    try { memoryRecognition.start(); } catch (_) { /* Already listening */ }
  });

  // Avoid stale service-worker caches during deployment of the new management page.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(() => {});
  }
  loadTargets().catch(error => setListMessage(`목록을 불러오지 못했습니다: ${error.message}`));
})();
