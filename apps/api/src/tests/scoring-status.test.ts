import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadScoreStatus } from "@syrantis/shared";

import { findScoringStatusRecord } from "../repositories/scoring-status.js";
import { createProductionScoringStatusService } from "../services/scoring-status.js";
import { testUser } from "./mocks/auth.js";

vi.mock("../repositories/scoring-status.js", () => ({
  findScoringStatusRecord: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000000901";
const jobId = "00000000-0000-4000-8000-000000000902";
const olderJobId = "00000000-0000-4000-8000-000000000903";
const scoreId = "00000000-0000-4000-8000-000000000904";
const olderScoreId = "00000000-0000-4000-8000-000000000905";
const diagnosticTraceId = "00000000-0000-4000-8000-000000000906";
const createdAt = new Date("2026-05-01T10:00:00.000Z");
const updatedAt = new Date("2026-05-01T10:05:00.000Z");
const completedAt = new Date("2026-05-01T10:06:00.000Z");
const failedAt = new Date("2026-05-01T10:07:00.000Z");

type JobStatus = "pending" | "running" | "completed" | "failed";

function job(status: JobStatus, overrides: Partial<Awaited<ReturnType<typeof baseJob>>> = {}) {
  return {
    ...baseJob(status),
    ...overrides,
  };
}

function baseJob(status: JobStatus) {
  return {
    id: jobId,
    status,
    attempts: status === "pending" ? 0 : 1,
    createdAt,
    updatedAt,
    completedAt: status === "completed" ? completedAt : null,
    failedAt: status === "failed" ? failedAt : null,
    diagnosticTraceId,
  };
}

function score(overrides: Partial<Awaited<ReturnType<typeof baseScore>>> = {}) {
  return {
    ...baseScore(),
    ...overrides,
  };
}

function baseScore() {
  return {
    id: scoreId,
    score: 84,
    scoreBand: "hot",
    confidence: 91,
    recommendedAction: "Call within 10 minutes.",
    createdAt: new Date("2026-05-01T10:08:00.000Z"),
  };
}

function mockRecord(input: {
  jobs?: ReturnType<typeof baseJob>[];
  scores?: ReturnType<typeof baseScore>[];
}) {
  vi.mocked(findScoringStatusRecord).mockResolvedValue({
    result: "ok",
    record: {
      jobs: input.jobs ?? [],
      scores: input.scores ?? [],
    },
  });
}

async function readStatus() {
  const service = createProductionScoringStatusService();
  const result = await service.getStatus(testUser.workspaceId, leadId);

  expect(result.result).toBe("ok");

  if (result.result !== "ok") {
    throw new Error("Expected ok result.");
  }

  return result.status;
}

describe("scoring status service", () => {
  beforeEach(() => {
    vi.mocked(findScoringStatusRecord).mockReset();
  });

  it.each([
    ["not_requested", [], []],
    ["completed", [], [score()]],
    ["pending", [job("pending")], []],
    ["running", [job("running")], []],
    ["completed", [job("completed")], [score()]],
    ["completed_but_score_missing", [job("completed")], []],
    ["failed", [job("failed")], []],
    ["failed_with_previous_score", [job("failed")], [score()]],
    ["rescoring_pending_with_previous_score", [job("pending")], [score()]],
    ["rescoring_pending_with_previous_score", [job("running")], [score()]],
  ] satisfies Array<
    [LeadScoreStatus, ReturnType<typeof baseJob>[], ReturnType<typeof baseScore>[]]
  >)("returns %s", async (expectedStatus, jobs, scores) => {
    mockRecord({ jobs, scores });

    const status = await readStatus();

    expect(status.leadId).toBe(leadId);
    expect(status.scoreStatus).toBe(expectedStatus);
    expect(status.counts).toEqual({
      totalScoringJobs: jobs.length,
      totalScores: scores.length,
    });
  });

  it("returns not_found when the lead is absent or cross-workspace", async () => {
    vi.mocked(findScoringStatusRecord).mockResolvedValue({ result: "not_found" });

    const result = await createProductionScoringStatusService().getStatus(
      testUser.workspaceId,
      leadId,
    );

    expect(result).toEqual({ result: "not_found" });
  });

  it("uses the most recent job and score from repository order", async () => {
    mockRecord({
      jobs: [
        job("failed"),
        job("completed", { id: olderJobId, createdAt: new Date("2026-04-30T10:00:00.000Z") }),
      ],
      scores: [
        score({ id: scoreId, score: 94 }),
        score({ id: olderScoreId, score: 42, createdAt: new Date("2026-04-30T10:10:00.000Z") }),
      ],
    });

    const status = await readStatus();

    expect(status.scoreStatus).toBe("failed_with_previous_score");
    expect(status.leadId).toBe(leadId);
    expect(status.latestJob?.id).toBe(jobId);
    expect(status.latestScore?.id).toBe(scoreId);
    expect(status.latestScore?.score).toBe(94);
    expect(status.counts).toEqual({
      totalScoringJobs: 2,
      totalScores: 2,
    });
  });

  it("sanitizes malformed diagnostic trace ids", async () => {
    mockRecord({
      jobs: [job("pending", { diagnosticTraceId: "not-a-uuid" })],
      scores: [],
    });

    const status = await readStatus();

    expect(status.latestJob?.diagnosticTraceId).toBeNull();
  });

  it("does not expose unsafe fields in the DTO", async () => {
    mockRecord({
      jobs: [job("completed")],
      scores: [score()],
    });

    const status = await readStatus();
    const serialized = JSON.stringify(status);

    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("bodyText");
    expect(serialized).not.toContain("body_text");
    expect(serialized).not.toContain("fromEmail");
    expect(serialized).not.toContain("contactEmail");
    expect(serialized).not.toContain("contactName");
    expect(serialized).not.toContain("subject");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("rawOutput");
    expect(serialized).not.toContain("raw_output");
    expect(serialized).not.toContain("provider_message_id");
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("last_error_message");
  });
});
