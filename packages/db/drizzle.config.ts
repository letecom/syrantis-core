import { defineConfig } from "drizzle-kit";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  ...(migrationDatabaseUrl ? { dbCredentials: { url: migrationDatabaseUrl } } : {})
});
