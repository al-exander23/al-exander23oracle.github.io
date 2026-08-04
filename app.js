// app.js — точка входа. Собирает вместе oracle.js (мозг), ui.js (вид),
// effects.js (движение) и profile.js (память), и больше почти ничего
// не делает сама — задача этого файла - только оркестрация сцены.

import { initMixes } from './mixes.js';
import { oracleChooseMix } from './oracle.js';
import { createGlobeRotator, spawnSmoke, spawnMotes } from './effects.js';
import {
  renderOrbText, renderOraclePhrase, renderIdleState, renderCard, hideCard,
  showToast, openSheet, closeSheet,
} from './ui.js';
import { addToHistory, isFavorite } from './profile.js';

// ---------------------------------------------------------------
// Telegram WebApp bootstrap
// ---------------------------------------------------------------
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor && tg.setHeaderColor('#0b0912'); } catch (e) {}
}
function haptic(style) {
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred(style || 'medium'); } catch (e) {}
  } else if (navigator.vibrate) {
    navigator.vibrate(style === 'light' ? 12 : 30);
  }
}

// ---------------------------------------------------------------
// DOM
// ---------------------------------------------------------------
const orbWrap = document.getElementById('orbWrap');
const orbSurface = document.getElementById('orbSurface');
const orbSmoke = document.getElementById('orbSmoke');
const screenEl = document.getElementById('screen');
const screenContent = document.getElementById('screenContent');
const counterEl = document.getElementById('counter');
const lockBtn = document.getElementById('lockBtn');
const mixCardEl = document.getElementById('mixCard');
const motesEl = document.getElementById('motes');

let count = 0;
let busy = false;
let locked = false;
let currentMix = null;

spawnMotes(motesEl, 22);
const rotator = createGlobeRotator(orbSurface);

// ---------------------------------------------------------------
// Сцена «оракул отвечает» — ровно по сценарию:
// нажатие → свечение → дым → смена подсветки → фраза оракула →
// ускорение шара → карточка появляется красиво.
// Всё на неблокирующих таймерах, ни одного synchronous sleep.
// ---------------------------------------------------------------
const T_DIM = 550;        // экран гаснет, проступает свечение и дым
const T_PHRASE = 950;     // фраза оракула держится на экране
const T_PHRASE_OUT = 350; // короткое затемнение перед раскрытием микса
const T_SETTLE = 650;     // шар успокаивается после ответа

async function revealMix() {
  if (busy || locked) return;
  busy = true;
  haptic('medium');

  // 1. шар начинает светиться + разгоняется + идёт дым
  orbWrap.classList.add('thinking');
  rotator.setBurst();
  const clearSmoke = spawnSmoke(orbSmoke, 5);

  // 2. меняется подсветка экрана
  screenEl.classList.add('off');

  await wait(T_DIM);

  // 3. появляется фраза оракула
  const { mix, phrase } = oracleChooseMix();
  if (!mix) { busy = false; orbWrap.classList.remove('thinking'); return; }
  renderOraclePhrase(screenContent, phrase);
  screenEl.classList.remove('off');

  await wait(T_PHRASE);

  // короткая смена подсветки перед самим раскрытием
  screenEl.classList.add('off');
  await wait(T_PHRASE_OUT);

  // 4. раскрываем сам микс — печатаем название, затем описание
  currentMix = mix;
  screenEl.classList.remove('off');
  screenEl.classList.remove('sweep');
  void screenEl.offsetWidth;
  screenEl.classList.add('sweep');

  await renderOrbText(screenContent, mix);

  // 5. карточка появляется красиво, оракул успокаивается
  renderCard(mixCardEl, mix);
  count++;
  counterEl.textContent = '№ ' + String(count).padStart(3, '0');
  lockBtn.style.display = 'inline-block';
  addToHistory(mix.id);

  await wait(T_SETTLE);
  rotator.setIdle();
  orbWrap.classList.remove('thinking');
  clearSmoke();
  busy = false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------
// Встряхивание: только реальный рывок, не поворот телефона.
// Используем линейное ускорение БЕЗ гравитации — поворот/наклон
// телефона меняет вектор гравитации, но не даёт скачка линейного
// ускорения, поэтому больше не путается со встряхиванием.
// ---------------------------------------------------------------
const SHAKE_THRESHOLD = 15;
const SHAKE_COOLDOWN = 700;
const gravity = { x: 0, y: 0, z: 0 };
let gravityInit = false;
let lastTriggerTs = 0;

function processLinearAcceleration(x, y, z, now) {
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  if (magnitude > SHAKE_THRESHOLD && now - lastTriggerTs > SHAKE_COOLDOWN) {
    lastTriggerTs = now;
    revealMix();
  }
}

function handleMotion(e) {
  const now = Date.now();
  const lin = e.acceleration;
  if (lin && lin.x !== null && lin.x !== undefined) {
    processLinearAcceleration(lin.x, lin.y, lin.z, now);
    return;
  }
  const raw = e.accelerationIncludingGravity;
  if (!raw || raw.x === null || raw.x === undefined) return;

  if (!gravityInit) {
    gravity.x = raw.x; gravity.y = raw.y; gravity.z = raw.z;
    gravityInit = true;
    return;
  }
  const alpha = 0.85;
  gravity.x = alpha * gravity.x + (1 - alpha) * raw.x;
  gravity.y = alpha * gravity.y + (1 - alpha) * raw.y;
  gravity.z = alpha * gravity.z + (1 - alpha) * raw.z;

  processLinearAcceleration(raw.x - gravity.x, raw.y - gravity.y, raw.z - gravity.z, now);
}

function attachShake() {
  window.addEventListener('devicemotion', handleMotion, true);
}

function initMotion() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    const btn = document.createElement('button');
    btn.className = 'permission-btn';
    btn.textContent = 'Разрешить встряхивание';
    btn.onclick = () => {
      DeviceMotionEvent.requestPermission().then((state) => {
        if (state === 'granted') attachShake();
        btn.remove();
      }).catch(() => btn.remove());
    };
    document.getElementById('hint').insertAdjacentElement('afterend', btn);
  } else if (typeof DeviceMotionEvent !== 'undefined') {
    attachShake();
  }
}

// ---------------------------------------------------------------
// Остальные обработчики UI
// ---------------------------------------------------------------
orbWrap.addEventListener('click', revealMix);

lockBtn.addEventListener('click', () => {
  locked = !locked;
  lockBtn.textContent = locked ? '🔓 Открепить микс' : '🔒 Закрепить микс';
  lockBtn.classList.toggle('active', locked);
  haptic('light');
});

document.getElementById('favBtnTop').addEventListener('click', () => openSheet('favorites'));
document.getElementById('historyBtnTop').addEventListener('click', () => openSheet('history'));
document.getElementById('sheetClose').addEventListener('click', closeSheet);
document.getElementById('sheetOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'sheetOverlay') closeSheet();
});

// ---------------------------------------------------------------
// Старт
// ---------------------------------------------------------------
renderIdleState(screenContent);
initMotion();
initMixes().catch(() => showToast('Не удалось загрузить базу миксов'));
