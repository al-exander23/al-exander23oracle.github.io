// POST /api/stars-create-invoice
// Creates a 30-day recurring ALX PRO invoice in Telegram Stars.

const { handleOptions, json, readJson } = require('../server/http.js');
const {
  SUBSCRIPTION_PERIOD,
  getPriceStars,
  telegramApi,
  validateInitData,
  createProPayload,
  ensureWebhook,
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
    const priceStars = getPriceStars();

    // Ensure Telegram knows where to send pre_checkout_query before we return
    // the invoice link. Repeating setWebhook on a cold function is safe.
    await ensureWebhook(req);

    const payload = createProPayload(session.user.id, priceStars);
    const invoiceLink = await telegramApi('createInvoiceLink', {
      title: 'ALX PRO',
      description: 'Премиальные коллекции и расширенные сценарии Микс Оракула на 30 дней.',
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'ALX PRO · 30 дней', amount: priceStars }],
      subscription_period: SUBSCRIPTION_PERIOD,
    });

    json(req, res, 200, {
      ok: true,
      invoiceLink,
      priceStars,
      periodDays: 30,
      recurring: true,
    });
  } catch (error) {
    console.error('[ALX Stars create invoice]', error);
    const authError = /initData|Telegram user|signature|expired/i.test(error?.message || '');
    json(req, res, authError ? 401 : 500, {
      ok: false,
      error: authError ? 'Не удалось подтвердить Telegram-сессию.' : 'Не удалось создать счёт Telegram Stars.',
    });
  }
};
