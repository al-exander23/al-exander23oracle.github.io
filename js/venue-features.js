// venue-features.js — B2B plan-specific guest features for white-label venues.

import { getTenant, getTenantId, getTenantPlan, tenantHasFeature } from './tenant.js?v=1.42.0-venue-plans';
import { trackAnalytics } from './analytics.js?v=1.42.0-venue-plans';

const TENANT = getTenant();
const TENANT_ID = getTenantId();
const PLAN = getTenantPlan();
const PROMO_ID = 'venuePromotionCard';

function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    return '';
  }
}

function openUrl(url) {
  if (!url) return;
  const tg = window.Telegram?.WebApp;
  if (typeof tg?.openLink === 'function') {
    try { tg.openLink(url); return; } catch (error) { /* browser fallback */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function ensurePromotion() {
  if (TENANT_ID === 'alx' || !tenantHasFeature('promotions')) return;
  const promo = TENANT.promotion;
  if (!promo || typeof promo !== 'object') return;

  const title = String(promo.title || '').trim();
  const text = String(promo.text || '').trim();
  if (!title || !text) return;

  let card = document.getElementById(PROMO_ID);
  if (card) return;

  card = document.createElement('section');
  card.id = PROMO_ID;
  card.className = 'venue-promo-card';

  const cta = String(promo.ctaLabel || 'Подробнее').trim();
  const url = safeUrl(promo.url);

  card.innerHTML = `
    <div class="venue-promo-kicker">${String(promo.kicker || 'СПЕЦПРЕДЛОЖЕНИЕ').replace(/[<>]/g, '')}</div>
    <div class="venue-promo-title"></div>
    <div class="venue-promo-text"></div>
    ${url ? '<button class="venue-promo-cta" type="button"></button>' : ''}
  `;

  card.querySelector('.venue-promo-title').textContent = title;
  card.querySelector('.venue-promo-text').textContent = text;
  const button = card.querySelector('.venue-promo-cta');
  if (button) {
    button.textContent = cta;
    button.addEventListener('click', () => {
      trackAnalytics('venue_promo_click', { venuePlan: PLAN });
      openUrl(url);
    });
  }

  const accessStrip = document.getElementById('alxAccessStrip');
  const hint = document.getElementById('hint');
  if (accessStrip) accessStrip.insertAdjacentElement('afterend', card);
  else if (hint) hint.insertAdjacentElement('afterend', card);
  else document.getElementById('stage')?.appendChild(card);

  trackAnalytics('venue_promo_view', { venuePlan: PLAN });
}

function init() {
  if (TENANT_ID === 'alx') return;
  ensurePromotion();
  window.addEventListener('alx-tenant-ready', ensurePromotion, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
