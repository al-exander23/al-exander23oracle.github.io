// POST /api/originals
// Backward-compatible proxy for older ALX Oracle clients.
// The actual ALX Originals recipes live only in Cloudflare D1 and are served
// by the protected Cloudflare Worker endpoint after ALX PRO verification.

const { handleOptions, json, readJson } = require('../server/http.js');

const DEFAULT_ORIGINALS_API = 'https://alx-pay.alxoracle.workers.dev/api/originals';
const UPSTREAM_TIMEOUT_MS = 10000;

function originalsApiUrl() {
  const configured = String(process.env.ALX_ORIGINALS_API_URL || '').trim();
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_ORIGINALS_API;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    json(req, res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const body = await readJson(req);
    const response = await fetch(originalsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: String(body.initData || '') }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({
      ok: false,
      error: 'Не удалось открыть ALX Originals.',
    }));
    json(req, res, response.status, data);
  } catch (error) {
    console.error('[ALX Originals proxy]', error);
    json(req, res, 502, {
      ok: false,
      error: 'Не удалось открыть ALX Originals.',
    });
  } finally {
    clearTimeout(timer);
  }
};
