# Venue onboarding runbook

## 1. Тарифы

- START — 9 900 ₽ + 2 990 ₽ / месяц.
- BUSINESS — 14 900 ₽ + 4 990 ₽ / месяц.
- PRO — 24 900 ₽ + 7 990 ₽ / месяц.

По умолчанию продавать BUSINESS. START — входной вариант. PRO — для промо, «Микса недели» и расширенного фирменного контента.

## 2. Данные клиента

Получить название, логотип, username бота, Telegram заведения, дополнительные контакты. Для BUSINESS / PRO — фирменные рецепты. Для PRO — текст и CTA промо.

## 3. Добавить tenant

START:
    node scripts/add-tenant.mjs lounge-one "Lounge One" lounge_one_bot "" "@lounge_one" "+79990000000" "https://example.com" --plan=start

BUSINESS:
    node scripts/add-tenant.mjs lounge-one "Lounge One" lounge_one_bot "" "@lounge_one" "+79990000000" "https://example.com" --plan=business

PRO:
    node scripts/add-tenant.mjs lounge-one "Lounge One" lounge_one_bot "" "@lounge_one" "+79990000000" "https://example.com" --plan=pro

## 4. Cloudflare Secrets

Для каждого клиента: `TENANT_BOT_TOKEN_<TENANT_ID>`.

Для BUSINESS / PRO дополнительно: `TENANT_ANALYTICS_KEY_<TENANT_ID>`.

Код аналитики должен быть уникальным и длинным. Не размещать секреты в GitHub, issue или публичной переписке.

## 5. Фирменные миксы

BUSINESS / PRO рецепты добавляются в `data/tenant-mixes.json` в массив соответствующего tenant.

Лимиты: START — 0, BUSINESS — 20, PRO — 60. Сумма процентов каждого рецепта должна быть ровно 100.

## 6. PRO-промо

В `data/tenants.json` у PRO tenant можно заполнить объект `promotion` с полями `kicker`, `title`, `text`, `ctaLabel`, `url`.

## 7. BotFather и QR

Mini App URL: `https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<tenant-id>`

QR tracking URL: `https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<tenant-id>&src=qr`

## 8. Аналитика BUSINESS / PRO

Панель: `https://alx-pay.alxoracle.workers.dev/venue-analytics?tenant=<tenant-id>`

Клиент вводит отдельный код аналитики. После входа используется HttpOnly-сессия; код не передаётся в URL.

## 9. Smoke test

Проверить бренд, отсутствие ALX PRO, безлимит, избранное, историю, контакты, Community и изоляцию tenants.

Для BUSINESS / PRO дополнительно проверить фирменные миксы и панель аналитики. Для PRO — промо-карточку и CTA.

## 10. Передача

Передать ссылку на бот, QR-ссылку, инструкцию персоналу, дату оплаты; BUSINESS / PRO — ссылку и код аналитики. Исходный код и инфраструктурные аккаунты не передаются.