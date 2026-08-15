/* Temporary absolute screen/body probe. Active only with ?screenprobe=1 or ?bodyprobe=1. */
(() => {
  const params = new URLSearchParams(location.search);
  const screenProbe = params.get('screenprobe') === '1';
  const bodyProbe = params.get('bodyprobe') === '1';
  if (!screenProbe && !bodyProbe) return;

  window.__ALX_SCREEN_PROBE__ = true;
  const style = document.createElement('style');
  style.id = 'alx-screen-probe-style';
  style.textContent = `
    html, body { margin: 0 !important; min-height: 100% !important; background: #111 !important; }
    #alx-screen-probe-host, #alx-body-probe { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #111 !important; color: #fff !important; font: 700 32px Arial, sans-serif !important; animation: none !important; transition: none !important; transform: none !important; filter: none !important; opacity: 1 !important; text-shadow: none !important; mix-blend-mode: normal !important; }
    #alx-screen-probe { position: absolute !important; inset: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #111 !important; color: #fff !important; font: 700 24px Arial, sans-serif !important; animation: none !important; transition: none !important; transform: none !important; filter: none !important; opacity: 1 !important; text-shadow: none !important; mix-blend-mode: normal !important; }
    body:not(.alx-body-probe-active) .stage > * { visibility: hidden !important; }
    body:not(.alx-body-probe-active) #screen, body:not(.alx-body-probe-active) #screen * { visibility: visible !important; }
  `;
  document.head.appendChild(style);

  if (bodyProbe || params.get('orbprobe') === '1') {
    document.body.classList.add('alx-body-probe-active');
    document.querySelectorAll('body > *').forEach((el) => { el.hidden = true; el.setAttribute('aria-hidden', 'true'); });
    const host = document.createElement('div');
    host.id = bodyProbe ? 'alx-body-probe' : 'alx-screen-probe-host';
    host.textContent = 'TEST';
    document.body.appendChild(host);
    return;
  }

  const screen = document.querySelector('#screen');
  if (!screen) return;
  screen.replaceChildren();
  screen.className = 'screen';
  const probe = document.createElement('div');
  probe.id = 'alx-screen-probe';
  probe.textContent = 'TEST';
  screen.appendChild(probe);
})();
