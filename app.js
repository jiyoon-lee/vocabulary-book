// ─── State ───────────────────────────────────────────────────────────────────
let allData = null;

// Inline quiz item registry
// key -> { word, type('en'|'ko'), partOfSpeech, correctAnswer, userAnswer, isCorrect, answered }
const _items = {};
let currentCategory = null;
let currentMode = 'list';   // 'list' | 'quiz-en' | 'quiz-ko'
let hideState = { en: false, ko: false };

// Quiz state
let quizItems = [];
let quizIndex = 0;
let quizRevealed = false;
let quizCorrect = 0;
let quizWrong = 0;

// CRUD state
let _editingWordId = null;
let _idCounter = Date.now();
function nextId() { return ++_idCounter; }

// ─── Local Data Storage ────────────────────────────────────────────────────────
const LOCAL_DATA_KEY = 'vocab_data';

function saveData() {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(allData));
}

async function reloadFromJson() {
  if (!confirm('words.json에서 데이터를 다시 불러옵니다.\n직접 추가/수정한 단어는 유지됩니다.')) return;
  try {
    const res = await fetch('data/words.json');
    const fresh = await res.json();
    // Merge: keep locally-added words (id > 1000), replace JSON-sourced categories
    const localCats = allData ? allData.categories : [];
    fresh.categories.forEach(freshCat => {
      const localCat = localCats.find(c => c.id === freshCat.id);
      if (localCat) {
        const localOnly = localCat.words.filter(w => w.id > 1000);
        freshCat.words = [...freshCat.words, ...localOnly];
      }
    });
    allData = fresh;
    saveData();
    renderHome();
    showToast('데이터를 새로고침했습니다.');
  } catch (e) {
    console.error(e);
    showToast('새로고침 실패. 네트워크를 확인해 주세요.');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const local = localStorage.getItem(LOCAL_DATA_KEY);
    if (local) {
      allData = JSON.parse(local);
    } else {
      const res = await fetch('data/words.json');
      allData = await res.json();
      saveData();
    }
  } catch (e) {
    console.error('데이터 로드 실패:', e);
    document.getElementById('category-list').innerHTML =
      '<p class="text-red-500 text-sm text-center">데이터를 불러오지 못했습니다.<br>GitHub Pages 또는 로컬 서버에서 실행해 주세요.</p>';
    return;
  }
  renderHome();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
let _prevView = 'home';

function showView(name) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');

  const backBtn = document.getElementById('btn-back');
  const title = document.getElementById('page-title');

  if (name === 'home') {
    backBtn.classList.add('hidden');
    title.textContent = '영단어 단어장';
  } else if (name === 'category') {
    backBtn.classList.remove('hidden');
    title.textContent = currentCategory.name;
  } else if (name === 'history') {
    _prevView = 'home';
    backBtn.classList.remove('hidden');
    title.textContent = '학습 기록';
    renderHistoryList();
  } else if (name === 'history-detail') {
    _prevView = 'history';
    backBtn.classList.remove('hidden');
    title.textContent = '정오표';
  }
}

function goBack() {
  if (_prevView === 'history') {
    showView('history');
  } else {
    showView('home');
    renderHome();
  }
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function renderHome() {
  const list = document.getElementById('category-list');
  list.innerHTML = allData.categories.map(cat => {
    const wordCount = countWords(cat);
    return `
      <button onclick="openCategory(${cat.id})"
        class="w-full bg-white rounded-xl p-4 shadow-sm flex items-center justify-between active:bg-gray-50 transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <span class="text-indigo-600 font-bold text-sm">${cat.name}</span>
          </div>
          <div class="text-left">
            <div class="font-semibold text-gray-800">${cat.name}</div>
            <div class="text-xs text-gray-400">단어 ${wordCount}개</div>
          </div>
        </div>
        <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>`;
  }).join('');

}

function countWords(cat) {
  return cat.words.length;
}

// ─── Category ─────────────────────────────────────────────────────────────────
function openCategory(catId) {
  currentCategory = allData.categories.find(c => c.id === catId);
  hideState = { en: false, ko: false };
  currentMode = 'list';
  showView('category');
  switchMode('list');
}

function switchMode(mode) {
  currentMode = mode;

  // Update tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('text-indigo-600', active);
    tab.classList.toggle('border-indigo-600', active);
    tab.classList.toggle('text-gray-400', !active);
    tab.classList.toggle('border-transparent', !active);
  });

  if (mode === 'list') {
    document.getElementById('mode-list').classList.remove('hidden');
    document.getElementById('mode-quiz').classList.add('hidden');
    renderWordList();
  } else {
    document.getElementById('mode-list').classList.add('hidden');
    document.getElementById('mode-quiz').classList.remove('hidden');
    startQuiz(mode);
  }
}

// ─── Word List ─────────────────────────────────────────────────────────────────
function toggleHide(type) {
  hideState[type] = !hideState[type];
  // Can't hide both at once
  if (hideState.en && hideState.ko) {
    hideState[type === 'en' ? 'ko' : 'en'] = false;
  }
  updateHideButtons();
  renderWordList();
}

function updateHideButtons() {
  const btnEn = document.getElementById('btn-hide-en');
  const btnKo = document.getElementById('btn-hide-ko');

  if (hideState.en) {
    btnEn.className = 'flex-1 py-2 text-xs rounded-lg border font-medium bg-indigo-600 text-white border-indigo-600';
  } else {
    btnEn.className = 'flex-1 py-2 text-xs rounded-lg border font-medium text-gray-600 border-gray-200 bg-white';
  }

  if (hideState.ko) {
    btnKo.className = 'flex-1 py-2 text-xs rounded-lg border font-medium bg-indigo-600 text-white border-indigo-600';
  } else {
    btnKo.className = 'flex-1 py-2 text-xs rounded-lg border font-medium text-gray-600 border-gray-200 bg-white';
  }
}

function renderWordList() {
  updateHideButtons();
  Object.keys(_items).forEach(k => delete _items[k]);
  const container = document.getElementById('word-list');
  container.innerHTML = currentCategory.words.map((word, idx) =>
    renderWordCard(word, idx + 1, false, true)
  ).join('');
  // 채점 버튼: hide 모드일 때만 표시
  const gradeWrap = document.getElementById('grade-btn-wrap');
  if (hideState.en || hideState.ko) {
    gradeWrap.classList.remove('hidden');
  } else {
    gradeWrap.classList.add('hidden');
  }
}

function renderWordCard(word, num, isRelated, showActions = false) {
  const key = `w${word.id}`;

  // English word section
  let wordHtml;
  if (hideState.en) {
    _items[key] = { word: word.word, type: 'en', partOfSpeech: null, correctAnswer: word.word, userAnswer: null, isCorrect: null, answered: false };
    const prefix = isRelated ? '' : `<span class="text-gray-400 text-sm mr-1">${num}.</span>`;
    wordHtml = `
      <div id="iw-${key}" class="inline-input-wrap">
        <div class="hidden-tap" onclick="activateInput('${key}','en')">
          ${prefix}<span class="tap-hint">영단어 입력...</span>
        </div>
      </div>`;
  } else {
    wordHtml = `<div class="word-main">${isRelated ? '' : num + '. '}${word.word}</div>`;
  }

  // Meanings section
  const meaningsHtml = word.meanings.map((m, mi) => {
    const mKey = `m${word.id}_${mi}`;
    if (hideState.ko) {
      _items[mKey] = { word: word.word, type: 'ko', partOfSpeech: m.partOfSpeech, correctAnswer: m.definitions, userAnswer: null, isCorrect: null, answered: false };
      return `
        <div class="flex items-center gap-1 mt-0.5">
          <span class="pos-badge">${m.partOfSpeech}</span>
          <div id="iw-${mKey}" class="inline-input-wrap flex-1">
            <div class="hidden-tap" onclick="activateInput('${mKey}','ko')">
              <span class="tap-hint">뜻 입력...</span>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="flex items-center gap-1 mt-0.5">
        <span class="pos-badge">${m.partOfSpeech}</span>
        <span class="meaning-text">${m.definitions.join(', ')}</span>
      </div>`;
  }).join('');

  // Related words
  const relatedHtml = isRelated || !word.related || word.related.length === 0
    ? ''
    : `<div class="mt-3 space-y-2">${word.related.map(rel =>
        `<div class="word-related">${renderWordCard(rel, null, true)}</div>`
      ).join('')}</div>`;

  const actionsHtml = (showActions && !isRelated) ? `
    <div class="flex gap-2 mt-3 justify-end">
      <button onclick="openEditWord(${word.id})" class="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-200 active:bg-gray-50">수정</button>
      <button onclick="deleteWord(${word.id})" class="text-xs text-red-400 px-2 py-1 rounded-lg border border-red-200 active:bg-red-50">삭제</button>
    </div>` : '';

  return `
    <div class="word-card">
      ${wordHtml}
      <div class="mt-1">${meaningsHtml}</div>
      ${relatedHtml}
      ${actionsHtml}
    </div>`;
}

function activateInput(key, type) {
  const wrap = document.getElementById('iw-' + key);
  if (!wrap) return;
  const placeholder = type === 'en' ? '영단어를 입력하세요' : '뜻을 입력하세요';
  wrap.innerHTML = `
    <div class="flex gap-1">
      <input type="text" placeholder="${placeholder}"
        class="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
        onkeydown="if(event.key==='Enter') checkInlineInput(this,'${key}','${type}')">
      <button onclick="checkInlineInput(this.previousElementSibling,'${key}','${type}')"
        class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold active:bg-indigo-700">확인</button>
    </div>
    <div id="fb-${key}" class="hidden mt-1 text-xs rounded px-2 py-0.5"></div>`;
  wrap.querySelector('input').focus();
}

function checkInlineInput(inputEl, key, type) {
  const userAnswer = normalize(inputEl.value);
  if (!userAnswer) return;
  const item = _items[key];
  if (!item) return;

  const isCorrect = matchAnswer(userAnswer, item.correctAnswer, type);

  // Update registry
  item.userAnswer = userAnswer;
  item.isCorrect = isCorrect;
  item.answered = true;

  inputEl.classList.remove('border-green-400', 'border-red-400');
  inputEl.classList.add(isCorrect ? 'border-green-400' : 'border-red-400');

  const fb = document.getElementById('fb-' + key);
  fb.classList.remove('hidden');
  if (isCorrect) {
    fb.textContent = '정답!';
    fb.className = 'mt-1 text-xs rounded px-2 py-0.5 text-green-600 bg-green-50';
  } else {
    const correct = Array.isArray(item.correctAnswer) ? item.correctAnswer.join(', ') : item.correctAnswer;
    fb.textContent = `정답: ${correct}`;
    fb.className = 'mt-1 text-xs rounded px-2 py-0.5 text-red-500 bg-red-50';
  }
}

function matchAnswer(userAnswer, correctAnswer, type) {
  if (type === 'en') {
    return userAnswer === normalize(correctAnswer);
  }
  return correctAnswer.some(def =>
    normalize(def) === userAnswer ||
    normalize(def).includes(userAnswer) ||
    userAnswer.includes(normalize(def))
  );
}

// ─── Grade All ────────────────────────────────────────────────────────────────
function gradeAll() {
  // Pull current input values from DOM for unanswered items
  for (const [key, item] of Object.entries(_items)) {
    if (item.answered) continue;
    const inputEl = document.querySelector(`#iw-${key} input`);
    const val = inputEl ? normalize(inputEl.value) : '';
    item.userAnswer = val || null;
    item.isCorrect = val ? matchAnswer(val, item.correctAnswer, item.type) : false;
    item.answered = true;
  }

  const entries = Object.values(_items);
  const total = entries.length;
  const correct = entries.filter(i => i.isCorrect).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const now = new Date();
  const record = {
    id: now.getTime(),
    date: now.toLocaleDateString('ko-KR'),
    time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    category: currentCategory.name,
    mode: hideState.en ? '영어 가리기' : '뜻 가리기',
    total,
    correct,
    pct,
    items: entries.map(i => ({
      word: i.word,
      type: i.type,
      partOfSpeech: i.partOfSpeech,
      correctAnswer: Array.isArray(i.correctAnswer) ? i.correctAnswer.join(', ') : i.correctAnswer,
      userAnswer: i.userAnswer || '(미응답)',
      isCorrect: i.isCorrect
    }))
  };

  saveHistoryRecord(record);
  renderHistoryDetail(record);
  showView('history-detail');
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────
function buildQuizItems(category) {
  const items = [];
  for (const word of category.words) {
    items.push({ word: word.word, meanings: word.meanings });
    if (word.related) {
      for (const rel of word.related) {
        items.push({ word: rel.word, meanings: rel.meanings });
      }
    }
  }
  return shuffle(items);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuiz(mode) {
  quizItems = buildQuizItems(currentCategory);
  quizIndex = 0;
  quizCorrect = 0;
  quizWrong = 0;
  quizRevealed = false;
  renderQuizCard(mode);
}

function renderQuizCard(mode) {
  const container = document.getElementById('quiz-container');
  const total = quizItems.length;

  if (quizIndex >= total) {
    renderQuizResult();
    return;
  }

  const item = quizItems[quizIndex];
  const progress = (quizIndex / total) * 100;
  const isEnMode = mode === 'quiz-en'; // 뜻 보여주고 영어 맞추기

  container.innerHTML = `
    <div class="progress-bar mt-2 mb-4">
      <div class="progress-fill" style="width:${progress}%"></div>
    </div>
    <div class="text-xs text-gray-400 text-center mb-4">${quizIndex + 1} / ${total}</div>

    <div class="quiz-card" id="quiz-card-area">
      <div class="quiz-prompt">${isEnMode ? '이 뜻의 영단어는?' : '이 단어의 뜻은?'}</div>
      ${isEnMode
        ? `<div class="quiz-meaning">${item.meanings.map(m =>
            `<div><span class="pos-badge">${m.partOfSpeech}</span> ${m.definitions.join(', ')}</div>`
          ).join('')}</div>`
        : `<div class="quiz-word">${item.word}</div>`
      }

      <div id="quiz-answer" class="quiz-answer hidden reveal-anim">
        ${isEnMode
          ? `<div class="font-bold text-indigo-700 text-2xl">${item.word}</div>`
          : `<div>${item.meanings.map(m =>
              `<div class="text-sm"><span class="pos-badge">${m.partOfSpeech}</span> ${m.definitions.join(', ')}</div>`
            ).join('')}</div>`
        }
      </div>
    </div>

    <!-- 입력창 -->
    <div id="quiz-input-area" class="mt-4">
      <div class="flex gap-2">
        <input id="quiz-input" type="text"
          placeholder="${isEnMode ? '영단어를 입력하세요' : '뜻을 입력하세요'}"
          class="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
        <button onclick="checkAnswer()"
          class="px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold active:bg-indigo-700">
          확인
        </button>
      </div>
      <div id="quiz-feedback" class="hidden mt-3 text-center text-sm font-medium rounded-xl py-2"></div>
    </div>

    <div id="quiz-next" class="hidden mt-4">
      <button onclick="markQuiz(false)"
        class="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50">
        다음 ›
      </button>
    </div>

    <div class="mt-4 text-center text-sm text-gray-400">
      맞음 <span class="text-green-500 font-semibold">${quizCorrect}</span>
      &nbsp; 틀림 <span class="text-red-400 font-semibold">${quizWrong}</span>
    </div>
  `;

  // Focus input and bind Enter key after render
  const input = document.getElementById('quiz-input');
  if (input) {
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkAnswer();
    });
  }
}


function escapeJs(str) {
  return str.replace(/'/g, "\\'");
}

function escHtml(s) {
  return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// ─── Word CRUD ────────────────────────────────────────────────────────────────
function openAddWord() {
  _editingWordId = null;
  showWordModal('단어 추가', { word: '', meanings: [{ partOfSpeech: '', definitions: [''] }], related: [] });
}

function openEditWord(wordId) {
  _editingWordId = wordId;
  const word = currentCategory.words.find(w => w.id === wordId);
  if (!word) return;
  showWordModal('단어 수정', word);
}

function showWordModal(title, word) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-form').innerHTML = buildWordForm(word);
  document.getElementById('word-modal').showModal();
}

function closeWordModal() {
  document.getElementById('word-modal').close();
}

function meaningRowHtml(pos, defs) {
  return `<div class="meaning-row flex gap-1 items-center">
    <input type="text" placeholder="품사" value="${escHtml(pos)}"
      class="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400 pos-input">
    <input type="text" placeholder="뜻 (콤마로 구분)" value="${escHtml(defs)}"
      class="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400 def-input">
    <button type="button" onclick="this.closest('.meaning-row').remove()" class="text-red-400 text-sm px-1 flex-shrink-0">✕</button>
  </div>`;
}

function relatedItemHtml(rWord, meaningsHtml) {
  return `<div class="related-item border border-gray-100 rounded-xl p-3 mb-2 bg-gray-50">
    <div class="flex items-center gap-2 mb-2">
      <input type="text" placeholder="연계 단어" value="${escHtml(rWord)}"
        class="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 related-word-input bg-white">
      <button type="button" onclick="this.closest('.related-item').remove()" class="text-red-400 text-xs px-2 py-1 border border-red-200 rounded-lg flex-shrink-0">삭제</button>
    </div>
    <div class="related-meanings space-y-1">${meaningsHtml}</div>
    <button type="button" onclick="addRelatedMeaning(this)" class="text-xs text-indigo-500 mt-1">+ 뜻 추가</button>
  </div>`;
}

function buildWordForm(word) {
  const meaningsHtml = (word.meanings || []).map(m =>
    meaningRowHtml(m.partOfSpeech, (m.definitions || []).join(', '))
  ).join('');

  const relatedHtml = (word.related || []).map(r => {
    const rMeaningsHtml = (r.meanings || []).map(m =>
      meaningRowHtml(m.partOfSpeech, (m.definitions || []).join(', '))
    ).join('');
    return relatedItemHtml(r.word, rMeaningsHtml);
  }).join('');

  return `<div class="space-y-4">
    <div>
      <label class="text-xs font-semibold text-gray-500 mb-1 block">영단어 *</label>
      <input id="form-word" type="text" placeholder="영단어" value="${escHtml(word.word)}"
        class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
    </div>
    <div>
      <label class="text-xs font-semibold text-gray-500 mb-1 block">뜻 *</label>
      <div id="form-meanings" class="space-y-1">${meaningsHtml}</div>
      <button type="button" onclick="addMeaningRow()" class="text-xs text-indigo-500 mt-1">+ 뜻 추가</button>
    </div>
    <div>
      <label class="text-xs font-semibold text-gray-500 mb-1 block">연계 단어</label>
      <div id="form-related">${relatedHtml}</div>
      <button type="button" onclick="addRelatedRow()" class="text-xs text-indigo-500 mt-1">+ 연계 단어 추가</button>
    </div>
  </div>`;
}

function addMeaningRow() {
  document.getElementById('form-meanings').insertAdjacentHTML('beforeend', meaningRowHtml('', ''));
}

function addRelatedRow() {
  document.getElementById('form-related').insertAdjacentHTML('beforeend', relatedItemHtml('', meaningRowHtml('', '')));
}

function addRelatedMeaning(btn) {
  btn.previousElementSibling.insertAdjacentHTML('beforeend', meaningRowHtml('', ''));
}

function collectMeanings(container) {
  const meanings = [];
  container.querySelectorAll('.meaning-row').forEach(row => {
    const pos = row.querySelector('.pos-input').value.trim();
    const defs = row.querySelector('.def-input').value.trim();
    if (defs) meanings.push({ partOfSpeech: pos, definitions: defs.split(',').map(d => d.trim()).filter(Boolean) });
  });
  return meanings;
}

function saveWord() {
  const wordText = document.getElementById('form-word').value.trim();
  if (!wordText) { showToast('영단어를 입력하세요.'); return; }

  const meanings = collectMeanings(document.getElementById('form-meanings'));
  if (meanings.length === 0) { showToast('뜻을 하나 이상 입력하세요.'); return; }

  const related = [];
  document.querySelectorAll('#form-related .related-item').forEach(item => {
    const rWord = item.querySelector('.related-word-input').value.trim();
    if (!rWord) return;
    const rMeanings = collectMeanings(item);
    if (rMeanings.length > 0) related.push({ id: nextId(), word: rWord, meanings: rMeanings });
  });

  const cat = allData.categories.find(c => c.id === currentCategory.id);
  if (_editingWordId === null) {
    cat.words.push({ id: nextId(), word: wordText, meanings, related });
  } else {
    const idx = cat.words.findIndex(w => w.id === _editingWordId);
    if (idx !== -1) {
      const oldRelated = cat.words[idx].related || [];
      related.forEach((r, i) => { if (oldRelated[i]) r.id = oldRelated[i].id; });
      cat.words[idx] = { id: _editingWordId, word: wordText, meanings, related };
    }
  }
  currentCategory = cat;
  saveData();
  closeWordModal();
  renderWordList();
  showToast(_editingWordId === null ? '추가됐습니다.' : '수정됐습니다.');
}

function deleteWord(wordId) {
  if (!confirm('이 단어를 삭제할까요?')) return;
  const cat = allData.categories.find(c => c.id === currentCategory.id);
  cat.words = cat.words.filter(w => w.id !== wordId);
  currentCategory = cat;
  saveData();
  renderWordList();
  showToast('삭제됐습니다.');
}

function normalize(str) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function checkAnswer() {
  if (quizRevealed) return;
  const input = document.getElementById('quiz-input');
  const feedback = document.getElementById('quiz-feedback');
  const userAnswer = normalize(input.value);
  if (!userAnswer) return;

  const item = quizItems[quizIndex];
  const isEnMode = currentMode === 'quiz-en';

  let isCorrect = false;
  if (isEnMode) {
    isCorrect = userAnswer === normalize(item.word);
  } else {
    const allDefs = item.meanings.flatMap(m => m.definitions);
    isCorrect = allDefs.some(def => normalize(def) === userAnswer || normalize(def).includes(userAnswer) || userAnswer.includes(normalize(def)));
  }

  quizRevealed = true;
  input.disabled = true;
  document.getElementById('quiz-answer').classList.remove('hidden');

  feedback.classList.remove('hidden');
  if (isCorrect) {
    feedback.textContent = '정답이에요!';
    feedback.className = 'mt-3 text-center text-sm font-medium rounded-xl py-2 bg-green-50 text-green-600';
    setTimeout(() => markQuiz(true), 800);
  } else {
    feedback.textContent = '틀렸어요. 정답을 확인하세요.';
    feedback.className = 'mt-3 text-center text-sm font-medium rounded-xl py-2 bg-red-50 text-red-500';
    document.getElementById('quiz-next').classList.remove('hidden');
  }
}

function markQuiz(correct) {
  if (correct) quizCorrect++; else quizWrong++;
  quizIndex++;
  quizRevealed = false;
  renderQuizCard(currentMode);
}

function renderQuizResult() {
  const total = quizItems.length;
  const pct = Math.round((quizCorrect / total) * 100);
  const color = pct >= 80 ? 'bg-green-100 text-green-600' : pct >= 50 ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-500';
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '😊' : '💪';

  const now = new Date();
  saveHistoryRecord({
    id: now.getTime(),
    date: now.toLocaleDateString('ko-KR'),
    time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    category: currentCategory.name,
    mode: currentMode === 'quiz-en' ? '뜻→영어' : '영어→뜻',
    correct: quizCorrect,
    wrong: quizWrong,
    total,
    pct,
    items: []   // 퀴즈 탭은 문항별 상세 없음
  });

  document.getElementById('quiz-container').innerHTML = `
    <div class="py-8 text-center">
      <div class="result-circle ${color} mb-4">
        <div class="text-3xl">${emoji}</div>
        <div class="text-2xl font-bold">${pct}%</div>
      </div>
      <div class="text-gray-700 font-semibold text-lg mb-1">퀴즈 완료!</div>
      <div class="text-gray-500 text-sm mb-6">
        ${total}문제 중 <span class="text-green-600 font-bold">${quizCorrect}개</span> 정답
        &nbsp;/ <span class="text-red-500 font-bold">${quizWrong}개</span> 오답
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="startQuiz(currentMode)"
          class="py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm active:bg-indigo-700">
          다시 풀기
        </button>
        <button onclick="switchMode('list')"
          class="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50">
          목록 보기
        </button>
      </div>
    </div>
  `;
}

// ─── History ──────────────────────────────────────────────────────────────────
const HISTORY_KEY = 'vocab_history';

function loadHistoryRecords() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistoryRecord(record) {
  const records = loadHistoryRecords();
  records.unshift(record);
  if (records.length > 100) records.splice(100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

function renderHistoryList() {
  const records = loadHistoryRecords();
  const container = document.getElementById('history-list-container');

  if (records.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-3">📋</div>
        <div class="text-sm">아직 채점 기록이 없습니다.<br>전체 목록에서 가리기 후 채점해 보세요.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="space-y-3">
      ${records.map(r => {
        const pctColor = r.pct >= 80 ? 'text-green-600 bg-green-50' : r.pct >= 50 ? 'text-yellow-600 bg-yellow-50' : 'text-red-500 bg-red-50';
        return `
          <button onclick="openHistoryDetail(${r.id})"
            class="w-full bg-white rounded-xl p-4 shadow-sm text-left active:bg-gray-50 transition-colors">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold text-gray-800 text-sm">${r.category} · ${r.mode}</div>
                <div class="text-xs text-gray-400 mt-0.5">${r.date} ${r.time}</div>
                <div class="text-xs text-gray-500 mt-1">
                  정답 <span class="text-green-600 font-semibold">${r.correct}</span> /
                  오답 <span class="text-red-500 font-semibold">${r.total - r.correct}</span> /
                  전체 ${r.total}문항
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold px-3 py-1 rounded-xl ${pctColor}">${r.pct}%</span>
                <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>
          </button>`;
      }).join('')}
      <button onclick="clearHistory()"
        class="mt-2 text-xs text-red-400 underline w-full text-center py-2">기록 모두 삭제</button>
    </div>`;
}

function openHistoryDetail(id) {
  const records = loadHistoryRecords();
  const record = records.find(r => r.id === id);
  if (!record) return;
  renderHistoryDetail(record);
  showView('history-detail');
}

function renderHistoryDetail(record) {
  const container = document.getElementById('history-detail-container');
  const pctColor = record.pct >= 80 ? 'bg-green-100 text-green-600' : record.pct >= 50 ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-500';
  const emoji = record.pct >= 80 ? '🎉' : record.pct >= 50 ? '😊' : '💪';

  if (!record.items || record.items.length === 0) {
    container.innerHTML = `
    <div class="text-center mb-6">
      <div class="result-circle ${pctColor} mb-3">
        <div class="text-3xl">${emoji}</div>
        <div class="text-2xl font-bold">${record.pct}%</div>
      </div>
      <div class="text-sm font-semibold text-gray-700">${record.category} · ${record.mode}</div>
      <div class="text-xs text-gray-400 mt-1">${record.date} ${record.time}</div>
      <div class="flex justify-center gap-4 mt-3 text-sm">
        <span>전체 <strong>${record.total}</strong></span>
        <span class="text-green-600">정답 <strong>${record.correct}</strong></span>
        <span class="text-red-500">오답 <strong>${record.total - record.correct}</strong></span>
      </div>
    </div>
    <div class="text-center text-sm text-gray-400 py-6">문항별 기록 없음</div>`;
    return;
  }

  const rows = record.items.map(item => {
    const icon = item.isCorrect
      ? `<span class="result-icon correct">O</span>`
      : `<span class="result-icon wrong">X</span>`;
    const userClass = item.isCorrect ? 'text-green-700' : 'text-red-500';
    const correctDisplay = item.isCorrect ? '' : `<div class="text-xs text-indigo-600 mt-0.5">정답: ${item.correctAnswer}</div>`;

    return `
      <div class="result-row ${item.isCorrect ? 'result-row-correct' : 'result-row-wrong'}">
        <div class="flex items-start gap-3">
          ${icon}
          <div class="flex-1 min-w-0">
            <div class="text-xs text-gray-400 mb-0.5">${item.type === 'en' ? '영단어 쓰기' : item.word + (item.partOfSpeech ? ' · ' + item.partOfSpeech : '')}</div>
            <div class="text-sm font-medium ${userClass} truncate">${item.userAnswer}</div>
            ${correctDisplay}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="text-center mb-6">
      <div class="result-circle ${pctColor} mb-3">
        <div class="text-3xl">${emoji}</div>
        <div class="text-2xl font-bold">${record.pct}%</div>
      </div>
      <div class="text-sm font-semibold text-gray-700">${record.category} · ${record.mode}</div>
      <div class="text-xs text-gray-400 mt-1">${record.date} ${record.time}</div>
      <div class="flex justify-center gap-4 mt-3 text-sm">
        <span>전체 <strong>${record.total}</strong></span>
        <span class="text-green-600">정답 <strong>${record.correct}</strong></span>
        <span class="text-red-500">오답 <strong>${record.total - record.correct}</strong></span>
      </div>
    </div>

    <h3 class="text-sm font-semibold text-gray-600 mb-3">정오표</h3>
    <div class="space-y-2">${rows}</div>`;
}

function clearHistory() {
  if (confirm('학습 기록을 모두 삭제할까요?')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryList();
    showToast('기록이 삭제되었습니다.');
  }
}


// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
