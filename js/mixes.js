// mixes.js — единая точка загрузки базы миксов.
// Обычные миксы загружаются из статики, а ALX Originals — только через
// защищённый API после подтверждения активного ALX PRO.

import { isProActive } from './pro.js?v=1.23.0-originals';

let cache = null;
let loadPromise = null;
let originalsPromise = null;
let originalsLoaded = false;

const DATA_VERSION = '1.23.0-originals';
const FETCH_TIMEOUT = 6000;
const ORIGINALS_COLLECTION = 'originals';
const DEFAULT_API_BASE = 'https://al-exander23oracle-github-io.vercel.app';

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

function apiBase() {
  const configured = typeof window.ALX_API_BASE === 'string'
    ? window.ALX_API_BASE.trim().replace(/\/$/, '')
    : '';
  return configured || DEFAULT_API_BASE;
}

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function fetchOriginalsSecure() {
  if (!isProActive()) return [];

  const initData = telegramInitData();
  if (!initData) {
    console.warn('[mixes.js] ALX Originals require verified Telegram Mini App session');
    return [];
  }

  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(`${apiBase()}/api/originals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
      cache: 'no-store',
      signal: abortCtrl.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !Array.isArray(data.mixes)) {
      console.warn('[mixes.js] ALX Originals access denied/unavailable:', response.status);
      return [];
    }
    return data.mixes;
  } catch (error) {
    console.warn('[mixes.js] ALX Originals secure load failed:', error);
    return [];
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
  const [base, trend2026, proDrops2026] = await Promise.all([
    fetchJson('data/mixes.json', { required: true }),
    fetchJson('data/mixes-2026.json'),
    fetchJson('data/pro-drops-2026.json'),
  ]);

  const merged = mergeUnique(base, trend2026, proDrops2026);
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
      .then(async (data) => {
        cache = data;
        if (isProActive()) await initOriginals();
        return getMixes();
      })
      .catch((err) => {
        console.error('[mixes.js]', err);
        cache = [];
        return cache;
      });
  }
  return loadPromise;
}

export async function initOriginals() {
  if (!isProActive()) return [];
  if (originalsLoaded) return getCollectionMixes(ORIGINALS_COLLECTION);
  if (originalsPromise) return originalsPromise;

  originalsPromise = fetchOriginalsSecure()
    .then((originals) => {
      if (originals.length) {
        cache = mergeUnique(cache || [], originals);
        originalsLoaded = true;
      }
      return originals;
    })
    .finally(() => {
      originalsPromise = null;
    });

  return originalsPromise;
}

// Обычный пул Оракула. Эксклюзивные коллекции сюда намеренно не входят,
// чтобы ALX Originals не выпадали случайно вне выбранного раздела.
export function getMixes() {
  return entitledMixes().filter((mix) => !isExclusive(mix));
}

// Полный набор данных, доступный текущему пользователю. FREE никогда не
// получает hiddenUntilPro записи, даже если они каким-то образом остались в памяти.
export function getAllMixes() {
  const all = cache || [];
  if (isProActive()) return all;
  return all.filter((mix) => mix?.hiddenUntilPro !== true && mix?.proOnly !== true);
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
