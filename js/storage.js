import { tenantStorageKey } from './tenant.js?v=1.39.0-white-label';

// storage.js — тонкая безопасная обёртка над localStorage.
// Ничего не знает о профиле/избранном/истории — просто хранит JSON по ключу.
// Если localStorage недоступен (приватный режим, отключены cookies и т.п.),
// всё продолжает работать через обычный объект в памяти — приложение не падает.

const memoryFallback = {};
let storageAvailable = true;

try {
  const testKey = '__alx_oracle_test__';
  window.localStorage.setItem(testKey, '1');
  window.localStorage.removeItem(testKey);
} catch (e) {
  storageAvailable = false;
}

export function getItem(key, fallback = null) {
  try {
    if (!storageAvailable) return memoryFallback[tenantStorageKey(key)] ?? fallback;
    const raw = window.localStorage.getItem(tenantStorageKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    if (!storageAvailable) {
      memoryFallback[tenantStorageKey(key)] = value;
      return true;
    }
    window.localStorage.setItem(tenantStorageKey(key), JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function removeItem(key) {
  try {
    if (!storageAvailable) {
      delete memoryFallback[tenantStorageKey(key)];
      return true;
    }
    window.localStorage.removeItem(tenantStorageKey(key));
    return true;
  } catch (e) {
    return false;
  }
}

export const isStorageAvailable = () => storageAvailable;
