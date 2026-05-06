export type JobPayload = Record<string, unknown>;
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "retrying";

export interface QueueDriver {
  dispatch(name: string, payload: JobPayload): Promise<string>;
}
