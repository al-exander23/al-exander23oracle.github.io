import { start } from "workflow/api";
import { requireAdmin } from "@/lib/auth";
import { scheduledThreadsPost } from "@/workflows/scheduled-threads-post";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "ALX autoposter test";
  if (!text || text.length > 500) {
    return Response.json({ ok: false, error: "text must be 1-500 chars" }, { status: 400 });
  }

  const jobId = `test-${crypto.randomUUID()}`;
  const run = await start(
    scheduledThreadsPost,
    [{ text, publishAt: new Date().toISOString(), jobId }],
  );
  return Response.json({ ok: true, runId: run.runId, jobId });
}
