// js/personalization.js
// Локальная персонализация без внешних API.
// Явные сигналы пользователя (Favorite / Dislike) важнее истории показов.

import { getTasteProfile } from './profile.js';

const NUMERIC_ATTRS = ['strength', 'freshness', 'sweetness', 'sourness'];
const RECENT_PENALTIES = [-10, -7, -5, -3, -2];

export function buildDerivedProfile(mixes) {
  const rawProfile = getTasteProfile();

  const favs = Array.isArray(rawProfile.favoriteIds) ? rawProfile.favoriteIds : [];
  const dislikes = Array.isArray(rawProfile.dislikedIds) ? rawProfile.dislikedIds : [];
  const history = Array.isArray(rawProfile.history) ? rawProfile.history : [];

  const explicitSignalIds = new Set([...favs, ...dislikes]);
  const profile = {
    explicitSignalCount: explicitSignalIds.size,
    favoriteIds: favs,
    dislikedIds: dislikes,
    recentMixIds: history.slice(0, 5).map((h) => h.id || h),
    seenMixIds: new Set(history.map((h) => h.id || h)),
    ingredients: {},
    numeric: { strength: null, freshness: null, sweetness: null, sourness: null },
    numericTotals: { strength: 0, freshness: 0, sweetness: 0, sourness: 0 },
    numericWeights: { strength: 0, freshness: 0, sweetness: 0, sourness: 0 },
  };

  if (!mixes.length || favs.length === 0) return profile;

  const mixDict = Object.create(null);
  mixes.forEach((mix) => {
    if (mix && mix.id) mixDict[mix.id] = mix;
  });

  // Положительный taste-профиль строим только по Favorite.
  // Сам факт показа микса не означает, что пользователю понравился вкус.
  favs.forEach((mixId) => {
    const mix = mixDict[mixId];
    if (!mix) return;

    if (Array.isArray(mix.recipe)) {
      mix.recipe.forEach((item) => {
        if (!item || !item.flavor) return;
        const share = Number.isFinite(item.percent) && item.percent > 0 ? item.percent / 100 : 0.33;
        profile.ingredients[item.flavor] = (profile.ingredients[item.flavor] || 0) + share;
      });
    }

    NUMERIC_ATTRS.forEach((attr) => {
      const value = mix[attr];
      if (!Number.isFinite(value)) return;
      profile.numericTotals[attr] += value;
      profile.numericWeights[attr] += 1;
    });
  });

  NUMERIC_ATTRS.forEach((attr) => {
    if (profile.numericWeights[attr] > 0) {
      profile.numeric[attr] = profile.numericTotals[attr] / profile.numericWeights[attr];
    }
  });

  return profile;
}

function getPersonalizationMultiplier(profile) {
  if (profile.explicitSignalCount <= 0) return 0;
  if (profile.explicitSignalCount <= 2) return 0.55;
  if (profile.explicitSignalCount <= 5) return 0.8;
  return 1;
}

export function calculateMixScore(mix, profile) {
  let score = 10;

  // Прямые сигналы по конкретному миксу — самые сильные.
  if (profile.favoriteIds.includes(mix.id)) score += 8;
  if (profile.dislikedIds.includes(mix.id)) return 0.05;

  const recentIdx = profile.recentMixIds.indexOf(mix.id);
  if (recentIdx !== -1) score += RECENT_PENALTIES[recentIdx];

  const multiplier = getPersonalizationMultiplier(profile);

  if (multiplier > 0 && profile.favoriteIds.length > 0) {
    let numericScore = 0;
    let numericMatches = 0;

    NUMERIC_ATTRS.forEach((attr) => {
      const ideal = profile.numeric[attr];
      const value = mix[attr];
      if (!Number.isFinite(ideal) || !Number.isFinite(value)) return;

      const distance = Math.abs(value - ideal);
      const similarity = Math.max(0, 1 - distance / 4);
      numericScore += similarity * 2.5;
      numericMatches++;
    });

    if (numericMatches > 0) score += numericScore * multiplier;

    let ingredientScore = 0;
    if (Array.isArray(mix.recipe)) {
      mix.recipe.forEach((item) => {
        if (!item || !item.flavor) return;
        const preference = profile.ingredients[item.flavor] || 0;
        if (preference <= 0) return;

        const share = Number.isFinite(item.percent) && item.percent > 0 ? item.percent / 100 : 0.33;
        ingredientScore += preference * share * 10;
      });
    }

    score += Math.min(12, ingredientScore) * multiplier;
  }

  // Небольшой бонус новым миксам помогает не зацикливаться на уже показанных.
  if (!profile.seenMixIds.has(mix.id)) score += 1.5;

  if (!Number.isFinite(score)) score = 1;
  return Math.max(0.05, score);
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export function selectWeightedMix(mixes, lastMixId) {
  if (!Array.isArray(mixes) || mixes.length === 0) return null;

  const availableMixes = mixes.length > 1
    ? mixes.filter((mix) => mix && mix.id !== lastMixId)
    : mixes.filter(Boolean);

  if (!availableMixes.length) return null;

  const profile = buildDerivedProfile(mixes);

  // Пока пользователь не поставил ни одного явного сигнала, сохраняем
  // исходное случайное поведение Oracle. История сама по себе не равна вкусу.
  if (profile.explicitSignalCount === 0) return null;

  // Чем больше явных сигналов, тем меньше exploration.
  const explorationChance = profile.explicitSignalCount <= 2 ? 0.35 : 0.20;

  if (Math.random() < explorationChance) {
    let candidates = availableMixes.filter((mix) =>
      !profile.favoriteIds.includes(mix.id) &&
      !profile.dislikedIds.includes(mix.id) &&
      !profile.recentMixIds.includes(mix.id)
    );

    if (!candidates.length) {
      candidates = availableMixes.filter((mix) => !profile.dislikedIds.includes(mix.id));
    }

    return pickRandom(candidates.length ? candidates : availableMixes);
  }

  let totalWeight = 0;
  const scored = availableMixes.map((mix) => {
    const weight = calculateMixScore(mix, profile);
    totalWeight += weight;
    return { mix, weight };
  });

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of scored) {
    roll -= item.weight;
    if (roll <= 0) return item.mix;
  }

  return scored[scored.length - 1]?.mix || null;
}
