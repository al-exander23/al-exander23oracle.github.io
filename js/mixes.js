// mixes.js — единая точка загрузки базы миксов.
// Базовая библиотека, 2026 Mix Lab, PRO drops и пользовательские ALX Originals
// объединяются здесь. Всё остальное приложение работает через getMixes().

import { isProActive } from './pro.js?v=1.23.0-originals';

let cache = null;
let loadPromise = null;

const DATA_VERSION = '1.23.0-originals';
const FETCH_TIMEOUT = 6000;
const ORIGINALS_COLLECTION = 'originals';

async function fetchJson(path, { required = false } = {}) {
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${path}?v=${DATA_VERSION}`, {
      cache: 'no-cache',
      signal: abortCtrl.signal,
    });
    if (!res.ok) {
      if (required) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
      console.warn('[mixes.js] optional mix layer unavailable:', path, res.status);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      if (required) throw new Error(`${path} повреждён`);
      console.warn('[mixes.js] optional mix layer is not an array:', path);
      return [];
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function mergeUnique(...layers) {
  const seen = new Set();
  const merged = [];
  layers.flat().forEach((mix) => {
    if (!mix || typeof mix.id !== 'string' || !mix.id || seen.has(mix.id)) return;
    seen.add(mix.id);
    merged.push(mix);
  });
  return merged;
}

async function loadMixes() {
  const [base, trend2026, proDrops2026, originals] = await Promise.all([
    fetchJson('data/mixes.json', { required: true }),
    fetchJson('data/mixes-2026.json'),
    fetchJson('data/pro-drops-2026.json'),
    fetchJson('data/alx-originals-pro-v1.json'),
  ]);

  const merged = mergeUnique(base, trend2026, proDrops2026, originals);
  if (!merged.length) throw new Error('База миксов пуста');
  return merged;
}

function entitledMixes() {
  const all = cache || [];
  if (isProActive()) return all;
  return all.filter((mix) => mix?.proOnly !== true);
}

function isExclusive(mix) {
  return typeof mix?.exclusiveCollection === 'string' && mix.exclusiveCollection.trim().length > 0;
}

export function initMixes() {
  if (!loadPromise) {
    loadPromise = loadMixes()
      .then((data) => { cache = data; return getMixes(); })
      .catch((err) => {
        console.error('[mixes.js]', err);
        cache = [];
        return cache;
      });
  }
  return loadPromise;
}

// Обычный пул Оракула. Эксклюзивные коллекции сюда намеренно не входят,
// чтобы ALX Originals не выпадали случайно вне выбранного раздела.
export function getMixes() {
  return entitledMixes().filter((mix) => !isExclusive(mix));
}

// Полный набор данных, доступный текущему пользователю. Для FREE скрываем
// коллекции с hiddenUntilPro, чтобы авторские Originals не попадали даже
// в тизеры или вспомогательные экраны до покупки.
export function getAllMixes() {
  const all = cache || [];
  if (isProActive()) return all;
  return all.filter((mix) => mix?.hiddenUntilPro !== true);
}

export function getCollectionMixes(collectionId) {
  const normalized = String(collectionId || '').trim().toLowerCase();
  if (!normalized || normalized === 'any') return getMixes();
  return getAllMixes().filter((mix) => {
    const exclusive = String(mix?.exclusiveCollection || '').trim().toLowerCase();
    return exclusive === normalized;
  });
}

export function hasMixes() {
  return getMixes().length > 0 || (isProActive() && getCollectionMixes(ORIGINALS_COLLECTION).length > 0);
}

export function getMixById(id) {
  return getAllMixes().find((m) => m.id === id) || null;
}
