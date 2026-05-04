# 022A — CRM Target Selection & Push-back Decision Record Implementation

## Summary

Created the 022A CRM target-selection decision record.

This issue documents the CRM doctrine, first target shortlist, delayed candidates, mapping expectations, minimal future push-back event shape, anti-overengineering boundary, founder-first-user decision questions, and recommended next issue order.

## Docs Created

- `docs/specs/022A-crm-target-selection.md`
- `docs/implementation/022A-crm-target-selection.md`

## Decision Made

Syrantis should not build CRM push-back yet.

The selected priority CRM targets are:

1. Dolibarr
2. Google Sheets pseudo-CRM
3. Twenty

Dolibarr should probably be the first real CRM connector because it best matches French TPE/PME, artisans, local services, devis/factures, and self-hostable/local-market workflows.

Google Sheets may be the fastest MVP validation target because many small businesses use spreadsheets as their real commercial tracking system.

Twenty is useful as founder dogfood and a modern open-source CRM reference, especially if the founder wants a clean self-host CRM path.

## Why No Code Was Added

CRM push-back is intentionally delayed because the right connector shape depends on the first target's object model and the founder-first-user path.

Adding code now would risk:

- A generic CRM abstraction before one real connector is validated.
- The wrong push-back surface.
- Accidental ownership of CRM state that should remain in the client tool.
- Maintenance drag before client demand is proven.

## Why No Migration Was Added

No migration was added because this issue does not create runtime behavior, connector state, outbox records, configuration tables, or CRM delivery events.

The current `email_sends` delivery proof surface from 021O and terminal delivery immutability from 021P remain the source that a future issue can read from.

## Why CRM Push-back Remains Delayed

The next step is not connector code. The next step is a first-user sandbox decision:

- Does the founder already use a CRM?
- If not, should the first test target be Google Sheets, Dolibarr, or Twenty?
- What is the smallest proof action: note, task, status, or sheet row?

Only after that target is selected should Syrantis implement one concrete, non-invasive push-back MVP.

## Future Issue Should Do Next

Recommended next issue:

- 022B — First-User CRM Sandbox Setup

022B should validate the founder's first target, sandbox setup, object model, auth/provisioning model, and the minimal record update action before connector code exists.

Then:

- 022C — Concrete CRM Push-back MVP
- 022D — CRM Push-back Hardening / Idempotency / Error Handling
- 022E — Second CRM Connector only after first connector is proven

Do not force a generic adapter before a second connector exists.

## Strict Anti-Scope Confirmation

This issue does not add:

- `src` changes.
- `package.json` changes.
- Migrations.
- API routes.
- Workers.
- DB schema.
- CRM SDK dependencies.
- Environment variables.
- Secrets.
- External API calls.
- Tests that require an external CRM.

Allowed surface only:

- `docs/specs`
- `docs/implementation`
- Minimal README roadmap alignment if needed
