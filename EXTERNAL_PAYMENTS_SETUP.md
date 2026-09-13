# ALX Oracle external payments v1.15

This stage adds a standalone ALX Pay website and a Cloudflare Worker/D1 backend for card + SBP payments through YooKassa. It stays separate from the Telegram Mini App; Telegram Stars remain the in-Telegram payment method.

## Implemented

- `/pay` standalone ALX PRO payment interface.
- Telegram website login using the current OIDC + PKCE flow.
- YooKassa payment creation for `sbp` and `bank_card`.
- YooKassa `payment.succeeded` webhook processing.
- Server-side re-check of YooKassa payments before PRO is granted.
- D1 tables for payments and external PRO entitlements.
- `/api/miniapp/status` endpoint for restoring externally purchased PRO in the Mini App.

## Test first

Start with YooKassa test credentials. Complete one end-to-end test payment before enabling real money. Production receipts/fiscalization must then be configured according to the merchant account.

## Cloudflare setup

Create a D1 database named `alx-pay`, apply `cloudflare/schema.sql`, and create a Worker using `cloudflare/worker.js` plus static assets from `/pay`.

Worker secrets:
- `SESSION_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CLIENT_ID`
- `TELEGRAM_CLIENT_SECRET`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`

Public variables:
- `ALX_EXTERNAL_PRICE_RUB`
- `ALX_ALLOWED_ORIGIN=https://al-exander23.github.io`
- `ALX_PAY_ORIGIN=https://<worker-domain>`

## Telegram Login

After the Worker has a public domain, open BotFather -> ALX Oracle bot -> Login Widget and register:
- `https://<worker-domain>`
- `https://<worker-domain>/auth/telegram/callback`

Store the Client Secret only as a Worker secret.

## YooKassa

Get the shop ID and API secret from YooKassa. Configure the successful-payment notification URL as:

`https://<worker-domain>/api/yookassa/webhook`

The Worker re-fetches every successful payment from YooKassa and verifies status, amount and Telegram user metadata before granting PRO.

## Purchase flow

External website -> Telegram login -> SBP/card -> YooKassa -> verified webhook -> D1 PRO entitlement -> Mini App restores PRO using signed Telegram initData.

Do not add an alternative card/SBP purchase button to the digital-goods paywall inside Telegram Mini App. The external ALX Pay page is a separate sales channel.
