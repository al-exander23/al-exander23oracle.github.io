// app.js — точка входа. Только: инициализация приложения, подключение
// Telegram, регистрация пользовательских событий и запуск SceneController.
//
// Вся детальная последовательность сцены (fade/дым/фраза/reveal/карточка)
// теперь целиком живёт в scene.js — этот файл её не знает и не должна.

import { initMixes } from './mixes.js';
import { createGlobeRotator, spawnMotes } from './effects.js';
import { renderIdleState, showToast, openSheet, closeSheet } from './ui.js';
import { initScene, requestOracleOnce } from './scene.js';

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
// Единственный источник взаимодействия с шаром — click.
// Намеренно НЕ добавляем одновременно touchstart/touchend/pointerdown
// поверх него — это и есть требование «один основной механизм»,
// чтобы Telegram WebView не мог вызвать requestOracle() дважды
// на одно и то же нажатие через разные события.
// ---------------------------------------------------------------
orbWrap.addEventListener('click', requestOracleOnce);

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
initMixes().catch((err) => {
  console.error('[ALX ERROR]', { stage: 'STARTUP', error: err.message, time: new Date().toISOString() });
  showToast('Оракул временно недоступен. Попробуй ещё раз.');
});
