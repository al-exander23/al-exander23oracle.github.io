// Shared HTTP helpers for Vercel serverless functions.

function allowedOrigin(req) {
  const configured = String(process.env.ALX_ALLOWED_ORIGIN || '').trim();
  if (configured) return configured;

  const origin = String(req.headers.origin || '').trim();
  if (/^https:\/\/al-exander23\.github\.io$/i.test(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  return '*';
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.status(204).end();
  return true;
}

function json(req, res, status, body) {
  applyCors(req, res);
  res.status(status).json(body);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

module.exports = {
  applyCors,
  handleOptions,
  json,
  readJson,
};
