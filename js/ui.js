// ui.js — всё, что рисует и обновляет DOM. Не содержит бизнес-логики
// подбора миксов (это oracle.js) и не лезет в localStorage напрямую
// (это profile.js) — только берёт готовые данные и показывает их.

import { isFavorite, toggleFavorite, getFavorites, getHistory } from './profile.js';
import { getMixById } from './mixes.js';

const STAT_FIELDS = [
  { key: 'strength', label: 'Крепость' },
  { key: 'freshness', label: 'Свежесть' },
  { key: 'sweetness', label: 'Сладость' },
  { key: 'sourness', label: 'Кислинка' },
  { key: 'difficulty', label: 'Сложность' },
];

function buildStatGrid(mix) {
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  STAT_FIELDS.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = f.label;
    const dots = document.createElement('div');
    dots.className = 'stat-dots';
    const value = mix[f.key] || 0;
    for (let i = 1; i <= 5; i++) {
      const dot = document.createElement('span');
      dot.className = 'stat-dot' + (i <= value ? ' filled' : '');
      dots.appendChild(dot);
    }
    row.appendChild(label);
    row.appendChild(dots);
    grid.appendChild(row);
  });
  return grid;
}

function buildChips(mix) {
  const wrap = document.createElement('div');
  wrap.className = 'recipe-chips';
  mix.recipe.forEach((r) => {
    const chip = document.createElement('span');
    chip.className = 'recipe-chip';
    chip.textContent = r.flavor;
    if (r.percent) {
      const b = document.createElement('b');
      b.textContent = ` ${r.percent}%`;
      chip.appendChild(b);
    }
    wrap.appendChild(chip);
  });
  return wrap;
}

function buildRatingLine(mix) {
  const el = document.createElement('div');
  if (mix.rating != null) {
    el.className = 'mix-card-rating';
    el.textContent = `★ ${mix.rating.toFixed(1)}`;
  } else {
    // реальных оценок ещё нет — показываем эвристическую популярность,
    // а не выдаём её за настоящий рейтинг
    const pct = Math.max(0, Math.min(100, mix.popularity || 0));
    el.className = 'mix-card-rating mix-card-rating--new';
    el.textContent = `🔥 ${pct}% · оценок пока нет`;
  }
  return el;
}

// Карточка строится через createElement с прямыми ссылками на узлы —
// без id, без getElementById. Каждый вызов renderCard() полностью
// заменяет содержимое cardEl (replaceChildren), поэтому старые
// обработчики уходят вместе со старыми узлами — без утечек.
export function renderCard(cardEl, mix) {
  const fav = isFavorite(mix.id);

  const head = document.createElement('div');
  head.className = 'mix-card-head';
  const title = document.createElement('div');
  title.className = 'mix-card-title';
  title.textContent = mix.name;
  const favBtn = document.createElement('button');
  favBtn.className = 'fav-btn' + (fav ? ' active' : '');
  favBtn.setAttribute('aria-label', 'В избранное');
  favBtn.textContent = fav ? '♥' : '♡';
  head.appendChild(title);
  head.appendChild(favBtn);

  const desc = document.createElement('div');
  desc.className = 'mix-card-desc';
  desc.textContent = mix.description;

  const compositionLabel = document.createElement('div');
  compositionLabel.className = 'mix-card-section-label';
  compositionLabel.textContent = 'Состав';

  const profileLabel = document.createElement('div');
  profileLabel.className = 'mix-card-section-label';
  profileLabel.textContent = 'Профиль вкуса';

  const foot = document.createElement('div');
  foot.className = 'mix-card-foot';
  const authorSpan = document.createElement('span');
  authorSpan.textContent = `Автор: ${mix.author || 'ALX Oracle'}`;
  const shareBtn = document.createElement('button');
  shareBtn.className = 'share-btn';
  shareBtn.textContent = 'Поделиться';
  foot.appendChild(authorSpan);
  foot.appendChild(shareBtn);

  cardEl.replaceChildren(
    head,
    buildRatingLine(mix),
    desc,
    compositionLabel,
    buildChips(mix),
    profileLabel,
    buildStatGrid(mix),
    foot,
  );
  cardEl.classList.add('show');

  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(mix.id);
    favBtn.classList.toggle('active', nowFav);
    favBtn.textContent = nowFav ? '♥' : '♡';
    favBtn.classList.remove('pop');
    void favBtn.offsetWidth;
    favBtn.classList.add('pop');
    showToast(nowFav ? 'Добавлено в избранное' : 'Убрано из избранного');
  });

  shareBtn.addEventListener('click', () => shareMix(mix));
}

export async function renderOrbText(screenContentEl, mix, signal, sceneId) {
  window.ALX_DIAG?.trace?.('renderOrbText', { sceneId, timestamp: Date.now(), text: mix?.name ?? null });
  // Production minimal renderer: one plain text node, no typewriter, no .ch.
  screenContentEl.replaceChildren();

  const mixName = document.createElement('div');
  mixName.className = 'mix-name';
  mixName.dataset.sceneId = String(sceneId);
  mixName.textContent = mix.name;

  screenContentEl.replaceChildren(mixName);
  console.assert(screenContentEl.children.length === 1, '[ALX] REVEAL must contain exactly one child');
  console.assert(screenContentEl.querySelectorAll('.mix-name').length === 1, '[ALX] REVEAL must contain exactly one .mix-name');
  window.ALX_DIAG?.snapshot?.('REVEAL_PLAIN_TEXT');
}

export async function renderOraclePhrase(screenContentEl, phrase, signal, sceneId) {
  window.ALX_DIAG?.trace?.('renderOraclePhrase', { sceneId, timestamp: Date.now(), text: phrase });
  // Production minimal renderer: exactly one plain phrase element.
  screenContentEl.replaceChildren();

  const phraseEl = document.createElement('div');
  phraseEl.className = 'oracle-phrase';
  phraseEl.dataset.sceneId = String(sceneId);
  phraseEl.textContent = phrase;

  screenContentEl.replaceChildren(phraseEl);
  console.assert(screenContentEl.children.length === 1, '[ALX] PHRASE must contain exactly one child');
  console.assert(screenContentEl.querySelectorAll('.oracle-phrase').length === 1, '[ALX] PHRASE must contain exactly one .oracle-phrase');
  window.ALX_DIAG?.snapshot?.('PHRASE_PLAIN_TEXT');
}

export function renderIdleState(screenContentEl) {
  screenContentEl.innerHTML =
    '<div class="idle-icon">✦</div>' +
    '<div class="idle-text">встряхни —<br>узнай микс</div>';
}

export function hideCard(cardEl) {
  cardEl.classList.remove('show');
}

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------
let toastTimer = null;
export function showToast(text) {
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 1800);
}

// ---------------------------------------------------------------
// Шаринг микса — через Telegram (если доступно) с копированием в буфер как фолбэком
// ---------------------------------------------------------------
function shareMix(mix) {
  const text = `🔮 Оракул подсказал микс «${mix.name}»\n${mix.recipe
    .map((r) => `${r.flavor}${r.percent ? ' ' + r.percent + '%' : ''}`)
    .join(' · ')}`;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.switchInlineQuery) {
    try {
      tg.switchInlineQuery(mix.name, ['users', 'groups']);
      return;
    } catch (e) { /* падаем в фолбэк ниже */ }
  }
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Скопировано в буфер обмена'));
  }
}

// ---------------------------------------------------------------
// Панель «Избранное» / «История» (bottom sheet)
// ---------------------------------------------------------------
export function openSheet(kind) {
  const overlay = document.getElementById('sheetOverlay');
  const titleEl = document.getElementById('sheetTitle');
  const listEl = document.getElementById('sheetList');

  const ids = kind === 'favorites'
    ? getFavorites()
    : [...new Set(getHistory().map((h) => h.id))];

  titleEl.firstChild.textContent = kind === 'favorites' ? 'Избранные миксы' : 'История';

  if (!ids.length) {
    listEl.innerHTML = `<div class="sheet-empty">${
      kind === 'favorites'
        ? 'Пока пусто. Нажми ♡ на карточке микса, чтобы сохранить его сюда.'
        : 'Пока пусто. Встряхни шар, и здесь появится история.'
    }</div>`;
  } else {
    listEl.innerHTML = ids
      .map((id) => getMixById(id))
      .filter(Boolean)
      .map(
        (m) => `
        <div class="sheet-item" data-id="${m.id}">
          <span class="sheet-item-name">${m.name}</span>
          ${kind === 'favorites' ? '<button class="sheet-item-remove" data-remove="' + m.id + '">Убрать</button>' : ''}
        </div>`
      )
      .join('');

    if (kind === 'favorites') {
      listEl.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          toggleFavorite(btn.getAttribute('data-remove'));
          openSheet('favorites');
        });
      });
    }
  }

  overlay.classList.add('show');
}

export function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('show');
}
