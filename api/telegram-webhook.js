// Telegram webhook for ALX Oracle + ALX PRO Stars.
// Handles the branded bot storefront and answers pre_checkout_query within Telegram's deadline.

const {
  getPriceStars,
  telegramApi,
  parseProPayload,
  verifyWebhookRequest,
  ensureBotPresentation,
} = require('../server/telegram.js');

const DEFAULT_MINI_APP_URL = 'https://al-exander23.github.io/al-exander23oracle.github.io/';
const DEFAULT_API_URL = 'https://al-exander23oracle-github-io.vercel.app';
const ALX_PAY_URL = 'https://alx-pay.alxoracle.workers.dev/';
const ALX_PAY_SUPPORT_URL = 'https://alx-pay.alxoracle.workers.dev/support/';
const DEFAULT_EXTERNAL_PRICE_RUB = 299;

function miniAppUrl() {
  const configured = String(process.env.ALX_MINI_APP_URL || '').trim();
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_MINI_APP_URL;
}

function apiOrigin() {
  const configured = String(process.env.ALX_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_API_URL;
}

function externalPriceRub() {
  const configured = Number(process.env.ALX_EXTERNAL_PRICE_RUB || DEFAULT_EXTERNAL_PRICE_RUB);
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : DEFAULT_EXTERNAL_PRICE_RUB;
}

function botVisualUrl() {
  return `${apiOrigin()}/api/bot-visual`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function launchKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔮 Запустить Оракул', web_app: { url: miniAppUrl() } }],
      [
        { text: '✦ ALX PRO', callback_data: 'alx_pro_info' },
        { text: 'Как это работает', callback_data: 'alx_help' },
      ],
      [
        { text: '🛟 Оплата и поддержка', callback_data: 'alx_pay_support' },
        { text: 'Условия', callback_data: 'alx_terms' },
      ],
    ],
  };
}

async function loadBotVisualBytes() {
  const response = await fetch(botVisualUrl());
  if (!response.ok) throw new Error(`BOT_VISUAL_HTTP_${response.status}`);
  return response.arrayBuffer();
}

async function sendBrandedPhoto(chatId, caption, replyMarkup) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const imageBytes = await loadBotVisualBytes();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('reply_markup', JSON.stringify(replyMarkup));
  form.append('photo', new Blob([imageBytes], { type: 'image/jpeg' }), 'alx-oracle.jpg');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.description || `sendPhoto failed (${response.status})`);
  return data.result;
}

function welcomeCaption(user = {}) {
  const name = escapeHtml(user.first_name || user.username || '');
  const greeting = name ? `, ${name}` : '';
  const price = getPriceStars();
  const rubPrice = externalPriceRub();
  return [
    `<b>ALX ORACLE</b>${greeting}`,
    '<i>Твой персональный Оракул вкуса.</i>',
    '',
    'Подбирай сочетания под настроение и ситуацию, сохраняй любимое и постепенно формируй собственный вкусовой профиль.',
    '',
    '✦ 5 бесплатных подборов Оракула в день',
    '✦ профиль вкуса, история, избранное и Микс дня',
    '✦ достижения и уведомления',
    '✦ 7 направлений ALX PRO + ALX Originals',
    '✦ Community Mixes — публикации, оценки, сохранения и выбор шаром',
    '',
    '<b>ALX PRO · 30 дней</b>',
    `<b>Внутри Telegram: ${price} ⭐</b> — оплата через Telegram Stars.`,
    `<b>Внешний ALX Pay: ${rubPrice} ₽</b> — официальный внешний канал оплаты.`,
    '',
    '<i>18+ · ALX Oracle не продаёт табачную продукцию.</i>',
  ].join('\n');
}

async function sendWelcome(chatId, user = {}) {
  try {
    await sendBrandedPhoto(chatId, welcomeCaption(user), launchKeyboard());
  } catch (error) {
    console.warn('[ALX Bot welcome photo]', error);
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: welcomeCaption(user),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: launchKeyboard(),
    });
  }
}

async function sendProInfo(chatId) {
  const price = getPriceStars();
  const rubPrice = externalPriceRub();
  const text = [
    '<b>✦ ALX PRO</b>',
    '<i>Глубже Оракула — больше контроля над подбором.</i>',
    '',
    '◆ <b>Безлимитные подборы</b> — без дневного ограничения FREE',
    '◆ <b>7 направлений Оракула</b> — ALX Originals, Parfum Lab, LIMITED 2026, ALX Signature, Для двоих, После полуночи и Эксперимент',
    '◆ <b>Community Mixes</b> — создавай и публикуй свои рецепты, оценивай, сохраняй и делись',
    '◆ <b>Community Oracle</b> — включи «Выбирать шаром», чтобы получать только рецепты участников',
    '◆ <b>Community Choice</b> — отметка рецептов с рейтингом от 4.5 и минимум 10 оценками',
    '◆ новые PRO-направления и функции по мере развития проекта',
    '',
    '<b>Стоимость ALX PRO / 30 дней</b>',
    `<b>${price} ⭐</b> — внутри Telegram через Telegram Stars.`,
    `<b>${rubPrice} ₽</b> — через официальный внешний ALX Pay.`,
    '',
    'ALX PRO — цифровой доступ к дополнительным функциям сервиса на 30 дней.',
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [
      [{ text: `Открыть PRO · ${price} ⭐`, web_app: { url: miniAppUrl() } }],
      [{ text: '🛟 Вопрос по оплате', callback_data: 'alx_pay_support' }],
    ],
  };

  try {
    await sendBrandedPhoto(chatId, text, replyMarkup);
  } catch (error) {
    await telegramApi('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text, reply_markup: replyMarkup });
  }
}

async function sendHelp(chatId) {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>Как работает ALX Oracle</b>',
      '',
      '1. Открой Оракул кнопкой ниже.',
      '2. Для обычного подбора коснись шара или встряхни телефон.',
      '3. Для специального режима сначала открой PRO и выбери направление.',
      '4. Получай конкретный рецепт, сохраняй удачные варианты и формируй профиль вкуса.',
      '5. В Community можно публиковать свои миксы, оценивать рецепты участников и запускать их через отдельный режим шара.',
      '',
      '<b>Команды</b>',
      '/start — главная',
      '/pro — ALX PRO',
      '/paysupport — оплата и поддержка',
      '/terms — условия',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{ text: '🔮 Запустить Оракул', web_app: { url: miniAppUrl() } }]],
    },
  });
}

async function sendPaySupport(chatId) {
  const rubPrice = externalPriceRub();
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: [
      '<b>🛟 Оплата и поддержка</b>',
      '',
      '<b>Telegram Stars</b>',
      'Если Stars списались, а PRO не открылся — полностью закрой ALX Oracle и открой Mini App заново. Доступ восстанавливается по подтверждённой Telegram-транзакции.',
      '',
      '<b>ALX Pay</b>',
      `Стоимость ALX PRO на внешнем официальном ALX Pay: <b>${rubPrice} ₽ / 30 дней</b>.`,
      'ALX Pay — отдельный официальный внешний ресурс проекта. На нём можно ознакомиться с доступными внешними способами оплаты, войти через Telegram и проверить уже оформленный внешний доступ ALX PRO.',
      '',
      'Для информации об ALX Pay и перехода на ресурс используй кнопку «Открыть ALX Pay». Для диагностики уже совершённой покупки — Support Center.',
      '',
      'Никогда не отправляй номер карты, CVC, пароль, SMS-код или код подтверждения.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 Открыть ALX Pay', url: ALX_PAY_URL }],
        [{ text: '🛟 Support Center ALX Pay', url: ALX_PAY_SUPPORT_URL }],
        [{ text: '🔮 Открыть ALX Oracle', web_app: { url: miniAppUrl() } }],
      ],
    },
  });
}

async function sendTerms(chatId) {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>Условия ALX Oracle</b>',
      '',
      '• сервис предназначен для пользователей 18+;',
      '• ALX Oracle предоставляет рекомендации и цифровой функционал, но не продаёт табачную продукцию;',
      '• ALX PRO открывает цифровые функции на срок оплаченного периода;',
      '• покупки цифрового PRO внутри Telegram оформляются в Telegram Stars;',
      '• доступ привязывается к подтверждённому Telegram-аккаунту;',
      '• вопросы по платежам и восстановлению доступа принимаются через /paysupport.',
      '',
      'Продолжая пользоваться сервисом, пользователь принимает эти условия и правила Telegram.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{ text: '🔮 Открыть ALX Oracle', web_app: { url: miniAppUrl() } }]],
    },
  });
}

async function handleCallback(callback) {
  const chatId = callback.message?.chat?.id;
  await telegramApi('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
  if (!chatId) return;

  if (callback.data === 'alx_pro_info') await sendProInfo(chatId);
  else if (callback.data === 'alx_help') await sendHelp(chatId);
  else if (callback.data === 'alx_pay_support') await sendPaySupport(chatId);
  else if (callback.data === 'alx_terms') await sendTerms(chatId);
}

async function handleMessage(_req, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = String(message.text || '').trim();
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    await sendWelcome(chatId, message.from || {});
    return;
  }
  if (command === '/pro') {
    await sendProInfo(chatId);
    return;
  }
  if (command === '/help') {
    await sendHelp(chatId);
    return;
  }
  if (command === '/paysupport') {
    await sendPaySupport(chatId);
    return;
  }
  if (command === '/terms') {
    await sendTerms(chatId);
  }
}

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

    if (!pre && (update.callback_query || update.message)) {
      await ensureBotPresentation().catch((error) => {
        console.warn('[ALX Bot presentation]', error);
      });
    }

    if (update.callback_query) await handleCallback(update.callback_query);
    if (update.message) await handleMessage(req, update.message);

    // Successful recurring payments and refunds are intentionally not mirrored
    // into a custom DB. /api/stars-status reconciles access directly against
    // Telegram's Star transaction ledger, which stays the source of truth.
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[ALX Telegram webhook]', error);
    res.status(500).json({ ok: false });
  }
};
