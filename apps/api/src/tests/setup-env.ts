import { afterEach, beforeEach, vi } from "vitest";

const emailProviderEnvNames = [
  "SEND_EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "RESEND_TO_ALLOWLIST",
  "RESEND_FROM_EMAIL",
  "RESEND_REPLY_TO",
] as const;

function clearEmailProviderEnv() {
  for (const envName of emailProviderEnvNames) {
    delete process.env[envName];
  }
}

clearEmailProviderEnv();

beforeEach(() => {
  vi.unstubAllEnvs();
  clearEmailProviderEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearEmailProviderEnv();
});
