import type { BackgroundJobRow } from "../repositories/background-jobs.js";

export const inboundEmailTestSource = "inbound_email_test";
export const publicInboundMessageSource = "public_inbound_message";

export function safeStringLength(value: string | null | undefined): number {
  return value?.length ?? 0;
}

export function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.length > 0);
}

export function buildPendingScoreLeadJobDto(job: BackgroundJobRow): {
  id: string;
  status: "pending" | "completed" | "failed";
  jobType: "score_lead";
  enqueuedAt: string;
} {
  const status = job.status === "completed" || job.status === "failed" ? job.status : "pending";

  return {
    id: job.id,
    status,
    jobType: "score_lead",
    enqueuedAt: job.createdAt.toISOString(),
  };
}
