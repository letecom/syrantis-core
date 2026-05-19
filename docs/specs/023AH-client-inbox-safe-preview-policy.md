# 023AH Client Inbox Safe Preview Policy

## Scope

023AH adds a bounded preview policy to the dedicated Client Inbox list route so the future final
Inbox UI can show useful message previews without reopening the 023AF list disclosure leak.

The only route approved to expose these previews is:

```txt
GET /api/client/inbox/messages
```

The preview fields are client Inbox list-only:

- `subjectPreview`
- `snippetPreview`

The legacy list fields remain present for v1 compatibility:

- `subject: null`
- `snippet: null`

Full subject/body/email detail remains available only through:

```txt
GET /api/client/inbox/messages/:mailItemId
```

## Preview Contract

List items include:

- `subject`: always `null` in the compatibility contract
- `snippet`: always `null` in the compatibility contract
- `subjectPreview`: `string | null`
- `snippetPreview`: `string | null`

`subjectPreview` is derived only from `client_mail_items.subject`:

- trim
- collapse whitespace and newlines
- redact internal/secret-like key-value material
- max 140 characters
- nullable

`snippetPreview` prefers `client_mail_items.snippet` when it is present and distinct from the
subject/full body. Otherwise it is derived from `client_mail_items.body_text`:

- trim
- collapse whitespace and newlines
- redact internal/secret-like key-value material
- max 220 characters
- nullable
- when derived from body text, omit at least one character so the preview is not the full body

The previews must not return raw metadata, workspace or tenant ids, provider ids, prompt/output
material, lease tokens, API key material, or full body fields.

## Safety Boundary

Previews are allowed only because this is the dedicated Client Inbox list route. They are forbidden
in:

- public intake responses
- activity log metadata
- background job payloads
- Google Sheets pushback
- admin generic queues
- provider payloads
- prompt/output logs
- raw metadata

The detail DTO remains the only response shape that may return the selected mail `bodyText`,
`fromEmail`, or `toEmail`.

## API And Repository Rules

- Business reads remain workspace-scoped by trusted server context through `tenantGuard`.
- The repository may read `body_text` internally for preview derivation, but the list DTO must never
  return `bodyText`.
- Routes continue to reject client-provided workspace or tenant identity.
- No new backend route is added.
- No migration is added.
- No intake behavior, worker behavior, provider call, Gmail call, Resend call, Google Sheets
  behavior, Caddy/env/systemd, final client UI, client RBAC, AI rewrite, direct send, or Scout
  behavior is approved.

## Admin Lab

`/app/client-inbox-lab` remains an internal founder/admin validation surface. It must:

- keep the banner `Internal validation only · Not final client UI`
- display `subjectPreview` and `snippetPreview` separately
- still show legacy `subject` and `snippet` values as `null`
- remove `listSubjectPreview` from `missingForFinalUI` when `subjectPreview` is present
- remove `listSnippetPreview` from `missingForFinalUI` when `snippetPreview` is present
- not become the final client Inbox UI

## Tests

Coverage must verify:

- list returns `subjectPreview` from stored subject with whitespace collapse, redaction, and
  truncation
- list returns `snippetPreview` from stored snippet or body fallback with whitespace collapse,
  redaction, and truncation
- list keeps `subject:null` and `snippet:null`
- list does not return `bodyText`, `fromEmail`, `toEmail`, workspace id, raw metadata, provider ids,
  prompt/output, lease token, or API key material
- list preview does not include full body when body is long
- detail still returns full selected `subject`, `bodyText`, `fromEmail`, and `toEmail`
- public intake responses still do not return previews/body/email/subject values
- activity logs and background jobs do not receive preview/body/subject values
- ignored and leadable items both get safe previews
- exact marker tests prove the stored full body marker does not appear in list responses and allowed
  truncated markers appear only inside preview fields

## Acceptance

- `GET /api/client/inbox/messages` returns safe `subjectPreview` and `snippetPreview`.
- The list route still does not return full body/email/raw internals.
- The detail route remains rich.
- The admin lab shows preview readiness without becoming final client UI.
- The future Client Inbox UI v1 Live can render the left email list aligned with the 023AE target.
