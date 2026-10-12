#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [, , tenantIdRaw, displayNameRaw, botUsernameRaw, logoUrlRaw = '', telegramRaw = '', phoneRaw = '', websiteRaw = ''] = process.argv;

function fail(message) {
  console.error(message);
  console.error('Usage: node scripts/add-tenant.mjs <tenant-id> "<display name>" <bot_username> [logoUrl] [telegram] [phone] [website]');
  process.exit(1);
}

function cleanTenantId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,47}$/.test(id) ? id : '';
}

function cleanBotUsername(value) {
  const username = String(value || '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(username) && /bot$/i.test(username) ? username : '';
}

const tenantId = cleanTenantId(tenantIdRaw);
const displayName = String(displayNameRaw || '').trim();
const botUsername = cleanBotUsername(botUsernameRaw);
if (!tenantId) fail('Invalid tenant id. Use lowercase letters, numbers and hyphens.');
if (!displayName) fail('Display name is required.');
if (!botUsername) fail('Telegram bot username is invalid or does not end in bot.');

const file = path.resolve('data/tenants.json');
const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
if (registry[tenantId]) fail(`Tenant "${tenantId}" already exists.`);

const contacts = {};
const telegram = String(telegramRaw || '').trim();
const phone = String(phoneRaw || '').trim();
const website = String(websiteRaw || '').trim();
if (telegram) contacts.telegram = telegram;
else contacts.telegram = `@${botUsername}`;
if (phone) contacts.phone = phone;
if (website) contacts.website = website;

registry[tenantId] = {
  id: tenantId,
  displayName,
  wordmark: displayName.toUpperCase(),
  pageTitle: `${displayName} — Микс Оракул`,
  logoUrl: String(logoUrlRaw || '').trim(),
  botUsername,
  communityName: 'Community Mixes',
  communityKicker: `${displayName.toUpperCase()} COMMUNITY`,
  communityIntroLabel: `СООБЩЕСТВО ${displayName.toUpperCase()}`,
  requirePro: false,
  contacts,
};

fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');

const secretName = `TENANT_BOT_TOKEN_${tenantId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
const miniAppUrl = `https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=${tenantId}`;

console.log('');
console.log('Tenant added successfully.');
console.log(`Tenant ID: ${tenantId}`);
console.log(`Bot: @${botUsername}`);
console.log(`Mini App URL: ${miniAppUrl}`);
console.log(`Cloudflare secret name: ${secretName}`);
console.log('Cloudflare secret value: paste the bot token directly in Cloudflare. Never commit it to GitHub.');
