// navigation.js — simplified, text-first navigation for ALX Oracle.
// Existing buttons remain the source of truth; secondary ones are hidden and
// triggered from a single readable menu so their behavior does not change.

import { trackAnalytics } from './analytics.js?v=1.19.0-analytics';

const VERSION = '1.22.0-navigation';
const MENU_BUTTON_ID = 'alxNavMenuButton';
const OVERLAY_ID = 'alxNavOverlay';

const SECONDARY_ACTIONS = [
  {
    targetId: 'historyBtnTop',
    title: 'История миксов',
    note: 'Все последние подборы Оракула',
    event: 'nav_history_open',
  },
  {
    targetId: 'tasteBtnTop',
    title: 'Профиль вкуса',
    note: 'Персонализация, Микс дня, серия и достижения',
    event: 'nav_taste_open',
  },
  {
    targetId: 'alxProTopButton',
    title: 'ALX PRO',
    note: 'Безлимитные подборы и закрытые коллекции',
    event: 'nav_pro_open',
  },
  {
    targetId: 'onboardingHelpBtn',
    title: 'Как пользоваться',
    note: 'Короткая инструкция по ALX Oracle',
    event: 'nav_help_open',
  },
];

function closeMenu() {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
}

function triggerExisting(targetId, eventName) {
  closeMenu();
  trackAnalytics(eventName, { navigationVersion: VERSION });
  setTimeout(() => {
    const target = document.getElementById(targetId);
    if (target) target.click();
  }, 80);
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'alx-nav-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="alx-nav-panel" role="dialog" aria-modal="true" aria-labelledby="alxNavTitle">
      <div class="alx-nav-head">
        <div>
          <div class="alx-nav-kicker">ALX ORACLE</div>
          <h2 id="alxNavTitle">Меню</h2>
        </div>
        <button class="alx-nav-close" id="alxNavClose" type="button">Закрыть</button>
      </div>
      <div class="alx-nav-list">
        ${SECONDARY_ACTIONS.map((item) => `
          <button class="alx-nav-row" type="button" data-target="${item.targetId}" data-event="${item.event}">
            <b>${item.title}</b>
            <small>${item.note}</small>
          </button>`).join('')}
      </div>
      <div class="alx-nav-foot">Основное действие всегда остаётся на главном экране — коснись шара, чтобы получить микс.</div>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#alxNavClose')?.addEventListener('click', closeMenu);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeMenu();
  });
  overlay.querySelectorAll('.alx-nav-row').forEach((button) => {
    button.addEventListener('click', () => {
      triggerExisting(button.dataset.target || '', button.dataset.event || 'nav_secondary_open');
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeMenu();
  });
  return overlay;
}

function openMenu() {
  const overlay = ensureOverlay();
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  trackAnalytics('nav_menu_open', { navigationVersion: VERSION });
}

function simplifyToolbar() {
  const toolbar = document.getElementById('topToolbar');
  if (!toolbar) return;

  const favorite = document.getElementById('favBtnTop');
  if (favorite) {
    favorite.textContent = 'Избранное';
    favorite.classList.add('alx-nav-main');
    favorite.setAttribute('aria-label', 'Открыть избранные миксы');
  }

  const myAlx = document.getElementById('myAlxTopButton');
  if (myAlx) {
    myAlx.textContent = 'Мой ALX';
    myAlx.classList.add('alx-nav-main');
    myAlx.setAttribute('aria-label', 'Открыть Мой ALX');
  }

  if (!document.getElementById(MENU_BUTTON_ID)) {
    const menu = document.createElement('button');
    menu.id = MENU_BUTTON_ID;
    menu.className = 'icon-btn alx-nav-main';
    menu.type = 'button';
    menu.textContent = 'Меню';
    menu.setAttribute('aria-label', 'Открыть меню');
    menu.addEventListener('click', openMenu);
    toolbar.appendChild(menu);
  }
}

function init() {
  simplifyToolbar();
  ensureOverlay();

  // Other modules create their toolbar buttons synchronously during startup,
  // but keep this observer as a safety net for slow WebViews.
  const observer = new MutationObserver(() => simplifyToolbar());
  observer.observe(document.getElementById('topToolbar') || document.body, { childList: true, subtree: false });
}

init();
