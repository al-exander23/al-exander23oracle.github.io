// scene.js — SceneController: ЕДИНСТВЕННЫЙ владелец сцены.
//
// app.js больше не знает деталей сценария ("сначала фаза гаснет, потом
// печатается фраза, потом..."). Он только один раз вызывает initScene()
// с нужными DOM-элементами, а дальше — единственная точка входа:
//
//     requestOracle()
//
// Её вызывают click, touch или devicemotion — не важно откуда, реакция
// всегда одна и та же, и никогда не может выполниться дважды одновременно.
//
// Архитектура: app.js -> SceneController -> Oracle Engine -> UI Renderer -> Effects
// Именно в этом файле лежит вся последовательность сцены — oracle.js,
// ui.js и effects.js сами ничего не решают, они только делают то, что им
// сказал SceneController, и отчитываются Promise'ом.

import { initMixes, hasMixes } from './mixes.js';
import { oracleChooseMix } from './oracle.js';
import { createGlobeRotator, spawnSmoke } from './effects.js';
import { renderOrbText, renderOraclePhrase, renderCard, showToast } from './ui.js';
import { addToHistory } from './profile.js';

export const SCENES = Object.freeze({
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  THINKING: 'THINKING',
  CHOOSING: 'CHOOSING',
  REVEAL: 'REVEAL',
  RESULT: 'RESULT',
  RESET: 'RESET',
});

// -------------------------------------------------------------------
// Watchdog-лимиты — это АВАРИЙНЫЙ fallback, а не расписание анимации.
// Нормальная визуальная сцена длится ~4 секунды суммарно; лимиты ниже
// заведомо в разы больше, чтобы обычная (даже медленная) анимация
// никогда не путалась с реальным зависанием. Timeout срабатывает
// только если этап РЕАЛЬНО не может завершиться (мёртвая сеть,
// сломанный промис и т.п.), а не потому что "долго считает буквы".
// -------------------------------------------------------------------
const STAGE_TIMEOUTS = Object.freeze({
  PREPARING: 8000,
  THINKING: 5000,
  CHOOSING: 8000,
  REVEAL: 8000,
  RESULT: 5000,
});
const DEFAULT_STAGE_TIMEOUT = 5000;

// тайминги сцены — синхронизированы с css/orb.css (.screen transition: .42s)
const FADE = 420;
const T_DIM = FADE + 40;
const T_LIGHT = FADE + 40;
const PHRASE_HOLD_MIN = 380;
const PHRASE_HOLD_MS_PER_CH = 8;
const T_SETTLE = 600;

// -------------------------------------------------------------------
// Внутреннее состояние. Scene lock (может ли стартовать новая сцена)
// определяется ИСКЛЮЧИТЕЛЬНО через state !== IDLE. Никаких отдельных
// булевых флагов вроде busy — это и есть требование пункта 4 ТЗ.
// Mix lock (locked) — это другое: он про то, закреплён ли пользователем
// текущий результат, и живёт в app.js отдельно от состояния сцены.
// -------------------------------------------------------------------
let state = SCENES.IDLE;
let debug = false;
let controller = null;
let stageStartTs = 0;
let sceneStartTs = 0;
let els = null;   // DOM-элементы, переданные из app.js через initScene()
let rotator = null;
let isMixLocked = () => false; // подставляется из app.js через initScene()
let activeClearSmoke = () => {};
let sceneId = 0; // диагностика v1.2.3 — уникальный id на каждую ПОПЫТКУ вызова requestOracle()

function log(...args) {
  if (debug) console.log('[ALX]', ...args);
}

function errorLog(stageName, error) {
  console.error('[ALX ERROR]', {
    stage: stageName,
    error: error && error.message ? error.message : String(error),
    time: new Date().toISOString(),
  });
}

function setState(next) {
  const now = performance.now();
  if (stageStartTs && debug) log(`Этап ${state} занял ${(now - stageStartTs).toFixed(0)}мс`);
  state = next;
  stageStartTs = now;
  log(next);
}

export function setDebug(v) {
  debug = !!v;
  window.__ALX_DEBUG__ = debug; // effects.js читает этот флаг для TYPE START/COMPLETE/ABORT
  if (debug) console.log('[ALX] Debug Mode включён');
}

export function isRunning() {
  return state !== SCENES.IDLE;
}

/**
 * Вызывается один раз при старте приложения. Передаёт SceneController
 * DOM-элементы и функцию проверки mix-lock — сам SceneController
 * ничего не ищет через document.getElementById в процессе сцены.
 */
export function initScene(elements, rotatorInstance, isLockedFn) {
  els = elements;
  rotator = rotatorInstance;
  isMixLocked = isLockedFn || (() => false);
}

/**
 * Watchdog для одного этапа — ИСКЛЮЧИТЕЛЬНО аварийный fallback.
 *
 * Нормальный путь: fn(signal) сам доходит до конца и withTimeout просто
 * возвращает его результат — Promise.race() здесь НЕ является механизмом
 * штатного завершения этапа, он молча "не мешает", пока fn успевает
 * в отведённый (заведомо избыточный) лимит. Он вступает в игру только
 * в одном случае — реальном зависании.
 *
 * Как это соотносится с AbortSignal (важное архитектурное различие):
 *  - Операции, которыми сцена владеет ПОЛНОСТЬЮ (wait(), typeText()) —
 *    реально проверяют signal.aborted на каждой итерации и останавливаются
 *    физически, а не просто перестают ожидаться. Это настоящая отмена.
 *  - Операции над ОБЩИМ ресурсом приложения (initMixes() — кэшируется
 *    и переиспользуется всеми будущими попытками, а не создаётся заново
 *    на каждую сцену) НЕЛЬЗЯ убивать через сигнал этой конкретной сцены —
 *    иначе одна нетерпеливая попытка сломает загрузку данных для всех
 *    последующих. Поэтому у неё есть СВОЙ независимый таймаут (см. mixes.js),
 *    а здесь Promise.race работает как «сцена прекращает ждать», а не
 *    как убийство самой операции.
 */
async function withTimeout(fn, signal, label) {
  const limitMs = STAGE_TIMEOUTS[label] || DEFAULT_STAGE_TIMEOUT;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      errorLog(label, new Error(`Аварийный watchdog: этап превысил ${limitMs}мс (это не длительность анимации, а лимит на зависание)`));
      if (!signal.aborted) controller.abort();
      reject(new DOMException(`Таймаут этапа "${label}"`, 'TimeoutError'));
    }, limitMs);
  });
  try {
    return await Promise.race([fn(signal), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Сцена отменена', 'AbortError')); return; }
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Сцена отменена', 'AbortError'));
    }, { once: true });
  });
}

// -------------------------------------------------------------------
// Единственная точка входа для запуска сцены. Всё остальное в
// приложении — click, shake, любой будущий жест — вызывает только её.
// -------------------------------------------------------------------
export async function requestOracle() {
  // --- ДИАГНОСТИКА v1.2.3: не влияет на логику, только на консоль ---
  const currentSceneId = ++sceneId;
  console.log('[ALX TRACE] REQUEST', currentSceneId);
  console.trace('[ALX TRACE] REQUEST SOURCE');

  if (isMixLocked()) {                // микс закреплён пользователем — не относится к scene lock
    console.log('[ALX TRACE] REQUEST REJECTED', currentSceneId, `state=${state}`, '(mix locked)');
    return;
  }
  if (isRunning()) {                  // единственная защита от двойного запуска
    console.log('[ALX TRACE] REQUEST REJECTED', currentSceneId, `state=${state}`);
    log('Повторный запуск отклонён — сцена уже выполняется:', state);
    return;
  }
  console.log('[ALX TRACE] SCENE START', currentSceneId);
  window.ALX_DIAG?.lifecycle?.('SCENE START', { sceneId: currentSceneId, requestId: currentSceneId, timestamp: Date.now() });
  // --- конец диагностической вставки ---

  controller = new AbortController();
  const { signal } = controller;
  sceneStartTs = performance.now();
  log('START');
  setState(SCENES.PREPARING);

  let mix = null;

  try {
    await withTimeout(async (sig) => {
      await initMixes();
      if (sig.aborted) throw new DOMException('Сцена отменена', 'AbortError');
      if (!hasMixes()) throw new Error('Список миксов пуст или не загрузился');
    }, signal, 'PREPARING');

    els.haptic('medium');
    els.orbWrap.classList.add('thinking');
    rotator.setBurst();
    activeClearSmoke = spawnSmoke(els.orbSmoke, 5);

    setState(SCENES.THINKING);
    await withTimeout((sig) => stageThinking(sig), signal, 'THINKING');

    setState(SCENES.CHOOSING);
    const chosen = oracleChooseMix();
    if (!chosen.mix) throw new Error('Оракул не смог подобрать микс');
    mix = chosen.mix;
    log('PHRASE');
    await withTimeout((sig) => stagePhrase(chosen.phrase, sig, currentSceneId), signal, 'CHOOSING');

    setState(SCENES.REVEAL);
    await withTimeout((sig) => stageReveal(mix, sig, currentSceneId), signal, 'REVEAL');

    setState(SCENES.RESULT);
    stageResult(mix);
    await withTimeout((sig) => wait(T_SETTLE, sig), signal, 'RESULT');
  } catch (err) {
    errorLog(state, err);
    showToast('Оракул на секунду отвлёкся — попробуй ещё раз');
  } finally {
    window.ALX_DIAG?.lifecycle?.('RESET', { sceneId: currentSceneId, requestId: currentSceneId, timestamp: Date.now() });
    log('CLEANUP');
    cleanupScene();
    setState(SCENES.RESET);
    window.ALX_DIAG?.lifecycle?.('IDLE', { sceneId: currentSceneId, requestId: currentSceneId, timestamp: Date.now() });
    setState(SCENES.IDLE);
    if (debug) log(`Scene duration: ${(performance.now() - sceneStartTs).toFixed(0)}ms`);
  }
}

// -------------------------------------------------------------------
// Стадии сцены — каждая с одним входом и одним выходом.
// -------------------------------------------------------------------

// THINKING: экран гаснет — и только. Один вход (сигнал), один выход (Promise).
async function stageThinking(signal) {
  els.screenEl.classList.add('off');
  await wait(T_DIM, signal);
}

// CHOOSING / «одна фраза оракула» — печатается один раз, без повторов.
async function stagePhrase(phrase, signal, sceneId) {
  window.ALX_DIAG?.lifecycle?.('PHRASE START', { sceneId, requestId: sceneId, timestamp: Date.now() });
  console.log('[ALX TRACE] STAGE PHRASE', sceneId, phrase);
  els.screenEl.classList.remove('off');
  await renderOraclePhrase(els.screenContent, phrase, signal, sceneId);

  // диагностика v1.2.5 — обязательно в своём try/catch: снимок ни при
  // каких условиях не должен обрывать реальную сцену, которую диагностирует
  try { forensicSnapshot(sceneId); } catch (fxErr) { console.warn('[ALX FORENSICS] snapshot failed:', fxErr); }

  const holdMs = Math.max(PHRASE_HOLD_MIN, phrase.length * PHRASE_HOLD_MS_PER_CH);
  await wait(holdMs, signal);

  els.screenEl.classList.add('off');
  await wait(T_DIM, signal);
}

// ---------------------------------------------------------------
// ALX VISUAL FORENSICS (v1.2.5) — временная диагностика визуального
// дубля текста. Только читает DOM/computed styles и пишет в консоль,
// НИЧЕГО не меняет и не влияет на сцену, тайминги или lifecycle.
// ---------------------------------------------------------------
function rectToPlainObject(rect) {
  // не полагаемся на DOMRect.prototype.toJSON() — он есть не везде
  // (например, отсутствует в некоторых встроенных WebView/тестовых средах)
  if (!rect) return null;
  return {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
  };
}

function forensicSnapshot(sceneId) {
  const el = document.querySelector('.oracle-phrase');

  console.log('[ALX FORENSICS]', {
    sceneId,
    text: el ? el.innerText : null,
    html: el ? el.outerHTML : null,
    rect: el ? rectToPlainObject(el.getBoundingClientRect()) : null,
    computed: el ? {
      display: getComputedStyle(el).display,
      position: getComputedStyle(el).position,
      opacity: getComputedStyle(el).opacity,
      transform: getComputedStyle(el).transform,
      filter: getComputedStyle(el).filter,
      textShadow: getComputedStyle(el).textShadow,
      webkitTextStroke: getComputedStyle(el).webkitTextStroke,
      animation: getComputedStyle(el).animation,
      transition: getComputedStyle(el).transition,
      zIndex: getComputedStyle(el).zIndex,
    } : null,
  });

  // родительские элементы — ищем compositing layers (п.5 ТЗ)
  const chain = [
    ['.oracle-phrase', el],
    ['.screen-content', document.querySelector('.screen-content')],
    ['.screen', document.querySelector('.screen')],
    ['.orb', document.querySelector('.orb')],
  ];
  chain.forEach(([label, node]) => {
    if (!node) { console.log('[ALX FORENSICS] PARENT', label, '— элемент не найден'); return; }
    const cs = getComputedStyle(node);
    console.log('[ALX FORENSICS] PARENT', label, {
      transform: cs.transform,
      filter: cs.filter,
      opacity: cs.opacity,
      textShadow: cs.textShadow,
      mixBlendMode: cs.mixBlendMode,
      isolation: cs.isolation,
      willChange: cs.willChange,
      backfaceVisibility: cs.backfaceVisibility,
      perspective: cs.perspective,
    });
  });

  // .ch spans (п.6 ТЗ)
  const chNodes = document.querySelectorAll('.oracle-phrase .ch');
  console.log('[ALX FORENSICS] CH COUNT', chNodes.length);
  console.log('[ALX FORENSICS] TEXT', el ? el.innerText : null);
  if (el) {
    const expectedLen = (el.innerText || '').length;
    console.log('[ALX FORENSICS] CH COUNT MATCHES TEXT LENGTH?', chNodes.length === expectedLen, `(ch=${chNodes.length}, textLen=${expectedLen})`);
  }
  console.log('[ALX FORENSICS] .oracle-phrase COUNT (должно быть 1):', document.querySelectorAll('.oracle-phrase').length);
}

// REVEAL: раскрываем сам микс.
async function stageReveal(mix, signal, sceneId) {
  window.ALX_DIAG?.lifecycle?.('REVEAL', { sceneId, requestId: sceneId, timestamp: Date.now() });
  els.screenEl.classList.remove('off');
  els.screenEl.classList.remove('sweep');
  void els.screenEl.offsetWidth;
  els.screenEl.classList.add('sweep');

  await wait(T_LIGHT, signal);
  await renderOrbText(els.screenContent, mix, signal, sceneId);
}

// RESULT: карточка. Синхронный рендер, без сети и без таймеров.
function stageResult(mix) {
  renderCard(els.mixCardEl, mix);
  els.onResult(mix);
  addToHistory(mix.id);
}

// -------------------------------------------------------------------
// Гарантированная уборка — вызывается в finally независимо от исхода.
// Пункт 16 ТЗ: шар НИКОГДА не остаётся в burst-режиме.
// -------------------------------------------------------------------
function cleanupScene() {
  rotator.setIdle();
  els.orbWrap.classList.remove('thinking');
  els.screenEl.classList.remove('off');
  try { activeClearSmoke(); } catch (e) { /* дым уже очищен — не критично */ }
  activeClearSmoke = () => {};
}

// Дебаг-режим: ?debug=1 в URL (сохраняется в localStorage) либо ALXDebug.enable()/disable()
try {
  const params = new URLSearchParams(location.search);
  if (params.has('debug')) {
    localStorage.setItem('alxOracle:debug', params.get('debug') === '1' ? '1' : '0');
  }
  if (localStorage.getItem('alxOracle:debug') === '1') setDebug(true);
} catch (e) { /* localStorage недоступен в этом окружении — просто не включаем debug */ }

window.ALXDebug = {
  enable() { setDebug(true); try { localStorage.setItem('alxOracle:debug', '1'); } catch (e) {} },
  disable() { setDebug(false); try { localStorage.setItem('alxOracle:debug', '0'); } catch (e) {} },
};
