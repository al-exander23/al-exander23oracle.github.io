// POST /api/stars-status
// Restores ALX PRO from Telegram Stars and external ALX Pay entitlements.

const { handleOptions, json, readJson } = require('../server/http.js');
const {
  getPriceStars,
  validateInitData,
  findProEntitlement,
} = require('../server/telegram.js');

const DEFAULT_EXTERNAL_PAY_API = 'https://alx-pay.sashaswag23.workers.dev';

function inactiveEntitlement(source = null) {
  return {
    plan: 'free',
    status: 'inactive',
    active: false,
    expiresAt: null,
    source,
  };
}

function normalizeEntitlement(raw, fallbackSource = null) {
  if (!raw || typeof raw !== 'object') return inactiveEntitlement(fallbackSource);

  const active = raw.active === true && raw.plan === 'pro' && raw.status === 'active';
  const expiresAt = Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : null;
  const notExpired = !expiresAt || expiresAt > Date.now();

  if (!active || !notExpired) return inactiveEntitlement(raw.source || fallbackSource);

  return {
    plan: 'pro',
    status: 'active',
    active: true,
    expiresAt,
    source: typeof raw.source === 'string' && raw.source ? raw.source : fallbackSource,
  };
}

function chooseEntitlement(...entitlements) {
  const active = entitlements
    .map((item) => normalizeEntitlement(item))
    .filter((item) => item.active)
    .sort((a, b) => {
      const left = a.expiresAt == null ? Number.POSITIVE_INFINITY : a.expiresAt;
      const right = b.expiresAt == null ? Number.POSITIVE_INFINITY : b.expiresAt;
      return right - left;
    });

  return active[0] || inactiveEntitlement(null);
}

function externalPayBaseUrl() {
  const configured = String(process.env.ALX_EXTERNAL_PAY_API_URL || DEFAULT_EXTERNAL_PAY_API)
    .trim()
    .replace(/\/$/, '');
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_EXTERNAL_PAY_API;
}

async function findExternalEntitlement(initData) {
  const response = await fetch(`${externalPayBaseUrl()}/api/miniapp/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `ALX Pay status failed (${response.status})`);
  }

  return normalizeEntitlement(data.entitlement, 'yookassa');
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    json(req, res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const session = validateInitData(body.initData);

    const [starsResult, externalResult] = await Promise.allSettled([
      findProEntitlement(session.user.id),
      findExternalEntitlement(body.initData),
    ]);

    if (starsResult.status === 'rejected') {
      console.error('[ALX PRO Stars status]', starsResult.reason);
    }
    if (externalResult.status === 'rejected') {
      console.error('[ALX PRO external status]', externalResult.reason);
    }

    if (starsResult.status === 'rejected' && externalResult.status === 'rejected') {
      throw new Error('All PRO entitlement sources are unavailable');
    }

    const starsEntitlement = starsResult.status === 'fulfilled'
      ? normalizeEntitlement(starsResult.value, 'telegram-stars')
      : inactiveEntitlement('telegram-stars');
    const externalEntitlement = externalResult.status === 'fulfilled'
      ? normalizeEntitlement(externalResult.value, 'yookassa')
      : inactiveEntitlement('yookassa');
    const entitlement = chooseEntitlement(starsEntitlement, externalEntitlement);

    json(req, res, 200, {
      ok: true,
      entitlement,
      offer: {
        priceStars: getPriceStars(),
        periodDays: 30,
        recurring: true,
      },
    });
  } catch (error) {
    console.error('[ALX PRO status]', error);
    const authError = /initData|Telegram user|signature|expired/i.test(error?.message || '');
    json(req, res, authError ? 401 : 500, {
      ok: false,
      error: authError ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось проверить подписку ALX PRO.',
    });
  }
};
