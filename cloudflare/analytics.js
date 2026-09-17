// Privacy-minimized analytics storage + owner dashboard for ALX Oracle.
// Data lives in the existing Cloudflare D1 database used by ALX Pay.

const VERSION = '1.19.0-analytics';
const OWNER_TEST_AMOUNT_RUB = 29;
const MAX_RETENTION_DAYS = 180;
const enc = new TextEncoder();
const dec = new TextDecoder();
let schemaPromise = null;

const ALLOWED_EVENTS = new Set([
  'app_open',
  'onboarding_started',
  'onboarding_step',
  'onboarding_completed',
  'onboarding_skipped',
  'onboarding_manual_open',
  'oracle_result',
  'free_usage',
  'free_limit_reached',
  'pro_paywall_open',
  'stars_checkout_start',
  'external_checkout_open',
  'payment_help_open',
  'pro_restore_attempt',
  'pro_restore_success',
  'pro_activated',
  'checkout_activation',
]);

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

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

async function sessionFromRequest(request, env) {
  if (!env.SESSION_SECRET) return null;
  const token = getCookie(request, 'alx_pay_session');
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = await hmacHex(env.SESSION_SECRET, payload);
  if (expected.length !== sig.length || expected !== sig) return null;
  try {
    const object = JSON.parse(dec.decode(b64urlDecode(payload)));
    if (!object?.user?.id || Number(object.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return object;
  } catch (error) {
    return null;
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALX_ALLOWED_ORIGIN || '').trim();
  const own = new URL(request.url).origin;
  if (origin && origin === configured) return origin;
  if (origin && origin === own) return origin;
  return '';
}

function cors(request, env) {
  const origin = allowedOrigin(request, env);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1_NOT_CONFIGURED');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          install_id TEXT NOT NULL,
          session_id TEXT,
          event_name TEXT NOT NULL,
          context TEXT NOT NULL,
          app_version TEXT,
          props_json TEXT,
          created_at INTEGER NOT NULL
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(event_name, created_at)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_install_time ON analytics_events(install_id, created_at)').run();
      return true;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function validId(value, max = 80) {
  const text = String(value || '').trim();
  return text.length >= 8 && text.length <= max && /^[A-Za-z0-9_-]+$/.test(text) ? text : null;
}

function cleanProps(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  Object.entries(input).slice(0, 16).forEach(([key, value]) => {
    const safeKey = String(key).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
    if (!safeKey) return;
    if (typeof value === 'boolean') output[safeKey] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) output[safeKey] = value;
    else if (typeof value === 'string') output[safeKey] = value.slice(0, 120);
  });
  return output;
}

async function recordEvent(request, env, ctx) {
  const headers = cors(request, env);
  if (!allowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, headers);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'Invalid payload' }, 400, headers);

  const installId = validId(body.installId);
  const sessionId = validId(body.sessionId);
  const eventName = String(body.event || '').trim();
  const context = body.context === 'telegram' ? 'telegram' : body.context === 'browser' ? 'browser' : 'unknown';
  const appVersion = String(body.appVersion || '').slice(0, 48);
  const props = cleanProps(body.props);

  if (!installId || !sessionId || !ALLOWED_EVENTS.has(eventName)) {
    return json({ ok: false, error: 'Unsupported analytics event' }, 400, headers);
  }

  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO analytics_events (install_id, session_id, event_name, context, app_version, props_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    installId,
    sessionId,
    eventName,
    context,
    appVersion,
    JSON.stringify(props),
    Date.now(),
  ).run();

  if (ctx && Math.random() < 0.02) {
    const cutoff = Date.now() - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    ctx.waitUntil(env.DB.prepare('DELETE FROM analytics_events WHERE created_at < ?').bind(cutoff).run().catch(() => {}));
  }

  return json({ ok: true }, 200, headers);
}

async function isOwnerSession(session, env) {
  const userId = String(session?.user?.id || '');
  if (!userId) return false;

  const configured = String(env.ALX_ANALYTICS_ADMIN_USER_ID || '').trim();
  if (configured) return userId === configured;

  // Safe bootstrap for this deployment: the owner performed the unique 29 RUB
  // live-verification payment before production returned to 299 RUB.
  const row = await env.DB.prepare(`
    SELECT telegram_user_id
    FROM payments
    WHERE status = 'succeeded' AND amount_rub = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(OWNER_TEST_AMOUNT_RUB).first();
  return Boolean(row?.telegram_user_id && String(row.telegram_user_id) === userId);
}

function clampDays(value) {
  const days = Number(value || 30);
  if (!Number.isFinite(days)) return 30;
  return Math.max(1, Math.min(180, Math.floor(days)));
}

async function summaryData(env, days = 30) {
  await ensureSchema(env);
  const periodDays = clampDays(days);
  const since = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  const events = await env.DB.prepare(`
    SELECT event_name, COUNT(*) AS events, COUNT(DISTINCT install_id) AS users
    FROM analytics_events
    WHERE created_at >= ?
    GROUP BY event_name
    ORDER BY users DESC, events DESC
  `).bind(since).all();

  const daily = await env.DB.prepare(`
    SELECT
      date(created_at / 1000, 'unixepoch') AS day,
      COUNT(DISTINCT CASE WHEN event_name = 'app_open' THEN install_id END) AS opens,
      SUM(CASE WHEN event_name = 'oracle_result' THEN 1 ELSE 0 END) AS mixes,
      COUNT(DISTINCT CASE WHEN event_name = 'pro_paywall_open' THEN install_id END) AS paywalls,
      COUNT(DISTINCT CASE WHEN event_name = 'pro_activated' THEN install_id END) AS activations
    FROM analytics_events
    WHERE created_at >= ?
    GROUP BY day
    ORDER BY day DESC
    LIMIT 31
  `).bind(since).all();

  const map = Object.fromEntries((events.results || []).map((row) => [row.event_name, {
    events: Number(row.events || 0),
    users: Number(row.users || 0),
  }]));

  const usersFor = (...names) => {
    const values = names.map((name) => map[name]?.users || 0);
    return names.length === 1 ? values[0] : null;
  };

  const checkoutUsersRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT install_id) AS users
    FROM analytics_events
    WHERE created_at >= ? AND event_name IN ('stars_checkout_start', 'external_checkout_open')
  `).bind(since).first();

  const funnel = {
    opened: usersFor('app_open'),
    onboardingCompleted: usersFor('onboarding_completed'),
    usedOracle: usersFor('oracle_result'),
    hitFreeLimit: usersFor('free_limit_reached'),
    openedPro: usersFor('pro_paywall_open'),
    checkoutStarted: Number(checkoutUsersRow?.users || 0),
    proActivated: usersFor('pro_activated'),
  };

  return {
    ok: true,
    version: VERSION,
    generatedAt: Date.now(),
    periodDays,
    funnel,
    totalOracleResults: map.oracle_result?.events || 0,
    events: map,
    daily: daily.results || [],
  };
}

async function requireOwner(request, env) {
  const session = await sessionFromRequest(request, env);
  if (!session) return { ok: false, status: 401, session: null };
  if (!(await isOwnerSession(session, env))) return { ok: false, status: 403, session };
  return { ok: true, status: 200, session };
}

function pct(value, base) {
  if (!base) return '0%';
  return `${Math.round((Number(value || 0) / Number(base)) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dashboardShell(body, title = 'ALX Analytics') {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#09070e;color:#eee7da;font:14px/1.45 Inter,system-ui,sans-serif}.wrap{max-width:980px;margin:auto;padding:28px 18px 60px}.head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:24px}.brand{font-size:11px;letter-spacing:.18em;color:#b99a62}.title{font:600 30px/1.1 Georgia,serif;margin:6px 0}.muted{color:#938a9b;font-size:12px}.periods{display:flex;gap:7px;flex-wrap:wrap}.periods a,.btn{color:#e8d2a4;text-decoration:none;border:1px solid #5d4c36;border-radius:999px;padding:7px 11px;background:#15101b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #2e2634;background:linear-gradient(145deg,#15111c,#0e0b13);border-radius:16px;padding:15px}.kpi{font-size:28px;font-weight:700;color:#f7e8c8}.label{font-size:11px;color:#9b91a3;margin-top:3px}.funnel{margin-top:18px;display:grid;gap:8px}.row{display:grid;grid-template-columns:190px 1fr 60px;align-items:center;gap:10px}.bar{height:9px;background:#221c27;border-radius:99px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#8d7148,#ddbd7a);border-radius:99px}.section{margin-top:28px}.section h2{font:600 20px Georgia,serif;margin:0 0 12px}table{width:100%;border-collapse:collapse;border:1px solid #2e2634;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:10px;border-bottom:1px solid #241e29;font-size:12px}th{color:#a99eb0;background:#121018}tr:last-child td{border-bottom:0}.notice{border:1px solid #493b2b;background:#15110d;border-radius:16px;padding:16px;margin-top:16px}@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr)}.row{grid-template-columns:130px 1fr 48px}.head{align-items:flex-start;flex-direction:column}}@media(max-width:420px){.grid{grid-template-columns:1fr 1fr}.kpi{font-size:22px}}
  </style></head><body><div class="wrap">${body}</div></body></html>`;
}

function loginPage() {
  return dashboardShell(`
    <div class="brand">ALX ORACLE · OWNER</div>
    <h1 class="title">Продуктовая аналитика</h1>
    <p class="muted">Сводка закрыта. Войди через Telegram-аккаунт владельца ALX Oracle.</p>
    <p style="margin-top:22px"><a class="btn" href="/analytics/login">Войти через Telegram</a></p>
  `);
}

function forbiddenPage() {
  return dashboardShell(`
    <div class="brand">ALX ORACLE · OWNER</div>
    <h1 class="title">Доступ закрыт</h1>
    <p class="muted">Эта Telegram-сессия не является владельцем аналитики ALX Oracle.</p>
  `, 'ALX Analytics · Access denied');
}

function dashboardPage(summary) {
  const f = summary.funnel;
  const max = Math.max(1, f.opened);
  const stages = [
    ['Открыли приложение', f.opened],
    ['Прошли onboarding', f.onboardingCompleted],
    ['Получили хотя бы 1 микс', f.usedOracle],
    ['Дошли до FREE-лимита', f.hitFreeLimit],
    ['Открыли ALX PRO', f.openedPro],
    ['Начали оплату', f.checkoutStarted],
    ['Активировали PRO', f.proActivated],
  ];

  const stageHtml = stages.map(([label, value]) => `
    <div class="row"><span>${escapeHtml(label)}</span><div class="bar"><div class="fill" style="width:${Math.max(2, Math.min(100, Math.round(value / max * 100)))}%"></div></div><b>${value}</b></div>
  `).join('');

  const dailyRows = (summary.daily || []).map((row) => `
    <tr><td>${escapeHtml(row.day)}</td><td>${Number(row.opens || 0)}</td><td>${Number(row.mixes || 0)}</td><td>${Number(row.paywalls || 0)}</td><td>${Number(row.activations || 0)}</td></tr>
  `).join('') || '<tr><td colspan="5">Пока нет данных</td></tr>';

  const eventRows = Object.entries(summary.events || {})
    .sort((a, b) => b[1].events - a[1].events)
    .map(([name, row]) => `<tr><td>${escapeHtml(name)}</td><td>${row.users}</td><td>${row.events}</td></tr>`)
    .join('') || '<tr><td colspan="3">Пока нет данных</td></tr>';

  return dashboardShell(`
    <div class="head"><div><div class="brand">ALX ORACLE · OWNER</div><h1 class="title">Продуктовая аналитика</h1><div class="muted">Последние ${summary.periodDays} дней · обновлено ${new Date(summary.generatedAt).toLocaleString('ru-RU')}</div></div><div class="periods"><a href="?days=7">7 дней</a><a href="?days=30">30 дней</a><a href="?days=90">90 дней</a></div></div>
    <div class="grid">
      <div class="card"><div class="kpi">${f.opened}</div><div class="label">установок открыли приложение</div></div>
      <div class="card"><div class="kpi">${summary.totalOracleResults}</div><div class="label">подборов микса</div></div>
      <div class="card"><div class="kpi">${f.openedPro}</div><div class="label">открыли PRO</div></div>
      <div class="card"><div class="kpi">${f.proActivated}</div><div class="label">активировали PRO · ${pct(f.proActivated, f.openedPro)} от открывших PRO</div></div>
    </div>
    <div class="section"><h2>Воронка</h2><div class="card funnel">${stageHtml}</div></div>
    <div class="section"><h2>По дням</h2><table><thead><tr><th>Дата</th><th>Открыли</th><th>Миксы</th><th>PRO экран</th><th>PRO активации</th></tr></thead><tbody>${dailyRows}</tbody></table></div>
    <div class="section"><h2>Все события</h2><table><thead><tr><th>Событие</th><th>Уникальные установки</th><th>Событий</th></tr></thead><tbody>${eventRows}</tbody></table></div>
    <div class="notice muted">Аналитика намеренно не хранит Telegram ID, имя, username, платёжные реквизиты или содержимое выбранных миксов. Install ID — случайный идентификатор приложения.</div>
  `);
}

async function analyticsDashboard(request, env) {
  const access = await requireOwner(request, env);
  if (access.status === 401) return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!access.ok) return new Response(forbiddenPage(), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const url = new URL(request.url);
  const summary = await summaryData(env, url.searchParams.get('days'));
  return new Response(dashboardPage(summary), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function analyticsLogin() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/auth/telegram/start',
      'Set-Cookie': 'alx_analytics_return=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600',
      'Cache-Control': 'no-store',
    },
  });
}

export function applyAnalyticsReturn(request, response) {
  if (getCookie(request, 'alx_analytics_return') !== '1') return response;
  if (response.status < 300 || response.status >= 400) return response;
  const headers = new Headers(response.headers);
  headers.set('Location', '/analytics');
  headers.append('Set-Cookie', 'alx_analytics_return=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleAnalyticsRoute(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === '/api/analytics/health' && request.method === 'GET') {
    await ensureSchema(env);
    return json({ ok: true, version: VERSION }, 200, cors(request, env));
  }

  if (url.pathname === '/api/analytics/event') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, cors(request, env));
    return recordEvent(request, env, ctx);
  }

  if (url.pathname === '/api/analytics/summary' && request.method === 'GET') {
    const access = await requireOwner(request, env);
    if (!access.ok) return json({ ok: false, error: access.status === 401 ? 'Auth required' : 'Forbidden' }, access.status);
    return json(await summaryData(env, url.searchParams.get('days')));
  }

  if (url.pathname === '/analytics/login' && request.method === 'GET') return analyticsLogin();
  if (url.pathname === '/analytics' && request.method === 'GET') return analyticsDashboard(request, env);
  return null;
}
