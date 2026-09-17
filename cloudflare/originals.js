// ALX Originals — private D1-backed collection.
// Recipes never live in the public frontend/API source. A verified active
// ALX PRO entitlement is required before any recipe row is returned.

const DEFAULT_PRO_STATUS_API = 'https://al-exander23oracle-github-io.vercel.app/api/stars-status';
const VERSION = '1.28.0-d1-originals';
const UPSTREAM_TIMEOUT_MS = 8000;

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

function parseRecipe(value) {
  const parsed = JSON.parse(String(value || '[]'));
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('INVALID_ORIGINAL_RECIPE');
  return parsed.map((item) => {
    const flavor = String(item?.flavor || '').trim();
    const percent = Number(item?.percent);
    if (!flavor || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new Error('INVALID_ORIGINAL_RECIPE_ITEM');
    }
    return { flavor, percent };
  });
}

function toMix(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || 'Авторский микс из закрытой коллекции ALX Originals.'),
    recipe: parseRecipe(row.recipe_json),
    rating: null,
    favorites: 0,
    author: String(row.author || 'ALX Originals'),
    proOnly: true,
    hiddenUntilPro: true,
    exclusiveCollection: 'originals',
    collections: ['originals'],
    original: true,
  };
}

async function loadOriginals(env) {
  if (!env.DB) throw new Error('D1_NOT_CONFIGURED');
  const result = await env.DB.prepare(`
    SELECT id, name, description, recipe_json, author, sort_order
    FROM alx_originals
    WHERE active = 1
    ORDER BY sort_order ASC, id ASC
  `).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  if (!rows.length) throw new Error('ALX_ORIGINALS_EMPTY');
  return rows.map(toMix);
}

async function health(request, env) {
  try {
    if (!env.DB) throw new Error('D1_NOT_CONFIGURED');
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active
      FROM alx_originals
    `).first();
    return json(request, env, {
      ok: true,
      storage: 'd1',
      version: VERSION,
      total: Number(row?.total || 0),
      active: Number(row?.active || 0),
    });
  } catch (error) {
    console.error('[ALX Originals health]', error);
    return json(request, env, { ok: false, storage: 'd1', version: VERSION }, 503);
  }
}

async function originals(request, env) {
  if (request.method !== 'POST') {
    return json(request, env, { ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const initData = String(body?.initData || '').trim();
    if (!initData) {
      return json(request, env, { ok: false, error: 'Не удалось подтвердить Telegram-сессию.' }, 401);
    }

    const proActive = await hasUnifiedPro(initData, env);
    if (!proActive) {
      return json(request, env, { ok: false, error: 'ALX PRO required' }, 403);
    }

    const mixes = await loadOriginals(env);
    return json(request, env, {
      ok: true,
      collection: 'originals',
      author: 'ALX Originals',
      storage: 'd1',
      version: VERSION,
      mixes,
    });
  } catch (error) {
    console.error('[ALX Originals D1]', error);
    const message = String(error?.message || '');
    const authError = /initData|Telegram|signature|expired|401/i.test(message) || error?.status === 401;
    return json(request, env, {
      ok: false,
      error: authError
        ? 'Не удалось подтвердить Telegram-сессию.'
        : 'Не удалось открыть ALX Originals.',
    }, authError ? 401 : 500);
  }
}

export async function handleOriginalsRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/originals' && url.pathname !== '/api/originals/health') return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (url.pathname === '/api/originals/health') {
    if (request.method !== 'GET') return json(request, env, { ok: false, error: 'Method not allowed' }, 405);
    return health(request, env);
  }
  return originals(request, env);
}
