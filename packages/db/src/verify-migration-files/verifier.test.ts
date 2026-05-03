import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { MigrationJournalReadError, readMigrationJournal } from "./journal.js";
import { formatMigrationFilesText, getMigrationFilesExitCode } from "./reporter.js";
import { scanMigrationSqlFiles } from "./scanner.js";
import type { MigrationFile, MigrationJournal } from "./types.js";
import { verifyMigrationFileIntegrity, verifyMigrationFiles } from "./verifier.js";

const matchingSqlFiles: MigrationFile[] = [
  { id: "0000", tag: "0000_init", filename: "0000_init.sql" },
  { id: "0001", tag: "0001_next", filename: "0001_next.sql" }
];

const matchingJournal: MigrationJournal = {
  entries: [
    { idx: 0, tag: "0000_init" },
    { idx: 1, tag: "0001_next" }
  ]
};

describe("migration file verifier", () => {
  it("passes when SQL files and journal entries match", () => {
    const result = verifyMigrationFileIntegrity(matchingSqlFiles, matchingJournal);

    assert.equal(result.success, true);
    assert.equal(result.checkedSqlFiles, 2);
    assert.equal(result.checkedJournalEntries, 2);
    assert.equal(result.drift.length, 0);
    assert.equal(getMigrationFilesExitCode(result), 0);
  });

  it("fails when a SQL file is missing from journal", () => {
    const result = verifyMigrationFileIntegrity(
      [...matchingSqlFiles, { id: "0002", tag: "0002_extra", filename: "0002_extra.sql" }],
      matchingJournal
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.drift.at(-1), {
      kind: "sql_without_journal",
      tag: "0002_extra",
      filename: "0002_extra.sql"
    });
    assert.equal(getMigrationFilesExitCode(result), 1);
  });

  it("fails when journal references a missing SQL file", () => {
    const result = verifyMigrationFileIntegrity(matchingSqlFiles, {
      entries: [...matchingJournal.entries, { idx: 2, tag: "0002_missing" }]
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.drift.at(-1), {
      kind: "journal_without_sql",
      tag: "0002_missing"
    });
  });

  it("fails on duplicate SQL migration ids and tags", () => {
    const result = verifyMigrationFileIntegrity(
      [...matchingSqlFiles, { id: "0001", tag: "0001_next", filename: "0001_next.copy.sql" }],
      matchingJournal
    );

    assert.equal(result.success, false);
    assert.ok(result.drift.some((drift) => drift.kind === "duplicate_sql_id" && drift.id === "0001"));
    assert.ok(result.drift.some((drift) => drift.kind === "duplicate_sql_tag" && drift.tag === "0001_next"));
  });

  it("fails on duplicate journal tags", () => {
    const result = verifyMigrationFileIntegrity(matchingSqlFiles, {
      entries: [...matchingJournal.entries, { idx: 2, tag: "0001_next" }]
    });

    assert.equal(result.success, false);
    assert.ok(result.drift.some((drift) => drift.kind === "duplicate_journal_tag" && drift.tag === "0001_next"));
  });

  it("fails on duplicate journal ids", () => {
    const result = verifyMigrationFileIntegrity(matchingSqlFiles, {
      entries: [...matchingJournal.entries, { idx: 1, tag: "0002_other" }]
    });

    assert.equal(result.success, false);
    assert.ok(result.drift.some((drift) => drift.kind === "duplicate_journal_idx" && drift.idx === 1));
  });

  it("exits 2 on malformed or missing journal", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "syrantis-migrations-"));

    try {
      await assert.rejects(readMigrationJournal(path.join(tempDir, "missing.json")), (error: unknown) => {
        assert.ok(error instanceof MigrationJournalReadError);
        assert.equal(error.exitCode, 2);
        return true;
      });

      const malformedJournal = path.join(tempDir, "_journal.json");
      await writeFile(malformedJournal, "{\"entries\":", "utf8");
      await assert.rejects(readMigrationJournal(malformedJournal), (error: unknown) => {
        assert.ok(error instanceof MigrationJournalReadError);
        assert.equal(error.exitCode, 2);
        return true;
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("reporter produces clear drift output", () => {
    const result = verifyMigrationFileIntegrity(
      [...matchingSqlFiles, { id: "0002", tag: "0002_extra", filename: "0002_extra.sql" }],
      matchingJournal
    );
    const output = formatMigrationFilesText(result);

    assert.match(output, /^MIGRATION_FILES_DRIFT/);
    assert.match(output, /sql_files=3 journal_entries=2 drift=1/);
    assert.match(output, /sql file has no journal entry: 0002_extra\.sql/);
  });

  it("scans SQL files and verifies a temporary migrations folder", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "syrantis-migrations-"));

    try {
      await mkdir(path.join(tempDir, "meta"));
      await writeFile(path.join(tempDir, "0000_init.sql"), "-- empty\n", "utf8");
      await writeFile(
        path.join(tempDir, "meta/_journal.json"),
        JSON.stringify({ entries: [{ idx: 0, tag: "0000_init" }] }),
        "utf8"
      );

      assert.deepEqual(await scanMigrationSqlFiles(tempDir), [
        { id: "0000", tag: "0000_init", filename: "0000_init.sql" }
      ]);

      const result = await verifyMigrationFiles({
        migrationsDir: tempDir,
        journalPath: path.join(tempDir, "meta/_journal.json")
      });

      assert.equal(result.success, true);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
