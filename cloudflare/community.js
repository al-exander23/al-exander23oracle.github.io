// ALX Community — PRO-only user mix community backed by Cloudflare D1.
// User recipes are isolated from the official Oracle/ALX Originals pool.

const DEFAULT_PRO_STATUS_API = 'https://al-exander23oracle-github-io.vercel.app/api/stars-status';
const VERSION = '1.30.0-community-mvp';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_CREATE_PER_24H = 5;
const enc = new TextEncoder();
let schemaPromise = null;

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALX_ALLOWED_ORIGIN || '').trim();
  const ownOrigin = new URL(request.url).origin;
  if (configured && origin === configured) return origin;
  if (origin === ownOrigin) return origin;
  return configured || ownOrigin;
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

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

function proStatusApi(env) {
  const configured = String(env.ALX_PRO_STATUS_API || '').trim();
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_PRO_STATUS_API;
}

function safeEqualHex(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (!/^[a-f0-9]+$/.test(left) || !/^[a-f0-9]+$/.test(right) || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function validateInitData(initData, env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('BOT_TOKEN_NOT_CONFIGURED');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKey = new Uint8Array(
    await crypto.subtle.sign('HMAC', secretKeyMaterial, enc.encode(env.TELEGRAM_BOT_TOKEN)),
  );
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const calculatedBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString)),
  );
  const calculatedHash = [...calculatedBytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (!safeEqualHex(calculatedHash, receivedHash)) throw new Error('INVALID_INIT_DATA');

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || now - authDate > 24 * 60 * 60 || authDate - now > 60) {
    throw new Error('EXPIRED_INIT_DATA');
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (error) {
    throw new Error('INVALID_USER_DATA');
  }
  if (!user?.id || !Number.isFinite(Number(user.id))) throw new Error('USER_MISSING');
  return { ...user, id: Number(user.id) };
}

async function hasUnifiedPro(initData, env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(proStatusApi(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      const error = new Error(data?.error || `PRO_STATUS_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data?.entitlement?.active === true;
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(body, env) {
  const initData = String(body?.initData || '').trim();
  if (!initData) {
    const error = new Error('Telegram initData is missing');
    error.status = 401;
    throw error;
  }
  const user = await validateInitData(initData, env);
  const proActive = await hasUnifiedPro(initData, env);
  if (!proActive) {
    const error = new Error('ALX PRO required');
    error.status = 403;
    throw error;
  }
  return { user, initData };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1_NOT_CONFIGURED');
  if (schemaPromise) return schemaPromise;

  schemaPromise = env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_mixes (
        id TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        strength INTEGER,
        status TEXT NOT NULL DEFAULT 'published',
        fingerprint TEXT NOT NULL,
        view_count INTEGER NOT NULL DEFAULT 0,
        save_count INTEGER NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        rating_sum INTEGER NOT NULL DEFAULT 0,
        report_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_mix_components (
        mix_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        flavor TEXT NOT NULL,
        percent REAL NOT NULL,
        PRIMARY KEY (mix_id, position)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_ratings (
        mix_id TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (mix_id, telegram_user_id)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_saves (
        mix_id TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (mix_id, telegram_user_id)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_views (
        mix_id TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (mix_id, telegram_user_id)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS community_reports (
        mix_id TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (mix_id, telegram_user_id)
      )
    `),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_community_mixes_status_created ON community_mixes(status, created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_community_mixes_owner ON community_mixes(telegram_user_id, created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_community_ratings_mix ON community_ratings(mix_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_community_saves_mix ON community_saves(mix_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_community_reports_mix ON community_reports(mix_id)'),
  ]).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function cleanText(value, maxLength, { minLength = 0, fallback = '' } = {}) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  if (text.length < minLength) return fallback;
  return text;
}

function containsLink(value) {
  return /(?:https?:\/\/|www\.|t\.me\/)/i.test(String(value || ''));
}

function normalizeFlavor(value) {
  return cleanText(value, 48)
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function publicAuthorName(requested, user) {
  const supplied = cleanText(requested, 32, { minLength: 2 });
  if (supplied && !containsLink(supplied)) return supplied;
  const username = cleanText(user?.username, 28);
  if (username) return `@${username.replace(/^@+/, '')}`;
  const firstName = cleanText(user?.first_name, 28, { minLength: 2 });
  return firstName || 'ALX user';
}

function validateRecipe(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 6) {
    throw new Error('Добавь от 2 до 6 вкусов.');
  }
  const recipe = raw.map((item) => {
    const flavor = cleanText(item?.flavor, 48, { minLength: 1 });
    const percentRaw = Number(item?.percent);
    const percent = Math.round(percentRaw * 10) / 10;
    if (!flavor || containsLink(flavor)) throw new Error('Проверь названия вкусов.');
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      throw new Error('Каждый процент должен быть больше 0 и меньше 100.');
    }
    return { flavor, percent };
  });

  const unique = new Set(recipe.map((item) => normalizeFlavor(item.flavor)));
  if (unique.size !== recipe.length) throw new Error('Один и тот же вкус нельзя добавлять дважды.');

  const total = Math.round(recipe.reduce((sum, item) => sum + item.percent, 0) * 10) / 10;
  if (Math.abs(total - 100) > 0.01) throw new Error('Сумма пропорций должна быть ровно 100%.');
  return recipe;
}

function recipeFingerprint(recipe) {
  return recipe
    .map((item) => `${normalizeFlavor(item.flavor)}:${item.percent.toFixed(1)}`)
    .sort()
    .join('|');
}

function rankScore(row) {
  const count = Number(row?.rating_count || 0);
  const sum = Number(row?.rating_sum || 0);
  const average = count > 0 ? sum / count : 0;
  const priorMean = 4.0;
  const priorWeight = 5;
  return Math.round((((average * count) + (priorMean * priorWeight)) / (count + priorWeight)) * 1000) / 1000;
}

function ratingAverage(row) {
  const count = Number(row?.rating_count || 0);
  return count > 0 ? Math.round((Number(row?.rating_sum || 0) / count) * 10) / 10 : 0;
}

async function loadComponents(env, ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT mix_id, position, flavor, percent
    FROM community_mix_components
    WHERE mix_id IN (${placeholders})
    ORDER BY mix_id ASC, position ASC
  `).bind(...ids).all();

  const map = new Map();
  for (const row of result?.results || []) {
    if (!map.has(row.mix_id)) map.set(row.mix_id, []);
    map.get(row.mix_id).push({
      flavor: String(row.flavor),
      percent: Number(row.percent),
    });
  }
  return map;
}

function toMix(row, recipe, userId) {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description || ''),
    author: String(row.author_name || 'ALX user'),
    strength: Number(row.strength || 0) || null,
    recipe: Array.isArray(recipe) ? recipe : [],
    rating: ratingAverage(row),
    ratingCount: Number(row.rating_count || 0),
    rankScore: rankScore(row),
    saves: Number(row.save_count || 0),
    views: Number(row.view_count || 0),
    reports: Number(row.report_count || 0),
    myRating: Number(row.my_rating || 0) || null,
    saved: Number(row.saved_by_me || 0) === 1,
    isMine: String(row.telegram_user_id) === String(userId),
    createdAt: Number(row.created_at || 0),
  };
}

async function rankPositions(env, ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          ORDER BY
            (((rating_sum * 1.0 / rating_count) * rating_count + 20.0) / (rating_count + 5.0)) DESC,
            rating_count DESC,
            save_count DESC,
            created_at DESC
        ) AS rank_position
      FROM community_mixes
      WHERE status = 'published' AND rating_count > 0
    )
    SELECT id, rank_position
    FROM ranked
    WHERE id IN (${placeholders})
  `).bind(...ids).all();
  return new Map((result?.results || []).map((row) => [String(row.id), Number(row.rank_position)]));
}

function baseSelect() {
  return `
    SELECT
      m.*,
      r.rating AS my_rating,
      CASE WHEN s.telegram_user_id IS NULL THEN 0 ELSE 1 END AS saved_by_me
    FROM community_mixes m
    LEFT JOIN community_ratings r
      ON r.mix_id = m.id AND r.telegram_user_id = ?
    LEFT JOIN community_saves s
      ON s.mix_id = m.id AND s.telegram_user_id = ?
  `;
}

async function listMixes(env, userId, mode) {
  let where = "m.status = 'published'";
  let order = 'm.created_at DESC';
  if (mode === 'mine') where += ' AND m.telegram_user_id = ?';
  if (mode === 'saved') where += ' AND s.telegram_user_id IS NOT NULL';
  if (mode === 'top') {
    order = `
      (((CASE WHEN m.rating_count > 0 THEN (m.rating_sum * 1.0 / m.rating_count) ELSE 4.0 END) * m.rating_count + 20.0)
      / (m.rating_count + 5.0)) DESC,
      m.rating_count DESC,
      m.save_count DESC,
      m.created_at DESC
    `;
  }

  const bindings = [String(userId), String(userId)];
  if (mode === 'mine') bindings.push(String(userId));

  const result = await env.DB.prepare(`
    ${baseSelect()}
    WHERE ${where}
    ORDER BY ${order}
    LIMIT 50
  `).bind(...bindings).all();

  const rows = result?.results || [];
  const ids = rows.map((row) => String(row.id));
  const [components, positions] = await Promise.all([
    loadComponents(env, ids),
    rankPositions(env, ids),
  ]);
  return rows.map((row) => ({
    ...toMix(row, components.get(String(row.id)), userId),
    rankPosition: positions.get(String(row.id)) || null,
  }));
}

async function getMix(env, userId, mixId) {
  const row = await env.DB.prepare(`
    ${baseSelect()}
    WHERE m.status = 'published' AND m.id = ?
    LIMIT 1
  `).bind(String(userId), String(userId), String(mixId)).first();
  if (!row) return null;
  const id = String(row.id);
  const [components, positions] = await Promise.all([
    loadComponents(env, [id]),
    rankPositions(env, [id]),
  ]);
  return {
    ...toMix(row, components.get(id), userId),
    rankPosition: positions.get(id) || null,
  };
}

async function health(request, env) {
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published
      FROM community_mixes
    `).first();
    return json(request, env, {
      ok: true,
      storage: 'd1',
      version: VERSION,
      total: Number(row?.total || 0),
      published: Number(row?.published || 0),
      maxCreatePer24h: MAX_CREATE_PER_24H,
    });
  } catch (error) {
    console.error('[ALX Community health]', error);
    return json(request, env, { ok: false, storage: 'd1', version: VERSION }, 503);
  }
}

async function preview(request, env, url) {
  await ensureSchema(env);
  const id = cleanText(url.searchParams.get('id'), 80, { minLength: 3 });
  if (!id) return json(request, env, { ok: false, error: 'Mix not found' }, 404);
  const row = await env.DB.prepare(`
    SELECT id, author_name, title, description, strength, rating_count, rating_sum, save_count, view_count, created_at
    FROM community_mixes
    WHERE id = ? AND status = 'published'
    LIMIT 1
  `).bind(id).first();
  if (!row) return json(request, env, { ok: false, error: 'Mix not found' }, 404);

  return json(request, env, {
    ok: true,
    version: VERSION,
    preview: {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description || ''),
      author: String(row.author_name || 'ALX user'),
      strength: Number(row.strength || 0) || null,
      rating: ratingAverage(row),
      ratingCount: Number(row.rating_count || 0),
      saves: Number(row.save_count || 0),
      views: Number(row.view_count || 0),
      createdAt: Number(row.created_at || 0),
    },
  });
}

async function list(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);
  const requested = String(body?.view || 'top').toLowerCase();
  const mode = ['top', 'new', 'mine', 'saved'].includes(requested) ? requested : 'top';
  const mixes = await listMixes(env, user.id, mode);
  return json(request, env, { ok: true, version: VERSION, view: mode, mixes });
}

async function getOne(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);
  const id = cleanText(body?.id, 80, { minLength: 3 });
  const mix = id ? await getMix(env, user.id, id) : null;
  if (!mix) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);
  return json(request, env, { ok: true, version: VERSION, mix });
}

async function create(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);

  const title = cleanText(body?.title, 60, { minLength: 2 });
  const description = cleanText(body?.description, 240);
  const authorName = publicAuthorName(body?.authorName, user);
  const strengthRaw = Number(body?.strength);
  const strength = Number.isFinite(strengthRaw) && strengthRaw >= 1 && strengthRaw <= 5
    ? Math.round(strengthRaw)
    : null;
  const recipe = validateRecipe(body?.recipe);

  if (!title || containsLink(title) || containsLink(description)) {
    return json(request, env, { ok: false, error: 'Проверь название и описание. Ссылки в рецептах не используются.' }, 400);
  }

  const now = Date.now();
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM community_mixes
    WHERE telegram_user_id = ? AND created_at >= ?
  `).bind(String(user.id), now - 24 * 60 * 60 * 1000).first();
  if (Number(recent?.count || 0) >= MAX_CREATE_PER_24H) {
    return json(request, env, { ok: false, error: 'Лимит Community: не более 5 публикаций за 24 часа.' }, 429);
  }

  const fingerprint = recipeFingerprint(recipe);
  const duplicate = await env.DB.prepare(`
    SELECT id
    FROM community_mixes
    WHERE telegram_user_id = ? AND fingerprint = ? AND status = 'published'
    LIMIT 1
  `).bind(String(user.id), fingerprint).first();
  if (duplicate?.id) {
    return json(request, env, { ok: false, error: 'Такой состав уже опубликован в ваших миксах.' }, 409);
  }

  const id = `cm_${crypto.randomUUID().replaceAll('-', '')}`;
  const statements = [
    env.DB.prepare(`
      INSERT INTO community_mixes (
        id, telegram_user_id, author_name, title, description, strength, status,
        fingerprint, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
    `).bind(
      id,
      String(user.id),
      authorName,
      title,
      description,
      strength,
      fingerprint,
      now,
      now,
    ),
    ...recipe.map((item, index) => env.DB.prepare(`
      INSERT INTO community_mix_components (mix_id, position, flavor, percent)
      VALUES (?, ?, ?, ?)
    `).bind(id, index, item.flavor, item.percent)),
  ];
  await env.DB.batch(statements);

  const mix = await getMix(env, user.id, id);
  return json(request, env, { ok: true, version: VERSION, mix }, 201);
}

async function rate(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);

  const id = cleanText(body?.id, 80, { minLength: 3 });
  const rating = Math.round(Number(body?.rating));
  if (!id || rating < 1 || rating > 5) {
    return json(request, env, { ok: false, error: 'Оценка должна быть от 1 до 5.' }, 400);
  }

  const owner = await env.DB.prepare(`
    SELECT telegram_user_id FROM community_mixes
    WHERE id = ? AND status = 'published'
    LIMIT 1
  `).bind(id).first();
  if (!owner) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);
  if (String(owner.telegram_user_id) === String(user.id)) {
    return json(request, env, { ok: false, error: 'Свой микс оценивать нельзя.' }, 400);
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO community_ratings (mix_id, telegram_user_id, rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(mix_id, telegram_user_id)
      DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at
    `).bind(id, String(user.id), rating, now, now),
    env.DB.prepare(`
      UPDATE community_mixes
      SET
        rating_count = (SELECT COUNT(*) FROM community_ratings WHERE mix_id = ?),
        rating_sum = (SELECT COALESCE(SUM(rating), 0) FROM community_ratings WHERE mix_id = ?)
      WHERE id = ?
    `).bind(id, id, id),
  ]);

  const mix = await getMix(env, user.id, id);
  return json(request, env, {
    ok: true,
    version: VERSION,
    rating: mix?.rating || 0,
    ratingCount: mix?.ratingCount || 0,
    rankScore: mix?.rankScore || 0,
    myRating: mix?.myRating || rating,
  });
}

async function save(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);

  const id = cleanText(body?.id, 80, { minLength: 3 });
  const desired = body?.saved !== false;
  const exists = id ? await env.DB.prepare(
    "SELECT id FROM community_mixes WHERE id = ? AND status = 'published' LIMIT 1",
  ).bind(id).first() : null;
  if (!exists) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);

  if (desired) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO community_saves (mix_id, telegram_user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(id, String(user.id), Date.now()).run();
  } else {
    await env.DB.prepare(
      'DELETE FROM community_saves WHERE mix_id = ? AND telegram_user_id = ?',
    ).bind(id, String(user.id)).run();
  }

  await env.DB.prepare(`
    UPDATE community_mixes
    SET save_count = (SELECT COUNT(*) FROM community_saves WHERE mix_id = ?)
    WHERE id = ?
  `).bind(id, id).run();

  const mix = await getMix(env, user.id, id);
  return json(request, env, {
    ok: true,
    version: VERSION,
    saved: Boolean(mix?.saved),
    saves: Number(mix?.saves || 0),
  });
}

async function view(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);

  const id = cleanText(body?.id, 80, { minLength: 3 });
  const exists = id ? await env.DB.prepare(
    "SELECT id FROM community_mixes WHERE id = ? AND status = 'published' LIMIT 1",
  ).bind(id).first() : null;
  if (!exists) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO community_views (mix_id, telegram_user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(id, String(user.id), Date.now()),
    env.DB.prepare(`
      UPDATE community_mixes
      SET view_count = (SELECT COUNT(*) FROM community_views WHERE mix_id = ?)
      WHERE id = ?
    `).bind(id, id),
  ]);

  const row = await env.DB.prepare('SELECT view_count FROM community_mixes WHERE id = ?').bind(id).first();
  return json(request, env, { ok: true, version: VERSION, views: Number(row?.view_count || 0) });
}

async function report(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);

  const id = cleanText(body?.id, 80, { minLength: 3 });
  const allowedReasons = new Set(['spam', 'offensive', 'duplicate', 'other']);
  const reason = allowedReasons.has(String(body?.reason || '')) ? String(body.reason) : 'other';
  const owner = id ? await env.DB.prepare(
    "SELECT telegram_user_id FROM community_mixes WHERE id = ? AND status = 'published' LIMIT 1",
  ).bind(id).first() : null;
  if (!owner) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);
  if (String(owner.telegram_user_id) === String(user.id)) {
    return json(request, env, { ok: false, error: 'На свой микс жаловаться не нужно — его можно снять с публикации.' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO community_reports (mix_id, telegram_user_id, reason, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, String(user.id), reason, Date.now()),
    env.DB.prepare(`
      UPDATE community_mixes
      SET report_count = (SELECT COUNT(*) FROM community_reports WHERE mix_id = ?)
      WHERE id = ?
    `).bind(id, id),
  ]);

  return json(request, env, { ok: true, version: VERSION, reported: true });
}

async function remove(request, env, body) {
  const { user } = await authorize(body, env);
  await ensureSchema(env);
  const id = cleanText(body?.id, 80, { minLength: 3 });
  if (!id) return json(request, env, { ok: false, error: 'Микс не найден.' }, 404);

  const result = await env.DB.prepare(`
    UPDATE community_mixes
    SET status = 'deleted', updated_at = ?
    WHERE id = ? AND telegram_user_id = ? AND status = 'published'
  `).bind(Date.now(), id, String(user.id)).run();

  const changed = Number(result?.meta?.changes || 0);
  if (!changed) return json(request, env, { ok: false, error: 'Микс не найден или уже снят с публикации.' }, 404);
  return json(request, env, { ok: true, version: VERSION, deleted: true });
}

function statusForError(error) {
  if (Number(error?.status) === 401) return 401;
  if (Number(error?.status) === 403) return 403;
  const message = String(error?.message || '');
  if (/initData|INVALID_|EXPIRED_|USER_MISSING|Telegram/i.test(message)) return 401;
  if (/PRO required/i.test(message)) return 403;
  return 500;
}

async function protectedRoute(request, env, action) {
  if (request.method !== 'POST') {
    return json(request, env, { ok: false, error: 'Method not allowed' }, 405);
  }
  const body = await request.json().catch(() => ({}));
  try {
    if (action === 'list') return await list(request, env, body);
    if (action === 'get') return await getOne(request, env, body);
    if (action === 'create') return await create(request, env, body);
    if (action === 'rate') return await rate(request, env, body);
    if (action === 'save') return await save(request, env, body);
    if (action === 'view') return await view(request, env, body);
    if (action === 'report') return await report(request, env, body);
    if (action === 'delete') return await remove(request, env, body);
    return json(request, env, { ok: false, error: 'Not found' }, 404);
  } catch (error) {
    console.error(`[ALX Community ${action}]`, error);
    const status = statusForError(error);
    return json(request, env, {
      ok: false,
      error: status === 401
        ? 'Не удалось подтвердить Telegram-сессию.'
        : status === 403
          ? 'Community Mixes доступны только с активным ALX PRO.'
          : cleanText(error?.message, 180) || 'Не удалось выполнить действие Community.',
    }, status);
  }
}

export async function handleCommunityRoute(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/community/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const action = url.pathname.slice('/api/community/'.length);
  if (action === 'health') {
    if (request.method !== 'GET') return json(request, env, { ok: false, error: 'Method not allowed' }, 405);
    return health(request, env);
  }
  if (action === 'preview') {
    if (request.method !== 'GET') return json(request, env, { ok: false, error: 'Method not allowed' }, 405);
    try {
      return await preview(request, env, url);
    } catch (error) {
      console.error('[ALX Community preview]', error);
      return json(request, env, { ok: false, error: 'Не удалось открыть превью микса.' }, 500);
    }
  }
  return protectedRoute(request, env, action);
}
