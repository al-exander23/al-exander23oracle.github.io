// daily.js — Daily Oracle + local visit memory.
// Completely local: no backend, auth or external API.
// One daily mix is persisted per local calendar day and re-used until the date changes.

import { getItem, setItem } from './storage.js';
import { initMixes, getMixes, getMixById } from './mixes.js';
import { selectWeightedMix } from './personalization.js';
import { addToHistory } from './profile.js';

const KEYS = {
  daily: 'alx_oracle_daily_oracle',
  visits: 'alx_oracle_visit_days',
};

const VISIT_LIMIT = 180;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKeyToDayNumber(key) {
  if (!isDateKey(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

function getVisitDays() {
  const raw = getItem(KEYS.visits, []);
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isDateKey))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, VISIT_LIMIT);
}

export function recordVisit(date = new Date()) {
  const today = getLocalDateKey(date);
  const days = getVisitDays();
  if (!days.includes(today)) {
    days.unshift(today);
    const clean = [...new Set(days)]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, VISIT_LIMIT);
    setItem(KEYS.visits, clean);
  }
  return getVisitStats(date);
}

export function getVisitStats(date = new Date()) {
  const days = getVisitDays();
  const dayNumbers = days
    .map(dateKeyToDayNumber)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const set = new Set(dayNumbers);
  const todayNum = dateKeyToDayNumber(getLocalDateKey(date));

  let currentStreak = 0;
  if (Number.isFinite(todayNum)) {
    let cursor = todayNum;
    while (set.has(cursor)) {
      currentStreak += 1;
      cursor -= 1;
    }
  }

  let bestStreak = 0;
  let run = 0;
  let prev = null;
  dayNumbers.forEach((dayNum) => {
    run = prev !== null && dayNum === prev + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = dayNum;
  });

  return {
    currentStreak,
    bestStreak,
    totalDays: days.length,
    lastVisit: days[0] || null,
  };
}

function getStoredDaily() {
  const raw = getItem(KEYS.daily, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isDateKey(raw.date) || typeof raw.mixId !== 'string' || !raw.mixId) return null;
  return {
    date: raw.date,
    mixId: raw.mixId,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
  };
}

function storeDaily(record) {
  setItem(KEYS.daily, record);
  return record;
}

function randomFallback(mixes, avoidId) {
  const valid = mixes.filter((mix) => mix && mix.id);
  if (!valid.length) return null;
  const candidates = valid.length > 1
    ? valid.filter((mix) => mix.id !== avoidId)
    : valid;
  const pool = candidates.length ? candidates : valid;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

export async function getOrCreateDailyMix() {
  await initMixes();

  const mixes = getMixes();
  if (!mixes.length) {
    return { mix: null, record: null, isNew: false };
  }

  const today = getLocalDateKey();
  const stored = getStoredDaily();

  if (stored && stored.date === today) {
    const existingMix = getMixById(stored.mixId);
    if (existingMix) {
      return { mix: existingMix, record: stored, isNew: false };
    }
  }

  const previousMixId = stored?.mixId || null;
  let mix = null;

  try {
    mix = selectWeightedMix(mixes, previousMixId);
  } catch (error) {
    console.warn('[ALX Daily] personalization fallback:', error);
  }

  if (!mix) mix = randomFallback(mixes, previousMixId);
  if (!mix) return { mix: null, record: null, isNew: false };

  const record = storeDaily({
    date: today,
    mixId: mix.id,
    createdAt: Date.now(),
  });

  // Daily Oracle is a real shown result, so it becomes "seen" exactly once.
  addToHistory(mix.id);

  return { mix, record, isNew: true };
}
