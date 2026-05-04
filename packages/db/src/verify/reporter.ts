import type { SchemaInvariantFailure, SchemaVerificationResult } from "./types.js";

export function getSchemaVerifyExitCode(result: SchemaVerificationResult): 0 | 1 {
  return result.success ? 0 : 1;
}

export function formatSchemaVerifyText(result: SchemaVerificationResult): string {
  const lines = [
    result.success ? "SCHEMA_VERIFY_OK" : "SCHEMA_VERIFY_DRIFT",
    `checked=${result.checked} passed=${result.passed.length} failed=${result.failed.length}`
  ];

  for (const failure of result.failed) {
    lines.push(formatFailure(failure));
  }

  return lines.join("\n");
}

export function formatSchemaVerifyJson(result: SchemaVerificationResult): string {
  return JSON.stringify(
    {
      success: result.success,
      checked: result.checked,
      passed: result.passed.length,
      failed: result.failed
    },
    null,
    2
  );
}

function formatFailure(failure: SchemaInvariantFailure): string {
  if (failure.reason === "missing") {
    return `missing ${failure.kind}: ${failure.object}`;
  }

  if (failure.reason === "data_type_mismatch") {
    return `column type mismatch: ${failure.object} expected=${failure.expected} actual=${failure.actual}`;
  }

  if (failure.reason === "nullability_mismatch") {
    return `column nullability mismatch: ${failure.object} expected=${failure.expected} actual=${failure.actual}`;
  }

  if (failure.reason === "rls_disabled") {
    return `RLS disabled: ${failure.object}`;
  }

  if (failure.reason === "rls_force_disabled") {
    return `FORCE RLS disabled: ${failure.object}`;
  }

  return `missing RLS policy: ${failure.object} expected=${failure.expected}`;
}
