# ALX Oracle — Telegram Stars backend (v1.14)

This repository remains a static Telegram Mini App on GitHub Pages. The new `/api` functions are designed to run on Vercel and are called by the existing frontend through `window.ALX_API_BASE`.

## Required Vercel environment

- `TELEGRAM_BOT_TOKEN` — required, server-only. Never expose it in frontend files or GitHub.
- `ALX_PRO_PRICE_STARS` — optional. Defaults to `149` Stars per 30 days.
- `ALX_ALLOWED_ORIGIN` — recommended for production: `https://al-exander23.github.io`.
- `TELEGRAM_WEBHOOK_SECRET` — optional. If omitted, the server derives a stable secret from the bot token.
- `ALX_PUBLIC_API_URL` — optional. Normally the server derives its own Vercel URL from the request.

## Endpoints

- `GET /api/health` — deployment/config smoke check; never exposes the bot token.
- `POST /api/stars-create-invoice` — validates Telegram Mini App `initData`, ensures the Telegram webhook, then creates a recurring 30-day `XTR` invoice.
- `POST /api/stars-status` — validates `initData` and restores PRO from Telegram's Star transaction ledger.
- `POST /api/telegram-webhook` — validates Telegram's webhook secret and answers `pre_checkout_query`.

## Security model

- The browser never receives the bot token.
- Telegram Mini App `initData` is HMAC validated server-side.
- Invoice payloads are signed server-side and bound to Telegram user ID, amount, issue time and nonce.
- PRO is not granted merely because the client reports `paid`; the frontend polls `/api/stars-status` and only caches a verified server result.
- No database is required in v1.14. Telegram's own Stars transaction ledger is the source of truth, so access can be restored after reopening the Mini App.

## Frontend handoff

After Vercel deployment, set the public deployment origin in the GitHub Pages frontend before the module scripts, for example:

```html
<script>window.ALX_API_BASE = 'https://YOUR-PROJECT.vercel.app';</script>
```

Once this value is set, the current GitHub Pages Mini App can use the Vercel backend without changing the Mini App URL in Telegram.
