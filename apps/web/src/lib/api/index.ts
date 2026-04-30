import { healthResponseSchema, type HealthResponse } from "@syrantis/shared";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Health request failed with ${response.status}`);
  }

  return healthResponseSchema.parse(await response.json());
}
