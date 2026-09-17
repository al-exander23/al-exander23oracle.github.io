// ALX Oracle retention reminders v1.20.1
// Fixes near-hour scheduling and adds authenticated instant delivery testing.

const VERSION = '1.20.1-reminder-fix';
const MINI_APP_URL = 'https://al-exander23.github.io/al-exander23oracle.github.io/';
const enc = new TextEncoder();
let schemaPromise = null;

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
    Vary: 'Origin',
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1_NOT_CONFIGURED');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS daily_reminders (
          telegram_user_id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0,
          local_hour INTEGER NOT NULL DEFAULT 19,
          timezone_offset_min INTEGER NOT NULL DEFAULT 0,
          next_send_at INTEGER,
          last_sent_at INTEGER,
          sent_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_daily_reminders_due ON daily_reminders(enabled, next_send_at)').run();
      return true;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function validateMiniAppInitData(initData, env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('BOT_TOKEN_NOT_CONFIGURED');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const secretKey = new Uint8Array(await crypto.subtle.sign(
    'HMAC', secretKeyMaterial, enc.encode(env.TELEGRAM_BOT_TOKEN),
  ));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const calculatedBytes = new Uint8Array(await crypto.subtle.sign(
    'HMAC', hmacKey, enc.encode(dataCheckString),
  ));
  const calculated = [...calculatedBytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (!receivedHash || calculated !== receivedHash) throw new Error('INVALID_INIT_DATA');

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > 24 * 60 * 60 || authDate - now > 60) {
    throw new Error('EXPIRED_INIT_DATA');
  }

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (error) { /* handled below */ }
  if (!user?.id || !Number.isFinite(Number(user.id))) throw new Error('USER_MISSING');
  return { ...user, id: Number(user.id) };
}

function cleanHour(value) {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return 19;
  return Math.max(0, Math.min(23, Math.floor(hour)));
}

function cleanOffset(value) {
  const offset = Number(value);
  if (!Number.isFinite(offset)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, Math.round(offset)));
}

function nextSendAt(localHour, timezoneOffsetMin, fromMs = Date.now()) {
  const offset = cleanOffset(timezoneOffsetMin);
  const localNow = new Date(fromMs - offset * 60_000);
  let target = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    cleanHour(localHour),
    0, 0, 0,
  ) + offset * 60_000;

  // Important: do NOT skip a reminder merely because it is less than one minute away.
  // The old implementation used fromMs + 60s here and could push 21:59 -> 22:00 to tomorrow.
  if (target <= fromMs) target += 24 * 60 * 60 * 1000;
  return target;
}

function authError(error) {
  return /INIT_DATA|USER_MISSING|BOT_TOKEN|EXPIRED/i.test(error?.message || '');
}

function reminderFromRow(row) {
  return {
    enabled: Boolean(row?.enabled),
    localHour: Number.isFinite(Number(row?.local_hour)) ? Number(row.local_hour) : 19,
    timezoneOffsetMin: Number.isFinite(Number(row?.timezone_offset_min)) ? Number(row.timezone_offset_min) : 0,
    nextSendAt: Number.isFinite(Number(row?.next_send_at)) ? Number(row.next_send_at) : null,
    lastSentAt: Number.isFinite(Number(row?.last_sent_at)) ? Number(row.last_sent_at) : null,
    sentCount: Number(row?.sent_count || 0),
  };
}

async function getReminder(env, userId) {
  await ensureSchema(env);
  return env.DB.prepare(`
    SELECT enabled, local_hour, timezone_offset_min, next_send_at, last_sent_at, sent_count
    FROM daily_reminders
    WHERE telegram_user_id = ?
  `).bind(String(userId)).first();
}

async function statusResponse(request, env) {
  const headers = cors(request, env);
  if (!allowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, headers);
  try {
    const body = await request.json().catch(() => ({}));
    const user = await validateMiniAppInitData(body.initData, env);
    const row = await getReminder(env, user.id);
    return json({ ok: true, version: VERSION, serverNow: Date.now(), reminder: reminderFromRow(row) }, 200, headers);
  } catch (error) {
    const auth = authError(error);
    return json({ ok: false, error: auth ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось загрузить напоминание.' }, auth ? 401 : 500, headers);
  }
}

async function setResponse(request, env) {
  const headers = cors(request, env);
  if (!allowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, headers);
  try {
    const body = await request.json().catch(() => ({}));
    const user = await validateMiniAppInitData(body.initData, env);
    const enabled = body.enabled === true;
    const localHour = cleanHour(body.localHour);
    const timezoneOffsetMin = cleanOffset(body.timezoneOffsetMin);
    const next = enabled ? nextSendAt(localHour, timezoneOffsetMin) : null;
    const now = Date.now();

    await ensureSchema(env);
    await env.DB.prepare(`
      INSERT INTO daily_reminders (
        telegram_user_id, enabled, local_hour, timezone_offset_min,
        next_send_at, last_sent_at, sent_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        enabled = excluded.enabled,
        local_hour = excluded.local_hour,
        timezone_offset_min = excluded.timezone_offset_min,
        next_send_at = excluded.next_send_at,
        updated_at = excluded.updated_at
    `).bind(String(user.id), enabled ? 1 : 0, localHour, timezoneOffsetMin, next, now).run();

    const row = await getReminder(env, user.id);
    return json({ ok: true, version: VERSION, serverNow: now, reminder: reminderFromRow(row) }, 200, headers);
  } catch (error) {
    const auth = authError(error);
    return json({ ok: false, error: auth ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось сохранить напоминание.' }, auth ? 401 : 500, headers);
  }
}

async function sendTelegramReminder(env, userId, test = false) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('BOT_TOKEN_NOT_CONFIGURED');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(userId),
      text: test
        ? '✅ Тест ALX Oracle: уведомления работают.\nСледующее напоминание о Миксе дня придёт по выбранному расписанию.'
        : '✦ Оракул уже выбрал твой Микс дня.\nСерия ждёт продолжения — загляни сегодня.',
      reply_markup: {
        inline_keyboard: [[{
          text: test ? 'Открыть ALX Oracle ✦' : 'Открыть Микс дня ✦',
          web_app: { url: MINI_APP_URL },
        }]],
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.description || `TELEGRAM_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return { messageId: data?.result?.message_id || null };
}

async function testResponse(request, env) {
  const headers = cors(request, env);
  if (!allowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, headers);
  try {
    const body = await request.json().catch(() => ({}));
    const user = await validateMiniAppInitData(body.initData, env);
    const result = await sendTelegramReminder(env, user.id, true);
    return json({ ok: true, version: VERSION, delivered: true, messageId: result.messageId }, 200, headers);
  } catch (error) {
    const auth = authError(error);
    const status = auth ? 401 : Number(error?.status) === 403 ? 403 : 502;
    const message = auth
      ? 'Не удалось подтвердить Telegram-сессию.'
      : Number(error?.status) === 403
        ? 'Бот не может написать в этот чат. Открой @Orcmix_bot и нажми Start, затем повтори тест.'
        : `Telegram не принял тестовое сообщение: ${String(error?.message || 'unknown error')}`;
    return json({ ok: false, error: message }, status, headers);
  }
}

async function processDueReminder(env, row, now) {
  const userId = String(row.telegram_user_id || '');
  if (!userId) return;
  try {
    await sendTelegramReminder(env, userId, false);
    const next = nextSendAt(row.local_hour, row.timezone_offset_min, now + 1000);
    await env.DB.prepare(`
      UPDATE daily_reminders
      SET last_sent_at = ?, sent_count = sent_count + 1, next_send_at = ?, updated_at = ?
      WHERE telegram_user_id = ?
    `).bind(now, next, now, userId).run();
  } catch (error) {
    console.warn('[ALX retention reminder]', userId, error?.message || error);
    if (Number(error?.status) === 403) {
      await env.DB.prepare(`
        UPDATE daily_reminders SET enabled = 0, next_send_at = NULL, updated_at = ?
        WHERE telegram_user_id = ?
      `).bind(now, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE daily_reminders SET next_send_at = ?, updated_at = ?
        WHERE telegram_user_id = ?
      `).bind(now + 10 * 60_000, now, userId).run();
    }
  }
}

export async function runRetentionSchedule(env) {
  await ensureSchema(env);
  const now = Date.now();
  const due = await env.DB.prepare(`
    SELECT telegram_user_id, local_hour, timezone_offset_min, next_send_at
    FROM daily_reminders
    WHERE enabled = 1 AND next_send_at IS NOT NULL AND next_send_at <= ?
    ORDER BY next_send_at ASC
    LIMIT 50
  `).bind(now).all();

  for (const row of due.results || []) await processDueReminder(env, row, now);
  return { ok: true, processed: (due.results || []).length, version: VERSION };
}

export async function handleRetentionRoute(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/retention/')) return null;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });

  if (url.pathname === '/api/retention/health' && request.method === 'GET') {
    await ensureSchema(env);
    return json({ ok: true, version: VERSION, serverNow: Date.now() }, 200, cors(request, env));
  }
  if (url.pathname === '/api/retention/reminder/status' && request.method === 'POST') return statusResponse(request, env);
  if (url.pathname === '/api/retention/reminder/set' && request.method === 'POST') return setResponse(request, env);
  if (url.pathname === '/api/retention/reminder/test' && request.method === 'POST') return testResponse(request, env);

  return json({ ok: false, error: 'Not found' }, 404, cors(request, env));
}
