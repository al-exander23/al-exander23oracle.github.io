// app.js — точка входа. Собирает вместе oracle.js (мозг), ui.js (вид),
// effects.js (движение) и profile.js (память), и больше почти ничего
// не делает сама — задача этого файла - только оркестрация сцены.

import { initMixes, hasMixes } from './mixes.js';
import { oracleChooseMix } from './oracle.js';
import { createGlobeRotator, spawnSmoke, spawnMotes } from './effects.js';
import {
  renderOrbText, renderOraclePhrase, renderIdleState, renderCard, hideCard,
  showToast, openSheet, closeSheet,
} from './ui.js';
import { addToHistory, isFavorite } from './profile.js';
import { scene } from './scene.js';

// ---------------------------------------------------------------
// Telegram WebApp bootstrap
// ---------------------------------------------------------------
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  try { tg.ready(); } catch (e) { console.warn('[ALX Oracle] tg.ready() недоступен:', e); }
  try { tg.expand(); } catch (e) { console.warn('[ALX Oracle] tg.expand() недоступен:', e); }
  try { tg.setHeaderColor && tg.setHeaderColor('#0b0912'); } catch (e) { /* безопасный fallback — просто без цвета */ }
}
function haptic(style) {
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred(style || 'medium'); } catch (e) { /* нет Haptic — просто без вибро-отклика */ }
  } else if (navigator.vibrate) {
    try { navigator.vibrate(style === 'light' ? 12 : 30); } catch (e) { /* вибрация недоступна — не критично */ }
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
let locked = false;
let currentMix = null;

spawnMotes(motesEl, 22);
const rotator = createGlobeRotator(orbSurface);

// ---------------------------------------------------------------
// Сцена «оракул отвечает» — управляется ИСКЛЮЧИТЕЛЬНО через scene.js.
// Ни один из вызываемых здесь модулей не решает сам, что показывать
// дальше — это делает только эта функция, шаг за шагом.
//
// Защита от двойного запуска: scene.beginScene() — синхронная и первая
// операция функции, до единого await. Если сцена уже идёт — beginScene()
// вернёт null, и функция немедленно выйдет. Не важно, что именно вызвало
// повторный триггер — click, touch, devicemotion или Telegram-событие —
// вторая сцена никогда не запустится поверх первой.
//
// Защита от зависаний: каждый этап обёрнут в scene.guard(promise, 3000) —
// если этап не уложился в 3 секунды, сцена принудительно прерывается
// (AbortController), typeText() сама остановит все свои таймеры, и
// приложение гарантированно вернётся в IDLE через finally.
// ---------------------------------------------------------------
const FADE = 420;              // должно совпадать с transition в css/orb.css (.screen)
const T_DIM = FADE + 40;       // ждём, пока экран полностью погаснет
const T_LIGHT = FADE + 40;     // ждём, пока экран полностью загорится
const PHRASE_HOLD_MIN = 380;   // минимальная пауза на «додумать» после фразы
const PHRASE_HOLD_MS_PER_CH = 8; // + время на дочитывание, пропорционально длине фразы
const T_SETTLE = 600;          // шар успокаивается после ответа
const STAGE_TIMEOUT = 3000;    // защитный таймаут на любой этап

async function runScene() {
  if (locked) return; // микс закреплён — сцена даже не начинается
  const started = scene.beginScene();
  if (!started) return; // сцена уже выполняется — повторный триггер игнорируется
  const { signal } = started;

  let clearSmoke = () => {};

  try {
    // ---- PREPARING: проверяем, что вообще есть из чего выбирать ----
    await scene.guard(initMixes(), STAGE_TIMEOUT, 'PREPARING');
    if (!hasMixes()) {
      throw new Error('Список миксов пуст или не загрузился');
    }

    haptic('medium');
    orbWrap.classList.add('thinking');
    rotator.setBurst();
    clearSmoke = spawnSmoke(orbSmoke, 5);

    // ---- THINKING: шар светится, экран гаснет ----
    scene.transition('THINKING');
    screenEl.classList.add('off');
    await scene.guard(wait(T_DIM, signal), STAGE_TIMEOUT, 'THINKING: затемнение');

    // ---- CHOOSING: оракул выбирает микс и фразу (один раз за сцену) ----
    scene.transition('CHOOSING');
    const { mix, phrase } = oracleChooseMix();
    if (!mix) throw new Error('Оракул не смог подобрать микс');

    screenEl.classList.remove('off');
    await scene.guard(renderOraclePhrase(screenContent, phrase, signal), STAGE_TIMEOUT, 'CHOOSING: фраза оракула');

    const holdMs = Math.max(PHRASE_HOLD_MIN, phrase.length * PHRASE_HOLD_MS_PER_CH);
    await scene.guard(wait(holdMs, signal), STAGE_TIMEOUT, 'CHOOSING: пауза на чтение');

    screenEl.classList.add('off');
    await scene.guard(wait(T_DIM, signal), STAGE_TIMEOUT, 'CHOOSING: затемнение перед раскрытием');

    // ---- REVEAL: раскрываем сам микс ----
    scene.transition('REVEAL');
    currentMix = mix;
    screenEl.classList.remove('off');
    screenEl.classList.remove('sweep');
    void screenEl.offsetWidth;
    screenEl.classList.add('sweep');

    await scene.guard(wait(T_LIGHT, signal), STAGE_TIMEOUT, 'REVEAL: включение экрана');
    await scene.guard(renderOrbText(screenContent, mix, signal), STAGE_TIMEOUT, 'REVEAL: печать названия');

    // ---- RESULT: карточка появляется красиво ----
    scene.transition('RESULT');
    renderCard(mixCardEl, mix);
    count++;
    counterEl.textContent = '№ ' + String(count).padStart(3, '0');
    lockBtn.style.display = 'inline-block';
    addToHistory(mix.id);

    await scene.guard(wait(T_SETTLE, signal), STAGE_TIMEOUT, 'RESULT: успокоение');
  } catch (err) {
    console.error('[ALX Oracle] сцена прервана:', err.message);
    showToast('Оракул на секунду отвлёкся — попробуй ещё раз');
  } finally {
    // Гарантия из пункта 6 ТЗ: что бы ни случилось выше — анимации
    // останавливаются, блокировки снимаются, состояние возвращается в IDLE.
    rotator.setIdle();
    orbWrap.classList.remove('thinking');
    clearSmoke();
    scene.endScene();
  }
}

/**
 * Пауза, которая умеет прерываться сигналом отмены сцены —
 * если сцену отменили посреди wait(), промис сразу отклоняется,
 * а не «висит» до истечения полного времени.
 */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('Сцена отменена', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Сцена отменена', 'AbortError'));
      }, { once: true });
    }
  });
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
    runScene();
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

let shakeAttached = false;
function attachShake() {
  if (shakeAttached) return; // повторная регистрация запрещена
  shakeAttached = true;
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
orbWrap.addEventListener('click', runScene);

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
