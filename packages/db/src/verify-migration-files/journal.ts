import { readFile } from "node:fs/promises";

import type { MigrationJournal, MigrationJournalEntry } from "./types.js";

export class MigrationJournalReadError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "MigrationJournalReadError";
  }
}

export async function readMigrationJournal(journalPath: string): Promise<MigrationJournal> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(journalPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown read error";
    throw new MigrationJournalReadError(`Unable to read migration journal ${journalPath}: ${detail}`);
  }

  if (!isJournal(parsed)) {
    throw new MigrationJournalReadError(`Migration journal is malformed: ${journalPath}`);
  }

  return {
    entries: parsed.entries.map((entry) => ({
      idx: entry.idx,
      tag: entry.tag
    }))
  };
}

function isJournal(value: unknown): value is { entries: MigrationJournalEntry[] } {
  if (!value || typeof value !== "object" || !("entries" in value)) {
    return false;
  }

  const entries = (value as { entries: unknown }).entries;

  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as MigrationJournalEntry).idx === "number" &&
        Number.isInteger((entry as MigrationJournalEntry).idx) &&
        typeof (entry as MigrationJournalEntry).tag === "string" &&
        (entry as MigrationJournalEntry).tag.length > 0
    )
  );
}
