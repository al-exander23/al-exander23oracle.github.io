// pro-library.js — unified premium library for ALX Oracle.
// Presentation only: existing Oracle, scenario and payment flows stay intact.

import { getProState, requestProPaywall } from './pro.js?v=1.25.0-pro-library';
import { initMixes, initOriginals, getAllMixes } from './mixes.js?v=1.24.0-originals-catalog';
import { getScenario, setScenario, resetScenario, getCollectionCounts } from './scenario.js?v=1.24.0-originals-catalog';
import { openCatalog as openOriginalsCatalog } from './originals-catalog.js?v=1.24.0-originals-catalog';
import { trackAnalytics } from './analytics.js?v=1.19.0-analytics';

const VERSION = '1.25.0-pro-library';
const OVERLAY_ID = 'alxProLibrary';
const CONTENT_ID = 'alxProLibraryContent';

const COLLECTIONS = Object.freeze([
  {
    id: 'parfum',
    title: 'Parfum Lab',
    eyebrow: 'АРОМАТИЧЕСКАЯ ЛАБОРАТОРИЯ',
    description: 'Парфюмная логика вкуса: чай, цветы, специи, фрукты и сложные ароматические акценты.',
  },
  {
    id: 'limited',
    title: 'LIMITED 2026',
    eyebrow: 'СЕЗОННЫЕ ДРОПЫ',
    description: 'Необычные сочетания и новые вкусовые идеи, собранные как отдельные сезонные выпуски.',
  },
  {
    id: 'signature',
    title: 'ALX Signature',
    eyebrow: 'СИЛЬНЫЙ ОТБОР',
    description: 'Собранная выборка выразительных и сбалансированных сочетаний для уверенного результата.',
  },
  {
    id: 'date-night',
    title: 'Для двоих',
    eyebrow: 'МЯГКИЙ ВЕЧЕР',
    description: 'Более мягкие, округлые и уютные сочетания для спокойного вечера вдвоём.',
  },
  {
    id: 'after-dark',
    title: 'После полуночи',
    eyebrow: 'ПОЗДНИЙ ВЕЧЕР',
    description: 'Более насыщенные и глубокие подборки для позднего времени и плотного вкуса.',
  },
  {
    id: 'experimental',
    title: 'Эксперимент',
    eyebrow: 'НЕОЧЕВИДНЫЕ СОЧЕТАНИЯ',
    description: 'Смелые сочетания с кислотностью, свежестью и нестандартными вкусовыми пересечениями.',
  },
]);

function formatExpiry(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return new Date(timestamp).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch (error) {
    return '';
  }
}

function setBottomNav(tab = 'home') {
  document.querySelectorAll('#alxBottomNav .alx-bottom-nav-btn').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'pro-library-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="pro-library-panel" role="dialog" aria-modal="true" aria-labelledby="proLibraryTitle">
      <header class="pro-library-head">
        <div>
          <div class="pro-library-kicker">ALX ORACLE</div>
          <h2 id="proLibraryTitle">PRO Библиотека</h2>
        </div>
        <button class="pro-library-close" id="proLibraryClose" type="button" aria-label="Закрыть PRO библиотеку">Закрыть</button>
      </header>
      <div id="${CONTENT_ID}" class="pro-library-content"></div>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#proLibraryClose')?.addEventListener('click', () => closeProLibrary());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeProLibrary();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeProLibrary();
  });
  return overlay;
}

function activateCollection(collection) {
  const state = getProState();
  if (!state.active) {
    closeProLibrary({ returnHome: false });
    requestProPaywall(collection.title);
    trackAnalytics('pro_library_unlock_click', { version: VERSION, collection: collection.id });
    return;
  }

  setScenario({ collection: collection.id });
  trackAnalytics('pro_library_collection_select', { version: VERSION, collection: collection.id });
  closeProLibrary({ returnHome: false });
  document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
}

function activateOriginalsOracle() {
  if (!getProState().active) {
    closeProLibrary({ returnHome: false });
    requestProPaywall('ALX Originals');
    trackAnalytics('pro_library_unlock_click', { version: VERSION, collection: 'originals' });
    return;
  }

  setScenario({ collection: 'originals' });
  trackAnalytics('pro_library_collection_select', { version: VERSION, collection: 'originals' });
  closeProLibrary({ returnHome: false });
  document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
}

function openOriginals() {
  trackAnalytics('pro_library_originals_open', { version: VERSION, pro: getProState().active });
  openOriginalsCatalog().catch((error) => console.warn('[ALX PRO Library] Originals:', error));
}

function resetToAll() {
  resetScenario();
  trackAnalytics('pro_library_all_mixes', { version: VERSION });
  closeProLibrary({ returnHome: false });
  document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
}

function collectionCard(collection, counts, current, activePlan) {
  const selected = current.collection === collection.id;
  const count = Number(counts?.[collection.id]) || 0;
  const meta = activePlan
    ? `${count} ${count === 1 ? 'микс' : count >= 2 && count <= 4 ? 'микса' : 'миксов'}`
    : 'ALX PRO';
  const action = activePlan ? (selected ? 'Выбрано для Оракула' : 'Выбирать из коллекции') : 'Открыть с PRO';

  return `
    <article class="pro-library-card${selected ? ' is-selected' : ''}" data-pro-card="${collection.id}">
      <div class="pro-library-card-top">
        <div>
          <div class="pro-library-card-kicker">${collection.eyebrow}</div>
          <h3>${collection.title}</h3>
        </div>
        <span class="pro-library-card-meta">${meta}</span>
      </div>
      <p>${collection.description}</p>
      <button class="pro-library-card-action" type="button" data-pro-select="${collection.id}"${selected && activePlan ? ' disabled' : ''}>${action}</button>
    </article>`;
}

async function render() {
  const overlay = ensureOverlay();
  const content = overlay.querySelector(`#${CONTENT_ID}`);
  if (!content) return;

  const state = getProState();
  const activePlan = state.active;
  const current = getScenario();
  let counts = {};

  content.innerHTML = '<div class="pro-library-loading">Собираю PRO библиотеку…</div>';

  if (activePlan) {
    try {
      await initMixes();
      await initOriginals();
      counts = getCollectionCounts(getAllMixes());
    } catch (error) {
      console.warn('[ALX PRO Library] counts unavailable:', error);
    }
  }

  const expiry = activePlan ? formatExpiry(state.expiresAt) : '';
  const originalsSelected = current.collection === 'originals';
  const originalsCount = Number(counts.originals) || 5;

  content.innerHTML = `
    <section class="pro-library-status${activePlan ? ' is-active' : ''}">
      <div>
        <span>${activePlan ? 'ALX PRO АКТИВЕН' : 'ALX FREE'}</span>
        <b>${activePlan ? 'Премиальная библиотека открыта' : 'Премиальные коллекции закрыты'}</b>
        <small>${activePlan
          ? `${expiry ? `Доступ до ${expiry}. ` : ''}Выбирай коллекцию вручную или доверь решение Оракулу.`
          : 'Можно посмотреть структуру PRO, но закрытые подборки и авторские рецепты открываются после активации.'}</small>
      </div>
      ${activePlan ? '<strong>PRO</strong>' : '<button id="proLibraryUnlock" type="button">Открыть PRO</button>'}
    </section>

    <section class="pro-library-originals${originalsSelected ? ' is-selected' : ''}">
      <div class="pro-library-originals-label">ГЛАВНАЯ АВТОРСКАЯ КОЛЛЕКЦИЯ</div>
      <div class="pro-library-originals-row">
        <div>
          <h3>ALX Originals</h3>
          <p>Авторские рецепты ALX с точными пропорциями. Отдельный каталог, не смешанный с общей базой.</p>
        </div>
        <span>${activePlan ? `${originalsCount} рецептов` : 'PRO'}</span>
      </div>
      <div class="pro-library-originals-actions">
        <button class="pro-library-primary" id="proLibraryOriginalsBrowse" type="button">${activePlan ? 'Открыть каталог' : 'Посмотреть коллекцию'}</button>
        <button class="pro-library-secondary" id="proLibraryOriginalsOracle" type="button">${activePlan ? (originalsSelected ? 'Выбрано для Оракула' : 'Выбирать шаром') : 'Открыть с PRO'}</button>
      </div>
    </section>

    <div class="pro-library-section-title">
      <span>Коллекции Оракула</span>
      <small>${activePlan ? 'Выбор меняет источник следующего подбора' : 'Доступны после активации ALX PRO'}</small>
    </div>

    <div class="pro-library-grid">
      ${COLLECTIONS.map((collection) => collectionCard(collection, counts, current, activePlan)).join('')}
    </div>

    ${activePlan ? `
      <button class="pro-library-all${current.collection === 'any' ? ' is-current' : ''}" id="proLibraryAll" type="button"${current.collection === 'any' ? ' disabled' : ''}>
        <span>Все миксы</span>
        <small>${current.collection === 'any' ? 'Обычный режим уже включён' : 'Вернуть Оракула к общей базе без фильтра коллекции'}</small>
      </button>` : ''}
  `;

  content.querySelector('#proLibraryUnlock')?.addEventListener('click', () => {
    closeProLibrary({ returnHome: false });
    requestProPaywall('ALX PRO');
    trackAnalytics('pro_library_unlock_click', { version: VERSION, collection: 'all' });
  });

  content.querySelector('#proLibraryOriginalsBrowse')?.addEventListener('click', openOriginals);
  content.querySelector('#proLibraryOriginalsOracle')?.addEventListener('click', activateOriginalsOracle);

  content.querySelectorAll('[data-pro-select]').forEach((button) => {
    button.addEventListener('click', () => {
      const collection = COLLECTIONS.find((item) => item.id === button.dataset.proSelect);
      if (collection) activateCollection(collection);
    });
  });

  content.querySelector('#proLibraryAll')?.addEventListener('click', resetToAll);
}

export async function openProLibrary() {
  const overlay = ensureOverlay();
  setBottomNav('pro');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  trackAnalytics('pro_library_open', { version: VERSION, pro: getProState().active });
  await render();
}

export function closeProLibrary({ returnHome = true } = {}) {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
  if (returnHome) setBottomNav('home');
}

function init() {
  ensureOverlay();
  window.addEventListener('alx-pro-change', () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay?.classList.contains('show')) render();
  });
}

init();
