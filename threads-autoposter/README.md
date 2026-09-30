# ALX Threads Autoposter

Independent Threads autoposter for **ALX Oracle (@alxoracle)**.

## Architecture

ChatGPT writes/schedules a job once. Vercel Workflow persists the post text and target datetime, sleeps durably, then publishes through the official Threads API. The publish step verifies the account, checks for exact-text duplicates, retries transient failures, and records the Media ID.

## Vercel

Import this GitHub repository and set **Root Directory** to `threads-autoposter`.

Production environment variables:

- `ADMIN_SECRET` — long random secret.
- `THREADS_ACCESS_TOKEN` — long-lived Threads user access token.
- `THREADS_EXPECTED_USERNAME=alxoracle`.

Health check:

```bash
curl -H "x-admin-secret: YOUR_SECRET" https://YOUR_APP.vercel.app/api/health
```

Schedule:

```bash
curl -X POST https://YOUR_APP.vercel.app/api/schedule \
  -H 'content-type: application/json' \
  -H 'x-admin-secret: YOUR_SECRET' \
  -d '{"jobId":"2026-10-01-1000","publishAt":"2026-10-01T10:00:00+05:00","text":"Текст поста"}'
```

## GitHub bridge

Create one new JSON file per post under `threads-autoposter/jobs/`. The repository workflow `.github/workflows/schedule-alx-threads.yml` schedules newly added files.

Repository secrets needed once:

- `ALX_AUTOPOSTER_URL` — Vercel production URL without trailing slash.
- `ALX_AUTOPOSTER_ADMIN_SECRET` — same as Vercel `ADMIN_SECRET`.

Job JSON:

```json
{
  "jobId": "2026-10-01-1000",
  "publishAt": "2026-10-01T10:00:00+05:00",
  "text": "Текст поста"
}
```
