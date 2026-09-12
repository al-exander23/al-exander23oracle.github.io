// pro-ui.js — ALX PRO presentation/paywall layer.
// Не создаёт entitlement и не хранит платёжные секреты.

import {
  PRO_BENEFITS,
  getProState,
  getCheckoutUrl,
  requestProPaywall,
} from './pro.js?v=1.13.0';

const CARD_ID = 'alxProCard';
const OVERLAY_ID = 'alxProOverlay';
let renderQueued = false;

function formatExpiry(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Date(timestamp).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch (error) {
    return '';
  }
}

function buildProCard() {
  const state = getProState();
  const card = document.createElement('div');
  card.id = CARD_ID;
  card.className = `taste-section pro-card-section${state.active ? ' pro-card-section--active' : ''}`;

  const expiry = state.active && state.expiresAt
    ? ` · до ${formatExpiry(state.expiresAt)}`
    : '';

  card.innerHTML = `
    <div class="taste-section-title taste-section-title--row">
      <span>ALX PRO</span>
      <span class="pro-plan-state${state.active ? ' active' : ''}">${state.active ? `активен${expiry}` : 'FREE'}</span>
    </div>
    <div class="pro-card">
      <div class="pro-card-orb" aria-hidden="true">✦</div>
      <div class="pro-card-copy">
        <div class="pro-card-title">${state.active ? 'PRO открыт' : 'Открой глубже Оракула'}</div>
        <div class="pro-card-text">${state.active
          ? 'Авторские коллекции доступны в ситуационном режиме.'
          : 'Закрытые подборки ALX и премиальные сценарии уже встроены в приложение.'}</div>
      </div>
      ${state.active
        ? '<div class="pro-card-badge">PRO</div>'
        : '<button class="pro-card-cta" id="proCardCta" type="button">Посмотреть PRO</button>'}
    </div>`;

  card.querySelector('#proCardCta')?.addEventListener('click', () => requestProPaywall('ALX PRO'));
  return card;
}

function ensurePaywall() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'pro-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="pro-sheet" role="dialog" aria-modal="true" aria-labelledby="proTitle">
      <div class="pro-sheet-glow" aria-hidden="true"></div>
      <button class="pro-close" id="proClose" type="button" aria-label="Закрыть">✕</button>
      <div class="pro-kicker">ALX ORACLE</div>
      <div class="pro-mark">✦</div>
      <h2 id="proTitle">ALX PRO</h2>
      <p class="pro-subtitle" id="proFeatureText">Больше контроля над тем, что покажет Оракул.</p>
      <div class="pro-benefits">
        ${PRO_BENEFITS.map((item) => `<div class="pro-benefit"><span>◆</span><p>${item}</p></div>`).join('')}
      </div>
      <div class="pro-premium-preview">
        <div><b>ALX Signature</b><span>отбор самых сильных сочетаний</span></div>
        <div><b>Для двоих</b><span>мягкие вечерние сценарии</span></div>
        <div><b>После полуночи</b><span>более насыщенные подборки</span></div>
        <div><b>Эксперимент</b><span>смелые и нестандартные сочетания</span></div>
      </div>
      <button class="pro-checkout" id="proCheckout" type="button">Подключить PRO</button>
      <div class="pro-checkout-note" id="proCheckoutNote"></div>
    </section>`;
  document.body.appendChild(overlay);

  const close = () => closeProPaywall();
  overlay.querySelector('#proClose')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) close();
  });

  overlay.querySelector('#proCheckout')?.addEventListener('click', () => {
    const url = getCheckoutUrl();
    if (!url) return;
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.openLink === 'function') {
      try { tg.openLink(url); return; } catch (error) { /* fallback below */ }
    }
    window.location.href = url;
  });

  return overlay;
}

export function openProPaywall(feature = 'ALX PRO') {
  const overlay = ensurePaywall();
  const checkout = overlay.querySelector('#proCheckout');
  const note = overlay.querySelector('#proCheckoutNote');
  const featureText = overlay.querySelector('#proFeatureText');
  const url = getCheckoutUrl();

  featureText.textContent = feature && feature !== 'ALX PRO'
    ? `«${feature}» входит в ALX PRO.`
    : 'Больше контроля над тем, что покажет Оракул.';

  if (url) {
    checkout.disabled = false;
    checkout.textContent = 'Подключить PRO';
    note.textContent = 'Оплата откроется в защищённом checkout.';
  } else {
    checkout.disabled = true;
    checkout.textContent = 'Оплата — следующий этап';
    note.textContent = 'PRO-логика уже готова. Безопасный платёжный слой подключается отдельно.';
  }

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}

export function closeProPaywall() {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
}

function renderCard() {
  const content = document.getElementById('tasteContent');
  if (!content) return;

  const fresh = buildProCard();
  const existing = document.getElementById(CARD_ID);
  if (existing) {
    existing.replaceWith(fresh);
    return;
  }

  const scenario = document.getElementById('scenarioOracleSection');
  if (scenario) {
    scenario.insertAdjacentElement('afterend', fresh);
    return;
  }

  const daily = content.querySelector('.taste-daily-card');
  if (daily) {
    daily.insertAdjacentElement('afterend', fresh);
  } else {
    content.prepend(fresh);
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const overlay = document.getElementById('tasteOverlay');
    if (!overlay?.classList.contains('show')) return;
    renderCard();
  });
}

function initProUi() {
  ensurePaywall();

  window.addEventListener('alx-pro-paywall', (event) => {
    openProPaywall(event.detail?.feature || 'ALX PRO');
  });
  window.addEventListener('alx-pro-change', queueRender);

  const content = document.getElementById('tasteContent');
  const tasteBtn = document.getElementById('tasteBtnTop');
  if (!content || !tasteBtn) return;

  tasteBtn.addEventListener('click', () => setTimeout(queueRender, 0));

  const observer = new MutationObserver(() => {
    const overlay = document.getElementById('tasteOverlay');
    if (overlay?.classList.contains('show') && !document.getElementById(CARD_ID)) {
      queueRender();
    }
  });
  observer.observe(content, { childList: true });
}

initProUi();
