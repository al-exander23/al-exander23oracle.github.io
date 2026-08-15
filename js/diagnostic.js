/* ALX Oracle temporary Telegram Mobile diagnostic overlay.
 * Activated only with ?diag=1. Remove this file and its script tag after diagnosis.
 * This module observes and reports; it does not alter scene decisions or timings.
 */
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('diag') !== '1') return;

  const state = {
    typeOperations: new Map(),
    events: [],
    startedAt: new Date().toISOString(),
  };
  let panel;
  let reportEl;

  const text = (value) => value == null ? 'null' : String(value);
  const count = (selector) => document.querySelectorAll(selector).length;
  const styleValue = (selector, prop) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el)[prop] : 'absent';
  };

  function runtime() {
    return {
      telegramVersion: window.Telegram?.WebApp?.version ?? 'unknown',
      telegramPlatform: window.Telegram?.WebApp?.platform ?? 'unknown',
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  function collect() {
    const screen = document.querySelector('#screen');
    const content = document.querySelector('#screenContent');
    const active = [...state.typeOperations.values()].filter((op) => op.status === 'ACTIVE');
    return {
      runtime: runtime(),
      dom: {
        oraclePhraseCount: count('.oracle-phrase'),
        chCount: count('.oracle-phrase .ch'),
        idleTextCount: count('.idle-text'),
        idleIconCount: count('.idle-icon'),
        screenContentChildren: content?.children.length ?? 0,
      },
      type: {
        activeOperations: active.length,
        operationIds: [...state.typeOperations.keys()],
        operations: [...state.typeOperations.values()],
      },
      screen: {
        class: screen?.className ?? 'absent',
        opacity: styleValue('#screen', 'opacity'),
        filter: styleValue('#screen', 'filter'),
        transform: styleValue('#screen', 'transform'),
        transition: styleValue('#screen', 'transition'),
        animation: styleValue('#screen', 'animation'),
      },
      result: {
        DOM_DUPLICATE: count('.oracle-phrase') > 1 || count('.oracle-phrase .ch') > 0 && count('.oracle-phrase') === 0,
        TYPEWRITER_SUSPECTED: active.length > 1 || count('.oracle-phrase .ch') > 0,
        COMPOSITING_SUSPECTED: ['filter','transform','opacity'].some((p) => {
          const v = styleValue('#screen', p);
          return v !== 'none' && v !== '1' && v !== 'absent';
        }),
      },
      events: state.events.slice(-30),
    };
  }

  function render() {
    if (!reportEl) return;
    reportEl.textContent = JSON.stringify(collect(), null, 2);
    const result = collect().result;
    reportEl.dataset.domDuplicate = result.DOM_DUPLICATE ? 'YES' : 'NO';
    reportEl.dataset.typewriter = result.TYPEWRITER_SUSPECTED ? 'YES' : 'NO';
    reportEl.dataset.compositing = result.COMPOSITING_SUSPECTED ? 'YES' : 'NO';
  }

  function record(event, payload = {}) {
    state.events.push({ time: new Date().toISOString(), event, ...payload });
    render();
  }

  function createPanel() {
    if (panel) return;
    panel = document.createElement('aside');
    panel.id = 'alx-diagnostic-panel';
    panel.innerHTML = `
      <div class="alx-diagnostic-head">
        <strong>ALX FORENSICS · TELEGRAM</strong>
        <button id="alx-diagnostic-refresh" type="button">REFRESH</button>
      </div>
      <pre id="alx-diagnostic-report"></pre>
      <button id="alx-diagnostic-copy" type="button">COPY DIAGNOSTICS</button>
      <div id="alx-diagnostic-copy-status" role="status"></div>
    `;
    document.body.appendChild(panel);
    reportEl = panel.querySelector('#alx-diagnostic-report');
    panel.querySelector('#alx-diagnostic-refresh').addEventListener('click', render);
    panel.querySelector('#alx-diagnostic-copy').addEventListener('click', async () => {
      const report = reportEl.textContent;
      try {
        await navigator.clipboard.writeText(report);
        panel.querySelector('#alx-diagnostic-copy-status').textContent = 'COPIED';
      } catch (error) {
        panel.querySelector('#alx-diagnostic-copy-status').textContent = 'COPY FAILED — выделите отчёт вручную';
        console.warn('[ALX DIAGNOSTIC] clipboard failed', error);
      }
    });
    render();
  }

  window.ALX_DIAG = {
    onTypeStart(sceneId, label, textValue) {
      const id = `${sceneId}:${Date.now()}:${state.typeOperations.size + 1}`;
      state.typeOperations.set(id, { id, sceneId: text(sceneId), label: text(label), text: text(textValue), status: 'ACTIVE', startedAt: new Date().toISOString() });
      record('TYPE_START', { id, sceneId, label });
    },
    onTypeComplete(sceneId, label) {
      const op = [...state.typeOperations.values()].reverse().find((item) => item.status === 'ACTIVE' && item.sceneId === text(sceneId));
      if (op) { op.status = 'COMPLETE'; op.completedAt = new Date().toISOString(); }
      record('TYPE_COMPLETE', { id: op?.id ?? null, sceneId, label });
    },
    onTypeAbort(sceneId, label) {
      const op = [...state.typeOperations.values()].reverse().find((item) => item.status === 'ACTIVE' && item.sceneId === text(sceneId));
      if (op) { op.status = 'ABORT'; op.abortedAt = new Date().toISOString(); }
      record('TYPE_ABORT', { id: op?.id ?? null, sceneId, label });
    },
    snapshot(label) { record(label); },
    getReport() { return collect(); },
  };

  const installStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      #alx-diagnostic-panel { position:fixed; z-index:2147483647; left:8px; right:8px; bottom:8px; max-height:48vh; display:flex; flex-direction:column; gap:6px; padding:10px; color:#f6ecd7; background:rgba(8,6,15,.96); border:2px solid #e3bd71; border-radius:12px; font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; box-shadow:0 0 24px rgba(0,0,0,.8); }
      #alx-diagnostic-panel strong { color:#f2c879; font-size:11px; }
      #alx-diagnostic-panel button { min-height:38px; color:#120d1e; background:#e3bd71; border:0; border-radius:8px; font:700 13px ui-monospace,SFMono-Regular,Menlo,monospace; }
      #alx-diagnostic-panel .alx-diagnostic-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
      #alx-diagnostic-panel #alx-diagnostic-refresh { min-height:28px; padding:0 8px; font-size:10px; }
      #alx-diagnostic-report { margin:0; max-height:32vh; overflow:auto; white-space:pre-wrap; word-break:break-word; color:#f6ecd7; }
      #alx-diagnostic-copy-status { min-height:16px; color:#9fe5ae; text-align:center; }
    `;
    document.head.appendChild(style);
  };

  const start = () => {
    installStyles();
    createPanel();
    record('DIAGNOSTIC_READY', { url: location.href });
    const content = document.querySelector('#screenContent');
    if (content) {
      const observer = new MutationObserver(() => { record('DOM_MUTATION'); });
      observer.observe(content, { childList: true, subtree: true, characterData: true });
    }
    setInterval(render, 250);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
