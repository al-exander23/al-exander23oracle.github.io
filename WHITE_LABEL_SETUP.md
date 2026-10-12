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

1. Add a new object to `data/tenants.json`.
2. Create/configure the venue bot in BotFather and point its Mini App URL to the URL above.
3. Add the bot token to the Cloudflare Worker secret `TENANT_BOT_TOKENS` as a JSON object.

Example secret value:

```json
{
  "lounge-one": "<telegram-bot-token>",
  "hookah-city": "<telegram-bot-token>"
}
```

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
