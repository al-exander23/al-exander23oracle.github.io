// tenant.js — white-label tenant resolver for ALX Oracle.
//
// One codebase serves ALX Oracle and branded venue bots. A venue is selected by
// ?tenant=<id> in the Mini App URL. Public branding lives in data/tenants.json;
// bot tokens never belong in the frontend and are configured as Worker secrets.

const DEFAULT_TENANT_ID = 'alx';
const TENANTS_URL = new URL('../data/tenants.json', import.meta.url);

const FALLBACK_TENANT = Object.freeze({
  id: DEFAULT_TENANT_ID,
  displayName: 'ALX Oracle',
  wordmark: 'МИКС ОРАКУЛ',
  pageTitle: 'ALX Oracle — Микс Оракул',
  logoUrl: '',
  botUsername: 'Orcmix_bot',
  communityName: 'Community Mixes',
  communityKicker: 'ALX PRO COMMUNITY',
  communityIntroLabel: 'СООБЩЕСТВО ALX',
  requirePro: true,
  contacts: {},
});

let tenant = { ...FALLBACK_TENANT };
let initialized = false;

function cleanTenantId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,47}$/.test(id) ? id : '';
}

function requestedTenantId() {
  const params = new URLSearchParams(window.location.search || '');
  const direct = cleanTenantId(params.get('tenant'));
  if (direct) return direct;

  const start = String(
    window.Telegram?.WebApp?.initDataUnsafe?.start_param
    || params.get('tgWebAppStartParam')
    || params.get('startapp')
    || '',
  ).trim();
  const match = start.match(/^tenant_([a-z0-9][a-z0-9-]{0,47})(?:_|$)/i);
  return cleanTenantId(match?.[1]) || DEFAULT_TENANT_ID;
}

function normalizeTenant(raw, requestedId) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const id = cleanTenantId(source.id || requestedId) || DEFAULT_TENANT_ID;
  return {
    ...FALLBACK_TENANT,
    ...source,
    id,
    displayName: String(source.displayName || FALLBACK_TENANT.displayName).trim(),
    wordmark: String(source.wordmark || source.displayName || FALLBACK_TENANT.wordmark).trim(),
    pageTitle: String(source.pageTitle || source.displayName || FALLBACK_TENANT.pageTitle).trim(),
    logoUrl: String(source.logoUrl || '').trim(),
    botUsername: String(source.botUsername || FALLBACK_TENANT.botUsername).replace(/^@+/, '').trim(),
    communityName: String(source.communityName || FALLBACK_TENANT.communityName).trim(),
    communityKicker: String(source.communityKicker || FALLBACK_TENANT.communityKicker).trim(),
    communityIntroLabel: String(source.communityIntroLabel || FALLBACK_TENANT.communityIntroLabel).trim(),
    requirePro: source.requirePro === true,
    contacts: source.contacts && typeof source.contacts === 'object' ? source.contacts : {},
  };
}

function applyBrand(config) {
  document.documentElement.dataset.tenant = config.id;
  document.title = config.pageTitle || config.displayName;

  const brand = document.querySelector('.brand');
  const wordmark = document.querySelector('.brand-text');
  if (brand) brand.dataset.text = config.wordmark;
  if (wordmark) {
    wordmark.textContent = config.wordmark;
    wordmark.dataset.text = config.wordmark;
  }

  let logo = document.getElementById('tenantBrandLogo');
  if (config.logoUrl) {
    if (!logo && brand) {
      logo = document.createElement('img');
      logo.id = 'tenantBrandLogo';
      logo.className = 'brand-logo';
      logo.alt = config.displayName;
      brand.prepend(logo);
    }
    if (logo) {
      logo.src = config.logoUrl;
      logo.alt = config.displayName;
      logo.hidden = false;
    }
  } else if (logo) {
    logo.hidden = true;
  }

  window.ALX_TENANT = Object.freeze({ ...config });
  window.dispatchEvent(new CustomEvent('alx-tenant-ready', { detail: window.ALX_TENANT }));
}

export async function initTenant() {
  if (initialized) return tenant;
  initialized = true;
  const requestedId = requestedTenantId();

  try {
    const response = await fetch(TENANTS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`TENANTS_HTTP_${response.status}`);
    const registry = await response.json();
    const selected = registry?.[requestedId] || registry?.[DEFAULT_TENANT_ID] || FALLBACK_TENANT;
    tenant = normalizeTenant(selected, registry?.[requestedId] ? requestedId : DEFAULT_TENANT_ID);
  } catch (error) {
    console.warn('[Tenant] using fallback config:', error);
    tenant = { ...FALLBACK_TENANT };
  }

  applyBrand(tenant);
  return tenant;
}

export function getTenant() {
  return tenant;
}

export function getTenantId() {
  return tenant.id || DEFAULT_TENANT_ID;
}

export function tenantRequiresPro() {
  return tenant.requirePro === true;
}

export function getTenantBotUsername() {
  return String(tenant.botUsername || FALLBACK_TENANT.botUsername).replace(/^@+/, '');
}

await initTenant();
