// js/personalization.js
import { getTasteProfile } from './profile.js';

export function buildDerivedProfile(mixes) {
  const rawProfile = getTasteProfile();
  
  const favs = rawProfile.favoriteIds || [];
  const dislikes = rawProfile.dislikedIds || [];
  const history = rawProfile.history || [];
  
  const profile = {
    uniqueSignalCount: rawProfile.uniqueSignalCount || 0,
    favoriteIds: favs,
    dislikedIds: dislikes,
    recentMixIds: history.slice(0, 5).map(h => h.id || h),
    ingredients: {},
    numeric: { strength: 0, freshness: 0, sweetness: 0, sourness: 0 },
    numericCounts: { strength: 0, freshness: 0, sweetness: 0, sourness: 0 }
  };

  if (profile.uniqueSignalCount === 0) return profile;

  const mixDict = {};
  mixes.forEach(m => mixDict[m.id] = m);

  const processMix = (mixId, weight) => {
    const mix = mixDict[mixId];
    if (!mix) return;

    if (mix.recipe) {
      mix.recipe.forEach(r => {
        profile.ingredients[r.flavor] = (profile.ingredients[r.flavor] || 0) + weight;
      });
    }

    ['strength', 'freshness', 'sweetness', 'sourness'].forEach(attr => {
      if (mix[attr] != null) {
        profile.numeric[attr] += mix[attr] * weight;
        profile.numericCounts[attr] += weight;
      }
    });
  };

  // Dislike НЕ создаёт глобальный blacklist ингредиентов.
  // Ингредиенты и числовые идеалы строятся ТОЛЬКО на положительных сигналах.
  history.forEach(h => processMix(h.id || h, 1));
  favs.forEach(id => processMix(id, 3));

  ['strength', 'freshness', 'sweetness', 'sourness'].forEach(attr => {
    if (profile.numericCounts[attr] > 0) {
      profile.numeric[attr] = profile.numeric[attr] / profile.numericCounts[attr];
    } else {
      profile.numeric[attr] = null;
    }
  });

  return profile;
}

export function calculateMixScore(mix, derivedProfile) {
  let score = 10; // Base score

  // 1. Прямые сигналы для конкретного микса
  if (derivedProfile.favoriteIds.includes(mix.id)) score += 5;
  if (derivedProfile.dislikedIds.includes(mix.id)) score -= 15; // Сильный штраф КОНКРЕТНОМУ миксу

  // 2. Recent Penalty (последние 5)
  const penaltyMap = [-8, -5, -3, -2, -1];
  const recentIdx = derivedProfile.recentMixIds.indexOf(mix.id);
  if (recentIdx !== -1) {
    score += penaltyMap[recentIdx];
  }

  // 3. Сила персонализации
  let pMultiplier = 1;
  if (derivedProfile.uniqueSignalCount >= 3 && derivedProfile.uniqueSignalCount <= 5) {
    pMultiplier = 0.5; // Weak personalization
  }

  // 4. Сходство числовых характеристик (дистанция 1-5 -> макс дистанция 4)
  let numericScore = 0;
  ['strength', 'freshness', 'sweetness', 'sourness'].forEach(attr => {
    const ideal = derivedProfile.numeric[attr];
    if (ideal !== null && mix[attr] != null) {
      const distance = Math.abs(mix[attr] - ideal);
      const similarity = 1 - (distance / 4); 
      numericScore += similarity * 2;
    }
  });
  score += numericScore * pMultiplier;

  // 5. Сходство ингредиентов (Ограниченное)
  let ingredientScore = 0;
  if (mix.recipe) {
    mix.recipe.forEach(r => {
      if (derivedProfile.ingredients[r.flavor]) {
        ingredientScore += derivedProfile.ingredients[r.flavor];
      }
    });
  }
  score += Math.max(-5, Math.min(10, ingredientScore)) * pMultiplier;

  // 6. Безопасность
  if (isNaN(score) || !isFinite(score)) score = 1;
  return Math.max(0.1, score); // Никогда не <= 0, не NaN, не Infinity
}

export function selectWeightedMix(mixes, lastMixId) {
  // Защита от немедленного повторения: lastMixId фильтруется до любых вычислений
  const availableMixes = mixes.length > 1 ? mixes.filter(m => m.id !== lastMixId) : mixes;
  const profile = buildDerivedProfile(mixes);

  // Cold Start (0-2 signals)
  if (profile.uniqueSignalCount <= 2) return null; // trigger safe fallback

  // Exploration (25%)
  if (Math.random() < 0.25) {
    let candidates = availableMixes.filter(m => 
      !profile.favoriteIds.includes(m.id) && 
      !profile.dislikedIds.includes(m.id) && 
      !profile.recentMixIds.includes(m.id)
    );
    
    // Безопасный fallback, если кандидатов не осталось
    if (candidates.length === 0) candidates = availableMixes;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Weighted Selection (75%)
  let totalWeight = 0;
  const scored = availableMixes.map(mix => {
    const w = calculateMixScore(mix, profile);
    totalWeight += w;
    return { mix, weight: w };
  });

  if (totalWeight <= 0 || isNaN(totalWeight) || !isFinite(totalWeight)) return null;

  let r = Math.random() * totalWeight;
  for (const item of scored) {
    r -= item.weight;
    if (r <= 0) return item.mix;
  }

  return null;
}