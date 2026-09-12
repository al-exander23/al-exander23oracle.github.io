// achievements.js — локальные достижения и награды серии.
// Никакого backend: прогресс хранится на устройстве рядом с остальным профилем.

import { getItem, setItem } from './storage.js';
import { getTasteProfile } from './profile.js';
import { getVisitStats } from './daily.js?v=1.10.0';

const KEY = 'alx_oracle_achievement_stats';

const ACHIEVEMENTS = [
  { id: 'oracle-1', icon: '✦', title: 'Первое видение', note: 'Получить первый ответ Оракула', metric: 'oracleResults', target: 1 },
  { id: 'oracle-10', icon: '🔮', title: 'Знакомство со сферой', note: 'Получить 10 ответов Оракула', metric: 'oracleResults', target: 10 },
  { id: 'oracle-30', icon: '☾', title: 'Хранитель дыма', note: 'Получить 30 ответов Оракула', metric: 'oracleResults', target: 30 },
  { id: 'favorites-3', icon: '♡', title: 'Коллекционер', note: 'Сохранить 3 любимых микса', metric: 'favorites', target: 3 },
  { id: 'favorites-10', icon: '♥', title: 'Куратор вкуса', note: 'Сохранить 10 любимых миксов', metric: 'favorites', target: 10 },
  { id: 'signals-6', icon: '◇', title: 'Оракул понял тебя', note: 'Дать 6 явных сигналов ❤️ / 👎', metric: 'explicitSignals', target: 6 },
  { id: 'visits-7', icon: '◷', title: 'Постоянный гость', note: 'Открыть Оракул в 7 разных дней', metric: 'visitDays', target: 7 },
  { id: 'visits-30', icon: '♜', title: 'Старший хранитель', note: 'Открыть Оракул в 30 разных дней', metric: 'visitDays', target: 30 },
];

export const STREAK_REWARDS = [
  { days: 3, icon: '✧', title: 'Искра Оракула' },
  { days: 7, icon: '◈', title: 'Печать недели' },
  { days: 14, icon: '◆', title: 'Амулет дыма' },
  { days: 30, icon: '♛', title: 'Корона Оракула' },
];

function cleanStats(raw) {
  const profile = getTasteProfile();
  const historyBaseline = Array.isArray(profile.history) ? profile.history.length : 0;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { oracleResults: historyBaseline, unlocked: {} };
  }

  return {
    oracleResults: Number.isFinite(raw.oracleResults) && raw.oracleResults >= 0
      ? Math.floor(raw.oracleResults)
      : historyBaseline,
    unlocked: raw.unlocked && typeof raw.unlocked === 'object' && !Array.isArray(raw.unlocked)
      ? { ...raw.unlocked }
      : {},
  };
}

function getStats() {
  return cleanStats(getItem(KEY, null));
}

function saveStats(stats) {
  setItem(KEY, stats);
  return stats;
}

function getMetrics(stats = getStats()) {
  const profile = getTasteProfile();
  const visits = getVisitStats();
  const favoriteIds = Array.isArray(profile.favoriteIds) ? profile.favoriteIds : [];
  const dislikedIds = Array.isArray(profile.dislikedIds) ? profile.dislikedIds : [];
  const explicitSignals = new Set([...favoriteIds, ...dislikedIds]).size;

  return {
    oracleResults: stats.oracleResults,
    favorites: favoriteIds.length,
    explicitSignals,
    visitDays: visits.totalDays || 0,
  };
}

export function syncAchievements() {
  const stats = getStats();
  const metrics = getMetrics(stats);
  const newlyUnlocked = [];

  ACHIEVEMENTS.forEach((achievement) => {
    if ((metrics[achievement.metric] || 0) < achievement.target) return;
    if (stats.unlocked[achievement.id]) return;
    stats.unlocked[achievement.id] = Date.now();
    newlyUnlocked.push(achievement);
  });

  saveStats(stats);
  return newlyUnlocked;
}

export function recordOracleResult() {
  const stats = getStats();
  stats.oracleResults += 1;
  saveStats(stats);
  return syncAchievements();
}

export function getAchievementState() {
  syncAchievements();
  const stats = getStats();
  const metrics = getMetrics(stats);

  const achievements = ACHIEVEMENTS.map((achievement) => {
    const current = Math.max(0, metrics[achievement.metric] || 0);
    const unlockedAt = stats.unlocked[achievement.id] || null;
    return {
      ...achievement,
      current,
      progress: Math.min(100, Math.round((current / achievement.target) * 100)),
      unlocked: Boolean(unlockedAt),
      unlockedAt,
    };
  });

  return {
    achievements,
    unlockedCount: achievements.filter((item) => item.unlocked).length,
    totalCount: achievements.length,
    oracleResults: stats.oracleResults,
  };
}

export function getStreakRewardState() {
  const visits = getVisitStats();
  const best = visits.bestStreak || 0;
  const current = visits.currentStreak || 0;
  const rewards = STREAK_REWARDS.map((reward) => ({
    ...reward,
    unlocked: best >= reward.days,
  }));
  const next = rewards.find((reward) => !reward.unlocked) || null;

  return {
    rewards,
    next,
    currentStreak: current,
    bestStreak: best,
    nextProgress: next ? Math.min(100, Math.round((current / next.days) * 100)) : 100,
  };
}
