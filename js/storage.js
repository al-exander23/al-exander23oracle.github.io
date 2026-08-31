// storage.js — локальное хранилище данных для Истории и Избранного.
// Изолированный слой данных (Data Layer), не зависящий от DOM.

const HISTORY_KEY = 'alx_oracle_history';
const FAVORITES_KEY = 'alx_oracle_favorites';
const HISTORY_LIMIT = 30; // Максимальное количество хранимых миксов в истории

// Безопасное чтение из localStorage (защита от ошибок парсинга и квот)
function readStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`[ALX STORAGE] Ошибка чтения ключа ${key}:`, e);
    return [];
  }
}

// Безопасная запись в localStorage
function writeStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`[ALX STORAGE] Ошибка записи ключа ${key}:`, e);
  }
}

// ==========================================
// ИСТОРИЯ
// ==========================================

export function getHistory() {
  return readStorage(HISTORY_KEY);
}

export function saveToHistory(mix) {
  if (!mix || !mix.id) return;

  const history = getHistory();
  
  // Создаем копию объекта микса и добавляем временную метку
  const record = {
    ...mix,
    savedAt: Date.now()
  };

  // Добавляем новый микс в начало списка
  history.unshift(record);

  // Обрезаем массив до установленного лимита
  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }

  writeStorage(HISTORY_KEY, history);
}

// ==========================================
// ИЗБРАННОЕ
// ==========================================

export function getFavorites() {
  return readStorage(FAVORITES_KEY);
}

export function isFavorite(mixId) {
  const favs = getFavorites();
  return favs.some(f => f.id === mixId);
}

// Возвращает boolean: true, если добавлено в избранное, false - если удалено
export function toggleFavorite(mix) {
  if (!mix || !mix.id) return false;

  const favs = getFavorites();
  const existsIndex = favs.findIndex(f => f.id === mix.id);
  let isNowFavorite = false;

  if (existsIndex >= 0) {
    // Если уже в избранном — удаляем
    favs.splice(existsIndex, 1);
    isNowFavorite = false;
  } else {
    // Если нет — добавляем
    favs.unshift({
      ...mix,
      favoritedAt: Date.now()
    });
    isNowFavorite = true;
  }

  writeStorage(FAVORITES_KEY, favs);
  return isNowFavorite;
}