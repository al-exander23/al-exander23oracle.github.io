// POST /api/originals
// Returns Alexander's private ALX Originals collection only after a verified
// Telegram Mini App session and an active ALX PRO entitlement.

const { handleOptions, json, readJson } = require('../server/http.js');
const { validateInitData, findProEntitlement } = require('../server/telegram.js');

const DEFAULT_EXTERNAL_PAY_API = 'https://alx-pay.alxoracle.workers.dev';

const ORIGINALS = Object.freeze([
  {
    id: 'alx-original-001',
    name: 'Bazar Night',
    description: 'Авторский микс Alexander из закрытой коллекции ALX Originals.',
    recipe: [
      { flavor: 'Пан-расс', percent: 10 },
      { flavor: 'Блэк Афгано', percent: 30 },
      { flavor: 'Индийский перец', percent: 10 },
      { flavor: 'Чернослив', percent: 50 },
    ],
    rating: null,
    favorites: 0,
    author: 'Alexander · ALX Originals',
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  },
  {
    id: 'alx-original-002',
    name: 'Дорогая вишня',
    description: 'Авторский микс Alexander из закрытой коллекции ALX Originals.',
    recipe: [
      { flavor: 'Бакара Руж', percent: 80 },
      { flavor: 'Вишня', percent: 20 },
    ],
    rating: null,
    favorites: 0,
    author: 'Alexander · ALX Originals',
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  },
  {
    id: 'alx-original-003',
    name: 'Мускус тайм',
    description: 'Авторский микс Alexander из закрытой коллекции ALX Originals.',
    recipe: [
      { flavor: 'Мускусная вишня', percent: 60 },
      { flavor: 'Пан-расс', percent: 20 },
      { flavor: 'Черешня', percent: 20 },
    ],
    rating: null,
    favorites: 0,
    author: 'Alexander · ALX Originals',
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  },
  {
    id: 'alx-original-004',
    name: 'Сапожник',
    description: 'Авторский микс Alexander из закрытой коллекции ALX Originals.',
    recipe: [
      { flavor: 'Замша', percent: 30 },
      { flavor: 'Лесные ягоды', percent: 70 },
    ],
    rating: null,
    favorites: 0,
    author: 'Alexander · ALX Originals',
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  },
  {
    id: 'alx-original-005',
    name: 'Luxury Viski-Cola',
    description: 'Авторский микс Alexander из закрытой коллекции ALX Originals.',
    recipe: [
      { flavor: 'Мармеладная кола', percent: 40 },
      { flavor: 'Виски', percent: 30 },
      { flavor: 'Ганимед', percent: 30 },
    ],
    rating: null,
    favorites: 0,
    author: 'Alexander · ALX Originals',
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  },
]);

function externalPayBaseUrl() {
  const configured = String(process.env.ALX_EXTERNAL_PAY_API_URL || DEFAULT_EXTERNAL_PAY_API)
    .trim()
    .replace(/\/$/, '');
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_EXTERNAL_PAY_API;
}

async function hasExternalPro(initData) {
  const response = await fetch(`${externalPayBaseUrl()}/api/miniapp/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const data = await response.json().catch(() => ({}));
  return Boolean(response.ok && data?.ok && data?.entitlement?.active === true);
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    json(req, res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const initData = String(body.initData || '');
    const session = validateInitData(initData);

    const [starsResult, externalResult] = await Promise.allSettled([
      findProEntitlement(session.user.id),
      hasExternalPro(initData),
    ]);

    const starsActive = starsResult.status === 'fulfilled' && starsResult.value?.active === true;
    const externalActive = externalResult.status === 'fulfilled' && externalResult.value === true;

    if (!starsActive && !externalActive) {
      json(req, res, 403, { ok: false, error: 'ALX PRO required' });
      return;
    }

    json(req, res, 200, {
      ok: true,
      collection: 'originals',
      author: 'Alexander',
      mixes: ORIGINALS,
    });
  } catch (error) {
    console.error('[ALX Originals]', error);
    const authError = /initData|Telegram user|signature|expired/i.test(error?.message || '');
    json(req, res, authError ? 401 : 500, {
      ok: false,
      error: authError ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось открыть ALX Originals.',
    });
  }
};
