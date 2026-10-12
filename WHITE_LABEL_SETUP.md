# White-label venue setup

Одна кодовая база обслуживает ALX Oracle и брендированные версии заведений.

## Тарифная модель

- `start`: стандартная white-label версия, без фирменных миксов и клиентской аналитики.
- `business`: до 20 фирменных миксов + приватная venue analytics + QR tracking.
- `pro`: до 60 фирменных миксов + всё BUSINESS + промо-карточка и CTR.

ALX tenant использует `plan: alx` и сохраняет собственную FREE / ALX PRO модель.

## Tenant URL

`https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<tenant-id>`

QR source URL: `https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<tenant-id>&src=qr`

## Добавление клиента

Использовать `scripts/add-tenant.mjs` с флагом `--plan=start|business|pro`.

Новый Telegram token хранить в индивидуальном секрете `TENANT_BOT_TOKEN_<TENANT_ID>`.

Для BUSINESS / PRO создать отдельный код аналитики в `TENANT_ANALYTICS_KEY_<TENANT_ID>`.

Legacy `TENANT_BOT_TOKENS` поддерживается только для ранее подключённых tenants.

## Фирменные миксы

`data/tenant-mixes.json` хранит публичные рецепты фирменных миксов по tenant ID. Лимиты применяются на клиенте и проверяются CI validator.

Фирменные рецепты входят в обычный пул Оракула и дополнительно доступны через коллекцию «Фирменные миксы». Карточка рецепта явно отмечает бренд заведения.

## Venue analytics

`https://alx-pay.alxoracle.workers.dev/venue-analytics?tenant=<tenant-id>`

Доступ защищён отдельным кодом. После успешного входа создаётся HttpOnly cookie-сессия. Код доступа не передаётся в URL.

Собираются агрегированные продуктовые события: открытия, подборы, фирменные миксы, избранное, share, Community, источники и PRO-promotions. Telegram ID, username и содержимое персональных подборов в analytics_events не сохраняются.

## PRO promotions

PRO tenant может иметь объект `promotion` с `kicker`, `title`, `text`, `ctaLabel`, `url`. Показы и клики отправляются в venue analytics.

## Smoke Test

`smoke-test` использует @smokertesterbot и переведён в BUSINESS для демонстрации фирменных миксов. Его текущий bot token остаётся в legacy secret, чтобы не ломать работающий тест.