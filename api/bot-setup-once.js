const { telegramApi } = require('../server/telegram.js');

const BOT_VISUAL_URL = 'https://al-exander23oracle-github-io.vercel.app/api/bot-visual';
const MINI_APP_URL = 'https://al-exander23.github.io/al-exander23oracle.github.io/';

async function setProfilePhoto() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const imageResponse = await fetch(BOT_VISUAL_URL);
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  try {
    const results = await Promise.allSettled([
      telegramApi('setMyName', { name: 'ALX Oracle' }),
      telegramApi('setMyDescription', {
        description: 'ALX Oracle — персональный Оракул авторских миксов. Подбор по настроению, история, избранное, сценарии и закрытые коллекции ALX PRO. 18+.',
      }),
      telegramApi('setMyShortDescription', {
        short_description: 'Персональный Оракул авторских миксов ALX · 18+',
      }),
      telegramApi('setMyCommands', {
        commands: [
          { command: 'start', description: 'Главная и запуск Оракула' },
          { command: 'pro', description: 'Возможности ALX PRO' },
          { command: 'help', description: 'Как пользоваться Оракулом' },
          { command: 'paysupport', description: 'Оплата и поддержка' },
          { command: 'terms', description: 'Условия использования' },
        ],
      }),
      telegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: 'Открыть Oracle',
          web_app: { url: MINI_APP_URL },
        },
      }),
      setProfilePhoto(),
    ]);

    const failed = results.filter((item) => item.status === 'rejected').map((item) => String(item.reason?.message || item.reason));
    res.status(failed.length ? 500 : 200).json({ ok: failed.length === 0, configured: results.length - failed.length, failed });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || 'Setup failed' });
  }
};