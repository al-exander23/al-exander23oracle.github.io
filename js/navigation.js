// navigation.js — Navigation Cleanup for ALX Oracle.
// Keeps existing feature buttons as hidden action sources while exposing a
// clear four-section bottom navigation with readable labels.

import { getProState } from './pro.js?v=1.33.0-payment-audit';
import { trackAnalytics } from './analytics.js?v=1.34.0-funnel-analytics';

const VERSION = '1.30.0-community-mvp';
const NAV_ID = 'alxBottomNav';
const ACCESS_ID = 'alxAccessStrip';
const FREE_LIMIT = 5;
const USAGE_KEY = 'alx_oracle_free_daily_usage_v1';

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function freeState() {
  const today = dayKey();
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    const used = raw?.day === today ? Math.max(0, Math.min(FREE_LIMIT, Number(raw.used) || 0)) : 0;
    return { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
  } catch (error) {
    return { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT };
  }
}

function setTextIfChanged(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setHtmlIfChanged(node, value) {
  if (node && node.innerHTML !== value) node.innerHTML = value;
}

function setActive(tab) {
  document.querySelectorAll(`#${NAV_ID} .alx-bottom-nav-btn`).forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function clickExisting(id) {
  const target = document.getElementById(id);
  if (!target) return false;
  target.click();
  return true;
}

function closeKnownPanels() {
  ['myAlxClose', 'tasteClose', 'sheetClose', 'proClose'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) {
      try { button.click(); } catch (error) { /* non-fatal */ }
    }
  });
  document.getElementById('alxOnboarding')?.classList.remove('show');
}

function goHome() {
  closeKnownPanels();
  setActive('home');
  trackAnalytics('nav_home_open', { navigationVersion: VERSION });
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (error) { window.scrollTo(0, 0); }
}

function openFavorites() {
  setActive('favorites');
  trackAnalytics('nav_favorites_open', { navigationVersion: VERSION });
  clickExisting('favBtnTop');
}

function openAccount() {
  setActive('account');
  trackAnalytics('nav_my_alx_open', { navigationVersion: VERSION });
  clickExisting('myAlxTopButton');
  setTimeout(enhanceMyAlx, 80);
}

function openPro() {
  setActive('pro');
  trackAnalytics('nav_pro_open', { navigationVersion: VERSION });
  clickExisting('alxProTopButton');
}

function ensureBottomNav() {
  let nav = document.getElementById(NAV_ID);
  if (nav) return nav;

  nav = document.createElement('nav');
  nav.id = NAV_ID;
  nav.className = 'alx-bottom-nav';
  nav.setAttribute('aria-label', 'Основная навигация');
  nav.innerHTML = `
    <button class="alx-bottom-nav-btn active" type="button" data-tab="home" aria-current="page">
      <span class="alx-bottom-nav-label">Главная</span>
    </button>
    <button class="alx-bottom-nav-btn" type="button" data-tab="favorites" aria-current="false">
      <span class="alx-bottom-nav-label">Избранное</span>
    </button>
    <button class="alx-bottom-nav-btn" type="button" data-tab="account" aria-current="false">
      <span class="alx-bottom-nav-label">Мой ALX</span>
    </button>
    <button class="alx-bottom-nav-btn alx-bottom-nav-btn--pro" type="button" data-tab="pro" aria-current="false">
      <span class="alx-bottom-nav-label">PRO</span>
      <span class="alx-bottom-nav-dot" aria-hidden="true"></span>
    </button>`;
  document.body.appendChild(nav);

  nav.querySelector('[data-tab="home"]')?.addEventListener('click', goHome);
  nav.querySelector('[data-tab="favorites"]')?.addEventListener('click', openFavorites);
  nav.querySelector('[data-tab="account"]')?.addEventListener('click', openAccount);
  nav.querySelector('[data-tab="pro"]')?.addEventListener('click', openPro);
  return nav;
}

function ensureAccessStrip() {
  let strip = document.getElementById(ACCESS_ID);
  if (strip) return strip;

  strip = document.createElement('button');
  strip.id = ACCESS_ID;
  strip.className = 'alx-access-strip';
  strip.type = 'button';
  strip.addEventListener('click', () => {
    if (getProState().active) openAccount();
    else openPro();
  });

  const retention = document.getElementById('alxRetentionStrip');
  const hint = document.getElementById('hint');
  if (retention) retention.insertAdjacentElement('afterend', strip);
  else if (hint) hint.insertAdjacentElement('afterend', strip);
  else document.getElementById('stage')?.appendChild(strip);
  return strip;
}

function renderAccess() {
  const strip = ensureAccessStrip();
  const state = getProState();
  const free = freeState();
  const proButton = document.querySelector(`#${NAV_ID} [data-tab="pro"]`);
  proButton?.classList.toggle('is-active-plan', state.active);

  if (state.active) {
    strip.classList.add('is-pro');
    setHtmlIfChanged(strip, `
      <span><b>ALX PRO активен</b><small>Безлимит, PRO-направления и Community</small></span>
      <strong>Мой ALX</strong>`);
    return;
  }

  strip.classList.remove('is-pro');
  const main = free.remaining > 0
    ? `FREE · осталось ${free.remaining} из ${free.limit} сегодня`
    : 'FREE · лимит на сегодня использован';
  setHtmlIfChanged(strip, `
    <span><b>${main}</b><small>Бесплатные подборы обновятся завтра</small></span>
    <strong>Что даёт PRO</strong>`);
}

function closeAccountThen(callback) {
  document.getElementById('myAlxClose')?.click();
  setTimeout(callback, 90);
}

function openTaste(selector = null) {
  closeAccountThen(() => {
    clickExisting('tasteBtnTop');
    if (!selector) return;
    setTimeout(() => {
      const target = document.querySelector(selector);
      try { target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (error) { target?.scrollIntoView(); }
    }, 220);
  });
}

function addAccountRow(section, id, title, note, handler) {
  if (!section || document.getElementById(id)) return;
  const button = document.createElement('button');
  button.className = 'my-alx-row';
  button.id = id;
  button.type = 'button';
  button.innerHTML = `<span>${title}</span><small>${note}</small>`;
  button.addEventListener('click', handler);
  section.appendChild(button);
}

function enhanceMyAlx() {
  const content = document.getElementById('myAlxContent');
  if (!content || !content.children.length) return;

  const close = document.getElementById('myAlxClose');
  if (close) {
    setTextIfChanged(close, 'Закрыть');
    if (close.getAttribute('aria-label') !== 'Закрыть Мой ALX') close.setAttribute('aria-label', 'Закрыть Мой ALX');
  }

  setTextIfChanged(content.querySelector('#myAlxTaste span'), 'Профиль вкуса');
  setTextIfChanged(content.querySelector('#myAlxRestore span'), 'Восстановить PRO');
  setTextIfChanged(content.querySelector('#myAlxProDetails span'), 'Возможности ALX PRO');
  setTextIfChanged(content.querySelector('#myAlxProDetails small'), '7 PRO-направлений, Community и безлимит');

  const state = getProState();
  const statusText = content.querySelector('.my-alx-status p');
  setTextIfChanged(
    statusText,
    state.active
      ? 'Безлимит, 7 PRO-направлений и Community Mixes: публикуй свои рецепты, получай оценки и рейтинг.'
      : 'PRO снимает дневной лимит, открывает 7 направлений Оракула и Community Mixes.'
  );

  const section = content.querySelector('.my-alx-section');
  setTextIfChanged(section?.querySelector('.my-alx-section-title'), 'Разделы и настройки');

  addAccountRow(section, 'myAlxHistory', 'История миксов', 'последние подборы Оракула', () => {
    closeAccountThen(() => {
      setActive('account');
      clickExisting('historyBtnTop');
      trackAnalytics('nav_history_open', { navigationVersion: VERSION, source: 'my_alx' });
    });
  });

  addAccountRow(section, 'myAlxNotifications', 'Уведомления', 'напоминание о Миксе дня и время отправки', () => {
    trackAnalytics('nav_notifications_open', { navigationVersion: VERSION, source: 'my_alx' });
    openTaste('#alxDailyReminderCard');
  });

  addAccountRow(section, 'myAlxAchievements', 'Микс дня и достижения', 'серия посещений, награды и персональный выбор', () => {
    trackAnalytics('nav_achievements_open', { navigationVersion: VERSION, source: 'my_alx' });
    openTaste('.taste-daily-card');
  });

  addAccountRow(section, 'myAlxHelp', 'Как пользоваться ALX Oracle', 'что такое Оракул, FREE/PRO и как выбирать направления', () => {
    closeAccountThen(() => {
      setActive('home');
      clickExisting('onboardingHelpBtn');
      trackAnalytics('nav_help_open', { navigationVersion: VERSION, source: 'my_alx' });
    });
  });
}

function observeAccount() {
  const attach = () => {
    const content = document.getElementById('myAlxContent');
    if (!content || content.dataset.navObserved === '1') return false;
    content.dataset.navObserved = '1';
    new MutationObserver(() => enhanceMyAlx()).observe(content, { childList: true, subtree: true });
    enhanceMyAlx();
    return true;
  };

  if (attach()) return;
  const bodyObserver = new MutationObserver(() => {
    if (attach()) bodyObserver.disconnect();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function simplifyDailyStrip() {
  const streak = document.querySelector('.retention-pill--streak');
  if (streak && streak.getAttribute('aria-hidden') !== 'true') streak.setAttribute('aria-hidden', 'true');
  const dailySmall = document.querySelector('.retention-pill--daily small');
  setTextIfChanged(dailySmall, 'Открыть сегодняшний персональный выбор');
}

function wireState() {
  window.addEventListener('alx-free-usage-change', renderAccess);
  window.addEventListener('alx-pro-change', () => {
    renderAccess();
    setTimeout(enhanceMyAlx, 0);
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target) return;
    if (target.id === 'sheetClose' || target.id === 'tasteClose' || target.id === 'myAlxClose' || target.id === 'proClose') {
      setTimeout(() => setActive('home'), 60);
    }
  }, true);

  const counter = document.getElementById('counter');
  if (counter) {
    new MutationObserver(() => renderAccess()).observe(counter, { childList: true, characterData: true, subtree: true });
  }
}

function init() {
  ensureBottomNav();
  ensureAccessStrip();
  renderAccess();
  observeAccount();
  wireState();
  simplifyDailyStrip();
}

init();
