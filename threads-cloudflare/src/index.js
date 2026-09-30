export { AlxThreadsWorkflow } from "./workflow.js";

const API = "https://graph.threads.net/v1.0";

async function getThreadsProfile(env) {
  if (!env.THREADS_ACCESS_TOKEN) {
    return { ok: false, error: "THREADS_ACCESS_TOKEN is not configured" };
  }

  const url = new URL(`${API}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", env.THREADS_ACCESS_TOKEN);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, status: res.status, providerError: body };
  }

  const expected = String(env.THREADS_EXPECTED_USERNAME || "alxoracle")
    .replace(/^@/, "")
    .toLowerCase();
  const actual = String(body.username || "")
    .replace(/^@/, "")
    .toLowerCase();

  return {
    ok: actual === expected,
    id: body.id || null,
    username: body.username || null,
    expected: `@${expected}`,
    accountMatches: actual === expected
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const profile = await getThreadsProfile(env);
      return Response.json(profile, { status: profile.ok ? 200 : 503 });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        service: "ALX Threads Autoposter",
        runtime: "Cloudflare Workers + Workflows",
        workflow: "alx-threads-autoposter",
        health: "/health"
      });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
};
