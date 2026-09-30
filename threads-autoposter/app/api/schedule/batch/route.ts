import { start } from "workflow/api";
import { requireAdmin } from "@/lib/auth";
import { validateScheduleInput } from "@/lib/validation";
import { scheduledThreadsPost } from "@/workflows/scheduled-threads-post";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!Array.isArray(body?.posts) || body.posts.length < 1 || body.posts.length > 50) {
      throw new Error("posts must be an array with 1-50 items");
    }
    const inputs = body.posts.map(validateScheduleInput);
    const runs = await Promise.all(inputs.map(async (input) => {
      const jobId = input.jobId ?? crypto.randomUUID();
      const run = await start(scheduledThreadsPost, [{ ...input, jobId }], { deploymentId: "latest" });
      return { jobId, runId: run.runId, publishAt: input.publishAt };
    }));
    return Response.json({ ok: true, runs });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
