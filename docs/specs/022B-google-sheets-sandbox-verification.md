# 022B - Google Sheets Sandbox Setup & Verification

## Scope

Create a founder-facing Google Sheets sandbox setup guide and a standalone manual verification script.

The issue verifies operational readiness before connector work:

- The founder can provision a sandbox Google Sheet.
- The server can authenticate to Google Sheets using a service account.
- Syrantis can append one test row.
- Syrantis can read the configured range back.
- The appended verification id can be found in the readback data.
- Credentials and spreadsheet configuration stay outside Git.

## Non-scope

This issue does not add:

- CRM connector code.
- Production push-back.
- Outbox behavior.
- Background worker behavior.
- API routes.
- Repositories.
- Services used by the application.
- Drizzle schema changes.
- Database migrations.
- Activity log changes.
- `email_sends` mutation.
- Webhook changes.
- Dolibarr setup code.
- Twenty setup code.
- Two-way sync.
- Generic CRM adapter.
- Automated tests that call Google APIs.
- CI dependency on real Google credentials.

The verification script must stay standalone and must not be imported by routes, workers, services, repositories, or production paths.

## Env Vars

Required:

- `GOOGLE_SHEETS_CREDENTIALS_JSON`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

Optional:

- `GOOGLE_SHEETS_RANGE`, default `Sheet1!A:E`

`GOOGLE_SHEETS_CREDENTIALS_JSON` may be either:

- an absolute path to a Google service-account JSON key file; or
- raw JSON string content.

The path form is preferred operationally because it avoids putting raw credentials into shell history or command output.

## Verification Script Behavior

The script lives at:

```txt
apps/api/src/scripts/verify-sheets-sandbox.ts
```

The package command is:

```bash
pnpm --filter @syrantis/api verify:sheets-sandbox
```

The script:

1. Reads the env vars.
2. Parses service-account credentials safely.
3. Authenticates with the Google Sheets scope.
4. Appends one row:

```txt
VERIFY | ISO timestamp | Syrantis Google Sheets sandbox verification | 022B | random verification id
```

5. Reads back recent values from the configured range.
6. Confirms the verification id appears.
7. Prints `SHEETS_SANDBOX_VERIFY_OK`, the range, the verification id, and a masked spreadsheet id on success.
8. Exits `0` on success.
9. Exits `1` on failure with a compact safe failure code.

Failure codes:

- `SHEETS_SANDBOX_MISSING_ENV`
- `SHEETS_SANDBOX_INVALID_CREDENTIALS`
- `SHEETS_SANDBOX_APPEND_FAILED`
- `SHEETS_SANDBOX_READBACK_FAILED`
- `SHEETS_SANDBOX_VERIFY_NOT_FOUND`
- `SHEETS_SANDBOX_UNKNOWN_ERROR`

The script must not print raw credential content, service-account key material, raw Google error bodies, or secrets.

## Security Model

The sandbox uses a Google service account shared explicitly on a dedicated Google Sheet.

Security requirements:

- No JSON key committed.
- No `.env` file committed.
- No real spreadsheet ID committed.
- No credential values in docs, tests, screenshots, or reports.
- The service account is dedicated to this sandbox.
- The Sheet contains no production client data.
- The script is manual and isolated from the Syrantis runtime.
- Google API calls are never required in CI or automated tests.

## Success Criteria

Success means:

- The guide exists in French and is usable by the founder.
- The verification script appends one row to the configured Sheet.
- The verification script reads back the configured range.
- The verification id is found after append.
- The script prints `SHEETS_SANDBOX_VERIFY_OK`.
- The script exits `0`.
- No route, worker, repository, migration, schema, webhook, activity log, or CRM connector code is added.
- No secrets or real spreadsheet IDs are committed.

## Failure Criteria

The verification fails if:

- Required env vars are missing.
- Credentials cannot be parsed or used.
- Google Sheets append fails.
- Google Sheets readback fails.
- The appended verification id is not found.
- The script prints unsafe credential or raw Google error content.
- The script becomes part of a production import path.
- CI requires real Google credentials.

## Next Issue Expected

022C should be a concrete Google Sheets Push-back MVP only after this script returns `SHEETS_SANDBOX_VERIFY_OK` in the founder sandbox.

022C should still avoid a generic CRM adapter unless one concrete target has proven the need for shared abstraction.
