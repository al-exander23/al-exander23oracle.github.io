// pro-library.js — unified premium direction library for ALX Oracle.
// Every PRO collection follows the same interaction: choose a direction,
// then let the Oracle reveal a concrete mix through the orb.

import { getProState, requestProPaywall } from './pro.js?v=1.33.0-payment-audit';
import { initMixes, initOriginals, initCommunityMixes, getAllMixes } from './mixes.js?v=1.33.0-payment-audit';
import { getScenario, setScenario, getCollectionCounts } from './scenario.js?v=1.33.0-payment-audit';
import { trackAnalytics } from './analytics.js?v=1.19.0-analytics';

const VERSION = '1.31.0-community-oracle';
const OVERLAY_ID = 'alxProLibrary';
const CONTENT_ID = 'alxProLibraryContent';

const COLLECTIONS = Object.freeze([
  {
    id: 'originals',
    title: 'ALX Originals',
    eyebrow: 'АВТОРСКАЯ КОЛЛЕКЦИЯ',
    description: 'Закрытые авторские миксы ALX. Ты выбираешь направление, а конкретный рецепт и пропорции раскрывает только Оракул.',
  },
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
          <h2 id="proLibraryTitle">PRO Направления</h2>
        </div>
        <button class="pro-library-close" id="proLibraryClose" type="button" aria-label="Закрыть PRO направления">Закрыть</button>
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

async function activateCollection(collection) {
  if (!getProState().active) {
    closeProLibrary();
    requestProPaywall(collection.title);
    trackAnalytics('pro_library_unlock_click', { version: VERSION, collection: collection.id });
    return;
  }

  // Originals stay protected by the verified PRO endpoint. Loading them here
  // prepares the orb without exposing a browseable catalog.
  if (collection.id === 'originals') {
    await initOriginals();
  }

  setScenario({ collection: collection.id });
  trackAnalytics('pro_library_collection_select', { version: VERSION, collection: collection.id });
  closeProLibrary({ returnHome: false });
  document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
}

function resetToAll() {
  setScenario({ collection: 'any' });
  trackAnalytics('pro_library_all_mixes', { version: VERSION });
  closeProLibrary({ returnHome: false });
  document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
}

function countLabel(count) {
  if (count === 1) return '1 микс';
  if (count >= 2 && count <= 4) return `${count} микса`;
  return `${count} миксов`;
}

function collectionCard(collection, counts, current, activePlan) {
  const selected = current.collection === collection.id;
  const count = Number(counts?.[collection.id]) || 0;
  const meta = activePlan ? countLabel(count) : 'ALX PRO';
  const action = activePlan
    ? (selected ? 'Выбрано для Оракула' : 'Выбрать направление')
    : 'Открыть с PRO';

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

  content.innerHTML = '<div class="pro-library-loading">Собираю PRO направления…</div>';

  if (activePlan) {
    try {
      await initMixes();
      counts = getCollectionCounts(getAllMixes());
    } catch (error) {
      console.warn('[ALX PRO Library] counts unavailable:', error);
    }
  }

  const expiry = activePlan ? formatExpiry(state.expiresAt) : '';

  content.innerHTML = `
    <section class="pro-library-status${activePlan ? ' is-active' : ''}">
      <div>
        <span>${activePlan ? 'ALX PRO АКТИВЕН' : 'ALX FREE'}</span>
        <b>${activePlan ? 'Выбери направление для Оракула' : 'PRO-направления закрыты'}</b>
        <small>${activePlan
          ? `${expiry ? `Доступ до ${expiry}. ` : ''}Направление задаёт настроение, а конкретный микс откроет шар.`
          : 'Можно увидеть направления PRO, но конкретные миксы и рецепты раскрываются только после активации.'}</small>
      </div>
      ${activePlan ? '<strong>PRO</strong>' : '<button id="proLibraryUnlock" type="button">Открыть PRO</button>'}
    </section>

    <section class="pro-community-entry">
      <div class="pro-community-entry-top">
        <div>
          <span>PRO COMMUNITY</span>
          <h3>Community Mixes</h3>
        </div>
        <span>${activePlan ? 'ДОСТУПНО' : 'ALX PRO'}</span>
      </div>
      <p>Создавай свои миксы, публикуй их для сообщества, получай оценки и делись рецептами. Отдельный режим шара выбирает опубликованные миксы участников Community.</p>
      <div class="pro-community-actions">
        <button id="proCommunityOpen" type="button">${activePlan ? 'Открыть Community' : 'Открыть с PRO'}</button>
        ${activePlan ? `<button id="proCommunityOracle" type="button" class="${current.collection === 'community' ? 'is-selected' : ''}"${current.collection === 'community' ? ' disabled' : ''}>${current.collection === 'community' ? 'Выбрано для шара' : 'Выбирать шаром'}</button>` : ''}
      </div>
    </section>

    <div class="pro-library-section-title">
      <span>Направления Оракула</span>
      <small>${activePlan ? 'Выбери одно — затем возвращайся к шару' : 'Доступны после активации ALX PRO'}</small>
    </div>

    <div class="pro-library-grid">
      ${COLLECTIONS.map((collection) => collectionCard(collection, counts, current, activePlan)).join('')}
    </div>

    ${activePlan ? `
      <button class="pro-library-all${current.collection === 'any' ? ' is-current' : ''}" id="proLibraryAll" type="button"${current.collection === 'any' ? ' disabled' : ''}>
        <span>Все миксы</span>
        <small>${current.collection === 'any' ? 'Обычный режим уже включён' : 'Убрать фильтр направления и вернуть общую базу'}</small>
      </button>` : ''}
  `;

  content.querySelector('#proLibraryUnlock')?.addEventListener('click', () => {
    closeProLibrary();
    requestProPaywall('ALX PRO');
    trackAnalytics('pro_library_unlock_click', { version: VERSION, collection: 'all' });
  });

  content.querySelector('#proCommunityOpen')?.addEventListener('click', () => {
    if (!getProState().active) {
      closeProLibrary();
      requestProPaywall('Community Mixes');
      trackAnalytics('community_unlock_click', { version: VERSION, source: 'pro_library' });
      return;
    }
    closeProLibrary({ returnHome: false });
    window.dispatchEvent(new CustomEvent('alx-community-open', { detail: { view: 'top' } }));
    trackAnalytics('community_entry_click', { version: VERSION, source: 'pro_library' });
  });

  content.querySelector('#proCommunityOracle')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!getProState().active) return;
    button.disabled = true;
    button.textContent = 'Загружаю Community…';
    try {
      const community = await initCommunityMixes({ force: true });
      if (!community.length) throw new Error('В Community пока нет доступных опубликованных миксов.');
      setScenario({ collection: 'community' });
      trackAnalytics('community_oracle_select', { version: VERSION, count: community.length });
      closeProLibrary({ returnHome: false });
      document.querySelector('#alxBottomNav [data-tab="home"]')?.click();
    } catch (error) {
      console.warn('[ALX Community Oracle]', error);
      button.disabled = false;
      button.textContent = 'Попробовать снова';
      button.title = error?.message || 'Не удалось загрузить Community';
    }
  });

  content.querySelectorAll('[data-pro-select]').forEach((button) => {
    button.addEventListener('click', async () => {
      const collection = COLLECTIONS.find((item) => item.id === button.dataset.proSelect);
      if (!collection) return;
      button.disabled = true;
      const originalText = button.textContent;
      if (getProState().active) button.textContent = 'Готовлю Оракула…';
      try {
        await activateCollection(collection);
      } catch (error) {
        console.warn('[ALX PRO Library] collection activation failed:', error);
        button.disabled = false;
        button.textContent = originalText;
      }
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
