// originals-nav-hook.js — routes the readable PRO tab to the ALX PRO catalog.
// Capture phase prevents the legacy hidden PRO button from opening the old
// purchase sheet first; FREE users can still open the paywall from the catalog.

import { openCatalog } from './originals-catalog.js?v=1.24.0-originals-catalog';

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
  openCatalog().catch((error) => console.warn('[ALX Originals catalog]', error));
}, true);
