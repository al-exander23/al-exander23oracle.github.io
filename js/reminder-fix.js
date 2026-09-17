// reminder-fix.js — delivery test + schedule visibility for ALX Oracle reminders.
// Loaded after retention.js and does not touch the orb lifecycle.

const API_BASE = 'https://alx-pay.alxoracle.workers.dev';
const VERSION = '1.20.1-reminder-fix';
let busy = false;

function tg() {
  return window.Telegram?.WebApp || null;
}

function initData() {
  return String(tg()?.initData || '').trim();
}

async function post(path, payload = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors',
    credentials: 'omit',
    body: JSON.stringify({ initData: initData(), ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function formatNext(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  try {
    const date = new Date(value);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const prefix = key(date) === key(today) ? 'сегодня' : key(date) === key(tomorrow) ? 'завтра' : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    return `${prefix} в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    return '';
  }
}

function ensureStyle() {
  if (document.getElementById('alxReminderFixStyle')) return;
  const style = document.createElement('style');
  style.id = 'alxReminderFixStyle';
  style.textContent = `
    .retention-test-row{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
    .retention-test-btn{appearance:none;border:1px solid rgba(217,184,120,.26);background:rgba(217,184,120,.07);color:#efd9ac;border-radius:11px;padding:8px 11px;font:600 9px/1.2 'Inter',sans-serif;cursor:pointer}
    .retention-test-btn:disabled{opacity:.45;cursor:default}
    .retention-next-send{color:#b8a98f;font:500 8.4px/1.4 'Inter',sans-serif}
    .retention-test-result{margin-top:7px;color:#9d93a5;font:500 8.4px/1.45 'Inter',sans-serif}
    .retention-test-result.ok{color:#cbb982}.retention-test-result.error{color:#d7a6a6}
  `;
  document.head.appendChild(style);
}

function ensureExtras(card) {
  if (!card || card.querySelector('#alxReminderTest')) return;
  const wrap = document.createElement('div');
  wrap.className = 'retention-test-row';
  wrap.innerHTML = `
    <button class="retention-test-btn" id="alxReminderTest" type="button">Отправить тест сейчас</button>
    <span class="retention-next-send" id="alxReminderNext"></span>
  `;
  const result = document.createElement('div');
  result.className = 'retention-test-result';
  result.id = 'alxReminderTestResult';
  card.appendChild(wrap);
  card.appendChild(result);

  card.querySelector('#alxReminderTest')?.addEventListener('click', async () => {
    if (busy) return;
    const button = card.querySelector('#alxReminderTest');
    const output = card.querySelector('#alxReminderTestResult');
    busy = true;
    button.disabled = true;
    button.textContent = 'Отправляю…';
    output.className = 'retention-test-result';
    output.textContent = 'Проверяю Mini App → Worker → Telegram Bot → твой чат…';
    try {
      await post('/api/retention/reminder/test');
      output.className = 'retention-test-result ok';
      output.textContent = 'Тест отправлен ✓ Проверь чат с @Orcmix_bot.';
    } catch (error) {
      output.className = 'retention-test-result error';
      output.textContent = error?.message || 'Тестовое сообщение не доставлено.';
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = 'Отправить тест сейчас';
    }
  });
}

async function refreshStatus(card, repairSchedule = false) {
  if (!initData() || !card?.isConnected) return;
  try {
    let data = await post('/api/retention/reminder/status');
    let reminder = data.reminder || {};

    // One-time reconciliation after the timing bug fix: an enabled reminder is
    // re-saved through the corrected nextSendAt() calculation.
    if (repairSchedule && reminder.enabled) {
      data = await post('/api/retention/reminder/set', {
        enabled: true,
        localHour: Number(reminder.localHour ?? 19),
        timezoneOffsetMin: new Date().getTimezoneOffset(),
      });
      reminder = data.reminder || reminder;
    }

    const next = card.querySelector('#alxReminderNext');
    if (next) next.textContent = reminder.enabled && reminder.nextSendAt
      ? `Следующее: ${formatNext(reminder.nextSendAt)}`
      : 'Расписание выключено';
  } catch (error) {
    const next = card.querySelector('#alxReminderNext');
    if (next) next.textContent = 'Не удалось прочитать расписание';
  }
}

function attach() {
  const card = document.getElementById('alxDailyReminderCard');
  if (!card) return false;
  ensureExtras(card);
  if (card.dataset.reminderFixReady !== VERSION) {
    card.dataset.reminderFixReady = VERSION;
    refreshStatus(card, true);
  } else {
    refreshStatus(card, false);
  }
  return true;
}

function init() {
  ensureStyle();
  if (!attach()) {
    const observer = new MutationObserver(() => attach());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.id === 'tasteBtnTop' || target.id === 'alxDailyOpen') setTimeout(() => attach(), 180);
  });
}

init();
