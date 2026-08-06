// scene.js — SceneController: единственный модуль, которому разрешено
// менять состояние сцены. Ни oracle.js, ни ui.js, ни effects.js не решают
// сами, что показывать дальше — они только выполняют то, что им сказал
// SceneController, и отчитываются через Promise.
//
// Состояния: IDLE -> PREPARING -> THINKING -> CHOOSING -> REVEAL -> RESULT -> RESET -> IDLE

export const SCENES = Object.freeze({
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  THINKING: 'THINKING',
  CHOOSING: 'CHOOSING',
  REVEAL: 'REVEAL',
  RESULT: 'RESULT',
  RESET: 'RESET',
});

const DEFAULT_STAGE_TIMEOUT = 3000; // «любой этап дольше 3 секунд — отменить сцену»

class SceneController {
  constructor() {
    this.state = SCENES.IDLE;
    this.debug = false;
    this._controller = null;
    this._stageStartTs = 0;
    this._sceneStartTs = 0;
  }

  // -------------------------------------------------------------
  // Debug Mode
  // -------------------------------------------------------------
  setDebug(v) {
    this.debug = !!v;
    if (this.debug) console.log('[ALX Oracle] Debug Mode включён');
  }

  log(...args) {
    if (this.debug) console.log('[ALX Oracle]', ...args);
  }

  // -------------------------------------------------------------
  // Одновременно может выполняться только одна сцена.
  // -------------------------------------------------------------
  get isRunning() {
    return this.state !== SCENES.IDLE;
  }

  /**
   * Начинает новую сцену. Если сцена уже идёт — отказывает (возвращает null).
   * Это единственная точка защиты от двойного запуска: click, touch, devicemotion,
   * Telegram-события — все идут через revealMix(), а он вызывает beginScene() первым
   * же синхронным действием, до единого await.
   */
  beginScene() {
    if (this.isRunning) {
      this.log('Повторный запуск отклонён — сцена уже выполняется:', this.state);
      return null;
    }
    this._controller = new AbortController();
    this._sceneStartTs = performance.now();
    this._transition(SCENES.PREPARING);
    return { signal: this._controller.signal };
  }

  _transition(next) {
    const now = performance.now();
    if (this._stageStartTs && this.debug) {
      this.log(`Этап ${this.state} занял ${(now - this._stageStartTs).toFixed(0)}мс`);
    }
    this.state = next;
    this._stageStartTs = now;
    this.log(`Scene -> ${next}`);
  }

  transition(next) {
    if (!Object.values(SCENES).includes(next)) {
      throw new Error(`Неизвестное состояние сцены: ${next}`);
    }
    this._transition(next);
  }

  /**
   * Защищает промис таймаутом: если он не разрешится за timeoutMs — сцена
   * прерывается (AbortController.abort()), промис отклоняется понятной ошибкой.
   * Ничего не «висит бесконечно».
   */
  guard(promise, timeoutMs = DEFAULT_STAGE_TIMEOUT, label = '') {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const msg = `Этап "${label || this.state}" превысил ${timeoutMs}мс — сцена отменена`;
        this.log('⏱', msg);
        if (this._controller) this._controller.abort();
        reject(new Error(msg));
      }, timeoutMs);

      Promise.resolve(promise).then(
        (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
        (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } },
      );
    });
  }

  /**
   * Всегда вызывается в finally вызывающего кода. Гарантированно возвращает
   * IDLE, что бы ни случилось на предыдущих этапах.
   */
  endScene() {
    if (this.state === SCENES.RESULT) this._transition(SCENES.RESET);
    this._transition(SCENES.IDLE);
    if (this.debug) {
      this.log(`Полная сцена заняла ${(performance.now() - this._sceneStartTs).toFixed(0)}мс`);
    }
    this._controller = null;
  }
}

export const scene = new SceneController();

// Включение Debug Mode: ?debug=1 в URL (сохраняется в localStorage),
// либо вручную из консоли: ALXDebug.enable() / ALXDebug.disable()
try {
  const params = new URLSearchParams(location.search);
  if (params.has('debug')) {
    localStorage.setItem('alxOracle:debug', params.get('debug') === '1' ? '1' : '0');
  }
  if (localStorage.getItem('alxOracle:debug') === '1') scene.setDebug(true);
} catch (e) { /* localStorage недоступен — просто не включаем debug */ }

window.ALXDebug = {
  enable() { scene.setDebug(true); try { localStorage.setItem('alxOracle:debug', '1'); } catch (e) {} },
  disable() { scene.setDebug(false); try { localStorage.setItem('alxOracle:debug', '0'); } catch (e) {} },
};
