const databaseUrlEnvName = "DATABASE_URL";
const acceptedDatabaseProtocols = new Set(["postgres:", "postgresql:"]);

export function getDatabaseUrl(): string | undefined {
  const value = process.env[databaseUrlEnvName]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function hasDatabaseUrl(): boolean {
  return getDatabaseUrl() !== undefined;
}

export function requireDatabaseUrl(): string {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for database access. Set it in the calling process environment; @syrantis/db does not load .env files or production env files."
    );
  }

  validateDatabaseUrl(databaseUrl);

  return databaseUrl;
}

function validateDatabaseUrl(databaseUrl: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!acceptedDatabaseProtocols.has(parsedUrl.protocol)) {
    throw new Error("DATABASE_URL must use the postgres: or postgresql: protocol.");
  }
}
