// profile.js — всё, что связано с локальным профилем человека:
// избранные миксы, история показов, простые настройки и дизлайки.
// Taste Profile вычисляется динамически из этих данных.

import { getItem, setItem, removeItem } from './storage.js';

const KEYS = {
  favorites: 'alx_oracle_favorites', // array of mix ids
  history: 'alx_oracle_history',     // array of { id, ts }
  settings: 'alx_oracle_settings',   // { hapticsEnabled, ... }
  dislikes: 'alx_oracle_dislikes'    // array of mix ids
};

const HISTORY_LIMIT = 50;

// ---------- избранное ----------
export function getFavorites() {
  return getItem(KEYS.favorites, []);
}

export function isFavorite(mixId) {
  return getFavorites().includes(mixId);
}

export function removeFavorite(mixId) {
  const favs = getFavorites();
  const idx = favs.indexOf(mixId);
  if (idx !== -1) {
    favs.splice(idx, 1);
    setItem(KEYS.favorites, favs);
  }
}

export function toggleFavorite(mixId) {
  const favs = getFavorites();
  const idx = favs.indexOf(mixId);
  let isNowFavorite = false;
  if (idx === -1) {
    favs.push(mixId);
    isNowFavorite = true;
    removeDislike(mixId); // Mutual exclusion: убираем из дизлайков
  } else {
    favs.splice(idx, 1);
  }
  setItem(KEYS.favorites, favs);
  return isNowFavorite;
}

// ---------- дизлайки ----------
export function getDislikes() {
  return getItem(KEYS.dislikes, []);
}

export function isDisliked(mixId) {
  return getDislikes().includes(mixId);
}

export function removeDislike(mixId) {
  const dis = getDislikes();
  const idx = dis.indexOf(mixId);
  if (idx !== -1) {
    dis.splice(idx, 1);
    setItem(KEYS.dislikes, dis);
  }
}

export function toggleDislike(mixId) {
  const dis = getDislikes();
  const idx = dis.indexOf(mixId);
  let isNowDisliked = false;
  if (idx === -1) {
    dis.push(mixId);
    isNowDisliked = true;
    removeFavorite(mixId); // Mutual exclusion: убираем из избранного
  } else {
    dis.splice(idx, 1);
  }
  setItem(KEYS.dislikes, dis);
  return isNowDisliked;
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

// ---------- настройки ----------
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

export function resetTaste() {
  // Сбрасываем только дизлайки. Избранное и история сохраняются.
  removeItem(KEYS.dislikes);
}

// ---------- Derived Taste Profile ----------
export function getTasteProfile() {
  const favs = getFavorites();
  const history = getHistory();
  const dislikes = getDislikes();

  // Считаем уникальные сигналы по ID
  const uniqueSignals = new Set([
    ...favs,
    ...history.map(h => h.id),
    ...dislikes
  ]);

  return {
    favoriteIds: favs,
    dislikedIds: dislikes,
    history: history,
    uniqueSignalCount: uniqueSignals.size,
    favoritesCount: favs.length
  };
}