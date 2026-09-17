// mixes.js — единая точка загрузки базы миксов.
// Базовая библиотека, 2026 Mix Lab, PRO drops и пользовательские ALX Originals
// объединяются здесь. Всё остальное приложение работает через getMixes().

import { isProActive } from './pro.js?v=1.17.0-mixlab';

let cache = null;
let loadPromise = null;

const DATA_VERSION = '1.18.0-pro-drops';
const FETCH_TIMEOUT = 6000;

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
    fetchJson('data/alx-originals.json'),
  ]);

  const merged = mergeUnique(base, trend2026, proDrops2026, originals);
  if (!merged.length) throw new Error('База миксов пуста');
  return merged;
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

export function getMixes() {
  const all = cache || [];
  if (isProActive()) return all;
  return all.filter((mix) => mix?.proOnly !== true);
}

export function getAllMixes() {
  return cache || [];
}

export function hasMixes() {
  return getMixes().length > 0;
}

export function getMixById(id) {
  return getMixes().find((m) => m.id === id) || null;
}
