# ALX Threads Autoposter — Cloudflare

Cloudflare Workers + Workflows version of the ALX Oracle Threads scheduler.

## Why this replaces the Vercel/Windsor path

A post is queued once as a Cloudflare Workflow instance. The workflow persists its input, sleeps until `publishAt`, verifies @alxoracle, checks for an exact-text duplicate, then publishes through the official Threads API. Transient failures are retried automatically.

## Required GitHub secrets

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — scoped to the correct account; Workers Scripts Write.
- `ALX_THREADS_ACCESS_TOKEN` — Threads user token with publishing permission.

## Deployment

GitHub Action: `.github/workflows/deploy-alx-threads-cloudflare.yml`.

The Action deploys `threads-cloudflare/` with Wrangler and securely binds `ALX_THREADS_ACCESS_TOKEN` as `THREADS_ACCESS_TOKEN`.

## Scheduling

Add one JSON file under `threads-cloudflare/jobs/`.

Example:

```json
{
  "jobId": "2026-10-02-1000",
  "publishAt": "2026-10-02T10:00:00+05:00",
  "text": "Текст поста"
}
```

The scheduling GitHub Action creates a Cloudflare Workflow instance directly through the Cloudflare API.

## Runtime

Workflow name: `alx-threads-autoposter`

The Workflow uses `step.sleepUntil()`, so waiting until publication time does not consume active CPU.

Transient errors (408, 429, 5xx) retry automatically. Before every effective publish attempt the current Threads feed is checked for the exact text to prevent duplicate publication.
