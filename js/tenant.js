// tenant.js — white-label branding layer.
// A venue is selected by ?tenant=<slug>. The ALX configuration remains the safe default.

const FALLBACK = Object.freeze({
  id: 'alx',
  appName: 'ALX Oracle',
  shortBrand: 'ALX',
  brandText: 'МИКС ОРАКУЛ',
  proName: 'ALX PRO',
  originalsName: 'ALX Originals',
  signatureName: 'ALX Signature',
  communityName: 'СООБЩЕСТВО ALX',
  pageTitle: 'ALX Oracle — Микс Оракул',
  logoUrl: '',
  botUrl: 'https://t.me/Orcmix_bot',
  contactUrl: '',
  contactLabel: '',
});

let currentTenant = { ...FALLBACK };

function clean(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requestedTenantId() {
  const raw = new URLSearchParams(window.location.search).get('tenant') || '';
  const id = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,49}$/.test(id) ? id : 'default';
}

function normalize(raw = {}) {
  const appName = clean(raw.appName, FALLBACK.appName);
  return {
    id: clean(raw.id, FALLBACK.id),
    appName,
    shortBrand: clean(raw.shortBrand, FALLBACK.shortBrand),
    brandText: clean(raw.brandText, FALLBACK.brandText),
    proName: clean(raw.proName, FALLBACK.proName),
    originalsName: clean(raw.originalsName, FALLBACK.originalsName),
    signatureName: clean(raw.signatureName, FALLBACK.signatureName),
    communityName: clean(raw.communityName, FALLBACK.communityName),
    pageTitle: clean(raw.pageTitle, appName + ' — Микс Оракул'),
    logoUrl: clean(raw.logoUrl, ''),
    botUrl: clean(raw.botUrl, FALLBACK.botUrl),
    contactUrl: clean(raw.contactUrl, ''),
    contactLabel: clean(raw.contactLabel, ''),
  };
}

function rewriteString(input) {
  if (typeof input !== 'string' || currentTenant.id === 'alx') return input;

  const pairs = [
    [FALLBACK.appName.toUpperCase(), currentTenant.appName.toUpperCase()],
    [FALLBACK.appName, currentTenant.appName],
    [FALLBACK.proName, currentTenant.proName],
    [FALLBACK.originalsName, currentTenant.originalsName],
    [FALLBACK.signatureName, currentTenant.signatureName],
    [FALLBACK.communityName, currentTenant.communityName],
  ];

  let out = input;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out.replace(/\bALX\b/g, currentTenant.shortBrand);
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  return !parent || ['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'].includes(parent.tagName);
}

function rewriteNode(root) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkipTextNode(root)) {
      const next = rewriteString(root.nodeValue || '');
      if (next !== root.nodeValue) root.nodeValue = next;
    }
    return;
  }

  if (!(root instanceof Element) && root !== document) return;

  if (root instanceof Element) {
    ['aria-label', 'title', 'placeholder', 'data-text'].forEach((attr) => {
      if (!root.hasAttribute(attr)) return;
      const value = root.getAttribute(attr) || '';
      const next = rewriteString(value);
      if (next !== value) root.setAttribute(attr, next);
    });
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!shouldSkipTextNode(node)) {
      const next = rewriteString(node.nodeValue || '');
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

function applyTopBrand() {
  document.title = currentTenant.pageTitle;
  document.documentElement.dataset.tenant = currentTenant.id;

  const brand = document.querySelector('.brand');
  const brandText = document.querySelector('.brand-text');

  if (brand) brand.setAttribute('data-text', currentTenant.brandText);
  if (brandText) {
    brandText.textContent = currentTenant.brandText;
    brandText.setAttribute('data-text', currentTenant.brandText);
  }

  let logo = document.getElementById('tenantBrandLogo');
  if (currentTenant.logoUrl && brand) {
    if (!logo) {
      logo = document.createElement('img');
      logo.id = 'tenantBrandLogo';
      logo.className = 'tenant-brand-logo';
      logo.alt = '';
      brand.insertBefore(logo, brand.firstChild);
    }
    logo.src = currentTenant.logoUrl;
    logo.hidden = false;
    brand.classList.add('brand--with-logo');
  } else if (logo) {
    logo.hidden = true;
    brand?.classList.remove('brand--with-logo');
  }
}

function observeDynamicUi() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        rewriteNode(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach((node) => rewriteNode(node));
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

async function loadTenant() {
  const id = requestedTenantId();

  try {
    const response = await fetch('data/tenants.json?v=1.40.0-multitenant', { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const all = await response.json();
    currentTenant = normalize(all?.[id] || all?.default || FALLBACK);
  } catch (error) {
    console.warn('[tenant] config unavailable, using ALX defaults:', error);
    currentTenant = { ...FALLBACK };
  }

  window.ALX_TENANT = Object.freeze({ ...currentTenant });
  applyTopBrand();
  rewriteNode(document.body);
  observeDynamicUi();
  window.dispatchEvent(new CustomEvent('alx-tenant-ready', { detail: window.ALX_TENANT }));
  return window.ALX_TENANT;
}

export function getTenant() {
  return window.ALX_TENANT || currentTenant || FALLBACK;
}

export const tenantReady = loadTenant();
