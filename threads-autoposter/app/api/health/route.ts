import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) return Response.json({ ok: false, error: "THREADS_ACCESS_TOKEN missing" }, { status: 500 });

  const url = new URL("https://graph.threads.net/v1.0/me");
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return Response.json(
    { ok: res.ok, threads: res.ok ? data : undefined, providerError: res.ok ? undefined : data },
    { status: res.ok ? 200 : 502 },
  );
}
