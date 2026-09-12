// Telegram Bot API + Mini App validation helpers for ALX PRO Stars.
// Bot token is server-only and must exist as TELEGRAM_BOT_TOKEN in Vercel.

const crypto = require('crypto');

const SUBSCRIPTION_PERIOD = 30 * 24 * 60 * 60; // Telegram currently requires exactly 30 days.
const DEFAULT_PRICE_STARS = 149;

function getBotToken() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
}

function getPriceStars() {
  const raw = Number(process.env.ALX_PRO_PRICE_STARS || DEFAULT_PRICE_STARS);
  if (!Number.isFinite(raw)) return DEFAULT_PRICE_STARS;
  return Math.max(1, Math.min(10000, Math.floor(raw)));
}

function getWebhookSecret() {
  const configured = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (configured) return configured;
  return crypto.createHash('sha256')
    .update(`alx-oracle-webhook|${getBotToken()}`)
    .digest('hex')
    .slice(0, 48);
}

async function telegramApi(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const description = data?.description || `Telegram API ${method} failed (${response.status})`;
    const error = new Error(description);
    error.telegram = data;
    throw error;
  }
  return data.result;
}

function timingSafeHexEqual(a, b) {
  if (!/^[a-f0-9]+$/i.test(a || '') || !/^[a-f0-9]+$/i.test(b || '')) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateInitData(initData, maxAgeSeconds = 24 * 60 * 60) {
  if (typeof initData !== 'string' || !initData.trim()) {
    throw new Error('Telegram initData is missing');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') || '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(getBotToken())
    .digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!timingSafeHexEqual(calculatedHash, receivedHash)) {
    throw new Error('Telegram initData signature is invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > maxAgeSeconds || authDate - now > 60) {
    throw new Error('Telegram initData is expired');
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (error) {
    throw new Error('Telegram user data is invalid');
  }

  if (!user || !Number.isFinite(Number(user.id))) {
    throw new Error('Telegram user is missing');
  }

  return {
    user: { ...user, id: Number(user.id) },
    authDate,
    queryId: params.get('query_id') || null,
  };
}

function payloadSignature(base) {
  return crypto.createHmac('sha256', getBotToken())
    .update(`alx-pro|${base}`)
    .digest('base64url')
    .slice(0, 24);
}

function createProPayload(userId, amount = getPriceStars()) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(6).toString('hex');
  const base = `ap1.${Number(userId)}.${issuedAt}.${nonce}.${Number(amount)}`;
  return `${base}.${payloadSignature(base)}`;
}

function parseProPayload(payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 6 || parts[0] !== 'ap1') return null;

  const [, userRaw, issuedRaw, nonce, amountRaw, signature] = parts;
  const userId = Number(userRaw);
  const issuedAt = Number(issuedRaw);
  const amount = Number(amountRaw);
  if (!Number.isFinite(userId) || !Number.isFinite(issuedAt) || !Number.isFinite(amount)) return null;
  if (!/^[a-f0-9]{12}$/i.test(nonce)) return null;

  const base = `ap1.${userId}.${issuedAt}.${nonce}.${amount}`;
  const expected = payloadSignature(base);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  return { userId, issuedAt, nonce, amount };
}

function publicBaseUrl(req) {
  const configured = String(process.env.ALX_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (/^https:\/\//i.test(configured)) return configured;

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  if (!host) throw new Error('Cannot determine public Vercel URL');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

let webhookPromise = null;
function ensureWebhook(req) {
  if (webhookPromise) return webhookPromise;
  webhookPromise = telegramApi('setWebhook', {
    url: `${publicBaseUrl(req)}/api/telegram-webhook`,
    secret_token: getWebhookSecret(),
    allowed_updates: ['pre_checkout_query', 'message'],
    drop_pending_updates: false,
  }).catch((error) => {
    webhookPromise = null;
    throw error;
  });
  return webhookPromise;
}

function verifyWebhookRequest(req) {
  const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  const expected = getWebhookSecret();
  if (!received || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function findProEntitlement(userId) {
  const nowSec = Math.floor(Date.now() / 1000);
  const minDate = nowSec - (SUBSCRIPTION_PERIOD + 2 * 24 * 60 * 60);
  const candidates = [];
  const refundedIds = new Set();

  // No separate database is required: Telegram's Star transaction ledger is
  // the payment source of truth. We only need recent subscription periods.
  for (let page = 0; page < 12; page += 1) {
    const offset = page * 100;
    const result = await telegramApi('getStarTransactions', { offset, limit: 100 });
    const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
    if (!transactions.length) break;

    let pageHasRecent = false;
    for (const tx of transactions) {
      const date = Number(tx?.date || 0);
      if (date >= minDate) pageHasRecent = true;

      const receiver = tx?.receiver;
      if (receiver?.type === 'user' && Number(receiver?.user?.id) === Number(userId)) {
        refundedIds.add(String(tx.id || ''));
      }

      const source = tx?.source;
      if (source?.type !== 'user' || Number(source?.user?.id) !== Number(userId)) continue;
      if (source?.transaction_type !== 'invoice_payment') continue;
      if (Number(source?.subscription_period || 0) !== SUBSCRIPTION_PERIOD) continue;

      const parsed = parseProPayload(source?.invoice_payload);
      if (!parsed || parsed.userId !== Number(userId)) continue;
      if (Number(tx?.amount) !== parsed.amount) continue;

      const expiresAtSec = date + SUBSCRIPTION_PERIOD;
      candidates.push({
        id: String(tx.id || ''),
        date,
        expiresAtSec,
        amount: parsed.amount,
      });
    }

    if (transactions.length < 100 || !pageHasRecent) break;
  }

  const valid = candidates
    .filter((item) => item.expiresAtSec > nowSec && !refundedIds.has(item.id))
    .sort((a, b) => b.expiresAtSec - a.expiresAtSec)[0];

  if (!valid) {
    return {
      plan: 'free',
      status: 'inactive',
      active: false,
      expiresAt: null,
      source: 'telegram-stars',
    };
  }

  return {
    plan: 'pro',
    status: 'active',
    active: true,
    expiresAt: valid.expiresAtSec * 1000,
    source: 'telegram-stars',
  };
}

module.exports = {
  SUBSCRIPTION_PERIOD,
  getPriceStars,
  getWebhookSecret,
  telegramApi,
  validateInitData,
  createProPayload,
  parseProPayload,
  ensureWebhook,
  verifyWebhookRequest,
  findProEntitlement,
};
