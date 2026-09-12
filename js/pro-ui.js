// pro-ui.js — ALX PRO + native Telegram Stars subscription flow.

import {
  PRO_BENEFITS,
  getProState,
  getProOffer,
  requestProPaywall,
  isTelegramPaymentContext,
  syncProEntitlement,
  createStarsInvoice,
  waitForProActivation,
} from './pro.js?v=1.14.0-stars';

const CARD_ID = 'alxProCard';
const OVERLAY_ID = 'alxProOverlay';
let renderQueued = false;
let checkoutBusy = false;

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
  const offer = getProOffer();
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
          : `Закрытые подборки ALX · ${offer.priceStars} ⭐ за ${offer.periodDays} дней.`}</div>
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
      <button class="pro-checkout" id="proCheckout" type="button"></button>
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

  overlay.querySelector('#proCheckout')?.addEventListener('click', () => beginStarsCheckout(overlay));
  return overlay;
}

function updateCheckoutUi(overlay, { busy = false, text, note, disabled } = {}) {
  const checkout = overlay.querySelector('#proCheckout');
  const noteEl = overlay.querySelector('#proCheckoutNote');
  if (!checkout || !noteEl) return;

  checkoutBusy = busy;
  checkout.disabled = disabled ?? busy;
  checkout.classList.toggle('loading', busy);
  if (text) checkout.textContent = text;
  if (note !== undefined) noteEl.textContent = note;
}

function resetCheckoutUi(overlay) {
  const state = getProState();
  const offer = getProOffer();

  if (state.active) {
    updateCheckoutUi(overlay, {
      text: `PRO активен${state.expiresAt ? ` до ${formatExpiry(state.expiresAt)}` : ''}`,
      note: 'Подписка подтверждена Telegram Stars.',
      disabled: true,
    });
    return;
  }

  if (!isTelegramPaymentContext()) {
    updateCheckoutUi(overlay, {
      text: `Подключить PRO · ${offer.priceStars} ⭐`,
      note: 'Оплата Stars доступна, когда ALX Oracle открыт внутри Telegram.',
      disabled: false,
    });
    return;
  }

  updateCheckoutUi(overlay, {
    text: `Подключить PRO · ${offer.priceStars} ⭐`,
    note: `Автопродление каждые ${offer.periodDays} дней через Telegram Stars. Отменить можно в Telegram.`,
    disabled: false,
  });
}

async function confirmActivation(overlay) {
  updateCheckoutUi(overlay, {
    busy: true,
    text: 'Подтверждаю подписку…',
    note: 'Telegram уже принял оплату. Проверяю доступ ALX PRO.',
  });

  try {
    const state = await waitForProActivation();
    if (!state.active) throw new Error('Подписка ещё не появилась в Stars ledger.');
    updateCheckoutUi(overlay, {
      text: 'ALX PRO активирован ✓',
      note: 'Закрытые коллекции уже разблокированы.',
      disabled: true,
    });
    renderCard();
    window.dispatchEvent(new CustomEvent('alx-pro-change', { detail: state }));
    setTimeout(() => closeProPaywall(), 900);
  } catch (error) {
    updateCheckoutUi(overlay, {
      text: `Проверить PRO · ${getProOffer().priceStars} ⭐`,
      note: 'Платёж мог уже пройти. Закрой и снова открой ALX Oracle — доступ восстановится автоматически.',
      disabled: false,
    });
  } finally {
    checkoutBusy = false;
  }
}

async function beginStarsCheckout(overlay) {
  if (checkoutBusy) return;
  const tg = window.Telegram?.WebApp;

  if (!isTelegramPaymentContext()) {
    updateCheckoutUi(overlay, {
      text: `Подключить PRO · ${getProOffer().priceStars} ⭐`,
      note: 'Открой приложение из Telegram и повтори оплату.',
      disabled: false,
    });
    return;
  }

  updateCheckoutUi(overlay, {
    busy: true,
    text: 'Создаю счёт…',
    note: 'Счёт формируется напрямую через Telegram Stars.',
  });

  try {
    const invoice = await createStarsInvoice();

    if (tg && typeof tg.openInvoice === 'function') {
      updateCheckoutUi(overlay, {
        busy: false,
        text: `Подключить PRO · ${invoice.priceStars} ⭐`,
        note: 'Подтверди подписку в окне Telegram.',
        disabled: false,
      });

      tg.openInvoice(invoice.invoiceLink, (status) => {
        if (status === 'paid' || status === 'pending') {
          confirmActivation(overlay);
          return;
        }
        if (status === 'cancelled') {
          resetCheckoutUi(overlay);
          overlay.querySelector('#proCheckoutNote').textContent = 'Оплата отменена — ничего не списано.';
          return;
        }
        resetCheckoutUi(overlay);
        overlay.querySelector('#proCheckoutNote').textContent = 'Telegram не завершил оплату. Попробуй ещё раз.';
      });
      return;
    }

    // Old clients: open the Telegram invoice deep link. Access is restored on
    // the next app activation by syncProEntitlement().
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(invoice.invoiceLink);
    } else {
      window.location.href = invoice.invoiceLink;
    }
    updateCheckoutUi(overlay, {
      text: 'Проверить подписку',
      note: 'После оплаты вернись в ALX Oracle — PRO проверится автоматически.',
      disabled: false,
    });
  } catch (error) {
    console.warn('[ALX PRO Stars]', error);
    updateCheckoutUi(overlay, {
      text: `Подключить PRO · ${getProOffer().priceStars} ⭐`,
      note: error?.message || 'Не удалось открыть Telegram Stars. Попробуй ещё раз.',
      disabled: false,
    });
  } finally {
    checkoutBusy = false;
  }
}

export function openProPaywall(feature = 'ALX PRO') {
  const overlay = ensurePaywall();
  const featureText = overlay.querySelector('#proFeatureText');

  featureText.textContent = feature && feature !== 'ALX PRO'
    ? `«${feature}» входит в ALX PRO.`
    : 'Больше контроля над тем, что покажет Оракул.';

  resetCheckoutUi(overlay);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  if (isTelegramPaymentContext()) {
    syncProEntitlement().then(() => {
      renderCard();
      resetCheckoutUi(overlay);
    }).catch(() => {
      // Keep cached state/UI. Checkout will show the concrete backend error if used.
    });
  }
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
  if (daily) daily.insertAdjacentElement('afterend', fresh);
  else content.prepend(fresh);
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

function syncOnReturn() {
  if (document.visibilityState !== 'visible' || !isTelegramPaymentContext()) return;
  syncProEntitlement().then(() => {
    queueRender();
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay?.classList.contains('show')) resetCheckoutUi(overlay);
  }).catch(() => {});
}

function initProUi() {
  ensurePaywall();

  window.addEventListener('alx-pro-paywall', (event) => {
    openProPaywall(event.detail?.feature || 'ALX PRO');
  });
  window.addEventListener('alx-pro-change', queueRender);
  window.addEventListener('alx-pro-offer-change', queueRender);
  document.addEventListener('visibilitychange', syncOnReturn);

  const content = document.getElementById('tasteContent');
  const tasteBtn = document.getElementById('tasteBtnTop');
  if (content && tasteBtn) {
    tasteBtn.addEventListener('click', () => setTimeout(queueRender, 0));
    const observer = new MutationObserver(() => {
      const overlay = document.getElementById('tasteOverlay');
      if (overlay?.classList.contains('show') && !document.getElementById(CARD_ID)) queueRender();
    });
    observer.observe(content, { childList: true });
  }

  // Restore a verified subscription when the app is opened again.
  if (isTelegramPaymentContext()) {
    syncProEntitlement().then(queueRender).catch(() => {});
  }
}

initProUi();
