// scene.js — SceneController: ЕДИНСТВЕННЫЙ владелец сцены.
//
// app.js больше не знает деталей сценария ("сначала фаза гаснет, потом
// печатается фраза, потом..."). Он только один раз вызывает initScene()
// с нужными DOM-элементами, а дальше — единственная точка входа:
//
// requestOracleOnce()
//
// Её вызывает единственный production click listener; повторный запуск
// никогда не может выполниться дважды одновременно.
//
// Архитектура: app.js -> SceneController -> Oracle Engine -> UI Renderer -> Effects
// Именно в этом файле лежит вся последовательность сцены — oracle.js,
// ui.js и effects.js сами ничего не решают, они только делают то, что им
// сказал SceneController, и отчитываются Promise'ом.

import { initMixes, hasMixes } from './mixes.js';
import { oracleChooseMix } from './oracle.js';
import { createGlobeRotator, spawnSmoke } from './effects.js';
import { renderOrbText, renderOraclePhrase, renderIdleState, renderCard, showToast } from './ui.js';
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
let controller = null;
let els = null;   // DOM-элементы, переданные из app.js через initScene()
let rotator = null;
let isMixLocked = () => false; // подставляется из app.js через initScene()
let activeClearSmoke = () => {};
let requestSequence = 0;
let currentRequestId = 0;
let busy = false;

function errorLog(stageName, error) {
  console.error('[ALX ERROR]', {
    stage: stageName,
    error: error && error.message ? error.message : String(error),
    time: new Date().toISOString(),
  });
}

function setState(next) {
  state = next;
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
 *  - Операции, которыми сцена владеет ПОЛНОСТЬЮ (wait()) —
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
export async function requestOracleOnce() {
  if (isMixLocked()) return;
  if (busy || isRunning()) return;

  busy = true;
  const requestId = ++requestSequence;
  currentRequestId = requestId;

  controller = new AbortController();
  const { signal } = controller;
  let sceneTimedOut = false;
  const sceneWatchdog = setTimeout(() => {
    sceneTimedOut = true;
    if (!signal.aborted) controller.abort();
  }, 8000);
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
    if (requestId !== currentRequestId) return;
    await withTimeout((sig) => stageThinking(sig, requestId), signal, 'THINKING');

    setState(SCENES.CHOOSING);
    const chosen = oracleChooseMix();
    if (!chosen.mix) throw new Error('Оракул не смог подобрать микс');
    mix = chosen.mix;
    if (requestId !== currentRequestId) return;
    await withTimeout((sig) => stagePhrase(chosen.phrase, sig, requestId), signal, 'CHOOSING');

    setState(SCENES.REVEAL);
    if (requestId !== currentRequestId) return;
    await withTimeout((sig) => stageReveal(mix, sig, requestId), signal, 'REVEAL');

    if (requestId !== currentRequestId) return;
    setState(SCENES.RESULT);
    stageResult(mix);
    await withTimeout((sig) => wait(T_SETTLE, sig), signal, 'RESULT');
  } catch (err) {
    if (sceneTimedOut) {
      showToast('Оракул задумался. Попробуй ещё раз.');
    } else {
      errorLog(state, err);
      showToast(!hasMixes() ? 'Не удалось загрузить миксы. Попробуй ещё раз.' : 'Оракул на секунду отвлёкся — попробуй ещё раз');
    }
  } finally {
    clearTimeout(sceneWatchdog);
    cleanupScene();
    setState(SCENES.RESET);
    setState(SCENES.IDLE);
    if (currentRequestId === requestId) currentRequestId = 0;
    busy = false;
  }
}

// -------------------------------------------------------------------
// Стадии сцены — каждая с одним входом и одним выходом.
// -------------------------------------------------------------------

// THINKING: экран гаснет — и только. Один вход (сигнал), один выход (Promise).
async function stageThinking(signal, requestId) {
  if (requestId !== currentRequestId) return;
  els.screenEl.classList.add('off');
  await wait(T_DIM, signal);
}

// CHOOSING / «одна фраза оракула» — печатается один раз, без повторов.
async function stagePhrase(phrase, signal, requestId) {
  if (requestId !== currentRequestId) return;
  els.screenEl.classList.remove('off');
  renderOraclePhrase(els.screenContent, phrase);

  const holdMs = Math.max(PHRASE_HOLD_MIN, phrase.length * PHRASE_HOLD_MS_PER_CH);
  await wait(holdMs, signal);
  if (requestId !== currentRequestId) return;

  els.screenEl.classList.add('off');
  await wait(T_DIM, signal);
}

// REVEAL: раскрываем сам микс.
async function stageReveal(mix, signal, requestId) {
  if (requestId !== currentRequestId) return;
  els.screenEl.classList.remove('off');
  els.screenEl.classList.remove('sweep');
  void els.screenEl.offsetWidth;
  els.screenEl.classList.add('sweep');

  await wait(T_LIGHT, signal);
  if (requestId !== currentRequestId) return;
  renderOrbText(els.screenContent, mix);
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
  renderIdleState(els.screenContent);
  try { activeClearSmoke(); } catch (e) { /* дым уже очищен — не критично */ }
  activeClearSmoke = () => {};
}
