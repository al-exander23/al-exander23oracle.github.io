// my-alx.js — conversion + personal account layer for ALX Oracle.
// Separate from the orb/scene lifecycle: it only reads existing local state and PRO entitlement.

import {
  getProState,
  getProOffer,
  requestProPaywall,
  syncProEntitlement,
  isTelegramPaymentContext,
} from './pro.js?v=1.33.0-payment-audit';
import { getFavorites, getHistory } from './profile.js';
import { getVisitStats } from './daily.js?v=1.33.0-payment-audit';
import { initMixes, getAllMixes } from './mixes.js?v=1.33.0-payment-audit';
import { trackAnalytics } from './analytics.js?v=1.34.0-funnel-analytics';

const VERSION = '1.21.0-my-alx';
const FREE_LIMIT = 5;
const USAGE_KEY = 'alx_oracle_free_daily_usage_v1';
const TEASER_SEEN_PREFIX = 'alx_pro_teaser_seen_';
const BUTTON_ID = 'myAlxTopButton';
const OVERLAY_ID = 'myAlxOverlay';
const TEASER_ID = 'alxProTeaser';
const EXTERNAL_PRICE_RUB = 299;

function telegramContext() {
  if (isTelegramPaymentContext()) return true;
  const platform = String(window.Telegram?.WebApp?.platform || '').trim().toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function freeUsage() {
  const today = dayKey();
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    const used = raw?.day === today ? Math.max(0, Number(raw.used) || 0) : 0;
    return { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
  } catch (error) {
    return { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT };
  }
}

function formatDate(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return null;
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Number(ms)));
  } catch (error) {
    return new Date(Number(ms)).toLocaleDateString('ru-RU');
  }
}

function sourceLabel(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('telegram') || value.includes('stars')) return 'Telegram Stars';
  if (value.includes('yookassa') || value.includes('external') || value.includes('alx-pay')) return 'ALX Pay';
  return 'ALX PRO';
}

function dayWord(value) {
  const n = Math.abs(Number(value) || 0);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function ensureButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const toolbar = document.getElementById('topToolbar');
  if (!toolbar) return;
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.className = 'icon-btn my-alx-top-btn';
  button.type = 'button';
  button.textContent = 'A';
  button.setAttribute('aria-label', 'Мой ALX');
  button.addEventListener('click', openDashboard);
  toolbar.appendChild(button);
}

function ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'my-alx-overlay';
  overlay.innerHTML = `
    <section class="my-alx-panel" role="dialog" aria-modal="true" aria-labelledby="myAlxTitle">
      <div class="my-alx-head">
        <div><div class="my-alx-kicker">ALX ORACLE</div><h2 id="myAlxTitle">Мой ALX</h2></div>
        <button class="my-alx-close" id="myAlxClose" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div id="myAlxContent"></div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#myAlxClose')?.addEventListener('click', closeDashboard);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDashboard();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeDashboard();
  });
}

function statusCardHtml(state) {
  const offer = getProOffer();
  const telegram = telegramContext();
  if (state.active) {
    const expiry = formatDate(state.expiresAt);
    return `
      <div class="my-alx-status my-alx-status--pro">
        <div class="my-alx-status-top"><span class="my-alx-plan">ALX PRO</span><span class="my-alx-live">АКТИВЕН</span></div>
        <b>Все возможности Оракула открыты</b>
        <p>Безлимитные подборы, закрытые коллекции, Parfum Lab и LIMITED.</p>
        <div class="my-alx-meta"><span>${sourceLabel(state.source)}</span>${expiry ? `<span>до ${expiry}</span>` : ''}</div>
      </div>`;
  }

  const free = freeUsage();
  const price = telegram ? `${offer.priceStars} ⭐ / ${offer.periodDays} дней` : `${EXTERNAL_PRICE_RUB} ₽ / 30 дней`;
  return `
    <div class="my-alx-status">
      <div class="my-alx-status-top"><span class="my-alx-plan">FREE</span><span class="my-alx-free-left">${free.remaining}/${free.limit} сегодня</span></div>
      <b>${free.remaining ? 'Оракул доступен бесплатно' : 'Дневной лимит использован'}</b>
      <p>PRO снимает лимит и открывает закрытые авторские коллекции.</p>
      <button class="my-alx-primary" id="myAlxUpgrade" type="button">Открыть ALX PRO · ${price}</button>
    </div>`;
}

function dashboardHtml() {
  const state = getProState();
  const favorites = getFavorites();
  const history = getHistory();
  const visits = getVisitStats();
  const telegram = telegramContext();
  return `
    ${statusCardHtml(state)}
    <div class="my-alx-grid">
      <div><b>${history.length}</b><span>миксов открыто</span></div>
      <div><b>${favorites.length}</b><span>в избранном</span></div>
      <div><b>${visits.currentStreak}</b><span>${dayWord(visits.currentStreak)} подряд</span></div>
      <div><b>${visits.bestStreak}</b><span>лучший рекорд</span></div>
    </div>
    <div class="my-alx-section">
      <div class="my-alx-section-title">Доступ и аккаунт</div>
      <button class="my-alx-row" id="myAlxTaste" type="button"><span>✦ Профиль вкуса</span><small>персонализация и Микс дня</small></button>
      ${telegram ? '<button class="my-alx-row" id="myAlxRestore" type="button"><span>↻ Восстановить PRO</span><small>проверить активную подписку</small></button>' : ''}
      <button class="my-alx-row" id="myAlxProDetails" type="button"><span>◆ Возможности ALX PRO</span><small>закрытые коллекции и безлимит</small></button>
    </div>
    <div class="my-alx-foot">${state.active ? 'PRO подтверждается сервером; локально хранится только кэш статуса.' : 'FREE-статистика и профиль хранятся локально на этом устройстве.'}</div>`;
}

function renderDashboard() {
  ensureOverlay();
  const content = document.getElementById('myAlxContent');
  if (!content) return;
  content.innerHTML = dashboardHtml();

  content.querySelector('#myAlxUpgrade')?.addEventListener('click', () => {
    trackAnalytics('my_alx_upgrade_click', { context: telegramContext() ? 'telegram' : 'browser' });
    requestProPaywall('Мой ALX');
  });
  content.querySelector('#myAlxProDetails')?.addEventListener('click', () => {
    requestProPaywall('Возможности ALX PRO');
  });
  content.querySelector('#myAlxTaste')?.addEventListener('click', () => {
    closeDashboard();
    setTimeout(() => document.getElementById('tasteBtnTop')?.click(), 80);
  });
  content.querySelector('#myAlxRestore')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const small = button.querySelector('small');
    const previous = small?.textContent || '';
    if (small) small.textContent = 'проверяю доступ…';
    try {
      const next = await syncProEntitlement({ attempts: 2, delayMs: 800 });
      if (next.active) {
        trackAnalytics('my_alx_restore_success', { source: next.source || 'unknown' });
        renderDashboard();
      } else {
        if (small) small.textContent = 'активный PRO не найден';
        setTimeout(renderDashboard, 1600);
      }
    } catch (error) {
      if (small) small.textContent = 'не удалось проверить — попробуй ещё раз';
      setTimeout(() => { button.disabled = false; if (small) small.textContent = previous; }, 1800);
    }
  });
}

function openDashboard() {
  ensureOverlay();
  renderDashboard();
  document.getElementById(OVERLAY_ID)?.classList.add('show');
  trackAnalytics('my_alx_open', { pro: getProState().active });
}

function closeDashboard() {
  document.getElementById(OVERLAY_ID)?.classList.remove('show');
}

function favoriteFlavorSet(allMixes) {
  const ids = new Set(getFavorites());
  const set = new Set();
  allMixes.forEach((mix) => {
    if (!ids.has(mix?.id) || !Array.isArray(mix?.recipe)) return;
    mix.recipe.forEach((part) => {
      if (part?.flavor) set.add(String(part.flavor).toLowerCase());
    });
  });
  return set;
}

function premiumTeaserMix(allMixes) {
  const premium = allMixes.filter((mix) => mix?.proOnly === true);
  if (!premium.length) return null;
  const liked = favoriteFlavorSet(allMixes);
  const scored = premium.map((mix) => {
    const matches = Array.isArray(mix.recipe)
      ? mix.recipe.filter((part) => liked.has(String(part?.flavor || '').toLowerCase())).length
      : 0;
    const popularity = Number(mix.popularity || 0);
    const parfumBoost = mix.theme === 'perfume' ? 8 : 0;
    return { mix, score: matches * 40 + popularity + parfumBoost };
  }).sort((a, b) => b.score - a.score || String(a.mix.id).localeCompare(String(b.mix.id)));

  if (scored[0]?.score > (Number(scored[0]?.mix?.popularity || 0) + (scored[0]?.mix?.theme === 'perfume' ? 8 : 0))) {
    return scored[0].mix;
  }

  // No taste signal yet: rotate a deterministic premium teaser by calendar date.
  const seed = Number(dayKey().replaceAll('-', '')) || 1;
  return premium[seed % premium.length] || premium[0];
}

function collectionLabel(mix) {
  const collections = Array.isArray(mix?.collections) ? mix.collections : [];
  if (mix?.theme === 'perfume' || collections.includes('parfum')) return 'PARFUM LAB';
  if (collections.includes('limited')) return 'LIMITED 2026';
  if (collections.includes('signature')) return 'ALX SIGNATURE';
  if (collections.includes('after-dark')) return 'AFTER DARK';
  return 'ALX PRO';
}

function teaserNotes(mix) {
  if (!Array.isArray(mix?.recipe)) return [];
  return mix.recipe.slice(0, 3).map((part) => String(part?.flavor || '').trim()).filter(Boolean);
}

function teaserSeenToday() {
  try { return localStorage.getItem(`${TEASER_SEEN_PREFIX}${dayKey()}`) === '1'; }
  catch (error) { return false; }
}

function markTeaserSeen() {
  try { localStorage.setItem(`${TEASER_SEEN_PREFIX}${dayKey()}`, '1'); } catch (error) { /* non-fatal */ }
}

function closeTeaser() {
  document.getElementById(TEASER_ID)?.remove();
}

async function showLimitTeaser() {
  if (getProState().active || teaserSeenToday() || document.getElementById(TEASER_ID)) return;
  await initMixes();
  const mix = premiumTeaserMix(getAllMixes());
  if (!mix) return;
  markTeaserSeen();

  const notes = teaserNotes(mix);
  const overlay = document.createElement('div');
  overlay.id = TEASER_ID;
  overlay.className = 'alx-pro-teaser';
  overlay.innerHTML = `
    <div class="alx-pro-teaser-backdrop"></div>
    <section class="alx-pro-teaser-card" role="dialog" aria-modal="true" aria-labelledby="alxTeaserTitle">
      <button class="alx-pro-teaser-close" id="alxTeaserClose" type="button" aria-label="Закрыть">✕</button>
      <div class="alx-pro-teaser-kicker">${collectionLabel(mix)} · ПЕРСОНАЛЬНЫЙ ТИЗЕР</div>
      <div class="alx-pro-teaser-lock">◆</div>
      <h3 id="alxTeaserTitle">Оракул нашёл ещё один микс</h3>
      <div class="alx-pro-teaser-name">${mix.name}</div>
      ${notes.length ? `<div class="alx-pro-teaser-notes">${notes.map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
      <p>${mix.description || 'Закрытая композиция из коллекции ALX PRO.'}</p>
      <div class="alx-pro-teaser-mask"><span>Пропорции и полный рецепт</span><b>🔒 PRO</b></div>
      <button class="alx-pro-teaser-cta" id="alxTeaserUnlock" type="button">Открыть рецепт в ALX PRO</button>
      <button class="alx-pro-teaser-later" id="alxTeaserLater" type="button">Не сейчас</button>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#alxTeaserClose')?.addEventListener('click', closeTeaser);
  overlay.querySelector('#alxTeaserLater')?.addEventListener('click', closeTeaser);
  overlay.querySelector('#alxTeaserUnlock')?.addEventListener('click', () => {
    trackAnalytics('pro_teaser_unlock_click', { collection: collectionLabel(mix), theme: mix.theme || 'standard' });
    closeTeaser();
    requestProPaywall(`Закрытый микс · ${mix.name}`);
  });
  overlay.querySelector('.alx-pro-teaser-backdrop')?.addEventListener('click', closeTeaser);
  trackAnalytics('pro_teaser_shown', { collection: collectionLabel(mix), theme: mix.theme || 'standard' });
}

function handleUsage(detail = {}) {
  if (Number(detail.remaining) === 0 && Number(detail.used) >= FREE_LIMIT) {
    setTimeout(() => showLimitTeaser().catch(() => {}), 900);
  }
}

function init() {
  ensureButton();
  ensureOverlay();
  window.addEventListener('alx-free-usage-change', (event) => handleUsage(event.detail || {}));
  window.addEventListener('alx-pro-change', () => {
    if (document.getElementById(OVERLAY_ID)?.classList.contains('show')) renderDashboard();
    if (getProState().active) closeTeaser();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureButton();
  });
}

init();
