const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_AUTH = 'https://oauth.telegram.org/auth';
const TELEGRAM_TOKEN = 'https://oauth.telegram.org/token';
const TELEGRAM_JWKS = 'https://oauth.telegram.org/.well-known/jwks.json';
const YOOKASSA_API = 'https://api.yookassa.ru/v3';
const PRO_DAYS = 30;

let jwksCache = null;
let jwksFetchedAt = 0;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function b64urlDecode(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
  return [...sig].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signObject(secret, object) {
  const payload = b64urlEncode(enc.encode(JSON.stringify(object)));
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

async function verifySignedObject(secret, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = await hmacHex(secret, payload);
  if (expected !== sig) return null;
  try {
    const object = JSON.parse(dec.decode(b64urlDecode(payload)));
    if (!object || object.exp < Math.floor(Date.now() / 1000)) return null;
    return object;
  } catch (error) {
    return null;
  }
}

function cookie(name, value, maxAge = 3600) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALX_ALLOWED_ORIGIN || '').trim();
  if (configured && origin === configured) return origin;
  const payOrigin = new URL(request.url).origin;
  if (origin === payOrigin) return origin;
  return configured || payOrigin;
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  };
}

async function getSession(request, env) {
  const token = getCookie(request, 'alx_pay_session');
  return verifySignedObject(env.SESSION_SECRET, token);
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session?.user?.id) throw new Error('AUTH_REQUIRED');
  return session;
}

function payOrigin(request, env) {
  const configured = String(env.ALX_PAY_ORIGIN || '').trim().replace(/\/$/, '');
  return configured || new URL(request.url).origin;
}

function callbackUrl(request, env) {
  return `${payOrigin(request, env)}/auth/telegram/callback`;
}

async function fetchJwks() {
  if (jwksCache && Date.now() - jwksFetchedAt < 60 * 60 * 1000) return jwksCache;
  const response = await fetch(TELEGRAM_JWKS);
  if (!response.ok) throw new Error('TELEGRAM_JWKS_FAILED');
  jwksCache = await response.json();
  jwksFetchedAt = Date.now();
  return jwksCache;
}

async function verifyTelegramIdToken(idToken, env) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('INVALID_ID_TOKEN');
  const header = JSON.parse(dec.decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
  const jwks = await fetchJwks();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('TELEGRAM_KEY_NOT_FOUND');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('INVALID_ID_TOKEN_SIGNATURE');

  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  if (payload.iss !== TELEGRAM_ISSUER || !aud.includes(String(env.TELEGRAM_CLIENT_ID)) || Number(payload.exp || 0) <= now) {
    throw new Error('INVALID_ID_TOKEN_CLAIMS');
  }
  const id = Number(payload.id || payload.sub);
  if (!Number.isFinite(id)) throw new Error('TELEGRAM_USER_MISSING');
  return {
    id,
    name: payload.name || payload.given_name || 'Telegram user',
    username: payload.preferred_username || null,
  };
}

async function startTelegramAuth(request, env) {
  if (!env.TELEGRAM_CLIENT_ID || !env.TELEGRAM_CLIENT_SECRET || !env.SESSION_SECRET) {
    return new Response('Telegram Login is not configured', { status: 503 });
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = b64urlEncode(await sha256(verifier));
  const authState = await signObject(env.SESSION_SECRET, {
    state,
    verifier,
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  const url = new URL(TELEGRAM_AUTH);
  url.searchParams.set('client_id', String(env.TELEGRAM_CLIENT_ID));
  url.searchParams.set('redirect_uri', callbackUrl(request, env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': cookie('alx_auth_state', authState, 600),
      'Cache-Control': 'no-store',
    },
  });
}

async function telegramCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await verifySignedObject(env.SESSION_SECRET, getCookie(request, 'alx_auth_state'));
  if (!code || !state || !saved || saved.state !== state) return new Response('Invalid Telegram login state', { status: 400 });

  const credentials = btoa(`${env.TELEGRAM_CLIENT_ID}:${env.TELEGRAM_CLIENT_SECRET}`);
  const tokenResponse = await fetch(TELEGRAM_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(request, env),
      client_id: String(env.TELEGRAM_CLIENT_ID),
      code_verifier: saved.verifier,
    }),
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.id_token) return new Response('Telegram token exchange failed', { status: 502 });
  const user = await verifyTelegramIdToken(tokenData.id_token, env);
  const session = await signObject(env.SESSION_SECRET, {
    user,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${payOrigin(request, env)}/`,
      'Set-Cookie': [cookie('alx_pay_session', session, 30 * 24 * 60 * 60), clearCookie('alx_auth_state')].join(', '),
      'Cache-Control': 'no-store',
    },
  });
}

function rubOffer(env) {
  const raw = Number(env.ALX_EXTERNAL_PRICE_RUB || 0);
  const priceRub = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  const yk = Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
  return { priceRub, periodDays: PRO_DAYS, enabled: Boolean(priceRub && yk) };
}

function amountString(env) {
  const price = rubOffer(env).priceRub;
  if (!price) throw new Error('PRICE_NOT_CONFIGURED');
  return `${price.toFixed(2)}`;
}

async function yookassa(env, path, options = {}) {
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) throw new Error('YOOKASSA_NOT_CONFIGURED');
  const auth = btoa(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`);
  const response = await fetch(`${YOOKASSA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.description || data.code || `YOOKASSA_${response.status}`);
    error.details = data;
    throw error;
  }
  return data;
}

async function createPayment(request, env) {
  const session = await requireSession(request, env);
  const body = await request.json().catch(() => ({}));
  const method = body.method === 'bank_card' ? 'bank_card' : body.method === 'sbp' ? 'sbp' : null;
  if (!method) return json({ ok: false, error: 'Выбери карту или СБП.' }, 400, corsHeaders(request, env));
  const offer = rubOffer(env);
  if (!offer.enabled) return json({ ok: false, error: 'Внешняя оплата ещё не настроена.' }, 503, corsHeaders(request, env));

  const idempotenceKey = crypto.randomUUID();
  const metadata = {
    telegram_user_id: String(session.user.id),
    plan: 'alx-pro-30d',
    source: 'yookassa',
  };
  const payment = await yookassa(env, '/payments', {
    method: 'POST',
    headers: { 'Idempotence-Key': idempotenceKey },
    body: JSON.stringify({
      amount: { value: amountString(env), currency: 'RUB' },
      capture: true,
      payment_method_data: { type: method },
      confirmation: {
        type: 'redirect',
        return_url: `${payOrigin(request, env)}/?payment=return`,
      },
      description: 'ALX PRO — 30 дней',
      metadata,
    }),
  });

  await env.DB.prepare(`
    INSERT INTO payments (id, telegram_user_id, provider, method, amount_rub, status, created_at, updated_at)
    VALUES (?, ?, 'yookassa', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at
  `).bind(
    payment.id,
    String(session.user.id),
    method,
    offer.priceRub,
    payment.status || 'pending',
    Date.now(),
    Date.now(),
  ).run();

  return json({ ok: true, paymentId: payment.id, confirmationUrl: payment.confirmation?.confirmation_url }, 200, corsHeaders(request, env));
}

async function upsertEntitlement(env, telegramUserId, paymentId, paidAt = Date.now()) {
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT expires_at FROM entitlements WHERE telegram_user_id = ?').bind(String(telegramUserId)).first();
  const base = Math.max(now, Number(existing?.expires_at || 0));
  const expiresAt = base + PRO_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(`
    INSERT INTO entitlements (telegram_user_id, plan, source, status, starts_at, expires_at, provider_payment_id, updated_at)
    VALUES (?, 'pro', 'yookassa', 'active', ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      plan='pro', source='yookassa', status='active', expires_at=excluded.expires_at,
      provider_payment_id=excluded.provider_payment_id, updated_at=excluded.updated_at
  `).bind(String(telegramUserId), paidAt, expiresAt, paymentId, now).run();
  return expiresAt;
}

async function processYookassaWebhook(request, env) {
  const body = await request.json().catch(() => ({}));
  if (body.event !== 'payment.succeeded' || !body.object?.id) return json({ ok: true });

  // Do not trust webhook body alone. Re-read the payment from YooKassa using
  // server credentials and verify status, amount and our metadata.
  const payment = await yookassa(env, `/payments/${encodeURIComponent(body.object.id)}`, { method: 'GET' });
  const expected = amountString(env);
  const userId = Number(payment.metadata?.telegram_user_id);
  if (payment.status !== 'succeeded' || !payment.paid || payment.amount?.currency !== 'RUB' || payment.amount?.value !== expected || !Number.isFinite(userId)) {
    return json({ ok: false, error: 'Payment verification failed' }, 400);
  }

  await env.DB.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?')
    .bind('succeeded', Date.now(), payment.id).run();
  await upsertEntitlement(env, userId, payment.id, Date.now());
  return json({ ok: true });
}

async function entitlementFor(env, userId) {
  const row = await env.DB.prepare('SELECT * FROM entitlements WHERE telegram_user_id = ?').bind(String(userId)).first();
  const now = Date.now();
  const active = Boolean(row && row.status === 'active' && Number(row.expires_at || 0) > now);
  return {
    plan: active ? 'pro' : 'free',
    status: active ? 'active' : 'inactive',
    active,
    expiresAt: active ? Number(row.expires_at) : null,
    source: active ? row.source : 'yookassa',
  };
}

async function validateMiniAppInitData(initData, env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('BOT_TOKEN_NOT_CONFIGURED');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKeyMaterial = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secretKey = new Uint8Array(await crypto.subtle.sign('HMAC', secretKeyMaterial, enc.encode(env.TELEGRAM_BOT_TOKEN)));
  const hmacKey = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const calculatedBytes = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString)));
  const calculated = [...calculatedBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (calculated !== receivedHash) throw new Error('INVALID_INIT_DATA');

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || now - authDate > 24 * 60 * 60 || authDate - now > 60) throw new Error('EXPIRED_INIT_DATA');
  const user = JSON.parse(params.get('user') || 'null');
  if (!user?.id) throw new Error('USER_MISSING');
  return user;
}

async function handleApi(request, env, pathname) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (pathname === '/api/config' && request.method === 'GET') {
    return json({ ok: true, offer: rubOffer(env) }, 200, cors);
  }
  if (pathname === '/api/session' && request.method === 'GET') {
    const session = await getSession(request, env);
    return json({ ok: true, session: session ? { user: session.user } : null }, 200, cors);
  }
  if (pathname === '/api/payment/create' && request.method === 'POST') {
    return createPayment(request, env);
  }
  if (pathname === '/api/payment/status' && request.method === 'GET') {
    try {
      const session = await requireSession(request, env);
      return json({ ok: true, entitlement: await entitlementFor(env, session.user.id) }, 200, cors);
    } catch (error) {
      return json({ ok: false, error: 'Сначала войди через Telegram.' }, 401, cors);
    }
  }
  if (pathname === '/api/miniapp/status' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const user = await validateMiniAppInitData(body.initData, env);
      return json({ ok: true, entitlement: await entitlementFor(env, user.id) }, 200, cors);
    } catch (error) {
      return json({ ok: false, error: 'Не удалось подтвердить Telegram-сессию.' }, 401, cors);
    }
  }
  if (pathname === '/api/yookassa/webhook' && request.method === 'POST') {
    return processYookassaWebhook(request, env);
  }
  return json({ ok: false, error: 'Not found' }, 404, cors);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/auth/telegram/start') return startTelegramAuth(request, env);
      if (url.pathname === '/auth/telegram/callback') return telegramCallback(request, env);
      if (url.pathname.startsWith('/api/')) return handleApi(request, env, url.pathname);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('ALX Pay assets are not configured', { status: 503 });
    } catch (error) {
      console.error('[ALX Pay Worker]', error);
      if (request.url.includes('/api/')) return json({ ok: false, error: 'Временная ошибка платёжного сервера.' }, 500, corsHeaders(request, env));
      return new Response('ALX Pay temporary error', { status: 500 });
    }
  },
};
