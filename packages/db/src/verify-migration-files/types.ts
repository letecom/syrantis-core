export type MigrationFile = {
  id: string;
  tag: string;
  filename: string;
};

export type MigrationJournalEntry = {
  idx: number;
  tag: string;
};

export type MigrationJournal = {
  entries: MigrationJournalEntry[];
};

export type MigrationFileDrift =
  | {
      kind: "sql_without_journal";
      tag: string;
      filename: string;
    }
  | {
      kind: "journal_without_sql";
      tag: string;
    }
  | {
      kind: "duplicate_sql_id";
      id: string;
      filenames: string[];
    }
  | {
      kind: "duplicate_sql_tag";
      tag: string;
      filenames: string[];
    }
  | {
      kind: "duplicate_journal_idx";
      idx: number;
      tags: string[];
    }
  | {
      kind: "duplicate_journal_tag";
      tag: string;
    };

export type MigrationFileVerificationResult = {
  success: boolean;
  checkedSqlFiles: number;
  checkedJournalEntries: number;
  drift: MigrationFileDrift[];
};

export type VerifyMigrationFilesPaths = {
  migrationsDir: string;
  journalPath: string;
};
