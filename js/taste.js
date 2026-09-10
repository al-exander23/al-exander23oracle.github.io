// taste.js — отдельная UI-панель профиля вкуса.
// Не вмешивается в SceneController, Orb lifecycle или механизм вывода текста.

import { initMixes, getMixes } from './mixes.js';
import { buildDerivedProfile } from './personalization.js';
import { getTasteProfile, resetTaste } from './profile.js';

const LEVELS = [
  { max: 0, label: 'Новый профиль', note: 'Поставь ❤️ или 👎 нескольким миксам — Оракул начнёт подстраиваться.', progress: 0 },
  { max: 2, label: 'Изучаю вкус', note: 'Первые сигналы уже учитываются, но Оракул всё ещё много исследует.', progress: 35 },
  { max: 5, label: 'Понимаю направление', note: 'Предпочтения уже заметно влияют на подбор новых миксов.', progress: 70 },
  { max: Infinity, label: 'Вкус настроен', note: 'Явных сигналов достаточно для полной силы персонализации.', progress: 100 },
];

function getLevel(count) {
  return LEVELS.find((level) => count <= level.max) || LEVELS[LEVELS.length - 1];
}

function numericLabel(attr, value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  const labels = {
    strength: ['лёгкая', 'лёгкая+', 'средняя', 'крепкая', 'очень крепкая'],
    freshness: ['мягкая', 'слегка свежая', 'свежая', 'холодная', 'очень холодная'],
    sweetness: ['сухая', 'слегка сладкая', 'сбалансированная', 'сладкая', 'десертная'],
    sourness: ['мягкая', 'слегка кислая', 'сбалансированная', 'кислая', 'ярко кислая'],
  };
  return labels[attr]?.[rounded - 1] || null;
}

function topIngredients(profile) {
  return Object.entries(profile.ingredients || {})
    .filter(([, score]) => Number.isFinite(score) && score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

function buildTraitRows(profile) {
  const traits = [
    ['Крепость', numericLabel('strength', profile.numeric?.strength)],
    ['Свежесть', numericLabel('freshness', profile.numeric?.freshness)],
    ['Сладость', numericLabel('sweetness', profile.numeric?.sweetness)],
    ['Кислинка', numericLabel('sourness', profile.numeric?.sourness)],
  ].filter(([, value]) => value);

  if (!traits.length) {
    return '<div class="taste-empty">Добавь хотя бы один микс в ❤️, чтобы появился вкусовой профиль.</div>';
  }

  return `<div class="taste-traits">${traits.map(([label, value]) => `
    <div class="taste-trait"><span>${label}</span><b>${value}</b></div>
  `).join('')}</div>`;
}

function ensureTasteUi() {
  if (document.getElementById('tasteBtnTop')) return;

  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'tasteBtnTop';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Профиль вкуса');
  btn.textContent = '✦';

  const toolbar = document.getElementById('topToolbar');
  const stage = document.getElementById('stage');
  (toolbar || stage).appendChild(btn);

  const overlay = document.createElement('div');
  overlay.className = 'taste-overlay';
  overlay.id = 'tasteOverlay';
  overlay.innerHTML = `
    <section class="taste-panel" role="dialog" aria-modal="true" aria-labelledby="tasteTitle">
      <div class="taste-head">
        <div>
          <div class="taste-kicker">ALX ORACLE</div>
          <h2 id="tasteTitle">Профиль вкуса</h2>
        </div>
        <button class="taste-close" id="tasteClose" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div id="tasteContent"></div>
    </section>`;
  document.body.appendChild(overlay);

  btn.addEventListener('click', openTasteProfile);
  document.getElementById('tasteClose').addEventListener('click', closeTasteProfile);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeTasteProfile();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeTasteProfile();
  });
}

async function renderTasteProfile() {
  const content = document.getElementById('tasteContent');
  content.innerHTML = '<div class="taste-loading">Считываю сигналы вкуса…</div>';

  await initMixes();
  const mixes = getMixes();
  const raw = getTasteProfile();
  const derived = buildDerivedProfile(mixes);
  const explicitCount = derived.explicitSignalCount || 0;
  const level = getLevel(explicitCount);
  const ingredients = topIngredients(derived);
  const dislikesCount = Array.isArray(raw.dislikedIds) ? raw.dislikedIds.length : 0;
  const favoritesCount = Array.isArray(raw.favoriteIds) ? raw.favoriteIds.length : 0;

  content.innerHTML = `
    <div class="taste-level-card">
      <div class="taste-level-row">
        <div>
          <div class="taste-level-label">${level.label}</div>
          <div class="taste-level-count">${explicitCount} ${explicitCount === 1 ? 'сигнал' : 'сигналов'}</div>
        </div>
        <div class="taste-level-percent">${level.progress}%</div>
      </div>
      <div class="taste-progress"><span style="width:${level.progress}%"></span></div>
      <p>${level.note}</p>
    </div>

    <div class="taste-stats">
      <div><b>${favoritesCount}</b><span>❤️ нравится</span></div>
      <div><b>${dislikesCount}</b><span>👎 не подходит</span></div>
      <div><b>${raw.history?.length || 0}</b><span>показано</span></div>
    </div>

    <div class="taste-section">
      <div class="taste-section-title">Твой профиль</div>
      ${buildTraitRows(derived)}
    </div>

    <div class="taste-section">
      <div class="taste-section-title">Любимые ноты</div>
      ${ingredients.length
        ? `<div class="taste-chips">${ingredients.map((name) => `<span>${name}</span>`).join('')}</div>`
        : '<div class="taste-empty">Пока недостаточно ❤️, чтобы выделить любимые вкусы.</div>'}
    </div>

    <div class="taste-explain">История используется только для защиты от повторов. Сам вкус Оракул изучает по твоим ❤️ и 👎.</div>
    <button class="taste-reset" id="tasteReset" type="button" ${dislikesCount ? '' : 'disabled'}>Сбросить отметки 👎</button>
    <div class="taste-privacy">Профиль хранится локально на этом устройстве.</div>
  `;

  const resetBtn = document.getElementById('tasteReset');
  resetBtn.addEventListener('click', () => {
    resetTaste();
    document.querySelectorAll('.dislike-btn.active').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    renderTasteProfile();
  });
}

export function openTasteProfile() {
  const overlay = document.getElementById('tasteOverlay');
  overlay.classList.add('show');
  renderTasteProfile().catch((error) => {
    console.warn('[ALX Taste]', error);
    document.getElementById('tasteContent').innerHTML = '<div class="taste-empty">Не удалось собрать профиль. Попробуй открыть его ещё раз.</div>';
  });
}

export function closeTasteProfile() {
  document.getElementById('tasteOverlay')?.classList.remove('show');
}

ensureTasteUi();
