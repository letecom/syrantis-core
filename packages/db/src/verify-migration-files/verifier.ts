import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readMigrationJournal } from "./journal.js";
import { scanMigrationSqlFiles } from "./scanner.js";
import type {
  MigrationFile,
  MigrationFileDrift,
  MigrationFileVerificationResult,
  MigrationJournal,
  VerifyMigrationFilesPaths
} from "./types.js";

export function verifyMigrationFileIntegrity(
  sqlFiles: readonly MigrationFile[],
  journal: MigrationJournal
): MigrationFileVerificationResult {
  const drift: MigrationFileDrift[] = [];
  const sqlByTag = new Map(sqlFiles.map((file) => [file.tag, file]));
  const journalByTag = new Map(journal.entries.map((entry) => [entry.tag, entry]));

  for (const group of groupBy(sqlFiles, (file) => file.id)) {
    if (group.items.length > 1) {
      drift.push({
        kind: "duplicate_sql_id",
        id: group.key,
        filenames: group.items.map((file) => file.filename)
      });
    }
  }

  for (const group of groupBy(sqlFiles, (file) => file.tag)) {
    if (group.items.length > 1) {
      drift.push({
        kind: "duplicate_sql_tag",
        tag: group.key,
        filenames: group.items.map((file) => file.filename)
      });
    }
  }

  for (const group of groupBy(journal.entries, (entry) => String(entry.idx))) {
    if (group.items.length > 1) {
      drift.push({
        kind: "duplicate_journal_idx",
        idx: Number(group.key),
        tags: group.items.map((entry) => entry.tag)
      });
    }
  }

  for (const group of groupBy(journal.entries, (entry) => entry.tag)) {
    if (group.items.length > 1) {
      drift.push({
        kind: "duplicate_journal_tag",
        tag: group.key
      });
    }
  }

  for (const file of sqlFiles) {
    if (!journalByTag.has(file.tag)) {
      drift.push({
        kind: "sql_without_journal",
        tag: file.tag,
        filename: file.filename
      });
    }
  }

  for (const entry of journal.entries) {
    if (!sqlByTag.has(entry.tag)) {
      drift.push({
        kind: "journal_without_sql",
        tag: entry.tag
      });
    }
  }

  return {
    success: drift.length === 0,
    checkedSqlFiles: sqlFiles.length,
    checkedJournalEntries: journal.entries.length,
    drift
  };
}

export async function verifyMigrationFiles(paths = getDefaultVerifyMigrationFilesPaths()): Promise<MigrationFileVerificationResult> {
  const sqlFiles = await scanMigrationSqlFiles(paths.migrationsDir);
  const journal = await readMigrationJournal(paths.journalPath);
  return verifyMigrationFileIntegrity(sqlFiles, journal);
}

export function getDefaultVerifyMigrationFilesPaths(): VerifyMigrationFilesPaths {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "packages/db/migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(moduleDirectory, "../../migrations"),
    path.resolve(moduleDirectory, "../../../migrations")
  ];
  const migrationsDir = candidates.find((candidate) => existsSync(candidate));

  if (!migrationsDir) {
    throw new Error("Drizzle migrations folder was not found.");
  }

  return {
    migrationsDir,
    journalPath: path.join(migrationsDir, "meta/_journal.json")
  };
}

function groupBy<T>(items: readonly T[], getKey: (item: T) => string): { key: string; items: T[] }[] {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const existing = grouped.get(key);

    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return [...grouped.entries()].map(([key, groupedItems]) => ({ key, items: groupedItems }));
}
