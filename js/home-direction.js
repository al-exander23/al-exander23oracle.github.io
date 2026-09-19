// home-direction.js — compact home indicator for the active Oracle direction.

import { COLLECTION_OPTIONS, getScenario, setScenario } from './scenario.js?v=1.33.0-payment-audit';

const ROOT_ID = 'alxHomeDirection';
const VERSION = '1.31.0-community-oracle';
let renderQueued = false;

function collectionMeta(id) {
  return COLLECTION_OPTIONS.find((item) => item.id === id) || COLLECTION_OPTIONS[0];
}

function isPremium(id) {
  return Boolean(collectionMeta(id)?.pro);
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('section');
  root.id = ROOT_ID;
  root.className = 'home-direction';
  root.setAttribute('aria-label', 'Активное направление Оракула');

  const orb = document.getElementById('orbWrap');
  const hint = document.getElementById('hint');
  if (orb?.parentElement) {
    if (hint?.parentElement === orb.parentElement) orb.parentElement.insertBefore(root, hint);
    else orb.insertAdjacentElement('afterend', root);
  }
  return root;
}

function openChooser(collectionId) {
  if (collectionId === 'any' || isPremium(collectionId)) {
    const pro = document.querySelector('#alxBottomNav [data-tab="pro"]');
    if (pro) {
      pro.click();
      return;
    }
  }

  const taste = document.getElementById('tasteBtnTop');
  if (taste) {
    taste.click();
    return;
  }

  document.querySelector('#alxBottomNav [data-tab="pro"]')?.click();
}

function render() {
  const root = ensureRoot();
  if (!root) return;

  const scenario = getScenario();
  const meta = collectionMeta(scenario.collection);
  const all = scenario.collection === 'any';

  root.classList.toggle('is-filtered', !all);
  root.innerHTML = `
    <div class="home-direction-copy">
      <span>${all ? 'РЕЖИМ ОРАКУЛА' : 'АКТИВНОЕ НАПРАВЛЕНИЕ'}</span>
      <strong>${all ? 'Все миксы' : `Направление · ${meta.label}`}</strong>
    </div>
    <div class="home-direction-actions">
      <button class="home-direction-change" type="button" data-home-direction-change>${all ? 'Выбрать' : 'Изменить'}</button>
      ${all ? '' : '<button class="home-direction-all" type="button" data-home-direction-all>Все миксы</button>'}
    </div>`;

  root.querySelector('[data-home-direction-change]')?.addEventListener('click', () => {
    openChooser(scenario.collection);
  });

  root.querySelector('[data-home-direction-all]')?.addEventListener('click', () => {
    setScenario({ collection: 'any' });
    window.dispatchEvent(new CustomEvent('alx-home-direction-reset', {
      detail: { version: VERSION },
    }));
    render();
  });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 0);
}

function init() {
  render();

  // Scenario selectors and the PRO library update storage synchronously from
  // click handlers. Re-reading after the click keeps this indicator compatible
  // with both old cached modules and future scenario controls.
  document.addEventListener('click', queueRender);
  window.addEventListener('storage', queueRender);
  window.addEventListener('alx-pro-change', queueRender);
  window.addEventListener('alx-home-direction-reset', queueRender);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) queueRender();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
