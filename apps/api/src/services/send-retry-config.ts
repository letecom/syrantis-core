const defaultMaxAttempts = 3;
const defaultBaseBackoffMs = 1_000;
const defaultMultiplier = 2;

export type SendRetryConfig = {
  maxAttempts: number;
  baseBackoffMs: number;
  multiplier: number;
};

function parseIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveSendRetryConfig(env: NodeJS.ProcessEnv = process.env): SendRetryConfig {
  return {
    maxAttempts: Math.min(Math.max(parseIntegerEnv(env.SEND_MAX_RETRIES, defaultMaxAttempts), 1), 10),
    baseBackoffMs: Math.min(
      Math.max(parseIntegerEnv(env.SEND_BACKOFF_BASE_MS, defaultBaseBackoffMs), 100),
      60 * 60 * 1000,
    ),
    multiplier: Math.min(
      Math.max(parseNumberEnv(env.SEND_BACKOFF_MULTIPLIER, defaultMultiplier), 1),
      10,
    ),
  };
}

export function computeSendBackoffMs(input: { attempt: number; config?: SendRetryConfig }): number {
  const config = input.config ?? resolveSendRetryConfig();
  const exponent = Math.max(input.attempt - 1, 0);
  return Math.round(config.baseBackoffMs * config.multiplier ** exponent);
}

export function isRetryableSendError(error: unknown): boolean {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode === 429 || [500, 502, 503, 504].includes(error.statusCode);
  }

  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return ["EMAIL_PROVIDER_TIMEOUT", "EMAIL_PROVIDER_NETWORK_ERROR"].includes(error.code);
  }

  return false;
}

export function isPermanentSendHttpStatus(statusCode: number): boolean {
  return [400, 401, 403, 404, 422].includes(statusCode);
}
