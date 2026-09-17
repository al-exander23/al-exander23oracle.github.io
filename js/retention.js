// retention.js — daily habit + opt-in reminder + share layer for ALX Oracle.
// Kept separate from the orb/scene lifecycle so retention UX cannot break mixing.

import { getVisitStats } from './daily.js?v=1.10.0';

const VERSION = '1.20.0-retention';
const API_BASE = 'https://alx-pay.alxoracle.workers.dev';
const BOT_LINK = 'https://t.me/Orcmix_bot?startapp=share';
const STRIP_ID = 'alxRetentionStrip';
const REMINDER_ID = 'alxDailyReminderCard';
const DEFAULT_HOUR = 19;

let reminderCache = null;
let reminderBusy = false;

function tg() {
  return window.Telegram?.WebApp || null;
}

function initData() {
  return String(tg()?.initData || '').trim();
}

function isTelegram() {
  if (initData()) return true;
  const platform = String(tg()?.platform || '').trim().toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

function dayWord(count) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function ensureStrip() {
  let strip = document.getElementById(STRIP_ID);
  if (strip) return strip;

  strip = document.createElement('div');
  strip.id = STRIP_ID;
  strip.className = 'retention-strip';
  strip.innerHTML = `
    <button class="retention-pill retention-pill--daily" id="alxDailyOpen" type="button">
      <span class="retention-pill-icon">✦</span>
      <span><b>Микс дня</b><small>новый выбор сегодня</small></span>
    </button>
    <button class="retention-pill retention-pill--streak" id="alxStreakOpen" type="button">
      <span class="retention-pill-icon">🔥</span>
      <span><b id="alxStreakValue">0 дней</b><small>серия с Оракулом</small></span>
    </button>`;

  const proBanner = document.getElementById('alxProMainBanner');
  const hint = document.getElementById('hint');
  if (proBanner) proBanner.insertAdjacentElement('afterend', strip);
  else if (hint) hint.insertAdjacentElement('afterend', strip);
  else document.getElementById('stage')?.appendChild(strip);

  strip.querySelector('#alxDailyOpen')?.addEventListener('click', openDailyInProfile);
  strip.querySelector('#alxStreakOpen')?.addEventListener('click', openStreakInProfile);
  renderStreak();
  return strip;
}

function renderStreak() {
  const stats = getVisitStats();
  const current = Number(stats.currentStreak || 0);
  const el = document.getElementById('alxStreakValue');
  if (el) el.textContent = `${current} ${dayWord(current)}`;
}

function openProfileAndScroll(selector) {
  document.getElementById('tasteBtnTop')?.click();
  setTimeout(() => {
    const target = document.querySelector(selector);
    try { target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (error) { target?.scrollIntoView(); }
  }, 180);
}

function openDailyInProfile() {
  openProfileAndScroll('.taste-daily-card');
}

function openStreakInProfile() {
  openProfileAndScroll('.taste-rewards-section');
}

function extractMixFromCard(card) {
  if (!card) return null;
  const name = card.querySelector('.mix-card-title, .taste-daily-name')?.textContent?.trim();
  if (!name) return null;

  let recipe = '';
  const recipeNode = card.querySelector('.taste-daily-recipe');
  if (recipeNode?.textContent?.trim()) {
    recipe = recipeNode.textContent.trim();
  } else {
    recipe = [...card.querySelectorAll('.recipe-chip')]
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(' · ');
  }
  return { name, recipe };
}

function shareMixCard(card, source = 'oracle') {
  const mix = extractMixFromCard(card);
  if (!mix) return;

  const text = `🔮 ALX Oracle подсказал микс «${mix.name}»${mix.recipe ? `\n${mix.recipe}` : ''}\n\nПопробуй спросить Оракула:`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(BOT_LINK)}&text=${encodeURIComponent(text)}`;

  if (isTelegram() && typeof tg()?.openTelegramLink === 'function') {
    try {
      tg().openTelegramLink(telegramShareUrl);
      return;
    } catch (error) { /* browser fallback below */ }
  }

  if (navigator.share) {
    navigator.share({ title: `ALX Oracle · ${mix.name}`, text, url: BOT_LINK }).catch(() => {});
    return;
  }

  const fallback = `${text}\n${BOT_LINK}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(fallback).then(() => toast('Микс и ссылка скопированы'));
  } else {
    window.open(telegramShareUrl, '_blank', 'noopener,noreferrer');
  }
}

function toast(text) {
  let el = document.getElementById('retentionToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'retentionToast';
    el.className = 'retention-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(window.__alxRetentionToastTimer);
  window.__alxRetentionToastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

async function retentionPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors',
    credentials: 'omit',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

async function loadReminderStatus(force = false) {
  if (!initData()) return null;
  if (reminderCache && !force) return reminderCache;
  const data = await retentionPost('/api/retention/reminder/status', { initData: initData() });
  reminderCache = data.reminder || null;
  return reminderCache;
}

async function saveReminder(enabled, localHour) {
  if (!initData()) throw new Error('Открой ALX Oracle внутри Telegram.');
  const data = await retentionPost('/api/retention/reminder/set', {
    initData: initData(),
    enabled: Boolean(enabled),
    localHour: Number(localHour),
    timezoneOffsetMin: new Date().getTimezoneOffset(),
  });
  reminderCache = data.reminder || null;
  return reminderCache;
}

function timeOptions(selected = DEFAULT_HOUR) {
  return [17, 18, 19, 20, 21, 22]
    .map((hour) => `<option value="${hour}"${Number(selected) === hour ? ' selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`)
    .join('');
}

function reminderCardHtml(state = null) {
  const telegram = isTelegram();
  const enabled = Boolean(state?.enabled);
  const hour = Number.isFinite(Number(state?.localHour)) ? Number(state.localHour) : DEFAULT_HOUR;

  if (!telegram) {
    return `
      <div class="retention-reminder-copy">
        <div class="retention-reminder-icon">🔔</div>
        <div><b>Напоминание о Миксе дня</b><span>Доступно внутри Telegram — бот мягко напомнит о новом выборе один раз в день.</span></div>
      </div>
      <div class="retention-reminder-note">Открой ALX Oracle через Telegram, чтобы включить.</div>`;
  }

  return `
    <div class="retention-reminder-copy">
      <div class="retention-reminder-icon">🔔</div>
      <div><b>Напоминать о Миксе дня</b><span>Одно сообщение в день. Можно отключить в любой момент.</span></div>
    </div>
    <div class="retention-reminder-controls">
      <label class="retention-switch">
        <input id="alxReminderToggle" type="checkbox" ${enabled ? 'checked' : ''}>
        <span></span>
      </label>
      <select id="alxReminderHour" ${enabled ? '' : 'disabled'}>${timeOptions(hour)}</select>
    </div>
    <div class="retention-reminder-note" id="alxReminderNote">${enabled ? `Включено · каждый день около ${String(hour).padStart(2, '0')}:00` : 'Сейчас выключено'}</div>`;
}

async function injectReminderCard() {
  const daily = document.querySelector('#tasteContent .taste-daily-card');
  if (!daily || document.getElementById(REMINDER_ID)) return;

  const card = document.createElement('div');
  card.id = REMINDER_ID;
  card.className = 'retention-reminder-card';
  card.innerHTML = reminderCardHtml(reminderCache);
  daily.insertAdjacentElement('afterend', card);

  if (!isTelegram()) return;

  try {
    const state = await loadReminderStatus();
    if (!card.isConnected) return;
    card.innerHTML = reminderCardHtml(state);
    wireReminderControls(card);
  } catch (error) {
    if (!card.isConnected) return;
    card.innerHTML = reminderCardHtml({ enabled: false, localHour: DEFAULT_HOUR });
    wireReminderControls(card);
    const note = card.querySelector('#alxReminderNote');
    if (note) note.textContent = 'Не удалось проверить настройку. Попробуй ещё раз.';
  }
}

function wireReminderControls(card) {
  const toggle = card.querySelector('#alxReminderToggle');
  const select = card.querySelector('#alxReminderHour');
  const note = card.querySelector('#alxReminderNote');
  if (!toggle || !select || !note) return;

  const save = async () => {
    if (reminderBusy) return;
    reminderBusy = true;
    toggle.disabled = true;
    select.disabled = true;
    note.textContent = 'Сохраняю…';
    try {
      const state = await saveReminder(toggle.checked, Number(select.value));
      toggle.checked = Boolean(state?.enabled);
      select.value = String(state?.localHour ?? DEFAULT_HOUR);
      note.textContent = state?.enabled
        ? `Включено · каждый день около ${String(state.localHour).padStart(2, '0')}:00`
        : 'Сейчас выключено';
      toast(state?.enabled ? 'Напоминание включено 🔔' : 'Напоминание выключено');
    } catch (error) {
      note.textContent = error?.message || 'Не удалось сохранить настройку.';
      toggle.checked = Boolean(reminderCache?.enabled);
    } finally {
      reminderBusy = false;
      toggle.disabled = false;
      select.disabled = !toggle.checked;
    }
  };

  toggle.addEventListener('change', () => {
    select.disabled = !toggle.checked;
    save();
  });
  select.addEventListener('change', save);
}

function injectDailyShare() {
  const actions = document.querySelector('#tasteContent .taste-daily-actions');
  const daily = document.querySelector('#tasteContent .taste-daily-card');
  if (!actions || !daily || actions.querySelector('.retention-daily-share')) return;

  const button = document.createElement('button');
  button.className = 'taste-daily-action retention-daily-share';
  button.type = 'button';
  button.textContent = '↗ Поделиться';
  button.addEventListener('click', () => shareMixCard(daily, 'daily'));
  actions.appendChild(button);
}

function observeTasteProfile() {
  const content = document.getElementById('tasteContent');
  if (!content) return;

  const sync = () => {
    if (!document.querySelector('#tasteOverlay.show')) return;
    injectDailyShare();
    injectReminderCard();
    renderStreak();
  };

  new MutationObserver(sync).observe(content, { childList: true, subtree: true });
  document.getElementById('tasteBtnTop')?.addEventListener('click', () => setTimeout(sync, 80));
}

function upgradeMainShare() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.share-btn') : null;
    if (!target) return;
    const card = target.closest('.mix-card');
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    shareMixCard(card, 'oracle');
  }, true);
}

function init() {
  ensureStrip();
  observeTasteProfile();
  upgradeMainShare();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderStreak();
      ensureStrip();
    }
  });
}

init();
