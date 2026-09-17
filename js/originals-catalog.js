// originals-catalog.js — browseable ALX Originals catalog inside the PRO section.
// Recipes are fetched only through the protected /api/originals endpoint.

import { getProState, requestProPaywall } from './pro.js?v=1.23.0-originals';
import { initOriginals, getCollectionMixes } from './mixes.js?v=1.23.0-originals';
import { setScenario } from './scenario.js?v=1.23.0-originals';
import { isFavorite, toggleFavorite } from './profile.js';
import { trackAnalytics } from './analytics.js?v=1.19.0-analytics';

const OVERLAY_ID = 'alxOriginalsCatalog';
const CONTENT_ID = 'alxOriginalsCatalogContent';
const VERSION = '1.24.0-originals-catalog';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(text) {
  let toast = document.getElementById('alxOriginalsToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'alxOriginalsToast';
    toast.className = 'originals-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'originals-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="originals-panel" role="dialog" aria-modal="true" aria-labelledby="originalsTitle">
      <div class="originals-head">
        <div>
          <div class="originals-kicker">ALX PRO</div>
          <h2 id="originalsTitle">ALX Originals</h2>
        </div>
        <button class="originals-close" id="originalsClose" type="button" aria-label="Закрыть">Закрыть</button>
      </div>
      <div id="${CONTENT_ID}" class="originals-content"></div>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#originalsClose')?.addEventListener('click', closeCatalog);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeCatalog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeCatalog();
  });
  return overlay;
}

function renderLocked(content) {
  content.innerHTML = `
    <div class="originals-locked">
      <div class="originals-lock-mark">PRO</div>
      <div class="originals-lock-kicker">ЗАКРЫТАЯ АВТОРСКАЯ КОЛЛЕКЦИЯ</div>
      <h3>ALX Originals</h3>
      <p>Авторские рецепты доступны только с активным ALX PRO. Названия, составы и пропорции до покупки не раскрываются.</p>
      <div class="originals-lock-mask">
        <span>Авторские миксы</span>
        <b>PRO</b>
      </div>
      <button class="originals-primary" id="originalsUnlock" type="button">Открыть с ALX PRO</button>
    </div>`;

  content.querySelector('#originalsUnlock')?.addEventListener('click', () => {
    trackAnalytics('originals_unlock_click', { version: VERSION });
    closeCatalog();
    requestProPaywall('ALX Originals');
  });
}

function renderLoading(content) {
  content.innerHTML = `
    <div class="originals-loading">
      <div class="originals-loading-dot"></div>
      <span>Проверяю PRO и загружаю авторскую коллекцию…</span>
    </div>`;
}

function renderUnavailable(content) {
  content.innerHTML = `
    <div class="originals-unavailable">
      <b>Не удалось открыть ALX Originals</b>
      <p>Проверь, что ALX Oracle открыт внутри Telegram и PRO активен, затем попробуй ещё раз.</p>
      <button class="originals-primary" id="originalsRetry" type="button">Повторить</button>
    </div>`;
  content.querySelector('#originalsRetry')?.addEventListener('click', () => renderActive(content));
}

function buildDetail(mix) {
  const fav = isFavorite(mix.id);
  return `
    <article class="originals-detail" data-original-detail="${escapeHtml(mix.id)}">
      <div class="originals-detail-top">
        <div>
          <div class="originals-detail-brand">ALX ORIGINALS</div>
          <h3>${escapeHtml(mix.name)}</h3>
        </div>
        <button class="originals-favorite${fav ? ' active' : ''}" type="button" data-original-favorite="${escapeHtml(mix.id)}" aria-pressed="${fav}">${fav ? 'В избранном' : 'В избранное'}</button>
      </div>
      <p class="originals-description">${escapeHtml(mix.description || 'Авторский микс из коллекции ALX Originals.')}</p>
      <div class="originals-section-label">Состав и пропорции</div>
      <div class="originals-recipe">
        ${(mix.recipe || []).map((item) => `
          <div class="originals-recipe-row">
            <span>${escapeHtml(item.flavor)}</span>
            <b>${Number(item.percent) || 0}%</b>
          </div>`).join('')}
      </div>
      <div class="originals-author">Автор: <b>ALX Originals</b></div>
      <div class="originals-detail-actions">
        <button class="originals-secondary" type="button" data-original-share="${escapeHtml(mix.id)}">Поделиться</button>
        <button class="originals-primary" type="button" id="originalsOracleMode">Попросить Оракула выбрать из Originals</button>
      </div>
    </article>`;
}

function attachDetailHandlers(content, mix) {
  content.querySelector(`[data-original-favorite="${CSS.escape(mix.id)}"]`)?.addEventListener('click', (event) => {
    const active = toggleFavorite(mix.id);
    event.currentTarget.classList.toggle('active', active);
    event.currentTarget.setAttribute('aria-pressed', String(active));
    event.currentTarget.textContent = active ? 'В избранном' : 'В избранное';
    showToast(active ? 'Добавлено в избранное' : 'Убрано из избранного');
    trackAnalytics('originals_favorite_toggle', { version: VERSION, active });
  });

  content.querySelector(`[data-original-share="${CSS.escape(mix.id)}"]`)?.addEventListener('click', async () => {
    const url = 'https://t.me/Orcmix_bot?startapp=originals';
    const text = `ALX Originals · ${mix.name}\nЗакрытая авторская коллекция в ALX PRO.`;
    const tg = window.Telegram?.WebApp;
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      } else if (navigator.share) {
        await navigator.share({ text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast('Ссылка скопирована');
      }
      trackAnalytics('originals_share', { version: VERSION });
    } catch (error) {
      // Sharing cancellation is not an app error.
    }
  });

  content.querySelector('#originalsOracleMode')?.addEventListener('click', () => {
    setScenario({ collection: 'originals' });
    trackAnalytics('originals_oracle_mode', { version: VERSION });
    closeCatalog();
    const home = document.querySelector('#alxBottomNav [data-tab="home"]');
    home?.click();
    showToast('Оракул выбирает только из ALX Originals');
  });
}

function showMix(content, mixes, mixId) {
  const mix = mixes.find((item) => item.id === mixId) || mixes[0];
  if (!mix) return;

  content.querySelectorAll('[data-original-id]').forEach((button) => {
    const active = button.dataset.originalId === mix.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const detailHost = content.querySelector('#originalsDetailHost');
  if (!detailHost) return;
  detailHost.innerHTML = buildDetail(mix);
  attachDetailHandlers(detailHost, mix);
  trackAnalytics('originals_mix_open', { version: VERSION });
}

async function renderActive(content) {
  renderLoading(content);
  await initOriginals();
  const mixes = getCollectionMixes('originals');

  if (!getProState().active) {
    renderLocked(content);
    return;
  }
  if (!mixes.length) {
    renderUnavailable(content);
    return;
  }

  content.innerHTML = `
    <div class="originals-intro">
      <span class="originals-count">${mixes.length} авторских миксов</span>
      <p>Выбери рецепт из каталога или отдай выбор Оракулу.</p>
    </div>
    <div class="originals-layout">
      <div class="originals-list" role="list" aria-label="ALX Originals">
        ${mixes.map((mix, index) => `
          <button class="originals-list-item${index === 0 ? ' active' : ''}" type="button" role="listitem" data-original-id="${escapeHtml(mix.id)}" aria-pressed="${index === 0}">
            <small>${String(index + 1).padStart(2, '0')}</small>
            <span>${escapeHtml(mix.name)}</span>
          </button>`).join('')}
      </div>
      <div id="originalsDetailHost"></div>
    </div>`;

  content.querySelectorAll('[data-original-id]').forEach((button) => {
    button.addEventListener('click', () => showMix(content, mixes, button.dataset.originalId));
  });
  showMix(content, mixes, mixes[0].id);
}

export async function openCatalog() {
  const overlay = ensureOverlay();
  const content = overlay.querySelector(`#${CONTENT_ID}`);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  trackAnalytics('originals_catalog_open', { version: VERSION, pro: getProState().active });

  if (!getProState().active) {
    renderLocked(content);
    return;
  }
  await renderActive(content);
}

export function closeCatalog() {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
}

function init() {
  ensureOverlay();
  window.__ALX_ORIGINALS_CATALOG_READY__ = true;
  window.addEventListener('alx-pro-section-open', openCatalog);
  window.addEventListener('alx-pro-change', () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay?.classList.contains('show')) openCatalog();
  });
}

init();
