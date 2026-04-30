import { checkDatabaseHealth } from "./health.js";

async function main(): Promise<void> {
  const result = await checkDatabaseHealth();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok || result.status === "missing_config" ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown database health check failure.");
  process.exitCode = 1;
});
