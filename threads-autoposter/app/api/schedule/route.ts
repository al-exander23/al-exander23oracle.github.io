import { start } from "workflow/api";
import { requireAdmin } from "@/lib/auth";
import { validateScheduleInput } from "@/lib/validation";
import { scheduledThreadsPost } from "@/workflows/scheduled-threads-post";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const input = validateScheduleInput(await request.json());
    const jobId = input.jobId ?? crypto.randomUUID();
    const run = await start(scheduledThreadsPost, [{ ...input, jobId }], { deploymentId: "latest" });
    return Response.json({ ok: true, jobId, runId: run.runId, publishAt: input.publishAt });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
