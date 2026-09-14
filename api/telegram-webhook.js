// Telegram webhook for ALX Oracle + ALX PRO Stars.
// Handles the bot welcome flow and answers pre_checkout_query within Telegram's deadline.

const {
  getPriceStars,
  telegramApi,
  parseProPayload,
  verifyWebhookRequest,
  ensureWebhook,
} = require('../server/telegram.js');

const DEFAULT_MINI_APP_URL = 'https://al-exander23.github.io/al-exander23oracle.github.io/';
let botProfilePromise = null;

function miniAppUrl() {
  const configured = String(process.env.ALX_MINI_APP_URL || '').trim();
  return /^https:\/\//i.test(configured) ? configured : DEFAULT_MINI_APP_URL;
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
        { text: '⭐ Что даёт ALX PRO', callback_data: 'alx_pro_info' },
        { text: '❓ Помощь', callback_data: 'alx_help' },
      ],
      [{ text: '🛟 Поддержка оплаты', callback_data: 'alx_pay_support' }],
    ],
  };
}

async function configureBot(req, chatId) {
  if (!botProfilePromise) {
    botProfilePromise = Promise.allSettled([
      ensureWebhook(req),
      telegramApi('setMyCommands', {
        commands: [
          { command: 'start', description: 'Открыть ALX Oracle' },
          { command: 'pro', description: 'Что входит в ALX PRO' },
          { command: 'help', description: 'Помощь по Оракулу' },
          { command: 'paysupport', description: 'Поддержка по оплате' },
        ],
      }),
      telegramApi('setMyDescription', {
        description: 'ALX Oracle — персональный Оракул вкуса. Подбирай миксы под настроение, сохраняй любимое и открывай закрытые коллекции ALX PRO.',
      }),
      telegramApi('setMyShortDescription', {
        short_description: 'Персональный Оракул вкуса и авторских миксов ALX.',
      }),
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

async function sendWelcome(chatId, user = {}) {
  const name = escapeHtml(user.first_name || user.username || '');
  const greeting = name ? `, ${name}` : '';
  const price = getPriceStars();

  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: [
      `<b>ALX ORACLE</b>${greeting}`,
      '',
      'Твой персональный Оракул вкуса.',
      'Он подбирает миксы под настроение и ситуацию, запоминает предпочтения и помогает находить новые сочетания.',
      '',
      '✦ персональные рекомендации',
      '✦ история и избранное',
      '✦ Daily Oracle',
      '✦ сценарии и достижения',
      '✦ закрытые коллекции ALX PRO',
      '',
      `<b>ALX PRO · ${price} ⭐ / 30 дней</b>`,
      'Расширенные коллекции, сценарии и новые PRO-возможности открываются прямо внутри Telegram.',
      '',
      'Нажми кнопку ниже — Оракул уже готов.',
    ].join('\n'),
    reply_markup: launchKeyboard(),
  });
}

async function sendProInfo(chatId) {
  const price = getPriceStars();
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>ALX PRO</b>',
      '',
      'PRO открывает закрытые авторские коллекции и расширенные сценарии Оракула:',
      '',
      '◆ ALX Signature',
      '◆ «Для двоих»',
      '◆ «После полуночи»',
      '◆ экспериментальные подборки',
      '◆ новые PRO-функции по мере развития проекта',
      '',
      `<b>${price} ⭐ / 30 дней</b>`,
      'Оплата цифрового доступа внутри Telegram проходит через Telegram Stars.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{ text: '🔮 Открыть ALX Oracle', web_app: { url: miniAppUrl() } }]],
    },
  });
}

async function sendHelp(chatId) {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '<b>Помощь ALX Oracle</b>',
      '',
      '🔮 /start — главная и запуск Оракула',
      '⭐ /pro — возможности ALX PRO',
      '🛟 /paysupport — вопросы по оплате',
      '',
      'Если Mini App уже открыт, встряхни телефон или коснись шара, чтобы получить новый микс.',
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
    text: [
      '<b>Поддержка по оплате</b>',
      '',
      'Если Stars списались, а PRO не открылся:',
      '1. Полностью закрой ALX Oracle.',
      '2. Открой Mini App заново из этого бота.',
      '3. Проверь карточку ALX PRO — доступ восстанавливается по подтверждённой Telegram-транзакции.',
      '',
      'Если проблема осталась, сохрани скриншот оплаты и время операции. Не отправляй номер банковской карты, CVC, пароли или коды подтверждения.',
      '',
      'Контакт для ручной поддержки будет добавлен отдельно.',
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
