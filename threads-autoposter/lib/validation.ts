export type ScheduleInput = {
  text: string;
  publishAt: string;
  jobId?: string;
};

export function validateScheduleInput(input: unknown): ScheduleInput {
  if (!input || typeof input !== "object") throw new Error("body must be an object");
  const x = input as Record<string, unknown>;
  if (typeof x.text !== "string" || !x.text.trim()) throw new Error("text is required");
  if (x.text.length > 500) throw new Error("Threads text must be <= 500 characters");
  if (typeof x.publishAt !== "string") throw new Error("publishAt is required");
  const when = new Date(x.publishAt);
  if (Number.isNaN(when.getTime())) throw new Error("publishAt must be ISO-8601");
  if (when.getTime() < Date.now() - 5 * 60_000) throw new Error("publishAt is too far in the past");
  if (x.jobId != null && typeof x.jobId !== "string") throw new Error("jobId must be a string");
  return { text: x.text, publishAt: when.toISOString(), jobId: x.jobId as string | undefined };
}
