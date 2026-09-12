// pro.js — ALX PRO entitlement + Telegram Stars client.
// LocalStorage is only a cache. Telegram's verified Stars ledger on the backend
// is the source of truth and can restore PRO on another session/device.

import { getItem, setItem } from './storage.js';

const KEY = 'alx_oracle_pro_entitlement';
const DEFAULT_OFFER = Object.freeze({ priceStars: 149, periodDays: 30, recurring: true });
let offer = { ...DEFAULT_OFFER };

export const PREMIUM_COLLECTION_IDS = Object.freeze([
  'signature',
  'date-night',
  'after-dark',
  'experimental',
]);

export const PRO_BENEFITS = Object.freeze([
  'Закрытые авторские коллекции ALX',
  'Сценарии «Для двоих» и «После полуночи»',
  'Экспериментальные подборки с более смелыми сочетаниями',
  'Новые PRO-функции по мере развития Оракула',
]);

function cleanEntitlement(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { plan: 'free', status: 'inactive', expiresAt: null, source: null };
  }

  const expiresAt = Number.isFinite(raw.expiresAt) ? Number(raw.expiresAt) : null;
  const plan = raw.plan === 'pro' ? 'pro' : 'free';
  const status = raw.status === 'active' ? 'active' : 'inactive';

  return {
    plan,
    status,
    expiresAt,
    source: typeof raw.source === 'string' ? raw.source : null,
  };
}

export function getProState(now = Date.now()) {
  const entitlement = cleanEntitlement(getItem(KEY, null));
  const notExpired = !entitlement.expiresAt || entitlement.expiresAt > now;
  const active = entitlement.plan === 'pro' && entitlement.status === 'active' && notExpired;

  return { ...entitlement, active };
}

export function isProActive() {
  return getProState().active;
}

export function isPremiumCollection(collectionId) {
  return PREMIUM_COLLECTION_IDS.includes(collectionId);
}

export function getProOffer() {
  return { ...offer };
}

function updateOffer(next) {
  if (!next || typeof next !== 'object') return;
  const priceStars = Number(next.priceStars);
  const periodDays = Number(next.periodDays);
  offer = {
    priceStars: Number.isFinite(priceStars) && priceStars > 0 ? Math.floor(priceStars) : offer.priceStars,
    periodDays: Number.isFinite(periodDays) && periodDays > 0 ? Math.floor(periodDays) : offer.periodDays,
    recurring: next.recurring !== false,
  };
  window.dispatchEvent(new CustomEvent('alx-pro-offer-change', { detail: getProOffer() }));
}

// Only call this with a response already verified by the payment backend.
export function cacheVerifiedProEntitlement(entitlement = {}) {
  const next = cleanEntitlement({
    plan: entitlement.plan,
    status: entitlement.status,
    expiresAt: entitlement.expiresAt,
    source: entitlement.source || 'telegram-stars',
  });
  setItem(KEY, next);
  window.dispatchEvent(new CustomEvent('alx-pro-change', { detail: getProState() }));
  return getProState();
}

export function clearProEntitlement() {
  setItem(KEY, { plan: 'free', status: 'inactive', expiresAt: null, source: null });
  window.dispatchEvent(new CustomEvent('alx-pro-change', { detail: getProState() }));
  return getProState();
}

export function requestProPaywall(feature = 'ALX PRO') {
  window.dispatchEvent(new CustomEvent('alx-pro-paywall', {
    detail: { feature: String(feature || 'ALX PRO') },
  }));
}

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

export function isTelegramPaymentContext() {
  return Boolean(telegramInitData());
}

function apiBase() {
  const configured = typeof window.ALX_API_BASE === 'string'
    ? window.ALX_API_BASE.trim().replace(/\/$/, '')
    : '';
  return configured;
}

async function postApi(path, payload, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function requireInitData() {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error('Открой ALX Oracle внутри Telegram, чтобы использовать оплату Stars.');
  }
  return initData;
}

export async function syncProEntitlement({ attempts = 1, delayMs = 0 } = {}) {
  const initData = requireInitData();
  let lastError = null;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    if (attempt > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const data = await postApi('/api/stars-status', { initData });
      updateOffer(data.offer);
      if (data.entitlement?.active) {
        return cacheVerifiedProEntitlement(data.entitlement);
      }
      clearProEntitlement();
      return getProState();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Не удалось проверить ALX PRO.');
}

export async function createStarsInvoice() {
  const initData = requireInitData();
  const data = await postApi('/api/stars-create-invoice', { initData });
  updateOffer({
    priceStars: data.priceStars,
    periodDays: data.periodDays,
    recurring: data.recurring,
  });
  if (!data.invoiceLink) throw new Error('Telegram не вернул ссылку на счёт.');
  return data;
}

export async function waitForProActivation({ attempts = 10, delayMs = 1200 } = {}) {
  // A successful invoice can arrive in the Stars ledger a moment after
  // invoice_closed=paid/pending. Poll the verified backend until it appears.
  let lastState = getProState();
  let lastError = null;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    if (attempt > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      lastState = await syncProEntitlement();
      if (lastState.active) return lastState;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError && !lastState.active) throw lastError;
  return lastState;
}
