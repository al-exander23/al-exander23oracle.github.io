const accountTitle = document.getElementById('accountTitle');
const accountText = document.getElementById('accountText');
const loginLink = document.getElementById('loginLink');
const checkAccess = document.getElementById('checkAccess');
const accessResult = document.getElementById('accessResult');

let session = null;
let checking = false;

function setResult(text = '', type = '') {
  accessResult.textContent = text;
  accessResult.className = `result${type ? ` ${type}` : ''}`;
}

async function api(path) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function renderSession() {
  const active = Boolean(session?.user?.id);
  checkAccess.disabled = !active || checking;
  loginLink.classList.toggle('hidden', active);

  if (!active) {
    accountTitle.textContent = 'Telegram не подтверждён';
    accountText.textContent = 'Чтобы проверить внешний ALX PRO, войди тем же Telegram-аккаунтом, который использовался при покупке на ALX Pay.';
    return;
  }

  const label = session.user.username ? `@${session.user.username}` : session.user.name || 'Telegram';
  accountTitle.textContent = `Подтверждён: ${label}`;
  accountText.textContent = 'Проверка будет выполнена только для этого Telegram-аккаунта. Платёжные данные не запрашиваются.';
}

async function loadSession() {
  try {
    const data = await api('/api/session');
    session = data.session || null;
  } catch (error) {
    session = null;
  }
  renderSession();
}

checkAccess.addEventListener('click', async () => {
  if (checking || !session?.user?.id) return;
  checking = true;
  renderSession();
  setResult('Проверяем entitlement ALX PRO…');

  try {
    const data = await api('/api/payment/status');
    const entitlement = data.entitlement || {};
    if (entitlement.active) {
      const expires = Number(entitlement.expiresAt)
        ? new Date(Number(entitlement.expiresAt)).toLocaleDateString('ru-RU')
        : null;
      setResult(`ALX PRO активен${expires ? ` до ${expires}` : ''}. Открой Oracle заново — доступ должен восстановиться автоматически.`, 'ok');
    } else {
      setResult('Активный внешний ALX PRO для этого Telegram-аккаунта не найден. Проверь, что вошёл тем же аккаунтом, который использовался при покупке.', 'error');
    }
  } catch (error) {
    setResult(error.message || 'Не удалось проверить ALX PRO. Попробуй ещё раз.', 'error');
  } finally {
    checking = false;
    renderSession();
  }
});

loadSession();
