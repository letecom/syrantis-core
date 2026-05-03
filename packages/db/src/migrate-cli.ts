import { pathToFileURL } from "node:url";

import { runMigrations } from "./migrate.js";
import { formatMigrationFilesText, getMigrationFilesExitCode } from "./verify-migration-files/reporter.js";
import { verifyMigrationFiles } from "./verify-migration-files/verifier.js";

type MigrateCliDependencies = {
  verifyMigrationFiles: typeof verifyMigrationFiles;
  runMigrations: typeof runMigrations;
};

export async function runMigrateCli(
  dependencies: MigrateCliDependencies = {
    verifyMigrationFiles,
    runMigrations
  }
): Promise<number> {
  const migrationFilesResult = await dependencies.verifyMigrationFiles();
  console.log(formatMigrationFilesText(migrationFilesResult));

  const migrationFilesExitCode = getMigrationFilesExitCode(migrationFilesResult);

  if (migrationFilesExitCode !== 0) {
    return migrationFilesExitCode;
  }

  const result = await dependencies.runMigrations();
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runMigrateCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Unknown database migration failure.");
      process.exitCode = 1;
    });
}
