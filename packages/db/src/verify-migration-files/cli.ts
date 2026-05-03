import { pathToFileURL } from "node:url";

import { MigrationJournalReadError } from "./journal.js";
import { formatMigrationFilesJson, formatMigrationFilesText, getMigrationFilesExitCode } from "./reporter.js";
import { verifyMigrationFiles } from "./verifier.js";

type CliOptions = {
  json: boolean;
};

function parseCliOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    json: false
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown verify-migration-files option: ${arg}`);
  }

  return options;
}

export async function runVerifyMigrationFilesCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliOptions(args);
  const result = await verifyMigrationFiles();
  console.log(options.json ? formatMigrationFilesJson(result) : formatMigrationFilesText(result));
  return getMigrationFilesExitCode(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runVerifyMigrationFilesCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown migration file verification error.";
      console.error(message);
      process.exitCode = error instanceof MigrationJournalReadError ? error.exitCode : 2;
    });
}
