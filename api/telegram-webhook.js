// Telegram webhook for ALX PRO Stars.
// Critical responsibility: answer pre_checkout_query within Telegram's deadline.

const {
  getPriceStars,
  telegramApi,
  parseProPayload,
  verifyWebhookRequest,
} = require('../server/telegram.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  try {
    if (!verifyWebhookRequest(req)) {
      res.status(401).json({ ok: false });
      return;
    }

    const update = req.body && typeof req.body === 'object' ? req.body : {};
    const pre = update.pre_checkout_query;

    if (pre) {
      const parsed = parseProPayload(pre.invoice_payload);
      const now = Math.floor(Date.now() / 1000);
      const valid = Boolean(
        parsed
        && parsed.userId === Number(pre.from?.id)
        && pre.currency === 'XTR'
        && Number(pre.total_amount) === Number(parsed.amount)
        && Number(pre.total_amount) === getPriceStars()
        && now - parsed.issuedAt <= 24 * 60 * 60
        && parsed.issuedAt - now <= 60
      );

      await telegramApi('answerPreCheckoutQuery', valid
        ? { pre_checkout_query_id: pre.id, ok: true }
        : {
            pre_checkout_query_id: pre.id,
            ok: false,
            error_message: 'Счёт ALX PRO устарел или изменился. Открой приложение и создай новый счёт.',
          });
    }

    // Successful recurring payments and refunds are intentionally not mirrored
    // into a custom DB. /api/stars-status reconciles access directly against
    // Telegram's Star transaction ledger, which stays the source of truth.
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[ALX Telegram webhook]', error);
    res.status(500).json({ ok: false });
  }
};
