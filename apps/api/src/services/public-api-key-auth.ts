import { createHash } from "node:crypto";

import { findActiveWorkspaceApiKeyByHash, type PublicApiKeyLookupRow } from "../repositories/public-lead-intake.js";

const API_KEY_PREFIX = "syr_live_";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractPlaintextBearerApiKey(authorizationHeader?: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader.trim());
  const plaintextApiKey = match?.[1] ?? null;

  if (!plaintextApiKey || !plaintextApiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  return plaintextApiKey;
}

export async function authenticateWorkspaceApiKey(
  authorizationHeader?: string | null,
): Promise<PublicApiKeyLookupRow | null> {
  const plaintextApiKey = extractPlaintextBearerApiKey(authorizationHeader);

  if (!plaintextApiKey) {
    return null;
  }

  return findActiveWorkspaceApiKeyByHash(sha256(plaintextApiKey));
}
