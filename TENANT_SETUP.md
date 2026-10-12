# White-label tenant setup

ALX Oracle can serve multiple venue brands from one codebase.

## Venue selection

Each venue bot opens the same Mini App URL with a tenant slug:

`https://al-exander23.github.io/al-exander23oracle.github.io/?tenant=<slug>`

The slug must match a top-level key in `data/tenants.json`.

## Add a venue

1. Add a new object to `data/tenants.json`.
2. Keep the standard layout, colors and Oracle mechanics unchanged.
3. Set the venue name, short brand, title, Telegram bot URL and optional logo.
4. If a logo is used, store it under `assets/tenants/<slug>/`.
5. Configure the venue bot Web App URL with `?tenant=<slug>`.

Example configuration:

```json
"smoke-room": {
  "id": "smoke-room",
  "appName": "Smoke Room",
  "shortBrand": "SMOKE",
  "brandText": "SMOKE ROOM",
  "proName": "SMOKE PRO",
  "originalsName": "Smoke Originals",
  "signatureName": "Smoke Signature",
  "communityName": "СООБЩЕСТВО SMOKE",
  "pageTitle": "Smoke Room — Микс Оракул",
  "logoUrl": "assets/tenants/smoke-room/logo.png",
  "botUrl": "https://t.me/SMOKE_ROOM_BOT",
  "contactUrl": "https://t.me/smoke_room",
  "contactLabel": "Smoke Room"
}
```

## Community access for branded bots

For tenant bots, keep bot tokens server-side in the Cloudflare secret
`ALX_TENANT_BOT_TOKENS` as a JSON object keyed by tenant slug:

```json
{"smoke-room":"123456:BOT_TOKEN"}
```

The default ALX bot continues to use `TELEGRAM_BOT_TOKEN`. Never put bot tokens in
`tenants.json`, frontend JavaScript or GitHub.

Tenant Community mixes are stored separately by tenant. The default ALX Community keeps
its existing PRO check; branded venue Communities can be used as a guest feature without
requiring ALX PRO.

## Commercial boundary

A standard white-label connection changes branding and venue settings only. Interface
layout, color palette and core functionality stay common. Custom features are separate
paid development.
