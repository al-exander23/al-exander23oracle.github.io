// pro-ui.js — ALX PRO purchase/restore UI.
// Inside Telegram digital PRO is sold only via Telegram Stars.
// Outside Telegram the same paywall may route to the official external ALX Pay page.

import {
  PRO_BENEFITS,
  getProState,
  getProOffer,
  requestProPaywall,
  isTelegramPaymentContext,
  syncProEntitlement,
  createStarsInvoice,
  waitForProActivation,
} from './pro.js?v=1.33.0-payment-audit';

const CARD_ID = 'alxProCard';
const OVERLAY_ID = 'alxProOverlay';
const EXTERNAL_PAY_URL = 'https://alx-pay.alxoracle.workers.dev/';
const EXTERNAL_PRICE_RUB = 299;
let renderQueued = false;
let checkoutBusy = false;

function isInsideTelegramApp() {
  if (isTelegramPaymentContext()) return true;
  const platform = String(window.Telegram?.WebApp?.platform || '').trim().toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

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
  const telegram = isInsideTelegramApp();
  const card = document.createElement('div');
  card.id = CARD_ID;
  card.className = `taste-section pro-card-section${state.active ? ' pro-card-section--active' : ''}`;

  const expiry = state.active && state.expiresAt
    ? ` · до ${formatExpiry(state.expiresAt)}`
    : '';

  const priceCopy = telegram
    ? `${offer.priceStars} ⭐ / ${offer.periodDays} дней`
    : `${EXTERNAL_PRICE_RUB} ₽ / ${offer.periodDays} дней · карта / СБП`;

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
          ? 'Parfum Lab, LIMITED 2026 и авторские коллекции уже доступны.'
          : `Parfum Lab · LIMITED 2026 · закрытые подборки · ${priceCopy}.`}</div>
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
        <div><b>Parfum Lab</b><span>цветы, чай, специи и фруктовые ноты как парфюмная композиция</span></div>
        <div><b>LIMITED 2026</b><span>необычные сезонные дропы и новые вкусовые идеи</span></div>
        <div><b>ALX Signature</b><span>отбор самых сильных сочетаний</span></div>
        <div><b>Для двоих</b><span>мягкие вечерние сценарии</span></div>
        <div><b>После полуночи</b><span>более насыщенные подборки</span></div>
        <div><b>Эксперимент</b><span>смелые и нестандартные сочетания</span></div>
      </div>
      <button class="pro-checkout" id="proCheckout" type="button"></button>
      <div class="pro-checkout-note" id="proCheckoutNote"></div>
      <div class="pro-secondary-actions" id="proSecondaryActions">
        <button class="pro-secondary-btn" id="proStarsHelp" type="button">Не получается оплатить?</button>
        <button class="pro-secondary-btn" id="proRestore" type="button">Восстановить PRO</button>
      </div>
      <div class="pro-inline-help" id="proInlineHelp" hidden>
        <b>Как оплатить Stars</b>
        <span>Пополни баланс Telegram Stars в Telegram, затем вернись сюда и нажми «Подключить PRO».</span>
      </div>
      <div class="pro-restore-status" id="proRestoreStatus" aria-live="polite"></div>
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
    if (isInsideTelegramApp()) beginStarsCheckout(overlay);
    else openExternalCheckout();
  });

  overlay.querySelector('#proStarsHelp')?.addEventListener('click', () => {
    const help = overlay.querySelector('#proInlineHelp');
    if (!help) return;
    help.hidden = !help.hidden;
  });

  overlay.querySelector('#proRestore')?.addEventListener('click', () => restoreProAccess(overlay));
  return overlay;
}

function setRestoreStatus(overlay, text = '', tone = '') {
  const status = overlay.querySelector('#proRestoreStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('success', tone === 'success');
  status.classList.toggle('error', tone === 'error');
}

function renderSecondaryUi(overlay) {
  const state = getProState();
  const telegram = isInsideTelegramApp();
  const actions = overlay.querySelector('#proSecondaryActions');
  const help = overlay.querySelector('#proInlineHelp');
  const helpBtn = overlay.querySelector('#proStarsHelp');
  const restoreBtn = overlay.querySelector('#proRestore');

  if (!actions || !help || !helpBtn || !restoreBtn) return;

  if (!telegram || state.active) {
    actions.hidden = true;
    help.hidden = true;
    setRestoreStatus(overlay, '');
    return;
  }

  actions.hidden = false;
  helpBtn.hidden = false;
  restoreBtn.hidden = false;
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
  const telegram = isInsideTelegramApp();

  setRestoreStatus(overlay, '');
  renderSecondaryUi(overlay);

  if (state.active) {
    updateCheckoutUi(overlay, {
      text: `PRO активен${state.expiresAt ? ` до ${formatExpiry(state.expiresAt)}` : ''}`,
      note: 'Доступ ALX PRO подтверждён и закрытые коллекции открыты.',
      disabled: true,
    });
    return;
  }

  if (!telegram) {
    updateCheckoutUi(overlay, {
      text: `Оплатить картой / СБП · ${EXTERNAL_PRICE_RUB} ₽`,
      note: 'Откроется официальный ALX Pay. После оплаты вернись в ALX Oracle в Telegram — PRO восстановится автоматически.',
      disabled: false,
    });
    return;
  }

  updateCheckoutUi(overlay, {
    text: `Подключить PRO · ${offer.priceStars} ⭐`,
    note: `Оплата внутри Telegram проходит через Stars · ${offer.periodDays} дней.`,
    disabled: false,
  });
}

function openExternalCheckout() {
  if (isInsideTelegramApp()) return;
  window.location.assign(EXTERNAL_PAY_URL);
}

async function restoreProAccess(overlay) {
  if (!isTelegramPaymentContext()) {
    setRestoreStatus(overlay, 'Открой ALX Oracle из Telegram, чтобы проверить доступ.', 'error');
    return;
  }

  const button = overlay.querySelector('#proRestore');
  if (button) {
    button.disabled = true;
    button.textContent = 'Проверяю…';
  }
  setRestoreStatus(overlay, 'Проверяю активную подписку…');

  try {
    const state = await syncProEntitlement({ attempts: 2, delayMs: 700 });
    if (state.active) {
      setRestoreStatus(overlay, 'ALX PRO найден и восстановлен ✓', 'success');
      renderCard();
      window.dispatchEvent(new CustomEvent('alx-pro-change', { detail: state }));
      resetCheckoutUi(overlay);
      return;
    }
    setRestoreStatus(overlay, 'Активный ALX PRO пока не найден.', 'error');
  } catch (error) {
    setRestoreStatus(overlay, 'Не удалось проверить доступ. Попробуй ещё раз.', 'error');
  } finally {
    if (button && !getProState().active) {
      button.disabled = false;
      button.textContent = 'Восстановить PRO';
    }
  }
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
      note: 'Parfum Lab, LIMITED 2026 и другие закрытые коллекции разблокированы.',
      disabled: true,
    });
    renderSecondaryUi(overlay);
    renderCard();
    window.dispatchEvent(new CustomEvent('alx-pro-change', { detail: state }));
    setTimeout(() => closeProPaywall(), 900);
  } catch (error) {
    updateCheckoutUi(overlay, {
      text: `Проверить PRO · ${getProOffer().priceStars} ⭐`,
      note: 'Платёж мог уже пройти. Нажми «Восстановить PRO» или снова открой ALX Oracle.',
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
      note: 'Открой ALX Oracle из Telegram и повтори оплату.',
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
    : 'Больше контроля, больше коллекций и больше необычных вкусов.';

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
