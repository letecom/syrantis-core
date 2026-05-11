# 023L Real Client Gmail E2E Validation Pack Implementation

## Summary

Added a repeatable client validation pack for:

```txt
Gmail -> Apps Script -> Google Sheet Intake Log -> Syrantis public API
  -> lead -> score_lead job -> worker -> lead_scores
```

023L is documentation/templates/runbook only. No backend, database, worker, runtime, UI, migration,
OAuth, Caddy, Docker, systemd, or env files were changed.

## Files Added

- `docs/templates/gmail-to-syrantis-intake.gs`
- `docs/templates/google-sheet-intake-log.csv`
- `docs/templates/google-sheet-intake-log.md`
- `docs/runbooks/gmail-client-e2e.md`
- `docs/specs/023L-real-client-gmail-e2e-validation-pack.md`
- `docs/implementation/023L-real-client-gmail-e2e-validation-pack.md`

`README.md` was updated with links to the pack.

## Real Gmail E2E Validation Already Proven

The real client-like test already succeeded with:

- 5 Gmail emails
- 5 Google Sheet Intake Log rows
- 5 HTTP `201`
- 5 leads
- 5 `score_lead` jobs
- 5 completed jobs after worker
- 5 `lead_scores`
- 0 new failed job
- 0 PII leak in `activity_logs`
- 0 PII leak in `background_jobs` payload

## Template Behavior

The Apps Script template:

- reads configuration from `PropertiesService.getScriptProperties()`
- keeps the API key in Script Properties only
- uses `LockService.getScriptLock()` to avoid concurrent runs
- creates and uses `Syrantis/ToProcess`, `Syrantis/Processed`, and `Syrantis/Error`
- processes at most `MAX_EMAILS_PER_RUN` Gmail threads
- posts the 023J public inbound message contract
- parses `diagnosticTraceId`, `lead.id`, `scoringJob.id`, and `idempotency.isReplay`
- writes only the approved Intake Log columns
- retries HTTP `429` and `5xx` up to 2 times
- does not retry HTTP `400`, `401`, or `422`

The template does not handle attachments, HTML body, raw MIME, backend OAuth, worker execution, or
Syrantis runtime configuration.

## Security

The pack explicitly documents:

- API keys must stay in Google Apps Script Script Properties.
- API keys must never be written to the Sheet.
- Email body text must never be written to the Sheet.
- Raw API responses must never be written to the Sheet.
- The Sheet and Script must not be public.
- The Apps Script and Sheet must not include `workspaceId`.

The Sheet schema intentionally contains only bounded client validation fields. It may contain
sender email, optional contact name, and subject because those are client-side validation aids, but
it excludes body content, body summaries, raw payloads, secrets, workspace context, AI internals,
and provider payloads.

## Validation Expected

Runbook validation expects:

- 5 labeled Gmail messages produce 5 safe Sheet rows.
- New messages return HTTP `201`.
- Replays return HTTP `200` with `data.idempotency.isReplay = true`.
- Leads use DB `source = email`.
- Public intake marker is `normalized_json->>'source' = public_inbound_message`.
- Background jobs are joined through `background_jobs.payload_json->>'leadId'`.
- Jobs complete after a worker pass.
- Each lead has at least one `lead_scores` row.
- No new failed job appears because of the validation.
- Activity logs and job payloads expose no PII keys.

## Rollback

Rollback is docs-only:

- remove the 023L template, runbook, spec, and implementation files
- remove the 023L README section

No database rollback is required because 023L adds no migration and changes no runtime behavior.
