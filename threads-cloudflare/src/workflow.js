import { WorkflowEntrypoint } from "cloudflare:workers";

const API = "https://graph.threads.net/v1.0";

function safeProviderError(body) {
  try {
    return JSON.stringify(body).slice(0, 1500);
  } catch {
    return String(body).slice(0, 1500);
  }
}

async function graphGet(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function graphPost(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json" }
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function shouldRetry(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function findExactPost(token, text) {
  const { res, body } = await graphGet("/me/threads", {
    fields: "id,text,timestamp,permalink",
    limit: "50",
    access_token: token
  });

  if (!res.ok) {
    if (shouldRetry(res.status)) {
      throw new Error(
        `Transient Threads read error ${res.status}: ${safeProviderError(body)}`
      );
    }
    return { error: `Threads read failed ${res.status}`, providerError: body };
  }

  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.find((post) => post.text === text) || null;
}

async function publishIdempotently(env, payload) {
  const token = env.THREADS_ACCESS_TOKEN;
  if (!token) {
    return { status: "failed", reason: "THREADS_ACCESS_TOKEN is not configured" };
  }

  const expected = String(env.THREADS_EXPECTED_USERNAME || "alxoracle")
    .replace(/^@/, "")
    .toLowerCase();

  const me = await graphGet("/me", {
    fields: "id,username",
    access_token: token
  });

  if (!me.res.ok) {
    if (shouldRetry(me.res.status)) {
      throw new Error(
        `Transient profile check error ${me.res.status}: ${safeProviderError(me.body)}`
      );
    }
    return {
      status: "failed",
      reason: `Threads profile check failed ${me.res.status}`,
      providerError: me.body
    };
  }

  const actual = String(me.body.username || "")
    .replace(/^@/, "")
    .toLowerCase();

  if (actual !== expected) {
    return {
      status: "failed",
      reason: `Wrong Threads account: expected @${expected}, got @${actual || "unknown"}`
    };
  }

  const existing = await findExactPost(token, payload.text);
  if (existing && !existing.error) {
    return {
      status: "already_published",
      mediaId: existing.id,
      permalink: existing.permalink || null,
      jobId: payload.jobId
    };
  }

  const created = await graphPost("/me/threads", {
    media_type: "TEXT",
    text: payload.text,
    auto_publish_text: "true",
    access_token: token
  });

  if (!created.res.ok) {
    if (shouldRetry(created.res.status)) {
      throw new Error(
        `Transient auto-publish error ${created.res.status}: ${safeProviderError(created.body)}`
      );
    }
    return {
      status: "failed",
      reason: `Auto-publish Threads text failed ${created.res.status}`,
      providerError: created.body,
      jobId: payload.jobId
    };
  }

  const returnedId = String(created.body.id || "");
  if (!returnedId) {
    throw new Error("Threads auto-publish returned no ID");
  }

  const verified = await findExactPost(token, payload.text);
  if (verified && !verified.error) {
    return {
      status: "published",
      mediaId: verified.id,
      permalink: verified.permalink || null,
      jobId: payload.jobId
    };
  }

  return {
    status: "published",
    mediaId: returnedId,
    permalink: null,
    jobId: payload.jobId
  };
}

export class AlxThreadsWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event.payload || {};
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const publishAt = new Date(payload.publishAt);
    const jobId = String(payload.jobId || event.instanceId || "");

    if (!text) {
      return { status: "failed", reason: "text is required", jobId };
    }
    if (text.length > 500) {
      return { status: "failed", reason: "text exceeds 500 characters", jobId };
    }
    if (Number.isNaN(publishAt.getTime())) {
      return { status: "failed", reason: "publishAt must be valid ISO-8601", jobId };
    }

    if (publishAt.getTime() > Date.now()) {
      await step.sleepUntil("wait until publication time", publishAt);
    }

    return await step.do(
      "verify account, dedupe and publish",
      {
        retries: {
          limit: 3,
          delay: "20 seconds",
          backoff: "exponential"
        },
        timeout: "2 minutes"
      },
      async () =>
        publishIdempotently(this.env, {
          text,
          publishAt: publishAt.toISOString(),
          jobId
        })
    );
  }
}
