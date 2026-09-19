// mixes.js — единая точка загрузки базы миксов.
// Обычные миксы загружаются из статики, а ALX Originals — только через
// защищённый API после подтверждения активного ALX PRO.

import { isProActive } from './pro.js?v=1.23.0-originals';

let cache = null;
let loadPromise = null;
let originalsPromise = null;
let originalsLoaded = false;
let communityPromise = null;
let communityLoaded = false;

const DATA_VERSION = '1.23.0-originals';
const FETCH_TIMEOUT = 6000;
const ORIGINALS_COLLECTION = 'originals';
const COMMUNITY_COLLECTION = 'community';
const DEFAULT_API_BASE = 'https://al-exander23oracle-github-io.vercel.app';
const COMMUNITY_API_BASE = 'https://alx-pay.alxoracle.workers.dev';

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

function normalizeCommunityMix(item) {
  if (!item || typeof item.id !== 'string' || !Array.isArray(item.recipe) || !item.recipe.length) return null;
  return {
    id: item.id,
    name: String(item.title || 'Community Mix'),
    description: String(item.description || ''),
    recipe: item.recipe.map((part) => ({
      flavor: String(part?.flavor || '').trim(),
      percent: Number(part?.percent || 0),
    })).filter((part) => part.flavor && Number.isFinite(part.percent) && part.percent > 0),
    rating: Number(item.ratingCount || 0) > 0 ? Number(item.rating || 0) : null,
    ratingCount: Number(item.ratingCount || 0),
    popularity: Number(item.ratingCount || 0) > 0
      ? Math.max(0, Math.min(100, Math.round((Number(item.rating || 0) / 5) * 100)))
      : 50,
    strength: Number(item.strength || 0) || null,
    author: String(item.author || 'Участник Community'),
    communityMix: true,
    communityMemberMix: true,
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: COMMUNITY_COLLECTION,
    collections: [COMMUNITY_COLLECTION],
    source: 'community',
  };
}

async function fetchCommunitySecure() {
  if (!isProActive()) return [];

  const initData = telegramInitData();
  if (!initData) {
    console.warn('[mixes.js] Community Oracle requires verified Telegram Mini App session');
    return [];
  }

  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(`${COMMUNITY_API_BASE}/api/community/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, view: 'oracle' }),
      cache: 'no-store',
      signal: abortCtrl.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !Array.isArray(data.mixes)) {
      console.warn('[mixes.js] Community Oracle access denied/unavailable:', response.status);
      return [];
    }
    return data.mixes.map(normalizeCommunityMix).filter((mix) => mix && mix.recipe.length);
  } catch (error) {
    console.warn('[mixes.js] Community Oracle secure load failed:', error);
    return [];
  } finally {
    clearTimeout(timer);
  }
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

export async function initCommunityMixes({ force = false } = {}) {
  if (!isProActive()) return [];
  if (communityLoaded && !force) return getCollectionMixes(COMMUNITY_COLLECTION);
  if (communityPromise) return communityPromise;

  communityPromise = fetchCommunitySecure()
    .then((community) => {
      cache = mergeUnique(
        (cache || []).filter((mix) => String(mix?.exclusiveCollection || '').toLowerCase() !== COMMUNITY_COLLECTION),
        community,
      );
      communityLoaded = community.length > 0;
      return community;
    })
    .finally(() => {
      communityPromise = null;
    });

  return communityPromise;
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
  return getMixes().length > 0
    || (isProActive() && getCollectionMixes(ORIGINALS_COLLECTION).length > 0)
    || (isProActive() && getCollectionMixes(COMMUNITY_COLLECTION).length > 0);
}

export function getMixById(id) {
  return getAllMixes().find((m) => m.id === id) || null;
}
