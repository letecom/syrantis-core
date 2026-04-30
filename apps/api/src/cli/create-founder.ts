import { LoginInputSchema } from "@syrantis/shared";

import { hashPassword } from "../lib/password.js";
import { createFounderUser, normalizeEmail } from "../services/auth.js";

async function main(): Promise<void> {
  const email = process.env.FOUNDER_EMAIL;
  const password = process.env.FOUNDER_PASSWORD;

  const parsedInput = LoginInputSchema.safeParse({
    email,
    password
  });

  if (!parsedInput.success || parsedInput.data.password.length < 12) {
    throw new Error("FOUNDER_EMAIL must be valid and FOUNDER_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await hashPassword(parsedInput.data.password);
  const result = await createFounderUser({
    email: normalizeEmail(parsedInput.data.email),
    passwordHash
  });

  console.log(`Created founder user ${result.userId}`);
  console.log(`Workspace ${result.workspaceId}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown founder creation failure.");
  process.exitCode = 1;
});
