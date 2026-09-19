// originals-nav-hook.js — routes the readable PRO tab to the unified PRO library.
// Capture phase prevents the legacy hidden PRO button from opening the old
// purchase sheet first. Purchase still opens from explicit library CTAs.

import { openProLibrary } from './pro-library.js?v=1.31.0-community-oracle';

function markProTabActive() {
  document.querySelectorAll('#alxBottomNav .alx-bottom-nav-btn').forEach((button) => {
    const active = button.dataset.tab === 'pro';
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

document.addEventListener('click', (event) => {
  const element = event.target instanceof Element ? event.target : null;
  const proTab = element?.closest('#alxBottomNav [data-tab="pro"]');
  if (!proTab) return;

  event.preventDefault();
  event.stopPropagation();
  markProTabActive();
  openProLibrary().catch((error) => console.warn('[ALX PRO Library]', error));
}, true);
