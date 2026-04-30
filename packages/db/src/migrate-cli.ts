import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const result = await runMigrations();
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown database migration failure.");
  process.exitCode = 1;
});
