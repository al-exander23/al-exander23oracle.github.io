// Telegram webhook for ALX Oracle + ALX PRO Stars.
// Handles the branded bot storefront and answers pre_checkout_query within Telegram's deadline.

const {
  getPriceStars,
  telegramApi,
  parseProPayload,
  verifyWebhookRequest,
  ensureWebhook,
} = require('../server/telegram.js');

const DEFAULT_MINI_APP_URL = 'https://al-exander23.github.io/al-exander23oracle.github.io/';
const DEFAULT_API_URL = 'https://al-exander23oracle-github-io.vercel.app';
const ALX_PAY_URL = 'https://alx-pay.sashaswag23.workers.dev/';
const ALX_PAY_SUPPORT_URL = 'https://alx-pay.sashaswag23.workers.dev/support/';
let botProfilePromise = null;

function miniAppUrl() {
  const configured = String(process.env.ALX_MINI_APP_URL || '').trim();
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_MINI_APP_URL;
}

function apiOrigin() {
  const configured = String(process.env.ALX_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_API_URL;
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

async function setBotProfilePhotoIfMissing() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return false;

  const me = await telegramApi('getMe');
  const photos = await telegramApi('getUserProfilePhotos', { user_id: me.id, limit: 1 });
  if (Number(photos?.total_count || 0) > 0) return false;

  const imageResponse = await fetch(botVisualUrl());
  if (!imageResponse.ok) throw new Error(`BOT_VISUAL_HTTP_${imageResponse.status}`);
  const imageBytes = await imageResponse.arrayBuffer();
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.append('avatar', new Blob([imageBytes], { type: 'image/jpeg' }), 'alx-oracle.jpg');

  const response = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.description || `setMyProfilePhoto failed (${response.status})`);
  return true;
}

async function configureBot(req, chatId) {
  if (!botProfilePromise) {
    botProfilePromise = Promise.allSettled([
      ensureWebhook(req),
      telegramApi('setMyName', { name: 'ALX Oracle' }),
      telegramApi('setMyCommands', {
        commands: [
          { command: 'start', description: 'Главная и запуск Оракула' },
          { command: 'pro', description: 'Возможности ALX PRO' },
          { command: 'help', description: 'Как пользоваться Оракулом' },
          { command: 'paysupport', description: 'Оплата и поддержка' },
          { command: 'terms', description: 'Условия использования' },
        ],
      }),
      telegramApi('setMyDescription', {
        description: 'ALX Oracle — персональный Оракул авторских миксов. Подбор по настроению, история, избранное, сценарии и закрытые коллекции ALX PRO. 18+.',
      }),
      telegramApi('setMyShortDescription', {
        short_description: 'Персональный Оракул авторских миксов ALX · 18+',
      }),
      telegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: 'Открыть Oracle',
          web_app: { url: miniAppUrl() },
        },
      }),
      setBotProfilePhotoIfMissing(),
    ]).catch((error) => {
      botProfilePromise = null;
      throw error;
    });
  }

  await botProfilePromise;

  if (chatId) {
    await telegramApi('setChatMenuButton', {
      chat_id: chatId,
      menu_button: {
        type: 'web_app',
        text: 'Открыть Oracle',
        web_app: { url: miniAppUrl() },
      },
    }).catch((error) => console.warn('[ALX Bot menu button]', error));
  }
}

function welcomeCaption(user = {}) {
  const name = escapeHtml(user.first_name || user.username || '');
  const greeting = name ? `, ${name}` : '';
  const price = getPriceStars();
  return [
    `<b>ALX ORACLE</b>${greeting}`,
    '<i>Твой персональный Оракул вкуса.</i>',
    '',
    'Подбирай сочетания под настроение и ситуацию, сохраняй любимое и постепенно формируй собственный вкусовой профиль.',
    '',
    '✦ персональные рекомендации',
    '✦ история и избранное',
    '✦ Daily Oracle',
    '✦ сценарии и достижения',
    '✦ закрытые коллекции ALX PRO',
    '',
    `<b>ALX PRO · ${price} ⭐ / 30 дней</b>`,
    'Внутри Telegram цифровой PRO оформляется через Telegram Stars.',
    '',
    '<i>18+ · ALX Oracle не продаёт табачную продукцию.</i>',
  ].join('\n');
}

async function sendWelcome(chatId, user = {}) {
  const payload = {
    chat_id: chatId,
    photo: botVisualUrl(),
    caption: welcomeCaption(user),
    parse_mode: 'HTML',
    reply_markup: launchKeyboard(),
  };

  try {
    await telegramApi('sendPhoto', payload);
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
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>✦ ALX PRO</b>',
      '<i>Глубже Оракула — больше контроля над подбором.</i>',
      '',
      '◆ <b>ALX Signature</b> — отбор самых сильных авторских сочетаний',
      '◆ <b>Для двоих</b> — мягкие вечерние сценарии',
      '◆ <b>После полуночи</b> — более насыщенные подборки',
      '◆ <b>Эксперимент</b> — смелые и нестандартные сочетания',
      '◆ новые PRO-функции по мере развития проекта',
      '',
      `<b>${price} ⭐ / 30 дней</b>`,
      'Цифровой доступ внутри Telegram оплачивается через Telegram Stars.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: `Открыть PRO · ${price} ⭐`, web_app: { url: miniAppUrl() } }],
        [{ text: '🛟 Вопрос по оплате', callback_data: 'alx_pay_support' }],
      ],
    },
  });
}

async function sendHelp(chatId) {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>Как работает ALX Oracle</b>',
      '',
      '1. Открой Оракул кнопкой ниже.',
      '2. Встряхни телефон или коснись шара.',
      '3. Получи сочетание и оцени его — Оракул постепенно запоминает твой вкус.',
      '4. Сохраняй удачные варианты в избранное и используй сценарии под ситуацию.',
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
      'ALX Pay — официальный внешний ресурс проекта. Там можно узнать об оплате картой или СБП, войти через Telegram и проверить уже оформленный внешний доступ ALX PRO.',
      '',
      'Если нужна диагностика уже совершённой покупки, используй Support Center. Если хочешь перейти на сам ресурс ALX Pay — нажми соответствующую кнопку ниже.',
      '',
      'Никогда не отправляй номер карты, CVC, пароль, SMS-код или код подтверждения.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Открыть ALX Pay', url: ALX_PAY_URL }],
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

async function handleMessage(req, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = String(message.text || '').trim();
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    await configureBot(req, chatId);
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