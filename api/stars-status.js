// POST /api/stars-status
// Restores ALX PRO from Telegram's own Star transaction ledger.

const { handleOptions, json, readJson } = require('../server/http.js');
const {
  getPriceStars,
  validateInitData,
  findProEntitlement,
} = require('../server/telegram.js');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    json(req, res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const session = validateInitData(body.initData);
    const entitlement = await findProEntitlement(session.user.id);

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
    console.error('[ALX Stars status]', error);
    const authError = /initData|Telegram user|signature|expired/i.test(error?.message || '');
    json(req, res, authError ? 401 : 500, {
      ok: false,
      error: authError ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось проверить подписку ALX PRO.',
    });
  }
};
