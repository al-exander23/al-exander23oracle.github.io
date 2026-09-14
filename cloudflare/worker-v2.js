import base from './worker.js';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_JWKS = 'https://oauth.telegram.org/.well-known/jwks.json';
const WORKER_VERSION = 'oauth-cookie-v2';
const enc = new TextEncoder();
const dec = new TextDecoder();
let jwksCache = null;
let jwksFetchedAt = 0;

function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function b64urlDecode(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
  return [...sig].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signSession(secret, user) {
  const payload = b64urlEncode(enc.encode(JSON.stringify({
    user,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  })));
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

async function fetchJwks() {
  if (jwksCache && Date.now() - jwksFetchedAt < 60 * 60 * 1000) return jwksCache;
  const response = await fetch(TELEGRAM_JWKS, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('TELEGRAM_JWKS_FAILED');
  jwksCache = await response.json();
  jwksFetchedAt = Date.now();
  return jwksCache;
}

async function verifyTelegramIdToken(idToken, env) {
  if (!env.TELEGRAM_CLIENT_ID) throw new Error('TELEGRAM_CLIENT_ID_MISSING');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('INVALID_ID_TOKEN');
  const header = JSON.parse(dec.decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
  if (header.alg !== 'RS256') throw new Error('UNSUPPORTED_ID_TOKEN_ALG');
  const jwks = await fetchJwks();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('TELEGRAM_KEY_NOT_FOUND');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signatureOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!signatureOk) throw new Error('INVALID_ID_TOKEN_SIGNATURE');
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  if (payload.iss !== TELEGRAM_ISSUER || !aud.includes(String(env.TELEGRAM_CLIENT_ID)) || Number(payload.exp || 0) <= now || Number(payload.iat || 0) > now + 60) {
    throw new Error('INVALID_ID_TOKEN_CLAIMS');
  }
  const id = Number(payload.id || payload.sub);
  if (!Number.isFinite(id)) throw new Error('TELEGRAM_USER_MISSING');
  return { id, name: payload.name || payload.given_name || 'Telegram user', username: payload.preferred_username || null };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

async function sdkLogin(request, env) {
  if (!env.SESSION_SECRET || !env.TELEGRAM_CLIENT_ID) return json({ ok: false, error: 'Telegram Login is not configured' }, 503);
  const body = await request.json().catch(() => ({}));
  if (!body.id_token) return json({ ok: false, error: 'Telegram did not return an ID token.' }, 400);
  try {
    const user = await verifyTelegramIdToken(body.id_token, env);
    const session = await signSession(env.SESSION_SECRET, user);
    return json({ ok: true, user }, 200, { 'Set-Cookie': `alx_pay_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}` });
  } catch (error) {
    console.error('[ALX Pay Telegram SDK login]', error);
    return json({ ok: false, error: 'Не удалось подтвердить вход через Telegram.' }, 401);
  }
}

async function paymentSmoke(env) {
  const now = Date.now();
  const payment = await env.DB.prepare('SELECT status, amount_rub, updated_at FROM payments ORDER BY updated_at DESC LIMIT 1').first();
  const entitlement = await env.DB.prepare('SELECT status, source, expires_at, updated_at FROM entitlements ORDER BY updated_at DESC LIMIT 1').first();
  return json({
    ok: true,
    latestPayment: payment ? {
      succeeded: payment.status === 'succeeded',
      amountRub: Number(payment.amount_rub),
      ageSeconds: Math.max(0, Math.round((now - Number(payment.updated_at || 0)) / 1000)),
    } : null,
    latestEntitlement: entitlement ? {
      active: entitlement.status === 'active' && Number(entitlement.expires_at || 0) > now,
      source: entitlement.source || null,
      expiresAt: Number(entitlement.expires_at || 0) || null,
      ageSeconds: Math.max(0, Math.round((now - Number(entitlement.updated_at || 0)) / 1000)),
    } : null,
  });
}

function splitOAuthCookies(response) {
  const combined = response.headers.get('Set-Cookie') || '';
  const marker = ', alx_auth_state=';
  const markerIndex = combined.indexOf(marker);
  if (!combined.includes('alx_pay_session=') || markerIndex < 0) return response;

  const sessionCookie = combined.slice(0, markerIndex);
  const authStateCookie = combined.slice(markerIndex + 2);
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.append('Set-Cookie', sessionCookie);
  headers.append('Set-Cookie', authStateCookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('X-ALX-Worker-Version', WORKER_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/telegram-sdk' && request.method === 'POST') {
      return withVersion(await sdkLogin(request, env));
    }
    if (url.pathname === '/api/_payment-smoke' && request.method === 'GET') {
      return withVersion(await paymentSmoke(env));
    }

    let response = await base.fetch(request, env, ctx);
    if (url.pathname === '/auth/telegram/callback') response = splitOAuthCookies(response);
    return withVersion(response);
  },
};
