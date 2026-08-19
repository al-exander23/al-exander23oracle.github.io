// app.v3.3.js — minimal runtime with orb-only visual spin and observable PHRASE/REVEAL frames.
// One click entry, one running guard, plain DOM rendering, orb-only visual spin.

import { initMixes, getMixById } from './mixes.js';
import { oracleChooseMix } from './oracle.js';
import {
  isFavorite,
  toggleFavorite,
  getFavorites,
  getHistory,
  addToHistory,
} from './profile.js';

window.ALX_BUILD = '3.3.0';
console.log('[ALX BUILD] 3.3.0');

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  if (typeof tg.ready === 'function') { try { tg.ready(); } catch (e) { /* optional */ } }
  if (typeof tg.expand === 'function') { try { tg.expand(); } catch (e) { /* optional */ } }
  if (typeof tg.setHeaderColor === 'function') {
    try { tg.setHeaderColor('#0b0912'); } catch (e) { /* optional */ }
  }
}

const orbWrap = document.getElementById('orbWrap');
const screenContent = document.getElementById('screenContent');
const screenEl = document.getElementById('screen');
const counterEl = document.getElementById('counter');
const lockBtn = document.getElementById('lockBtn');
const mixCardEl = document.getElementById('mixCard');
const runningState = { value: false };
let count = 0;
let lockedMixId = null;

function renderIdle() {
  screenContent.replaceChildren();
  const icon = document.createElement('div');
  icon.className = 'idle-icon';
  icon.textContent = '✦';
  const text = document.createElement('div');
  text.className = 'idle-text';
  text.append(document.createTextNode('встряхни —'));
  text.append(document.createElement('br'));
  text.append(document.createTextNode('узнай микс'));
  screenContent.append(icon, text);
}

function renderPhrase(oraclePhrase) {
  screenContent.replaceChildren();
  const phrase = document.createElement('div');
  phrase.className = 'oracle-phrase';
  phrase.textContent = oraclePhrase;
  screenContent.appendChild(phrase);
  console.assert(screenContent.children.length === 1, 'ALX: phrase must have one child');
  console.assert(document.querySelectorAll('.oracle-phrase').length === 1, 'ALX: expected one oracle phrase');
  console.assert(document.querySelectorAll('.idle-text').length === 0, 'ALX: idle text must be absent during phrase');
  console.assert(document.querySelectorAll('.idle-icon').length === 0, 'ALX: idle icon must be absent during phrase');
}

function renderReveal(mix) {
  screenContent.replaceChildren();
  const name = document.createElement('div');
  name.className = 'mix-name';
  name.textContent = mix.name;
  const desc = document.createElement('div');
  desc.className = 'mix-desc';
  desc.textContent = mix.description;
  screenContent.appendChild(name);
  screenContent.appendChild(desc);
  console.assert(document.querySelectorAll('.oracle-phrase').length === 0, 'ALX: phrase must be absent during reveal');
  console.assert(document.querySelectorAll('.mix-name').length === 1, 'ALX: expected one mix name');
  console.assert(document.querySelectorAll('.mix-desc').length === 1, 'ALX: expected one mix description');
}

function buildStatGrid(mix) {
  const fields = [
    ['strength', 'Крепость'], ['freshness', 'Свежесть'], ['sweetness', 'Сладость'],
    ['sourness', 'Кислинка'], ['difficulty', 'Сложность'],
  ];
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  for (const [key, labelText] of fields) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = labelText;
    const dots = document.createElement('div');
    dots.className = 'stat-dots';
    for (let i = 1; i <= 5; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'stat-dot' + (i <= (mix[key] || 0) ? ' filled' : '');
      dots.appendChild(dot);
    }
    row.append(label, dots);
    grid.appendChild(row);
  }
  return grid;
}

function renderCard(mix) {
  const head = document.createElement('div');
  head.className = 'mix-card-head';
  const title = document.createElement('div');
  title.className = 'mix-card-title';
  title.textContent = mix.name;
  const favBtn = document.createElement('button');
  favBtn.className = 'fav-btn' + (isFavorite(mix.id) ? ' active' : '');
  favBtn.setAttribute('aria-label', 'В избранное');
  favBtn.textContent = isFavorite(mix.id) ? '♥' : '♡';
  head.append(title, favBtn);

  const cardDesc = document.createElement('div');
  cardDesc.className = 'mix-card-desc';
  cardDesc.textContent = mix.description;
  const compositionLabel = document.createElement('div');
  compositionLabel.className = 'mix-card-section-label';
  compositionLabel.textContent = 'Состав';
  const chips = document.createElement('div');
  chips.className = 'recipe-chips';
  for (const recipe of mix.recipe || []) {
    const chip = document.createElement('span');
    chip.className = 'recipe-chip';
    chip.textContent = `${recipe.flavor}${recipe.percent ? ` ${recipe.percent}%` : ''}`;
    chips.appendChild(chip);
  }
  const profileLabel = document.createElement('div');
  profileLabel.className = 'mix-card-section-label';
  profileLabel.textContent = 'Профиль вкуса';
  const foot = document.createElement('div');
  foot.className = 'mix-card-foot';
  const author = document.createElement('span');
  author.textContent = `Автор: ${mix.author || 'ALX Oracle'}`;
  const shareBtn = document.createElement('button');
  shareBtn.className = 'share-btn';
  shareBtn.textContent = 'Поделиться';
  foot.append(author, shareBtn);

  mixCardEl.replaceChildren(head, cardDesc, compositionLabel, chips, profileLabel, buildStatGrid(mix), foot);
  mixCardEl.classList.add('show');

  favBtn.addEventListener('click', () => {
    const nowFavorite = toggleFavorite(mix.id);
    favBtn.classList.toggle('active', nowFavorite);
    favBtn.textContent = nowFavorite ? '♥' : '♡';
  });
  shareBtn.addEventListener('click', () => shareMix(mix));
}

function shareMix(mix) {
  const text = `Оракул подсказал микс «${mix.name}»\n${(mix.recipe || [])
    .map((r) => `${r.flavor}${r.percent ? ` ${r.percent}%` : ''}`).join(' · ')}`;
  if (tg && typeof tg.switchInlineQuery === 'function') {
    try { tg.switchInlineQuery(mix.name, ['users', 'groups']); return; } catch (e) { /* fallback */ }
  }
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
}

function renderSheet(kind) {
  const overlay = document.getElementById('sheetOverlay');
  const title = document.getElementById('sheetTitle');
  const list = document.getElementById('sheetList');
  const ids = kind === 'favorites'
    ? getFavorites()
    : [...new Set(getHistory().map((item) => item.id))];
  title.firstChild.textContent = kind === 'favorites' ? 'Избранные миксы' : 'История';
  list.replaceChildren();
  if (!ids.length) {
    const empty = document.createElement('div');
    empty.className = 'sheet-empty';
    empty.textContent = kind === 'favorites'
      ? 'Пока пусто. Нажми ♡ на карточке микса, чтобы сохранить его сюда.'
      : 'Пока пусто. Нажми на шар, и здесь появится история.';
    list.appendChild(empty);
  } else {
    for (const id of ids) {
      const mix = getMixById(id);
      if (!mix) continue;
      const item = document.createElement('div');
      item.className = 'sheet-item';
      const name = document.createElement('span');
      name.className = 'sheet-item-name';
      name.textContent = mix.name;
      item.appendChild(name);
      if (kind === 'favorites') {
        const remove = document.createElement('button');
        remove.className = 'sheet-item-remove';
        remove.textContent = 'Убрать';
        remove.addEventListener('click', () => { toggleFavorite(mix.id); renderSheet('favorites'); });
        item.appendChild(remove);
      }
      list.appendChild(item);
    }
  }
  overlay.classList.add('show');
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('show');
}

async function runOracle() {
  if (runningState.value) return;
  runningState.value = true;
  orbWrap.classList.add('is-spinning');
  screenEl.classList.add('is-spinning');
  try {
    await initMixes();
    const result = oracleChooseMix();
    if (!result.mix) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    renderPhrase(result.phrase);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderReveal(result.mix);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderCard(result.mix);
    addToHistory(result.mix.id);
    count += 1;
    counterEl.textContent = `№ ${String(count).padStart(3, '0')}`;
    lockBtn.style.display = 'inline-block';
  } finally {
    orbWrap.classList.remove('is-spinning');
    screenEl.classList.remove('is-spinning');
    renderIdle();
    runningState.value = false;
  }
}

orbWrap.addEventListener('click', runOracle);
lockBtn.addEventListener('click', () => {
  const history = getHistory();
  lockedMixId = lockedMixId ? null : (history.length ? history[history.length - 1].id : null);
  lockBtn.classList.toggle('active', Boolean(lockedMixId));
  lockBtn.textContent = lockedMixId ? '🔓 Открепить микс' : '🔒 Закрепить микс';
});
document.getElementById('favBtnTop').addEventListener('click', () => renderSheet('favorites'));
document.getElementById('historyBtnTop').addEventListener('click', () => renderSheet('history'));
document.getElementById('sheetClose').addEventListener('click', closeSheet);
document.getElementById('sheetOverlay').addEventListener('click', (event) => {
  if (event.target.id === 'sheetOverlay') closeSheet();
});

renderIdle();
initMixes().catch(() => {});
