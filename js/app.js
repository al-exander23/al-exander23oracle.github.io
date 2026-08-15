// app.js — точка входа. Только: инициализация приложения, подключение
// Telegram, регистрация пользовательских событий и запуск SceneController.
//
// Вся детальная последовательность сцены (fade/дым/фраза/reveal/карточка)
// теперь целиком живёт в scene.js — этот файл её не знает и не должна.

import { initMixes } from './mixes.js';
import { createGlobeRotator, spawnMotes } from './effects.js';
import { renderIdleState, showToast, openSheet, closeSheet } from './ui.js';
import { initScene, requestOracle } from './scene.js';

// Temporary absolute screen/body probe guard. screenprobe.js runs before this module.
if (window.__ALX_SCREEN_PROBE__) {
  console.info('[ALX SCREEN PROBE] app bootstrap skipped');
} else {

// ---------------------------------------------------------------
// ALX VISUAL FORENSICS (v1.2.5) — временный диагностический код.
// Только включает/выключает CSS-класс, НЕ трогает scene.js/typeText()/
// SceneController и ничего в JS lifecycle. См. п.8 ТЗ — не оставлять
// как постоянное поведение, только для диагностики визуального дубля.
// ---------------------------------------------------------------
window.ALX_DISABLE_TEXT_EFFECTS = () => {
  document.documentElement.classList.add('alx-no-text-effects');
  console.log('[ALX FORENSICS] alx-no-text-effects ВКЛЮЧЁН — все текстовые CSS-эффекты .oracle-phrase отключены');
};
window.ALX_ENABLE_TEXT_EFFECTS = () => {
  document.documentElement.classList.remove('alx-no-text-effects');
  console.log('[ALX FORENSICS] alx-no-text-effects ВЫКЛЮЧЕН — эффекты вернулись');
};
try {
  const forensicParams = new URLSearchParams(location.search);
  if (forensicParams.get('nofx') === '1') {
    window.ALX_DISABLE_TEXT_EFFECTS();
  }
} catch (e) { /* URLSearchParams/location недоступны — просто не включаем */ }

// ---------------------------------------------------------------
// Telegram WebApp bootstrap — любой из этих API может быть недоступен
// в конкретном клиенте (Android/iOS/Desktop/браузер), и это не ошибка:
// используем, если есть, иначе просто продолжаем без него.
// ---------------------------------------------------------------
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  if (typeof tg.ready === 'function') { try { tg.ready(); } catch (e) { console.warn('[ALX] tg.ready() недоступен:', e); } }
  if (typeof tg.expand === 'function') { try { tg.expand(); } catch (e) { console.warn('[ALX] tg.expand() недоступен:', e); } }
  if (typeof tg.setHeaderColor === 'function') {
    try { tg.setHeaderColor('#0b0912'); } catch (e) { console.warn('[ALX] setHeaderColor недоступен:', e); }
  }
}
function haptic(style) {
  if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.impactOccurred === 'function') {
    try { tg.HapticFeedback.impactOccurred(style || 'medium'); } catch (e) { console.warn('[ALX] HapticFeedback недоступен:', e); }
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

// ---------------------------------------------------------------
// Mix lock — закрепление ТЕКУЩЕГО результата пользователем.
// Это НЕ то же самое, что состояние сцены (scene.isRunning из scene.js).
// Две разные, независимые блокировки: одна про «идёт ли анимация»,
// вторая — про «хочет ли пользователь зафиксировать то, что уже показано».
// ---------------------------------------------------------------
let count = 0;
let mixLocked = false;

spawnMotes(motesEl, 22);
const rotator = createGlobeRotator(orbSurface);

initScene(
  {
    orbWrap, orbSmoke, screenEl, screenContent, mixCardEl,
    haptic,
    onResult(mix) {
      count++;
      counterEl.textContent = '№ ' + String(count).padStart(3, '0');
      lockBtn.style.display = 'inline-block';
    },
  },
  rotator,
  () => mixLocked,
);

// ---------------------------------------------------------------
// Встряхивание — ДОПОЛНИТЕЛЬНЫЙ способ вызвать requestOracle(),
// не основной. Если devicemotion недоступен (нет разрешения, нет
// API вообще) — приложение полностью работает через тап по шару,
// никаких ошибок и зависаний из-за отсутствия Motion.
//
// Используем линейное ускорение БЕЗ гравитации — поворот/наклон
// телефона меняет вектор гравитации, но не даёт скачка линейного
// ускорения, поэтому не путается со встряхиванием.
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
    requestOracle(); // тот же единственный вход, что и у клика
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
  if (shakeAttached) return; // запрещена повторная регистрация слушателя
  shakeAttached = true;
  window.addEventListener('devicemotion', handleMotion, true);
}

function initMotion() {
  if (typeof DeviceMotionEvent === 'undefined') return; // Motion недоступен — просто работаем через тап
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ требует явного разрешения по жесту пользователя — это
    // ДОПОЛНИТЕЛЬНАЯ возможность, основной сценарий (тап по шару)
    // доступен и без неё, никакого permission screen поверх него нет.
    const btn = document.createElement('button');
    btn.className = 'permission-btn';
    btn.textContent = 'Разрешить встряхивание';
    btn.onclick = () => {
      DeviceMotionEvent.requestPermission().then((state) => {
        if (state === 'granted') attachShake();
        btn.remove();
      }).catch((e) => { console.warn('[ALX] DeviceMotion permission недоступен:', e); btn.remove(); });
    };
    document.getElementById('hint').insertAdjacentElement('afterend', btn);
  } else {
    attachShake();
  }
}

// ---------------------------------------------------------------
// Единственный источник взаимодействия с шаром — click.
// Намеренно НЕ добавляем одновременно touchstart/touchend/pointerdown
// поверх него — это и есть требование «один основной механизм»,
// чтобы Telegram WebView не мог вызвать requestOracle() дважды
// на одно и то же нажатие через разные события.
// ---------------------------------------------------------------
orbWrap.addEventListener('click', requestOracle);

lockBtn.addEventListener('click', () => {
  mixLocked = !mixLocked;
  lockBtn.textContent = mixLocked ? '🔓 Открепить микс' : '🔒 Закрепить микс';
  lockBtn.classList.toggle('active', mixLocked);
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
initMixes().catch((err) => {
  console.error('[ALX ERROR]', { stage: 'STARTUP', error: err.message, time: new Date().toISOString() });
  showToast('Оракул временно недоступен. Попробуй ещё раз.');
});
}
