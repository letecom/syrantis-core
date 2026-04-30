type DrizzlePlaceholderConfig = {
  readonly schema: string;
  readonly out: string;
  readonly dialect: "postgresql";
  readonly dbCredentials: {
    readonly url: string;
  };
  readonly strict: boolean;
  readonly verbose: boolean;
};

const config: DrizzlePlaceholderConfig = {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/syrantis_issue_002_placeholder"
  },
  strict: true,
  verbose: true
};

export default config;
