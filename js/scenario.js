// scenario.js — ситуационный режим Оракула и виртуальные коллекции.
// Работает поверх существующей персонализации и не меняет данные mixes.json.

import { getItem, setItem } from './storage.js';
import { buildDerivedProfile, calculateMixScore } from './personalization.js';
import { isPremiumCollection, isProActive } from './pro.js?v=1.13.0';

const KEY = 'alx_oracle_scenario';

const DEFAULT_SCENARIO = Object.freeze({
  mood: 'any',
  company: 'any',
  time: 'any',
  collection: 'any',
});

export const SCENARIO_OPTIONS = {
  mood: [
    { id: 'any', label: 'Любое' },
    { id: 'бодрит', label: 'Бодрость' },
    { id: 'уют', label: 'Уют' },
    { id: 'лёгкость', label: 'Лёгкость' },
    { id: 'вечер', label: 'Вечер' },
  ],
  company: [
    { id: 'any', label: 'Любая' },
    { id: 'solo', label: 'Один' },
    { id: 'date', label: 'Вдвоём' },
    { id: 'friends', label: 'Друзья' },
    { id: 'party', label: 'Компания' },
  ],
  time: [
    { id: 'any', label: 'Любое' },
    { id: 'auto', label: 'Авто' },
    { id: 'day', label: 'День' },
    { id: 'evening', label: 'Вечер' },
    { id: 'late', label: 'Ночь' },
  ],
};

export const COLLECTION_OPTIONS = [
  { id: 'any', label: 'Все миксы' },
  { id: 'fresh', label: 'Свежие' },
  { id: 'dessert', label: 'Десертные' },
  { id: 'berry', label: 'Ягодные' },
  { id: 'tropical', label: 'Тропические' },
  { id: 'sour', label: 'С кислинкой' },
  { id: 'strong', label: 'Крепкие' },
  { id: 'signature', label: 'ALX Signature', pro: true },
  { id: 'date-night', label: 'Для двоих', pro: true },
  { id: 'after-dark', label: 'После полуночи', pro: true },
  { id: 'experimental', label: 'Эксперимент', pro: true },
];

const BERRY_WORDS = [
  'малина', 'клубника', 'земляника', 'черника', 'ежевика', 'смородина',
  'клюква', 'брусника', 'лесные ягоды', 'вишня', 'черешня',
];

const TROPICAL_WORDS = [
  'манго', 'маракуйя', 'папайя', 'ананас', 'гуава', 'личи', 'кокос',
  'питахайя', 'драконий фрукт', 'банан', 'киви', 'фейхоа',
];

const DESSERT_WORDS = [
  'шоколад', 'бисквит', 'печенье', 'чизкейк', 'меренга', 'пломбир',
  'мороженое', 'йогурт', 'карамель', 'ваниль', 'крем', 'вафля', 'тирамису',
  'фисташка', 'лесной орех', 'орех',
];

function normalize(value) {
  return String(value || '').trim().toLowerCase().replaceAll('ё', 'е');
}

function recipeNames(mix) {
  if (!Array.isArray(mix?.recipe)) return [];
  return mix.recipe
    .map((item) => normalize(item?.flavor))
    .filter(Boolean);
}

function includesAny(names, words) {
  return names.some((name) => words.some((word) => name.includes(normalize(word))));
}

export function collectionMatches(mix, collectionId) {
  if (!mix || collectionId === 'any') return true;
  const names = recipeNames(mix);
  const mood = normalize(mix.mood);

  switch (collectionId) {
    case 'fresh':
      return Number(mix.freshness) >= 2 || includesAny(names, ['мята', 'эвкалипт', 'лед', 'айс', 'ментол']);
    case 'dessert':
      return includesAny(names, DESSERT_WORDS) || Number(mix.sweetness) >= 3;
    case 'berry':
      return includesAny(names, BERRY_WORDS);
    case 'tropical':
      return includesAny(names, TROPICAL_WORDS);
    case 'sour':
      return Number(mix.sourness) >= 2 || includesAny(names, ['лимон', 'лайм', 'грейпфрут', 'клюква', 'кисл']);
    case 'strong':
      return Number(mix.strength) >= 3;
    case 'signature':
      return Number(mix.popularity) >= 78 && Number(mix.difficulty || 1) <= 3;
    case 'date-night':
      return ['уют', 'вечер'].includes(mood)
        || (Number(mix.sweetness) >= 2 && Number(mix.freshness) <= 2);
    case 'after-dark':
      return mood === 'вечер'
        || (Number(mix.popularity) >= 72 && Number(mix.strength) >= 2);
    case 'experimental':
      return Number(mix.sourness) >= 2
        || Number(mix.freshness) >= 2
        || Number(mix.difficulty) >= 3;
    default:
      return true;
  }
}

function validOption(group, value) {
  return SCENARIO_OPTIONS[group]?.some((item) => item.id === value);
}

function validCollection(value) {
  return COLLECTION_OPTIONS.some((item) => item.id === value);
}

function collectionAllowed(value) {
  return validCollection(value) && (!isPremiumCollection(value) || isProActive());
}

export function getScenario() {
  const raw = getItem(KEY, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SCENARIO };
  }

  return {
    mood: validOption('mood', raw.mood) ? raw.mood : DEFAULT_SCENARIO.mood,
    company: validOption('company', raw.company) ? raw.company : DEFAULT_SCENARIO.company,
    time: validOption('time', raw.time) ? raw.time : DEFAULT_SCENARIO.time,
    collection: collectionAllowed(raw.collection) ? raw.collection : DEFAULT_SCENARIO.collection,
  };
}

export function setScenario(patch = {}) {
  const current = getScenario();
  const requestedCollection = patch.collection;
  const next = {
    mood: validOption('mood', patch.mood) ? patch.mood : current.mood,
    company: validOption('company', patch.company) ? patch.company : current.company,
    time: validOption('time', patch.time) ? patch.time : current.time,
    collection: collectionAllowed(requestedCollection) ? requestedCollection : current.collection,
  };
  setItem(KEY, next);
  return next;
}

export function resetScenario() {
  setItem(KEY, { ...DEFAULT_SCENARIO });
  return { ...DEFAULT_SCENARIO };
}

export function hasActiveScenario(scenario = getScenario()) {
  return scenario.mood !== 'any'
    || scenario.company !== 'any'
    || scenario.time !== 'any'
    || scenario.collection !== 'any';
}

export function getResolvedTime(scenario = getScenario(), date = new Date()) {
  if (scenario.time !== 'auto') return scenario.time;
  const hour = date.getHours();
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'late';
}

function labelFor(group, id) {
  return SCENARIO_OPTIONS[group]?.find((item) => item.id === id)?.label || id;
}

function collectionLabel(id) {
  return COLLECTION_OPTIONS.find((item) => item.id === id)?.label || id;
}

export function describeScenario(scenario = getScenario()) {
  const parts = [];
  if (scenario.mood !== 'any') parts.push(labelFor('mood', scenario.mood));
  if (scenario.company !== 'any') parts.push(labelFor('company', scenario.company));
  if (scenario.time !== 'any') {
    const resolved = getResolvedTime(scenario);
    parts.push(scenario.time === 'auto' ? `Авто · ${labelFor('time', resolved)}` : labelFor('time', scenario.time));
  }
  if (scenario.collection !== 'any') parts.push(collectionLabel(scenario.collection));
  return parts.length ? parts.join(' · ') : 'Обычный режим без фильтров';
}

export function getCollectionCounts(mixes = []) {
  const counts = {};
  COLLECTION_OPTIONS.forEach((collection) => {
    counts[collection.id] = collection.id === 'any'
      ? mixes.filter(Boolean).length
      : mixes.filter((mix) => collectionMatches(mix, collection.id)).length;
  });
  return counts;
}

function scenarioBonus(mix, scenario) {
  let bonus = 0;
  const mood = normalize(mix?.mood);

  if (scenario.mood !== 'any') {
    if (mood === normalize(scenario.mood)) bonus += 7;
    else if (mood === 'универсальное') bonus += 1.5;
    else bonus -= 1.25;
  }

  switch (scenario.company) {
    case 'solo':
      if (Number(mix.strength) <= 3) bonus += 1.5;
      if (['уют', 'универсальное', 'легкость'].includes(mood)) bonus += 2.5;
      if (Number(mix.difficulty) <= 2) bonus += 1;
      break;
    case 'date':
      if (['уют', 'вечер'].includes(mood)) bonus += 4;
      if (Number(mix.sweetness) >= 2) bonus += 2.5;
      if (Number(mix.freshness) <= 2) bonus += 1;
      break;
    case 'friends':
      if (['бодрит', 'универсальное'].includes(mood)) bonus += 3;
      if (Number(mix.popularity) >= 65) bonus += 2;
      if (Number(mix.strength) >= 2 && Number(mix.strength) <= 3) bonus += 1;
      break;
    case 'party':
      if (mood === 'бодрит') bonus += 4;
      if (Number(mix.freshness) >= 2) bonus += 2;
      if (Number(mix.sourness) >= 2) bonus += 1.5;
      if (Number(mix.strength) >= 3) bonus += 1.5;
      break;
    default:
      break;
  }

  switch (getResolvedTime(scenario)) {
    case 'day':
      if (['бодрит', 'легкость', 'универсальное'].includes(mood)) bonus += 2;
      if (Number(mix.freshness) >= 2) bonus += 1.5;
      if (Number(mix.strength) <= 3) bonus += 1;
      break;
    case 'evening':
      if (['уют', 'вечер'].includes(mood)) bonus += 3;
      if (Number(mix.sweetness) >= 2) bonus += 1.5;
      break;
    case 'late':
      if (['уют', 'вечер'].includes(mood)) bonus += 2;
      if (Number(mix.strength) >= 3) bonus += 2;
      if (Number(mix.sweetness) >= 2) bonus += 1;
      break;
    default:
      break;
  }

  if (scenario.collection !== 'any' && collectionMatches(mix, scenario.collection)) {
    bonus += 3;
  }

  if (scenario.collection === 'signature' && Number(mix.popularity) >= 85) bonus += 3;
  if (scenario.collection === 'date-night' && ['уют', 'вечер'].includes(mood)) bonus += 3;
  if (scenario.collection === 'after-dark' && Number(mix.strength) >= 3) bonus += 3;
  if (scenario.collection === 'experimental' && Number(mix.sourness) >= 2 && Number(mix.freshness) >= 2) bonus += 2.5;

  return bonus;
}

function weightedPick(scored) {
  const total = scored.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  let roll = Math.random() * total;
  for (const item of scored) {
    roll -= item.weight;
    if (roll <= 0) return item.mix;
  }
  return scored[scored.length - 1]?.mix || null;
}

export function selectScenarioMix(mixes, lastMixId) {
  if (!Array.isArray(mixes) || !mixes.length) return null;

  const scenario = getScenario();
  if (!hasActiveScenario(scenario)) return null;

  let candidates = mixes.filter((mix) => mix && mix.id && mix.id !== lastMixId);
  if (!candidates.length) candidates = mixes.filter(Boolean);

  if (scenario.collection !== 'any') {
    const collectionPool = candidates.filter((mix) => collectionMatches(mix, scenario.collection));
    if (collectionPool.length) candidates = collectionPool;
  }

  const profile = buildDerivedProfile(mixes);
  const scored = candidates
    .map((mix) => {
      const base = calculateMixScore(mix, profile);
      const bonus = scenarioBonus(mix, scenario);
      return { mix, weight: Math.max(0.05, base + bonus) };
    })
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0);

  if (!scored.length) return null;

  // Небольшая доля исследования сохраняет ощущение живого Оракула,
  // но выбор всё равно остаётся внутри активной коллекции, если она задана.
  if (Math.random() < 0.12) {
    const exploration = scored
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(3, Math.ceil(scored.length * 0.35)));
    return exploration[Math.floor(Math.random() * exploration.length)]?.mix || null;
  }

  return weightedPick(scored);
}
