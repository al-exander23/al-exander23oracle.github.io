// Lightweight deployment check. Does not expose secrets.

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'alx-oracle-stars',
    telegramConfigured: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim()),
    priceStars: Math.max(1, Math.min(10000, Math.floor(Number(process.env.ALX_PRO_PRICE_STARS || 149) || 149))),
  });
};
