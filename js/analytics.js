// analytics.js — privacy-minimized product analytics for ALX Oracle.
// Sends only an anonymous install id, event names and small technical counters.
// No Telegram ids, usernames, mix contents or payment identifiers are collected here.

import { getProState, isTelegramPaymentContext } from './pro.js?v=1.33.0-payment-audit';

const ENDPOINT = 'https://alx-pay.alxoracle.workers.dev/api/analytics/event';
const INSTALL_KEY = 'alx_analytics_install_v1';
const LIMIT_KEY_PREFIX = 'alx_analytics_limit_seen_';
const ACTIVATION_KEY = 'alx_analytics_activation_v1';
const APP_VERSION = '1.34.0-funnel-analytics';
const sessionId = makeId();
let restorePendingUntil = 0;
let checkoutPendingUntil = 0;
let onboardingVisible = false;
let lastCounterValue = '';

function makeId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch (error) { /* old WebView */ }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function installId() {
  try {
    let value = localStorage.getItem(INSTALL_KEY);
    if (!value) {
      value = makeId();
      localStorage.setItem(INSTALL_KEY, value);
    }
    return value;
  } catch (error) {
    if (!window.__alxAnalyticsInstallId) window.__alxAnalyticsInstallId = makeId();
    return window.__alxAnalyticsInstallId;
  }
}

function telegramContext() {
  if (isTelegramPaymentContext()) return true;
  const platform = String(window.Telegram?.WebApp?.platform || '').trim().toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

function cleanProps(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  Object.entries(input).slice(0, 16).forEach(([key, value]) => {
    const safeKey = String(key).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
    if (!safeKey) return;
    if (typeof value === 'boolean' || typeof value === 'number') result[safeKey] = value;
    else if (typeof value === 'string') result[safeKey] = value.slice(0, 120);
  });
  return result;
}

export function trackAnalytics(event, props = {}) {
  const payload = {
    installId: installId(),
    sessionId,
    event: String(event || '').slice(0, 64),
    context: telegramContext() ? 'telegram' : 'browser',
    appVersion: APP_VERSION,
    props: cleanProps(props),
  };

  if (!payload.event) return;

  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch (error) {
    // Analytics must never block the product experience.
  }
}

function proProps() {
  const state = getProState();
  return {
    pro: Boolean(state.active),
    source: state.source || 'none',
  };
}

function dayKey() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function markLimitOnce(detail = {}) {
  if (Number(detail.remaining) !== 0) return;
  const key = `${LIMIT_KEY_PREFIX}${dayKey()}`;
  try {
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
  } catch (error) { /* still record once per runtime when storage is unavailable */ }
  trackAnalytics('free_limit_reached', {
    used: Number(detail.used) || 0,
    limit: Number(detail.limit) || 0,
  });
}

function observeOracleCounter() {
  const counter = document.getElementById('counter');
  if (!counter) return;
  lastCounterValue = counter.textContent || '';
  const observer = new MutationObserver(() => {
    const value = counter.textContent || '';
    if (!value || value === lastCounterValue) return;
    lastCounterValue = value;
    if (!/^№\s*\d+/.test(value)) return;
    trackAnalytics('oracle_result', proProps());
  });
  observer.observe(counter, { childList: true, characterData: true, subtree: true });
}

function onboardingStepNumber() {
  const kicker = document.getElementById('alxTourKicker')?.textContent || '';
  const match = kicker.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function observeOnboarding() {
  const attach = () => {
    const overlay = document.getElementById('alxOnboarding');
    if (!overlay || overlay.dataset.analyticsObserved === '1') return false;
    overlay.dataset.analyticsObserved = '1';
    onboardingVisible = overlay.classList.contains('show');

    const observer = new MutationObserver(() => {
      const visible = overlay.classList.contains('show');
      if (visible && !onboardingVisible) {
        trackAnalytics('onboarding_started', {
          manual: document.activeElement?.id === 'onboardingHelpBtn',
        });
        setTimeout(() => trackAnalytics('onboarding_step', { step: onboardingStepNumber() || 1 }), 0);
      }
      onboardingVisible = visible;
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    return true;
  };

  if (attach()) return;
  const bodyObserver = new MutationObserver(() => {
    if (attach()) bodyObserver.disconnect();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function wireEvents() {
  window.addEventListener('alx-free-usage-change', (event) => {
    const detail = event.detail || {};
    trackAnalytics('free_usage', {
      used: Number(detail.used) || 0,
      remaining: Number(detail.remaining) || 0,
      limit: Number(detail.limit) || 0,
    });
    markLimitOnce(detail);
  });

  window.addEventListener('alx-pro-paywall', (event) => {
    trackAnalytics('pro_paywall_open', {
      feature: String(event.detail?.feature || 'ALX PRO').slice(0, 80),
      ...proProps(),
    });
  });

  window.addEventListener('alx-pro-change', (event) => {
    const state = event.detail || getProState();
    if (!state?.active) return;

    const marker = `${state.source || 'unknown'}:${Number(state.expiresAt || 0)}`;
    try {
      if (localStorage.getItem(ACTIVATION_KEY) === marker) return;
      localStorage.setItem(ACTIVATION_KEY, marker);
    } catch (error) { /* non-fatal */ }

    trackAnalytics('pro_activated', {
      source: state.source || 'unknown',
    });

    const now = Date.now();
    if (restorePendingUntil > now) {
      trackAnalytics('pro_restore_success', { source: state.source || 'unknown' });
      restorePendingUntil = 0;
    }
    if (checkoutPendingUntil > now) {
      trackAnalytics('checkout_activation', { source: state.source || 'unknown' });
      checkoutPendingUntil = 0;
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a') : null;
    if (!target) return;

    if (target.id === 'alxTourNext') {
      const currentStep = onboardingStepNumber();
      const finalStep = /Попробовать/i.test(target.textContent || '');
      if (finalStep) trackAnalytics('onboarding_completed', { steps: currentStep || 1 });
      else setTimeout(() => trackAnalytics('onboarding_step', { step: onboardingStepNumber() }), 0);
      return;
    }

    if (target.id === 'alxTourSkip') {
      trackAnalytics('onboarding_skipped', { step: onboardingStepNumber() });
      return;
    }

    if (target.id === 'onboardingHelpBtn') {
      trackAnalytics('onboarding_manual_open', {});
      return;
    }

    if (target.id === 'proCheckout') {
      checkoutPendingUntil = Date.now() + 5 * 60 * 1000;
      trackAnalytics(telegramContext() ? 'stars_checkout_start' : 'external_checkout_open', {
        ...proProps(),
      });
      return;
    }

    if (target.id === 'proRestore') {
      restorePendingUntil = Date.now() + 60 * 1000;
      trackAnalytics('pro_restore_attempt', {});
      return;
    }

    if (target.id === 'proStarsHelp') {
      trackAnalytics('payment_help_open', {});
    }
  }, true);
}

function init() {
  wireEvents();
  observeOracleCounter();
  observeOnboarding();

  trackAnalytics('app_open', {
    ...proProps(),
    language: String(document.documentElement.lang || navigator.language || '').slice(0, 16),
  });
}

init();
