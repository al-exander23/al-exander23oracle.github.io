# White-label / multi-tenant setup

ALX Oracle can serve multiple hookah venues from one codebase. Each venue gets its own Telegram bot and public branding, while product updates remain shared.

## What changes per venue

Only the public tenant config changes:

- venue name;
- wordmark;
- optional logo URL;
- Telegram bot username;
- contacts;
- Community labels.

The visual system, layout and product logic remain standardized.

## How a venue is selected

Configure the venue bot's Mini App URL as:

```
https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<tenant-id>
```

Example tenant IDs: `alx`, `lounge-one`, `hookah-city`.

## Add a venue

Preferred repeatable path:

1. Run the tenant helper:

```bash
node scripts/add-tenant.mjs lounge-one "Lounge One" lounge_one_bot
```

2. Review the generated object in `data/tenants.json`.
3. Create/configure the venue bot in BotFather and point its Mini App URL to the URL printed by the helper.
4. Add the token as the individual encrypted Cloudflare Worker secret printed by the helper.

For tenant `lounge-one` the preferred secret is:

```
TENANT_BOT_TOKEN_LOUNGE_ONE
```

The legacy JSON secret `TENANT_BOT_TOKENS` remains supported only for backwards compatibility with already provisioned tenants. New customers should always use one individual secret per bot, so onboarding a new venue never requires reading or replacing another customer's token.

Never commit bot tokens to GitHub.

## Community Mixes isolation

ALX keeps the existing ALX PRO requirement.

Branded venue tenants authenticate through their own Telegram bot token. Their Community Mixes are isolated by tenant prefix, so one venue does not see another venue's user recipes.

Venue end users do not need ALX PRO for Community in the current white-label model: the venue's monthly B2B subscription is the commercial access layer.

Official Oracle/ALX mixes and user Community Mixes remain separate datasets.

## New client checklist

Ask the buyer for:

- venue name;
- logo (PNG/SVG or public URL);
- desired bot username/name;
- Telegram contact;
- phone/social link if needed.

Do not promise custom colors, layout changes or individual feature development in the base package. Those are separate paid changes.


## Smoke Test

Первый тестовый tenant:

- tenant id: `smoke-test`
- bot: `@smokertesterbot`
- Mini App URL after production merge: `https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=smoke-test`
- Smoke Test may continue using the existing legacy `TENANT_BOT_TOKENS` secret; new venues use individual `TENANT_BOT_TOKEN_<TENANT>` secrets.

Before onboarding a real venue, verify ALX default mode, Smoke Test branding, unlimited Oracle access, Community auth and cross-tenant isolation.
