import { FatalError, RetryableError, sleep } from "workflow";

export type ScheduledThreadsPost = {
  text: string;
  publishAt: string;
  jobId: string;
};

type ThreadItem = {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
};

const API = "https://graph.threads.net/v1.0";

function token() {
  const value = process.env.THREADS_ACCESS_TOKEN;
  if (!value) throw new FatalError("THREADS_ACCESS_TOKEN is not configured");
  return value;
}

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function graphPost(path: string, params: Record<string, string>) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function apiError(label: string, status: number, body: unknown): never {
  const safe = JSON.stringify(body).slice(0, 1200);
  if (status === 429 || status >= 500) {
    throw new RetryableError(`${label}: ${status} ${safe}`, { retryAfter: status === 429 ? "2m" : "30s" });
  }
  throw new FatalError(`${label}: ${status} ${safe}`);
}

async function findExactPost(text: string): Promise<ThreadItem | null> {
  const { res, body } = await graphGet("/me/threads", {
    fields: "id,text,timestamp,permalink",
    limit: "25",
    access_token: token(),
  });
  if (!res.ok) apiError("read latest Threads posts failed", res.status, body);
  const rows = Array.isArray((body as any).data) ? (body as any).data as ThreadItem[] : [];
  return rows.find((p) => p.text === text) ?? null;
}

async function publishStep(input: ScheduledThreadsPost) {
  "use step";

  const me = await graphGet("/me", {
    fields: "id,username",
    access_token: token(),
  });
  if (!me.res.ok) apiError("Threads profile check failed", me.res.status, me.body);

  const expected = process.env.THREADS_EXPECTED_USERNAME ?? "alxoracle";
  const actual = String((me.body as any).username ?? "").replace(/^@/, "").toLowerCase();
  if (actual !== expected.replace(/^@/, "").toLowerCase()) {
    throw new FatalError(`Wrong Threads account: expected @${expected}, got @${actual || "unknown"}`);
  }

  const existing = await findExactPost(input.text);
  if (existing) {
    return { status: "already_published" as const, mediaId: existing.id, permalink: existing.permalink ?? null, jobId: input.jobId };
  }

  const created = await graphPost("/me/threads", {
    media_type: "TEXT",
    text: input.text,
    access_token: token(),
  });
  if (!created.res.ok) apiError("create Threads container failed", created.res.status, created.body);

  const creationId = String((created.body as any).id ?? "");
  if (!creationId) throw new RetryableError("Meta returned no container id", { retryAfter: "20s" });

  const published = await graphPost("/me/threads_publish", {
    creation_id: creationId,
    access_token: token(),
  });

  if (!published.res.ok) {
    const recovered = await findExactPost(input.text);
    if (recovered) {
      return { status: "recovered" as const, mediaId: recovered.id, permalink: recovered.permalink ?? null, jobId: input.jobId };
    }
    apiError("publish Threads container failed", published.res.status, published.body);
  }

  const mediaId = String((published.body as any).id ?? "");
  if (!mediaId) {
    const recovered = await findExactPost(input.text);
    if (recovered) return { status: "recovered" as const, mediaId: recovered.id, permalink: recovered.permalink ?? null, jobId: input.jobId };
    throw new RetryableError("Publish returned no media id", { retryAfter: "20s" });
  }

  return { status: "published" as const, mediaId, permalink: null, jobId: input.jobId };
}

export async function scheduledThreadsPost(input: ScheduledThreadsPost) {
  "use workflow";
  await sleep(new Date(input.publishAt));
  return publishStep(input);
}
