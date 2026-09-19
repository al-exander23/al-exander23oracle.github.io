// community.js — ALX Community Mixes UI.
// PRO-only publishing/rating with safe FREE shared previews.

import { getProState, requestProPaywall, syncProEntitlement } from './pro.js?v=1.31.0-community-oracle';
import { trackAnalytics } from './analytics.js?v=1.19.0-analytics';

const VERSION = '1.31.0-community-oracle';
const API_BASE = 'https://alx-pay.alxoracle.workers.dev';
const OVERLAY_ID = 'alxCommunity';
const CONTENT_ID = 'alxCommunityContent';
const MAX_COMPONENTS = 6;
const MIN_COMPONENTS = 2;

let currentView = 'top';
let mixes = [];
let openedId = null;
let previewId = null;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function telegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

function telegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

function defaultAuthor() {
  const user = telegramUser();
  if (user?.username) return `@${String(user.username).replace(/^@+/, '').slice(0, 28)}`;
  if (user?.first_name) return String(user.first_name).slice(0, 28);
  return 'ALX user';
}

async function apiPost(action, payload = {}, timeoutMs = 12000) {
  const initData = telegramInitData();
  if (!initData) throw new Error('Открой ALX Oracle внутри Telegram, чтобы использовать Community Mixes.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/api/community/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, initData }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function apiPreview(id) {
  const response = await fetch(`${API_BASE}/api/community/preview?id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'Микс не найден.');
  return data.preview;
}

function formatDate(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(Number(ms)));
  } catch (error) {
    return '';
  }
}

function stars(value) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function ratingText(mix) {
  if (!mix.ratingCount) return 'без оценок';
  return `${Number(mix.rating || 0).toFixed(1)} · ${mix.ratingCount} оценок`;
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'community-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="community-panel" role="dialog" aria-modal="true" aria-labelledby="communityTitle">
      <header class="community-head">
        <div>
          <div class="community-kicker">ALX PRO COMMUNITY</div>
          <h2 id="communityTitle">Community Mixes</h2>
        </div>
        <button class="community-close" id="communityClose" type="button">Закрыть</button>
      </header>
      <div id="${CONTENT_ID}" class="community-content"></div>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#communityClose')?.addEventListener('click', closeCommunity);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeCommunity();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeCommunity();
  });

  return overlay;
}

function setBottomNav(tab = 'pro') {
  document.querySelectorAll('#alxBottomNav .alx-bottom-nav-btn').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function shellHtml() {
  return `
    <section class="community-intro">
      <div>
        <span>СООБЩЕСТВО ALX</span>
        <strong>Создавай свои миксы. Делись. Попадай в рейтинг.</strong>
        <p>Community-рецепты живут отдельно от официальных ALX Originals и базы Оракула.</p>
      </div>
      <button class="community-create-main" type="button" data-community-create>+ Создать микс</button>
    </section>
    <nav class="community-tabs" aria-label="Community Mixes">
      <button type="button" data-community-tab="top">Лучшие</button>
      <button type="button" data-community-tab="new">Новые</button>
      <button type="button" data-community-tab="mine">Мои</button>
      <button type="button" data-community-tab="saved">Сохранённые</button>
    </nav>
    <div id="communityList" class="community-list"></div>`;
}

function setActiveTab(root) {
  root.querySelectorAll('[data-community-tab]').forEach((button) => {
    const active = button.dataset.communityTab === currentView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function emptyCopy(view) {
  if (view === 'mine') return ['У тебя пока нет опубликованных миксов.', 'Создай первый рецепт и отправь его в рейтинг Community.'];
  if (view === 'saved') return ['Сохранённых миксов пока нет.', 'Здесь будут твои опубликованные миксы и рецепты других авторов, которые ты сохранишь.'];
  if (view === 'new') return ['Новых миксов пока нет.', 'Стань первым автором Community.'];
  return ['Рейтинг пока пуст.', 'Первый опубликованный рецепт сразу появится здесь.'];
}

function recipeHtml(recipe = []) {
  return recipe.map((item) => `
    <div class="community-recipe-row">
      <span>${esc(item.flavor)}</span>
      <b>${Number(item.percent)}%</b>
    </div>`).join('');
}

function ratingButtons(mix) {
  if (mix.isMine) return '<div class="community-own-rating">Свой микс оценивать нельзя</div>';
  return `
    <div class="community-rate">
      <span>Ваша оценка</span>
      <div>
        ${[1,2,3,4,5].map((value) => `
          <button type="button" data-community-rate="${mix.id}" data-rating="${value}" class="${Number(mix.myRating) >= value ? 'active' : ''}" aria-label="Оценить на ${value}">★</button>
        `).join('')}
      </div>
    </div>`;
}

function mixCard(mix) {
  const open = openedId === mix.id;
  return `
    <article class="community-card${mix.isMine ? ' is-mine' : ''}" data-community-card="${esc(mix.id)}">
      <div class="community-card-head">
        <div>
          <span class="community-author">${mix.isMine ? 'МОЙ МИКС' : esc(mix.author)}</span>
          <h3>${esc(mix.title)}</h3>
        </div>
        <div class="community-rating">
          ${mix.rankPosition ? `<em>#${mix.rankPosition}</em>` : ''}
          <b>${mix.ratingCount ? Number(mix.rating).toFixed(1) : '—'}</b>
          <span>${stars(mix.rating)}</span>
          <small>${esc(ratingText(mix))}</small>
        </div>
      </div>
      ${mix.description ? `<p class="community-description">${esc(mix.description)}</p>` : ''}
      <div class="community-meta">
        ${mix.strength ? `<span>Крепость ${mix.strength}/5</span>` : ''}
        <span>${mix.views || 0} открытий</span>
        <span>${mix.saves || 0} сохранений</span>
        <span>${esc(formatDate(mix.createdAt))}</span>
      </div>
      <button class="community-open-recipe" type="button" data-community-open="${esc(mix.id)}">
        ${open ? 'Скрыть рецепт' : 'Открыть рецепт'}
      </button>
      <div class="community-detail${open ? ' show' : ''}">
        <div class="community-recipe">
          <div class="community-detail-title">Состав и пропорции</div>
          ${recipeHtml(mix.recipe)}
        </div>
        ${ratingButtons(mix)}
        <div class="community-actions">
          ${mix.isMine
            ? '<button type="button" class="active" disabled>В сохранённых</button>'
            : `<button type="button" data-community-save="${esc(mix.id)}" class="${mix.saved ? 'active' : ''}">
                ${mix.saved ? 'Сохранено' : 'Сохранить'}
              </button>`}
          <button type="button" data-community-share="${esc(mix.id)}">Поделиться</button>
          ${mix.isMine
            ? `<button type="button" class="danger" data-community-delete="${esc(mix.id)}">Снять с публикации</button>`
            : `<button type="button" class="muted" data-community-report="${esc(mix.id)}">Пожаловаться</button>`}
        </div>
        ${mix.isMine ? `
          <div class="community-author-stats">
            <span>Место <b>${mix.rankPosition ? `#${mix.rankPosition}` : '—'}</b></span>
            <span>Рейтинг <b>${mix.ratingCount ? Number(mix.rating).toFixed(1) : '—'}</b></span>
            <span>Оценок <b>${mix.ratingCount || 0}</b></span>
            <span>Открытий <b>${mix.views || 0}</b></span>
            <span>Сохранений <b>${mix.saves || 0}</b></span>
          </div>` : ''}
      </div>
    </article>`;
}

function renderList() {
  const root = document.getElementById(CONTENT_ID);
  const list = root?.querySelector('#communityList');
  if (!list) return;
  setActiveTab(root);

  if (!mixes.length) {
    const [title, note] = emptyCopy(currentView);
    list.innerHTML = `<div class="community-empty"><b>${title}</b><span>${note}</span></div>`;
    return;
  }

  list.innerHTML = mixes.map(mixCard).join('');
  wireListActions(list);
}

function updateMix(id, patch) {
  mixes = mixes.map((mix) => mix.id === id ? { ...mix, ...patch } : mix);
  renderList();
}

async function loadView(view = currentView) {
  currentView = ['top', 'new', 'mine', 'saved'].includes(view) ? view : 'top';
  const root = document.getElementById(CONTENT_ID);
  if (!root) return;
  if (!root.querySelector('#communityList')) root.innerHTML = shellHtml();
  setActiveTab(root);
  const list = root.querySelector('#communityList');
  list.innerHTML = '<div class="community-loading">Загружаю Community…</div>';

  try {
    const data = await apiPost('list', { view: currentView });
    mixes = Array.isArray(data.mixes) ? data.mixes : [];
    openedId = null;
    renderList();
    trackAnalytics('community_list_open', { version: VERSION, view: currentView });
  } catch (error) {
    if (error?.status === 401) {
      root.innerHTML = `
        <section class="community-access-block">
          <span>COMMUNITY НЕДОСТУПЕН</span>
          <h3>Telegram-сессия не подтверждена</h3>
          <p>${esc(error.message || 'Не удалось подтвердить Telegram-сессию.')}</p>
          <b>Закрой Mini App и открой ALX Oracle заново через @Orcmix_bot. После нового запуска Telegram выдаст свежую защищённую сессию.</b>
          <button type="button" data-community-access-retry>Проверить снова</button>
        </section>`;
      root.querySelector('[data-community-access-retry]')?.addEventListener('click', () => openCommunity(currentView));
      return;
    }

    if (error?.status === 403) {
      root.innerHTML = `
        <section class="community-access-block">
          <span>ALX PRO REQUIRED</span>
          <h3>PRO не подтверждён сервером</h3>
          <p>Community разрешает публикацию только после серверной проверки активного ALX PRO.</p>
          <b id="communityProCheckMessage">Нажми «Проверить PRO», чтобы синхронизировать подписку.</b>
          <button type="button" data-community-pro-check>Проверить PRO</button>
        </section>`;
      root.querySelector('[data-community-pro-check]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const status = root.querySelector('#communityProCheckMessage');
        button.disabled = true;
        button.textContent = 'Проверяю…';
        try {
          const state = await syncProEntitlement({ attempts: 2, delayMs: 700 });
          if (state.active) {
            await openCommunity(currentView);
            return;
          }
          status.textContent = 'Активный ALX PRO не найден.';
          button.textContent = 'Открыть ALX PRO';
          button.disabled = false;
          button.onclick = () => {
            closeCommunity();
            requestProPaywall('Community Mixes');
          };
        } catch (syncError) {
          status.textContent = syncError.message || 'Не удалось проверить ALX PRO.';
          button.textContent = 'Повторить проверку';
          button.disabled = false;
        }
      });
      return;
    }

    list.innerHTML = `<div class="community-error"><b>Не удалось открыть Community</b><span>${esc(error.message)}</span><button type="button" data-community-retry>Повторить</button></div>`;
    list.querySelector('[data-community-retry]')?.addEventListener('click', () => loadView(currentView));
  }
}

async function toggleOpen(id) {
  openedId = openedId === id ? null : id;
  renderList();
  if (openedId === id) {
    apiPost('view', { id }).then((data) => updateMix(id, { views: data.views })).catch(() => {});
    trackAnalytics('community_mix_open', { version: VERSION });
  }
}

async function rateMix(id, rating) {
  try {
    const data = await apiPost('rate', { id, rating });
    updateMix(id, {
      rating: data.rating,
      ratingCount: data.ratingCount,
      rankScore: data.rankScore,
      myRating: data.myRating,
    });
    toast('Оценка сохранена');
    trackAnalytics('community_rate', { version: VERSION, rating });
  } catch (error) {
    toast(error.message || 'Не удалось сохранить оценку');
  }
}

async function saveMix(id) {
  const mix = mixes.find((item) => item.id === id);
  if (!mix) return;
  try {
    const data = await apiPost('save', { id, saved: !mix.saved });
    updateMix(id, { saved: data.saved, saves: data.saves });
    toast(data.saved ? 'Микс сохранён' : 'Удалено из сохранённых');
    trackAnalytics('community_save', { version: VERSION, saved: data.saved });
  } catch (error) {
    toast(error.message || 'Не удалось сохранить');
  }
}

function shareMix(id) {
  const mix = mixes.find((item) => item.id === id);
  if (!mix) return;
  const deepLink = `https://t.me/Orcmix_bot?startapp=community_${encodeURIComponent(id)}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(`Community Mix · ${mix.title} · ${mix.author}`)}`;
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank', 'noopener');
  }
  trackAnalytics('community_share', { version: VERSION });
}

function confirmAction(message) {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp?.showConfirm) {
      window.Telegram.WebApp.showConfirm(message, resolve);
      return;
    }
    resolve(window.confirm(message));
  });
}

async function reportMix(id) {
  if (!(await confirmAction('Отправить жалобу на этот Community-микс?'))) return;
  try {
    await apiPost('report', { id, reason: 'other' });
    toast('Жалоба отправлена');
    trackAnalytics('community_report', { version: VERSION });
  } catch (error) {
    toast(error.message || 'Не удалось отправить жалобу');
  }
}

async function deleteMix(id) {
  if (!(await confirmAction('Снять этот микс с публикации? Он исчезнет из Community.'))) return;
  try {
    await apiPost('delete', { id });
    mixes = mixes.filter((mix) => mix.id !== id);
    openedId = null;
    renderList();
    toast('Микс снят с публикации');
    trackAnalytics('community_delete', { version: VERSION });
  } catch (error) {
    toast(error.message || 'Не удалось снять микс');
  }
}

function wireListActions(list) {
  list.querySelectorAll('[data-community-open]').forEach((button) => {
    button.addEventListener('click', () => toggleOpen(button.dataset.communityOpen));
  });
  list.querySelectorAll('[data-community-rate]').forEach((button) => {
    button.addEventListener('click', () => rateMix(button.dataset.communityRate, Number(button.dataset.rating)));
  });
  list.querySelectorAll('[data-community-save]').forEach((button) => {
    button.addEventListener('click', () => saveMix(button.dataset.communitySave));
  });
  list.querySelectorAll('[data-community-share]').forEach((button) => {
    button.addEventListener('click', () => shareMix(button.dataset.communityShare));
  });
  list.querySelectorAll('[data-community-report]').forEach((button) => {
    button.addEventListener('click', () => reportMix(button.dataset.communityReport));
  });
  list.querySelectorAll('[data-community-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteMix(button.dataset.communityDelete));
  });
}

function componentRow(index, flavor = '', percent = '') {
  return `
    <div class="community-form-component" data-component-row>
      <input type="text" maxlength="48" placeholder="Вкус ${index + 1}" value="${esc(flavor)}" data-component-flavor>
      <input type="number" min="0.1" max="99.9" step="0.1" placeholder="%" value="${esc(percent)}" data-component-percent>
      <button type="button" data-component-remove aria-label="Удалить вкус">×</button>
    </div>`;
}

function renderPublishSuccess(mix) {
  const root = document.getElementById(CONTENT_ID);
  if (!root || !mix?.id) return;

  root.innerHTML = `
    <section class="community-publish-success">
      <div class="community-success-mark" aria-hidden="true">✓</div>
      <span>ОПУБЛИКОВАНО В COMMUNITY</span>
      <h3>${esc(mix.title || 'Новый микс')}</h3>
      <p>Микс успешно опубликован. Он доступен другим участникам Community, находится в «Мои» и «Сохранённые» и может выпадать из шара в режиме Community Mixes.</p>
      <div class="community-success-summary">
        <div><small>Автор</small><b>${esc(mix.author || defaultAuthor())}</b></div>
        <div><small>Статус</small><b>Опубликован</b></div>
        <div><small>Рейтинг</small><b>Ждёт оценок</b></div>
      </div>
      <div class="community-success-actions">
        <button type="button" class="community-success-primary" data-success-open>Открыть мой микс</button>
        <button type="button" data-success-mine>Перейти в мои миксы</button>
      </div>
      <small class="community-success-note">После первой оценки у микса появятся рейтинг и место в общем списке. В режиме Community Mixes шар выбирает опубликованные рецепты участников.</small>
    </section>`;

  const goMine = async (open = false) => {
    currentView = 'mine';
    root.innerHTML = shellHtml();
    wireShell(root);
    await loadView('mine');
    if (open) {
      const exists = mixes.some((item) => item.id === mix.id);
      if (exists) {
        openedId = mix.id;
        renderList();
        document.querySelector(`[data-community-card="${CSS.escape(mix.id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
  };

  root.querySelector('[data-success-open]')?.addEventListener('click', () => goMine(true));
  root.querySelector('[data-success-mine]')?.addEventListener('click', () => goMine(false));
}

function renderCreateForm() {
  const root = document.getElementById(CONTENT_ID);
  if (!root) return;
  root.innerHTML = `
    <section class="community-form-head">
      <button type="button" data-community-back>← Назад</button>
      <div><span>НОВАЯ ПУБЛИКАЦИЯ</span><h3>Создать Community-микс</h3></div>
    </section>
    <form id="communityCreateForm" class="community-form" novalidate>
      <label>
        <span>Название</span>
        <input name="title" type="text" maxlength="60" minlength="2" required placeholder="Например: Cherry Night">
      </label>
      <label>
        <span>Имя автора</span>
        <input name="authorName" type="text" maxlength="32" minlength="2" required value="${esc(defaultAuthor())}">
        <small>Это имя увидят другие пользователи. Telegram ID не публикуется.</small>
      </label>
      <label>
        <span>Короткое описание</span>
        <textarea name="description" maxlength="240" rows="3" placeholder="Какой характер у этого микса?"></textarea>
      </label>
      <label>
        <span>Крепость</span>
        <select name="strength">
          <option value="">Не указывать</option>
          <option value="1">1 · лёгкая</option>
          <option value="2">2</option>
          <option value="3">3 · средняя</option>
          <option value="4">4</option>
          <option value="5">5 · крепкая</option>
        </select>
      </label>
      <div class="community-form-recipe">
        <div class="community-form-row-title">
          <span>Состав и пропорции</span>
          <b id="communityPercentTotal">0%</b>
        </div>
        <div id="communityComponents">
          ${componentRow(0)}
          ${componentRow(1)}
          ${componentRow(2)}
        </div>
        <button type="button" class="community-add-component" data-component-add>+ Добавить вкус</button>
        <small>От 2 до 6 вкусов. Общая сумма должна быть ровно 100%.</small>
      </div>
      <div class="community-rules">
        <b>Перед публикацией</b>
        <span>Не добавляй рекламу и ссылки. Один и тот же состав нельзя публиковать повторно. Лимит — 5 новых миксов за 24 часа.</span>
      </div>
      <button type="submit" class="community-publish">Опубликовать в Community</button>
      <div class="community-form-message" id="communityFormMessage"></div>
    </form>`;

  const form = root.querySelector('#communityCreateForm');
  root.querySelector('[data-community-back]')?.addEventListener('click', () => {
    root.innerHTML = shellHtml();
    wireShell(root);
    loadView(currentView);
  });

  function updateTotal() {
    const total = [...form.querySelectorAll('[data-component-percent]')]
      .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
    const display = Math.round(total * 10) / 10;
    const node = root.querySelector('#communityPercentTotal');
    node.textContent = `${display}%`;
    node.classList.toggle('is-valid', Math.abs(display - 100) < 0.01);
  }

  function wireRows() {
    form.querySelectorAll('[data-component-percent]').forEach((input) => {
      input.oninput = updateTotal;
    });
    form.querySelectorAll('[data-component-remove]').forEach((button) => {
      button.onclick = () => {
        if (form.querySelectorAll('[data-component-row]').length <= MIN_COMPONENTS) {
          toast('Нужно минимум 2 вкуса');
          return;
        }
        button.closest('[data-component-row]')?.remove();
        updateTotal();
        wireRows();
      };
    });
  }

  root.querySelector('[data-component-add]')?.addEventListener('click', () => {
    const holder = root.querySelector('#communityComponents');
    const count = holder.querySelectorAll('[data-component-row]').length;
    if (count >= MAX_COMPONENTS) {
      toast('Максимум 6 вкусов');
      return;
    }
    holder.insertAdjacentHTML('beforeend', componentRow(count));
    wireRows();
    updateTotal();
  });

  wireRows();
  updateTotal();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('.community-publish');
    const message = root.querySelector('#communityFormMessage');
    const title = String(form.elements.title.value || '').trim();
    const authorName = String(form.elements.authorName.value || '').trim();
    const recipe = [...form.querySelectorAll('[data-component-row]')].map((row) => ({
      flavor: String(row.querySelector('[data-component-flavor]')?.value || '').trim(),
      percent: Number(row.querySelector('[data-component-percent]')?.value || 0),
    }));
    const filledRecipe = recipe.filter((item) => item.flavor || item.percent > 0);
    const total = Math.round(filledRecipe.reduce((sum, item) => sum + item.percent, 0) * 10) / 10;

    const failBeforeSend = (text) => {
      message.className = 'community-form-message is-error';
      message.innerHTML = `<b>НЕ ОПУБЛИКОВАНО</b><span>${esc(text)}</span>`;
      submit.disabled = false;
      submit.textContent = 'Опубликовать в Community';
      message.scrollIntoView({ block: 'center', behavior: 'smooth' });
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch (error) { /* non-fatal */ }
    };

    if (title.length < 2) {
      failBeforeSend('Добавь название микса — минимум 2 символа.');
      return;
    }
    if (authorName.length < 2) {
      failBeforeSend('Укажи имя автора, которое увидят другие пользователи.');
      return;
    }
    if (filledRecipe.length < MIN_COMPONENTS || filledRecipe.length > MAX_COMPONENTS) {
      failBeforeSend('Добавь от 2 до 6 заполненных вкусов.');
      return;
    }
    if (filledRecipe.some((item) => !item.flavor || !Number.isFinite(item.percent) || item.percent <= 0)) {
      failBeforeSend('У каждого вкуса должны быть название и процент больше 0.');
      return;
    }
    if (Math.abs(total - 100) > 0.01) {
      failBeforeSend(`Сумма пропорций сейчас ${total}%. Нужно ровно 100%.`);
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Публикую…';
    message.className = 'community-form-message is-pending';
    message.innerHTML = '<b>ПУБЛИКАЦИЯ…</b><span>Проверяю Telegram, PRO и сохраняю рецепт в Community.</span>';

    try {
      const data = await apiPost('create', {
        title,
        authorName,
        description: form.elements.description.value,
        strength: form.elements.strength.value ? Number(form.elements.strength.value) : null,
        recipe: filledRecipe,
      }, 15000);
      if (!data?.mix?.id) throw new Error('Публикация не подтверждена сервером. Попробуй ещё раз.');
      trackAnalytics('community_create', { version: VERSION, components: recipe.length });
      renderPublishSuccess(data.mix);
    } catch (error) {
      const reason = error?.message || 'Сервер не подтвердил публикацию.';
      message.className = 'community-form-message is-error';
      message.innerHTML = `<b>НЕ ОПУБЛИКОВАНО</b><span>${esc(reason)}</span><small>Рецепт не потерян — исправь причину и нажми кнопку ещё раз.</small>`;
      submit.disabled = false;
      submit.textContent = 'Попробовать снова';
      message.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('Микс не опубликован');
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error'); } catch (hapticError) { /* non-fatal */ }
      trackAnalytics('community_create_failed', { version: VERSION, reason: String(error?.status || 'client') });
    }
  });
}

function wireShell(root) {
  root.querySelector('[data-community-create]')?.addEventListener('click', renderCreateForm);
  root.querySelectorAll('[data-community-tab]').forEach((button) => {
    button.addEventListener('click', () => loadView(button.dataset.communityTab));
  });
}

function toast(message) {
  let node = document.getElementById('alxCommunityToast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'alxCommunityToast';
    node.className = 'community-toast';
    document.body.appendChild(node);
  }
  node.textContent = String(message || '');
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2200);
}

export async function openCommunity(view = 'top') {
  if (!getProState().active) {
    requestProPaywall('Community Mixes');
    return;
  }
  previewId = null;
  const overlay = ensureOverlay();
  const root = document.getElementById(CONTENT_ID);
  root.innerHTML = shellHtml();
  wireShell(root);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  setBottomNav('pro');
  currentView = view;
  await loadView(view);
  trackAnalytics('community_open', { version: VERSION, view });
}

export function closeCommunity() {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
  setBottomNav('home');
  previewId = null;
}

async function openSharedPreview(id) {
  previewId = id;
  const overlay = ensureOverlay();
  const root = document.getElementById(CONTENT_ID);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  setBottomNav('pro');
  root.innerHTML = '<div class="community-loading">Открываю Community Mix…</div>';

  try {
    const preview = await apiPreview(id);
    const pro = getProState().active;
    root.innerHTML = `
      <section class="community-shared-preview">
        <span>COMMUNITY MIX</span>
        <h3>${esc(preview.title)}</h3>
        <div class="community-shared-author">от ${esc(preview.author)}</div>
        ${preview.description ? `<p>${esc(preview.description)}</p>` : ''}
        <div class="community-shared-rating">
          <b>${preview.ratingCount ? Number(preview.rating).toFixed(1) : '—'}</b>
          <span>${stars(preview.rating)}</span>
          <small>${preview.ratingCount || 0} оценок · ${preview.saves || 0} сохранений</small>
        </div>
        <div class="community-preview-lock">
          <b>Рецепт и пропорции ${pro ? 'готовы к открытию' : 'доступны в ALX PRO'}</b>
          <span>${pro ? 'Открой карточку и оцени микс автора.' : 'Community Mixes — закрытый раздел для участников ALX PRO.'}</span>
        </div>
        <button type="button" class="community-preview-open" data-shared-open>
          ${pro ? 'Открыть рецепт' : 'Открыть с ALX PRO'}
        </button>
      </section>`;

    root.querySelector('[data-shared-open]')?.addEventListener('click', async () => {
      if (!getProState().active) {
        closeCommunity();
        requestProPaywall('Community Mixes');
        return;
      }
      root.innerHTML = '<div class="community-loading">Открываю рецепт…</div>';
      try {
        const data = await apiPost('get', { id });
        mixes = [data.mix];
        currentView = 'top';
        openedId = id;
        root.innerHTML = shellHtml();
        wireShell(root);
        renderList();
        apiPost('view', { id }).then((viewData) => updateMix(id, { views: viewData.views })).catch(() => {});
      } catch (error) {
        root.innerHTML = `<div class="community-error"><b>Не удалось открыть рецепт</b><span>${esc(error.message)}</span></div>`;
      }
    });
  } catch (error) {
    root.innerHTML = `<div class="community-error"><b>Community-микс недоступен</b><span>${esc(error.message)}</span></div>`;
  }
}

function sharedStartId() {
  const raw = String(
    window.Telegram?.WebApp?.initDataUnsafe?.start_param
    || new URLSearchParams(window.location.search).get('tgWebAppStartParam')
    || new URLSearchParams(window.location.search).get('startapp')
    || '',
  ).trim();
  if (!raw.startsWith('community_')) return '';
  return raw.slice('community_'.length);
}

function enhanceMyAlx() {
  const section = document.querySelector('#myAlxContent .my-alx-section');
  if (!section || document.getElementById('myAlxCommunity')) return;
  const button = document.createElement('button');
  button.id = 'myAlxCommunity';
  button.className = 'my-alx-row';
  button.type = 'button';
  button.innerHTML = `
    <span>Community Mixes</span>
    <small>${getProState().active ? 'мои рецепты, оценки и рейтинг' : 'создание и рейтинг миксов · ALX PRO'}</small>`;
  button.addEventListener('click', () => {
    document.getElementById('myAlxClose')?.click();
    setTimeout(() => {
      if (getProState().active) openCommunity('mine');
      else requestProPaywall('Community Mixes');
    }, 90);
  });
  section.appendChild(button);
}

function init() {
  ensureOverlay();

  window.addEventListener('alx-community-open', (event) => {
    const view = event?.detail?.view || 'top';
    openCommunity(view).catch((error) => {
      console.warn('[ALX Community]', error);
      toast(error.message || 'Не удалось открыть Community');
    });
  });

  window.addEventListener('alx-pro-change', () => {
    enhanceMyAlx();
    if (previewId) openSharedPreview(previewId);
  });

  document.addEventListener('click', (event) => {
    const home = event.target instanceof Element
      ? event.target.closest('#alxBottomNav [data-tab="home"]')
      : null;
    if (home && document.getElementById(OVERLAY_ID)?.classList.contains('show')) closeCommunity();
  }, true);

  const observer = new MutationObserver(enhanceMyAlx);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceMyAlx();

  const startId = sharedStartId();
  if (startId) setTimeout(() => openSharedPreview(startId), 350);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
