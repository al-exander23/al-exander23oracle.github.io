// pro-entry.js — visible FREE/PRO layer on the main Oracle screen.
// Keeps the existing SceneController/orb lifecycle untouched.

import {
  getProState,
  getProOffer,
  requestProPaywall,
  isTelegramPaymentContext,
} from './pro.js?v=1.33.0-payment-audit';

const FREE_DAILY_LIMIT = 5;
const EXTERNAL_PRICE_RUB = 299;
const USAGE_KEY = 'alx_oracle_free_daily_usage_v1';
const TOP_BUTTON_ID = 'alxProTopButton';
const BANNER_ID = 'alxProMainBanner';
let lastLimitPromptAt = 0;

function isInsideTelegramApp() {
  if (isTelegramPaymentContext()) return true;
  const platform = String(window.Telegram?.WebApp?.platform || '').trim().toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readUsage() {
  const today = dayKey();
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    if (!raw || raw.day !== today) return { day: today, used: 0 };
    const used = Math.max(0, Math.min(FREE_DAILY_LIMIT, Number(raw.used) || 0));
    return { day: today, used };
  } catch (error) {
    return { day: today, used: 0 };
  }
}

function writeUsage(next) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Local storage can be unavailable in hardened WebViews. In that case
    // the app stays usable rather than failing the main Oracle flow.
  }
}

function freeState() {
  const usage = readUsage();
  return {
    ...usage,
    limit: FREE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_DAILY_LIMIT - usage.used),
  };
}

function canUseOracle() {
  return getProState().active || freeState().remaining > 0;
}

function emitUsageChange() {
  window.dispatchEvent(new CustomEvent('alx-free-usage-change', {
    detail: freeState(),
  }));
}

function recordFreeOracleResult() {
  if (getProState().active) return;
  const usage = readUsage();
  if (usage.used >= FREE_DAILY_LIMIT) return;
  writeUsage({ day: usage.day, used: usage.used + 1 });
  emitUsageChange();
}

function promptLimit() {
  const now = Date.now();
  if (now - lastLimitPromptAt < 1800) return;
  lastLimitPromptAt = now;
  requestProPaywall('Безлимитные подборы Оракула');
}

function guardInteraction(event) {
  if (canUseOracle()) return;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  event?.stopPropagation?.();
  promptLimit();
}

function ensureMainEntry() {
  const toolbar = document.getElementById('topToolbar');
  if (toolbar && !document.getElementById(TOP_BUTTON_ID)) {
    const button = document.createElement('button');
    button.id = TOP_BUTTON_ID;
    button.className = 'pro-top-button';
    button.type = 'button';
    button.addEventListener('click', () => requestProPaywall('ALX PRO'));
    toolbar.appendChild(button);
  }

  const hint = document.getElementById('hint');
  if (hint && !document.getElementById(BANNER_ID)) {
    const banner = document.createElement('button');
    banner.id = BANNER_ID;
    banner.className = 'pro-main-banner';
    banner.type = 'button';
    banner.addEventListener('click', () => requestProPaywall('ALX PRO'));
    hint.insertAdjacentElement('afterend', banner);
  }
}

function renderMainEntry() {
  ensureMainEntry();
  const state = getProState();
  const offer = getProOffer();
  const free = freeState();
  const telegram = isInsideTelegramApp();
  const top = document.getElementById(TOP_BUTTON_ID);
  const banner = document.getElementById(BANNER_ID);

  if (top) {
    top.classList.toggle('active', state.active);
    top.innerHTML = state.active
      ? '<span class="pro-top-dot"></span>PRO'
      : 'PRO';
    top.setAttribute('aria-label', state.active ? 'ALX PRO активен' : 'Открыть ALX PRO');
  }

  if (!banner) return;
  banner.classList.toggle('active', state.active);
  banner.classList.toggle('exhausted', !state.active && free.remaining === 0);

  if (state.active) {
    banner.innerHTML = `
      <span class="pro-main-copy">
        <b>ALX PRO активен</b>
        <small>Безлимитные подборы · закрытые коллекции открыты</small>
      </span>
      <span class="pro-main-action">PRO ✓</span>`;
    return;
  }

  const usageText = free.remaining > 0
    ? `Осталось ${free.remaining} из ${free.limit} подборов сегодня`
    : 'Бесплатные подборы на сегодня закончились';

  const paymentHint = telegram
    ? 'PRO — без лимита + закрытые коллекции · Telegram Stars'
    : 'PRO — без лимита + закрытые коллекции · карта / СБП';
  const price = telegram ? `${offer.priceStars} ⭐` : `${EXTERNAL_PRICE_RUB} ₽`;

  banner.innerHTML = `
    <span class="pro-main-copy">
      <b>FREE · ${usageText}</b>
      <small>${paymentHint}</small>
    </span>
    <span class="pro-main-action">${price}</span>`;
}

function enhancePaywall() {
  const sheet = document.querySelector('#alxProOverlay .pro-sheet');
  if (!sheet || sheet.querySelector('.pro-free-compare')) return;
  const subtitle = sheet.querySelector('.pro-subtitle');
  if (!subtitle) return;

  const compare = document.createElement('div');
  compare.className = 'pro-free-compare';
  compare.innerHTML = `
    <div><span>FREE</span><b>${FREE_DAILY_LIMIT} подборов / день</b></div>
    <div><span>PRO</span><b>Без лимита</b></div>`;
  subtitle.insertAdjacentElement('afterend', compare);
}

function observeSuccessfulResults() {
  const counter = document.getElementById('counter');
  if (!counter) return;
  let lastValue = counter.textContent;

  const observer = new MutationObserver(() => {
    const nextValue = counter.textContent;
    if (nextValue === lastValue) return;
    lastValue = nextValue;
    if (/^№\s*\d+/.test(nextValue)) recordFreeOracleResult();
  });
  observer.observe(counter, { childList: true, characterData: true, subtree: true });
}

function installGuardsBeforeApp() {
  const orbWrap = document.getElementById('orbWrap');
  // Capture phase: this runs before app.js' regular click handler.
  orbWrap?.addEventListener('click', guardInteraction, true);

  // pro-entry.js is loaded before app.js, so this capture listener is also
  // registered before app.js attaches its shake listener.
  window.addEventListener('devicemotion', (event) => {
    if (!canUseOracle()) guardInteraction(event);
  }, true);
}

function init() {
  ensureMainEntry();
  renderMainEntry();
  installGuardsBeforeApp();
  observeSuccessfulResults();

  window.addEventListener('alx-free-usage-change', renderMainEntry);
  window.addEventListener('alx-pro-change', renderMainEntry);
  window.addEventListener('alx-pro-offer-change', renderMainEntry);
  window.addEventListener('alx-pro-paywall', () => setTimeout(enhancePaywall, 0));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderMainEntry();
  });

  // pro-ui.js creates the paywall after this module. Enhance it once present.
  const bodyObserver = new MutationObserver(() => {
    if (document.getElementById('alxProOverlay')) {
      enhancePaywall();
      bodyObserver.disconnect();
    }
  });
  bodyObserver.observe(document.body, { childList: true });
}

init();
