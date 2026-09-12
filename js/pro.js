// pro.js — foundation для ALX PRO.
// Entitlement хранится локально только как клиентский кэш. Реальный платёжный
// backend подключается отдельным этапом и должен подтверждать/обновлять этот кэш.

import { getItem, setItem } from './storage.js';

const KEY = 'alx_oracle_pro_entitlement';

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

  return {
    ...entitlement,
    active,
  };
}

export function isProActive() {
  return getProState().active;
}

export function isPremiumCollection(collectionId) {
  return PREMIUM_COLLECTION_IDS.includes(collectionId);
}

// Этот метод предназначен для будущего проверенного ответа backend/payment layer.
// UI покупки сам entitlement не создаёт.
export function cacheVerifiedProEntitlement(entitlement = {}) {
  const next = cleanEntitlement({
    plan: entitlement.plan,
    status: entitlement.status,
    expiresAt: entitlement.expiresAt,
    source: entitlement.source,
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

// Checkout URL будет устанавливаться платёжным слоем. Токены/секреты сюда
// никогда не помещаются. Это только публичная ссылка на уже созданный checkout.
export function getCheckoutUrl() {
  const url = typeof window.ALX_PRO_CHECKOUT_URL === 'string'
    ? window.ALX_PRO_CHECKOUT_URL.trim()
    : '';
  return /^https:\/\//i.test(url) ? url : '';
}
