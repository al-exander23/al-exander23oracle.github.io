// profile.js — всё, что связано с локальным профилем человека:
// избранные миксы, история показов, простые настройки.
// Осознанно НЕ хранит здесь ничего облачного — это задел на будущее
// (когда появится Telegram-аккаунт/бэкенд, эти функции просто поменяют
// реализацию внутри, а вызывающий код останется прежним).

import { getItem, setItem } from './storage.js';

const KEYS = {
  favorites: 'alx_oracle_favorites', // array of mix ids
  history: 'alx_oracle_history',     // array of { id, ts }
  settings: 'alx_oracle_settings',   // { hapticsEnabled, ... }
};

const HISTORY_LIMIT = 50;

// ---------- избранное ----------
export function getFavorites() {
  return getItem(KEYS.favorites, []);
}

export function isFavorite(mixId) {
  return getFavorites().includes(mixId);
}

export function toggleFavorite(mixId) {
  const favs = getFavorites();
  const idx = favs.indexOf(mixId);
  if (idx === -1) {
    favs.push(mixId);
  } else {
    favs.splice(idx, 1);
  }
  setItem(KEYS.favorites, favs);
  return favs.includes(mixId);
}

// ---------- история ----------
export function getHistory() {
  return getItem(KEYS.history, []);
}

export function addToHistory(mixId) {
  const history = getHistory();
  history.unshift({ id: mixId, ts: Date.now() });
  setItem(KEYS.history, history.slice(0, HISTORY_LIMIT));
}

// ---------- настройки (задел на будущее: PRO-режим, звук и т.д.) ----------
export function getSettings() {
  return getItem(KEYS.settings, {
    hapticsEnabled: true,
  });
}

export function setSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  setItem(KEYS.settings, settings);
  return settings;
}

// ---------- задел под будущие сигналы для Oracle Engine ----------
// Пока не используется, но именно отсюда oracle.js в будущем сможет
// брать "любимые вкусы" и "настроение", не меняя свой публичный API.
export function getTasteProfile() {
  const favs = getFavorites();
  return {
    favoriteIds: favs,
    favoritesCount: favs.length,
  };
}
