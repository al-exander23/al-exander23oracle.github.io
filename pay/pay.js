const priceEl = document.getElementById('price');
const authPanel = document.getElementById('authPanel');
const paymentPanel = document.getElementById('paymentPanel');
const loginBtn = document.getElementById('telegramLogin');
const authStatus = document.getElementById('authStatus');
const paymentStatus = document.getElementById('paymentStatus');
const methodButtons = [...document.querySelectorAll('[data-method]')];

const TELEGRAM_CLIENT_ID = 8910147832;
const TELEGRAM_SDK_SRC = 'https://oauth.telegram.org/js/telegram-login.js?3';

let session = null;
let offer = null;
let busy = false;
let telegramSdkPromise = null;

function setStatus(el, text = '', type = '') {
  el.textContent = text;
  el.className = `status${type ? ` ${type}` : ''}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function loadTelegramSdk() {
  if (window.Telegram?.Login?.auth) return Promise.resolve(window.Telegram);
  if (telegramSdkPromise) return telegramSdkPromise;

  telegramSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-alx-telegram-login]');
    if (existing) {
      existing.addEventListener('load', () => window.Telegram?.Login?.auth ? resolve(window.Telegram) : reject(new Error('Telegram Login SDK недоступен.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Telegram Login SDK.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = TELEGRAM_SDK_SRC;
    script.async = true;
    script.dataset.alxTelegramLogin = '1';
    script.onload = () => window.Telegram?.Login?.auth ? resolve(window.Telegram) : reject(new Error('Telegram Login SDK недоступен.'));
    script.onerror = () => reject(new Error('Не удалось загрузить Telegram Login SDK.'));
    document.head.appendChild(script);
  });
  return telegramSdkPromise;
}

function telegramAuth() {
  return new Promise(async (resolve, reject) => {
    try {
      const Telegram = await loadTelegramSdk();
      Telegram.Login.auth({
        client_id: TELEGRAM_CLIENT_ID,
        scope: ['profile'],
        lang: 'ru',
      }, (result) => {
        if (!result) return reject(new Error('Telegram не вернул результат авторизации.'));
        if (result.error) return reject(new Error(result.error));
        if (!result.id_token) return reject(new Error('Telegram не вернул ID token.'));
        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function renderOffer() {
  if (!offer?.priceRub) {
    priceEl.innerHTML = '— ₽ <span>/ 30 дней</span>';
    return;
  }
  priceEl.innerHTML = `${offer.priceRub} ₽ <span>/ ${offer.periodDays || 30} дней</span>`;
}

function renderSession() {
  const active = Boolean(session?.user?.id);
  paymentPanel.classList.toggle('disabled', !active);
  paymentPanel.setAttribute('aria-disabled', String(!active));
  methodButtons.forEach((button) => { button.disabled = !active || busy || offer?.enabled === false; });

  if (active) {
    const label = session.user.username ? `@${session.user.username}` : session.user.name || 'Telegram';
    loginBtn.textContent = `Telegram: ${label}`;
    loginBtn.disabled = true;
    setStatus(authStatus, 'Аккаунт подтверждён. PRO будет привязан к этому Telegram.', 'ok');
  } else {
    loginBtn.textContent = 'Войти через Telegram';
    loginBtn.disabled = false;
    setStatus(authStatus, '');
  }
}

async function load() {
  try {
    const config = await api('/api/config');
    offer = config.offer;
    renderOffer();
    if (offer?.enabled === false) {
      setStatus(paymentStatus, 'Тестовый платёжный канал ещё не настроен владельцем.', 'error');
    }
  } catch (error) {
    setStatus(paymentStatus, 'Не удалось загрузить настройки оплаты.', 'error');
  }

  try {
    const data = await api('/api/session');
    session = data.session || null;
  } catch (error) {
    session = null;
  }
  renderSession();

  loadTelegramSdk().catch(() => {});

  const params = new URLSearchParams(location.search);
  if (params.get('payment') === 'return') {
    await refreshEntitlement();
    history.replaceState({}, '', location.pathname);
  }
}

async function refreshEntitlement() {
  if (!session?.user?.id) return;
  try {
    const data = await api('/api/payment/status');
    if (data.entitlement?.active) {
      setStatus(paymentStatus, `Оплата подтверждена. ALX PRO активен до ${new Date(data.entitlement.expiresAt).toLocaleDateString('ru-RU')}.`, 'ok');
    } else {
      setStatus(paymentStatus, 'Платёж пока обрабатывается. Если ты уже оплатил, обнови страницу через несколько секунд.');
    }
  } catch (error) {
    setStatus(paymentStatus, error.message, 'error');
  }
}

loginBtn.addEventListener('click', async () => {
  if (busy || session?.user?.id) return;
  busy = true;
  loginBtn.disabled = true;
  setStatus(authStatus, 'Открываем безопасный вход через Telegram…');
  try {
    const result = await telegramAuth();
    const data = await api('/api/auth/telegram-sdk', {
      method: 'POST',
      body: JSON.stringify({ id_token: result.id_token }),
    });
    session = { user: data.user };
    setStatus(authStatus, 'Telegram подтверждён.', 'ok');
  } catch (error) {
    setStatus(authStatus, error.message || 'Не удалось войти через Telegram.', 'error');
  } finally {
    busy = false;
    renderSession();
  }
});

methodButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    if (busy || !session?.user?.id) return;
    busy = true;
    renderSession();
    setStatus(paymentStatus, 'Создаём защищённый платёж…');
    try {
      const data = await api('/api/payment/create', {
        method: 'POST',
        body: JSON.stringify({ method: button.dataset.method }),
      });
      if (!data.confirmationUrl) throw new Error('ЮKassa не вернула ссылку на оплату.');
      location.href = data.confirmationUrl;
    } catch (error) {
      setStatus(paymentStatus, error.message || 'Не удалось создать платёж.', 'error');
      busy = false;
      renderSession();
    }
  });
});

load();
