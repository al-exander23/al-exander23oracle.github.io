// ui.js — всё, что рисует и обновляет DOM. Не содержит бизнес-логики
// подбора миксов (это oracle.js) и не лезет в localStorage напрямую
// (это profile.js) — только берёт готовые данные и показывает их.

import { typeText } from './effects.js';
import { isFavorite, toggleFavorite, getFavorites, getHistory } from './profile.js';
import { getMixById } from './mixes.js';

const STAT_FIELDS = [
  { key: 'strength', label: 'Крепость' },
  { key: 'freshness', label: 'Свежесть' },
  { key: 'sweetness', label: 'Сладость' },
  { key: 'sourness', label: 'Кислинка' },
  { key: 'difficulty', label: 'Сложность' },
];

function statDots(value) {
  let html = '<div class="stat-dots">';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="stat-dot${i <= value ? ' filled' : ''}"></span>`;
  }
  html += '</div>';
  return html;
}

function renderStatGrid(mix) {
  return STAT_FIELDS.map(
    (f) => `
    <div class="stat-row">
      <span class="stat-label">${f.label}</span>
      ${statDots(mix[f.key] || 0)}
    </div>`
  ).join('');
}

function renderChips(mix) {
  return mix.recipe
    .map((r) => `<span class="recipe-chip">${r.flavor}${r.percent ? ` <b>${r.percent}%</b>` : ''}</span>`)
    .join('');
}

export function renderOrbText(screenContentEl, mix) {
  screenContentEl.innerHTML =
    '<div class="mix-name" id="mn"></div>' +
    '<div class="mix-desc" id="md"></div>';
  const mn = document.getElementById('mn');
  const md = document.getElementById('md');
  md.textContent = mix.recipe.map((r) => `${r.flavor}${r.percent ? ' ' + r.percent + '%' : ''}`).join(' · ');
  mn.classList.add('in');
  return new Promise((resolve) => {
    typeText(mn, mix.name, () => {
      md.classList.add('in');
      resolve();
    });
  });
}

export function renderOraclePhrase(screenContentEl, phrase) {
  screenContentEl.innerHTML = `<div class="oracle-phrase" id="op">${phrase}</div>`;
  const op = document.getElementById('op');
  requestAnimationFrame(() => requestAnimationFrame(() => op.classList.add('in')));
}

export function renderIdleState(screenContentEl) {
  screenContentEl.innerHTML =
    '<div class="idle-icon">✦</div>' +
    '<div class="idle-text">встряхни —<br>узнай микс</div>';
}

function renderRatingLine(mix) {
  if (mix.rating != null) {
    return `<div class="mix-card-rating">★ ${mix.rating.toFixed(1)}</div>`;
  }
  // реальных оценок ещё нет — показываем эвристическую популярность,
  // а не выдаём её за настоящий рейтинг
  const pct = Math.max(0, Math.min(100, mix.popularity || 0));
  return `<div class="mix-card-rating mix-card-rating--new">🔥 ${pct}% · оценок пока нет</div>`;
}

export function renderCard(cardEl, mix) {
  const fav = isFavorite(mix.id);
  cardEl.innerHTML = `
    <div class="mix-card-head">
      <div class="mix-card-title">${mix.name}</div>
      <button class="fav-btn${fav ? ' active' : ''}" id="favBtn" aria-label="В избранное">${fav ? '♥' : '♡'}</button>
    </div>
    ${renderRatingLine(mix)}
    <div class="mix-card-desc">${mix.description}</div>
    <div class="mix-card-section-label">Состав</div>
    <div class="recipe-chips">${renderChips(mix)}</div>
    <div class="mix-card-section-label">Профиль вкуса</div>
    <div class="stat-grid">${renderStatGrid(mix)}</div>
    <div class="mix-card-foot">
      <span>Автор: ${mix.author || 'ALX Oracle'}</span>
      <button class="share-btn" id="shareBtn">Поделиться</button>
    </div>
  `;
  cardEl.classList.add('show');

  const favBtn = document.getElementById('favBtn');
  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(mix.id);
    favBtn.classList.toggle('active', nowFav);
    favBtn.textContent = nowFav ? '♥' : '♡';
    favBtn.classList.remove('pop');
    void favBtn.offsetWidth;
    favBtn.classList.add('pop');
    showToast(nowFav ? 'Добавлено в избранное' : 'Убрано из избранного');
  });

  const shareBtn = document.getElementById('shareBtn');
  shareBtn.addEventListener('click', () => shareMix(mix));
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
