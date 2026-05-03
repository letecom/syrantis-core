import { readdir } from "node:fs/promises";
import path from "node:path";

import type { MigrationFile } from "./types.js";

const migrationFilenamePattern = /^(\d{4})_(.+)\.sql$/;

export async function scanMigrationSqlFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const dirents = await readdir(migrationsDir, { withFileTypes: true });

  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => dirent.name)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => {
      const match = migrationFilenamePattern.exec(filename);

      if (!match) {
        throw new Error(`Migration SQL filename does not match NNNN_name.sql: ${path.join(migrationsDir, filename)}`);
      }

      const id = match[1];

      if (!id) {
        throw new Error(`Migration SQL filename is missing an id: ${path.join(migrationsDir, filename)}`);
      }

      return {
        id,
        tag: filename.slice(0, -".sql".length),
        filename
      };
    })
    .sort((left, right) => left.filename.localeCompare(right.filename));
}
