# 023AE Client App Design System + Inbox Product Contract

## Goal

Freeze the initial client app product/design contract before building the live Inbox. The issue
separates the future client app from founder/admin validation surfaces and creates a mock visual
preview matching the provided Inbox reference.

## Scope

- Add client app design contract docs in `docs/design`.
- Add isolated client design tokens for the web app.
- Add `/app/client-inbox-preview` as a mock-only visual preview.
- Add frontend tests for the preview route and anti-scope rules.
- Update architecture state and README notes.

## Non-Goals

- No live backend Inbox routes.
- No migration or `client_mail_items` table.
- No intake behavior changes.
- No provider calls, Gmail logic, or mutation behavior.
- No real `app.syrantis.fr` deployment.
- No real client role/auth implementation.
- No draft editing, rewrite, export, or send implementation.

## Acceptance

- The preview route renders a high-quality mock aligned with `docs/implementation/UIInboxClient.png`.
- Design docs define the client app UI contract and future Client Inbox backend contract.
- Existing admin app remains non-regressed.
- No backend behavior changes and no migration are added.
- Frontend tests verify required preview labels and absence of admin/debug/bulk UI.
