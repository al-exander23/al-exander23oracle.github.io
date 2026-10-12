#!/usr/bin/env node
import fs from 'node:fs';

const tenants = JSON.parse(fs.readFileSync('data/tenants.json', 'utf8'));
const tenantMixes = JSON.parse(fs.readFileSync('data/tenant-mixes.json', 'utf8'));
const plans = new Set(['start', 'business', 'pro']);
const limits = { start: 0, business: 20, pro: 60 };
const errors = [];
const ids = new Set();

for (const [key, tenant] of Object.entries(tenants)) {
  if (!tenant || tenant.id !== key) errors.push(`Tenant key/id mismatch: ${key}`);
  if (key !== 'alx' && !plans.has(String(tenant.plan || 'start'))) errors.push(`Invalid plan for ${key}`);
  if (key !== 'alx' && tenant.promotion && tenant.plan !== 'pro') errors.push(`Promotion requires PRO plan: ${key}`);
}

for (const [tenantId, mixes] of Object.entries(tenantMixes)) {
  const tenant = tenants[tenantId];
  if (!tenant) {
    errors.push(`Mix registry references unknown tenant: ${tenantId}`);
    continue;
  }
  const plan = String(tenant.plan || 'start');
  const limit = limits[plan] ?? 0;
  if (!Array.isArray(mixes)) {
    errors.push(`Mix registry for ${tenantId} must be an array`);
    continue;
  }
  if (mixes.length > limit) errors.push(`${tenantId} has ${mixes.length} signature mixes, plan limit is ${limit}`);

  mixes.forEach((mix, index) => {
    const id = String(mix?.id || '').trim();
    if (!id) errors.push(`${tenantId} mix #${index + 1} has no id`);
    if (id && ids.has(id)) errors.push(`Duplicate signature mix id: ${id}`);
    if (id) ids.add(id);

    if (!String(mix?.name || '').trim()) errors.push(`${tenantId}/${id || index}: name required`);
    if (!Array.isArray(mix?.recipe) || mix.recipe.length < 2 || mix.recipe.length > 6) {
      errors.push(`${tenantId}/${id || index}: recipe must contain 2-6 parts`);
      return;
    }
    const total = mix.recipe.reduce((sum, part) => sum + Number(part?.percent || 0), 0);
    if (Math.abs(total - 100) > 0.01) errors.push(`${tenantId}/${id || index}: recipe total is ${total}, expected 100`);
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Venue configuration OK: ${Object.keys(tenants).length} tenants, ${ids.size} signature mixes.`);
