import type { MigrationFileDrift, MigrationFileVerificationResult } from "./types.js";

export function getMigrationFilesExitCode(result: MigrationFileVerificationResult): 0 | 1 {
  return result.success ? 0 : 1;
}

export function formatMigrationFilesText(result: MigrationFileVerificationResult): string {
  const lines = [
    result.success ? "MIGRATION_FILES_OK" : "MIGRATION_FILES_DRIFT",
    `sql_files=${result.checkedSqlFiles} journal_entries=${result.checkedJournalEntries} drift=${result.drift.length}`
  ];

  for (const drift of result.drift) {
    lines.push(formatDrift(drift));
  }

  return lines.join("\n");
}

export function formatMigrationFilesJson(result: MigrationFileVerificationResult): string {
  return JSON.stringify(
    {
      success: result.success,
      sqlFiles: result.checkedSqlFiles,
      journalEntries: result.checkedJournalEntries,
      drift: result.drift
    },
    null,
    2
  );
}

function formatDrift(drift: MigrationFileDrift): string {
  if (drift.kind === "sql_without_journal") {
    return `sql file has no journal entry: ${drift.filename}`;
  }

  if (drift.kind === "journal_without_sql") {
    return `journal entry has no sql file: ${drift.tag}`;
  }

  if (drift.kind === "duplicate_sql_id") {
    return `duplicate sql migration id: ${drift.id} files=${drift.filenames.join(",")}`;
  }

  if (drift.kind === "duplicate_sql_tag") {
    return `duplicate sql migration tag: ${drift.tag} files=${drift.filenames.join(",")}`;
  }

  if (drift.kind === "duplicate_journal_idx") {
    return `duplicate journal idx: ${drift.idx} tags=${drift.tags.join(",")}`;
  }

  return `duplicate journal tag: ${drift.tag}`;
}
