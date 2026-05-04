# 022A — CRM Target Selection & Push-back Decision Record

## Scope

This is a documentation and decision issue only.

It creates a durable CRM target-selection artifact before any CRM connector or push-back code is written.

This issue adds:

- CRM doctrine for Syrantis.
- The first CRM shortlist.
- Delayed CRM candidates.
- The smallest useful future push-back shape.
- The recommended next issue order.

This issue does not add:

- Application code.
- Database migrations.
- CRM connector code.
- Generic adapter code.
- An outbox.
- API routes.
- Workers.
- SDK dependencies.
- Environment variables.
- External API calls.

## Why this issue exists

Coding CRM push-back now is premature because the connector shape depends on the CRM that Syrantis actually targets first.

The first useful connector is not just an HTTP client. It depends on:

- The target CRM object model.
- Whether the client tracks people, companies, prospects, devis, tasks, or notes.
- Whether the target is a real CRM, a spreadsheet, or a founder dogfood instance.
- How the CRM records outbound proof without implying that Syrantis owns the commercial record.

Local French TPE workflows also differ from SaaS CRM assumptions. A plumbing, heating, renovation, or local B2B service company may work from devis, contacts, phone calls, agendas, and spreadsheets instead of a clean sales-pipeline CRM.

The founder-first-user path matters because the first connector must be testable by the founder before it becomes a client promise. The wrong first connector would create maintenance drag, force early abstractions around unproven assumptions, and distract from the 90-day wedge.

A generic CRM abstraction before one concrete CRM is validated would be overengineering. Syrantis should first prove one small push-back action in one real target, then decide whether a second target justifies an abstraction.

## Syrantis CRM doctrine

- Syrantis is not a CRM.
- The CRM remains the commercial source of truth.
- Syrantis pushes proof back to the CRM.
- Syrantis should not mutate invoices or devis automatically.
- Human approval remains upstream of outbound actions.
- CRM push-back must be auditable, idempotent, tenant-safe, and non-invasive.

CRM push-back should add compact proof or follow-up context. It should not pretend to own the client's sales process.

## Priority CRM shortlist

### 1. Dolibarr

Dolibarr is selected because it is the strongest fit for French TPE, PME, artisans, local services, devis, factures, and operational small-business workflows.

Dolibarr is relevant to Syrantis because it represents the kind of local commercial source of truth that a plumber, heating contractor, renovation company, or local B2B service business could plausibly use. It is also open-source and self-hostable, which fits a sovereign/local deployment posture better than many pure SaaS CRMs.

Founder-first-user fit:

- Good fit if the founder wants to test a realistic local-market CRM.
- Good fit if the first client discovery conversations point to devis/factures and artisan operations.
- Less fast than a spreadsheet because Dolibarr setup, modules, and record relationships must be understood first.

Expected API/auth model:

- REST API exposed by the Dolibarr instance.
- Instance-specific base URL.
- API explorer available from the Dolibarr installation.
- Header-based API key authentication using Dolibarr's REST API key mechanism.
- Exact permissions and enabled modules must be validated in a sandbox before connector code.

Data model concepts to investigate:

- `thirdparties` / `societe`: companies, prospects, customers, suppliers.
- `contacts`: individual people linked to a third party.
- `agenda` / `actioncomm`: agenda events or actions.
- Notes on third-party or contact records.
- `proposals` / `propal`: commercial proposals / devis.

First push-back action:

- Add a safe delivery/follow-up note or agenda event linked to the relevant third-party or contact.

First read/import action:

- List third parties/prospects or contacts.

What not to push:

- No invoice mutation.
- No devis/proposal mutation.
- No automatic commercial stage changes.
- No billing changes.
- No automatic customer/prospect conversion.

Implementation risks:

- Dolibarr modules can be enabled or disabled per installation.
- Object relationships vary by business setup.
- Devis/proposal concepts are tempting but risky for automatic mutation.
- Permissions and API availability depend on instance configuration.
- Self-hosted versions and hosted instances may differ.
- Notes versus agenda events must be tested for reviewability and idempotency.

Dolibarr should probably be the first real CRM connector because it best matches the local French TPE/PME wedge and the artisan/devis context. If Syrantis works cleanly with Dolibarr without owning invoices, devis, or commercial stages, the doctrine is probably sound.

### 2. Google Sheets pseudo-CRM

Google Sheets is selected because many small local businesses effectively use a spreadsheet as their CRM.

For early Syrantis users, the "CRM" may be a sheet with columns like name, phone, email, lead source, devis status, relance date, and comments. That is not a formal CRM, but it is often the actual commercial source of truth.

Local-market fit:

- Very strong for businesses without a CRM.
- Common for founder-led TPEs, local services, and early operational workflows.
- Easy to understand in client conversations.

Founder-first-user fit:

- Excellent for the fastest first end-to-end proof.
- Lets the founder model leads, follow-up, and delivery proof without committing to a CRM product.
- Helps discover the real minimum useful push-back fields before a formal connector.

Expected API/auth model:

- Google Sheets API using OAuth-scoped credentials.
- User OAuth may be needed for founder-owned or client-owned sheets.
- Service-account style access may work for controlled sandbox sheets that are explicitly shared with the service account.
- Spreadsheet ID, sheet/range, and known columns must be configured later; no configuration UI in this issue.

First push-back action:

- Append a delivery proof row, or update a lead row with send/delivery status when a stable row identity is available.

First read/import action:

- Read rows as a lead intake source.

What not to push:

- No two-way sync.
- No schema inference engine.
- No complex conflict handling.
- No automatic column creation without an explicit later decision.
- No broad Google Workspace integration.

Implementation risks:

- Columns can be renamed.
- Sheet schemas are brittle.
- Row identity is weak unless a stable external ID column is added.
- OAuth and service-account setup differ by ownership model.
- Shared spreadsheets can be manually edited while Syrantis is processing.
- Permissions can be revoked outside Syrantis.

Google Sheets may be the fastest MVP validation target because it proves the business loop with minimal operational setup: lead intake, AI draft, human approval, email send, delivery proof, then visible proof in the founder's working sheet.

### 3. Twenty

Twenty is selected because it is a modern open-source CRM path that can serve founder dogfood and a clean developer-facing CRM reference.

Founder-first-user fit:

- Strong if the founder wants to operate from a modern self-hostable CRM.
- Useful for testing a clean CRM object model without the complexity of ERP/devis/facture modules.
- Good reference for API-first CRM behavior.

Modern open-source/self-host fit:

- Open-source CRM posture.
- Self-hostable option.
- Developer-friendly API surface.
- Standard CRM objects that are easier to reason about than ERP modules.

Expected API/auth model:

- REST and GraphQL APIs.
- Cloud or self-hosted base URL.
- Bearer API key authentication.
- Workspace-specific generated API documentation based on the configured data model.

Likely object model:

- People.
- Companies.
- Opportunities.
- Activities, notes, or tasks depending on the configured workspace model.

First push-back action:

- Create an activity or note linked to a person, company, or opportunity.

First read/import action:

- List people and companies.

What not to push:

- No pipeline automation.
- No automatic deal mutation.
- No automatic opportunity stage changes.
- No custom workflow automation from Syrantis yet.

Implementation risks:

- Younger product than older CRM/ERP systems.
- Less local-market adoption than Dolibarr.
- Data model can be customized, so generated API docs must be checked per workspace.
- The right target object for proof may be a note, task, or activity depending on the instance.

Twenty is useful as founder dogfood and a modern CRM reference. It should not displace Dolibarr for local-market proof unless the founder chooses a modern self-host CRM as the first-user path.

## Delayed CRM candidates

| CRM | Why not now | When it becomes relevant |
| --- | --- | --- |
| Odoo | Broad ERP/CRM surface, complex modules, larger implementation footprint, and high temptation to touch devis/factures too early. | Relevant when a real client already uses Odoo and needs proof notes without commercial document mutation. |
| HubSpot | Strong SaaS CRM reference, but not the likely first local artisan/TPE default and introduces OAuth/app-marketplace complexity. | Relevant when a paying client already operates in HubSpot or when Syrantis needs a SaaS CRM benchmark. |
| EspoCRM | Open-source CRM candidate, but less strategically distinct than Dolibarr for local operations or Twenty for founder dogfood. | Relevant after one open-source connector is proven and a client specifically runs EspoCRM. |
| SuiteCRM | Mature open-source CRM, but heavier legacy CRM shape and less aligned with the immediate founder-first-user path. | Relevant if a client has an existing SuiteCRM deployment that needs delivery proof notes. |
| Pipedrive | Sales-pipeline SaaS fit, but less aligned with artisans/devis and adds SaaS auth/configuration before local-market proof. | Relevant when a client already works from Pipedrive pipelines and asks for follow-up proof. |
| Zoho | Broad SaaS suite with CRM value, but complex product surface and account/app setup before validation. | Relevant when a paying client is already standardized on Zoho CRM. |
| Airtable | Often used as a flexible pseudo-CRM, but it can pull Syrantis toward schema inference and database-like sync too early. | Relevant after Google Sheets proves the pseudo-CRM path and a client has a stable Airtable base. |

## Mapping table

The future push-back payload must be compact proof, not a copy of provider, AI, or message internals.

Do not include:

- Raw email body.
- `provider_message_id`.
- Provider message identifiers.
- Raw webhook payload.
- AI prompt or output.
- Recipient PII beyond what is already represented in the CRM itself.

| Syrantis field | Dolibarr target concept | Google Sheets target column | Twenty target object/property |
| --- | --- | --- | --- |
| `workspaceId` | Internal Syrantis-only mapping; not written into public note text unless later approved | Hidden/configured Syrantis workspace column only if needed for controlled sandbox; otherwise not shown | Internal Syrantis-only mapping; not written into note text unless later approved |
| `leadId` | External mapping to third-party/contact, or compact reference in note metadata if available | `syrantis_lead_id` stable row key when explicitly added | External mapping to person/company/opportunity, or compact note metadata if supported |
| `draftId` | Compact proof reference in note/event metadata | `syrantis_draft_id` | Compact proof reference in note/activity metadata |
| `emailSendId` | Idempotency reference for the proof note or agenda event | `syrantis_email_send_id` | Idempotency reference for note/activity creation |
| send status | Note/event summary field such as "send requested", "sent", "failed" | `send_status` | Note/activity body or status-like custom property only if later approved |
| `deliveryStatus` | Note/event summary: delivered, bounced, complained, or unknown | `delivery_status` | Note/activity body or compact custom property only if later approved |
| `requestedAt` | Note/event timestamp detail | `requested_at` | Note/activity timestamp detail |
| `sentAt` | Note/event timestamp detail | `sent_at` | Note/activity timestamp detail |
| `deliveredAt` | Note/event timestamp detail | `delivered_at` | Note/activity timestamp detail |
| `bouncedAt` | Note/event timestamp detail | `bounced_at` | Note/activity timestamp detail |
| `complainedAt` | Note/event timestamp detail | `complained_at` | Note/activity timestamp detail |
| `deliveryErrorCode` | Compact safe error code in note/event, no raw provider detail | `delivery_error_code` | Compact safe error code in note/activity |
| safe note text | Third-party/contact note or agenda/action event body | `safe_note_text` or appended proof row text | Note or activity content linked to person/company/opportunity |

## Connector readiness matrix

| CRM | API type | Auth model | Self-host/local fit | Provisioning complexity | Data-model mapping risk | First push-back complexity | First read/import complexity | First-user usefulness | Local-market usefulness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dolibarr | REST API | Instance API key header with module permissions | High | Medium | Medium-high because ERP modules and third-party/contact/proposal relationships vary | Medium: note or agenda event must be linked safely | Medium: third parties/prospects or contacts must be filtered carefully | High if founder wants realistic local CRM | Very high |
| Google Sheets pseudo-CRM | Google Sheets API | OAuth-scoped credentials or explicitly shared service-account sandbox | Medium: SaaS but widely used locally | Low-medium | High because columns and row identity are informal | Low for append row; medium for updating existing lead row | Low-medium for reading rows | Very high for fastest proof | High |
| Twenty | REST and GraphQL API | Bearer API key | High | Medium | Medium because workspace data model can be customized | Low-medium: create linked note/activity | Low-medium: list people/companies | High for founder dogfood | Medium |

## Future minimal push-back event

Future canonical event shape in pseudocode only:

```txt
event:
  eventType: email_send.delivery_updated
  workspaceId: <trusted server context workspace id>
  leadId: <canonical Syrantis lead id>
  draftId: <approved draft id>
  emailSendId: <canonical send proof id>
  deliveryStatus: <delivered | bounced | complained | unknown>
  occurredAt: <delivery proof timestamp or event processing timestamp>
  safeSummary: <compact human-readable proof summary>
```

Rules:

- No raw provider payload.
- No provider identifier.
- No subject/body content unless explicitly approved in a later issue.
- No AI prompt or output.
- Idempotency key should be `emailSendId + eventType + deliveryStatus`.
- `workspaceId` must come only from trusted server context.
- The event should be sufficient to create a safe note, task, agenda item, or sheet row without leaking internals.

## Anti-overengineering boundary

The next coding issue must not add these surfaces unless a later decision explicitly changes scope:

- Generic CRM adapter zoo.
- Multi-connector registry.
- CRM configuration UI.
- OAuth framework.
- Two-way sync.
- CRM webhook ingestion.
- Event sourcing.
- Full outbox with generic dispatch before one concrete target is validated.
- Automatic devis/facture mutation.
- Automatic pipeline stage mutation.

The first connector should be a concrete target with a concrete action. The abstraction decision should wait until a second connector proves which behavior is common.

## Founder first-user decision

### Décision fondateur à remplir

Questions:

1. Est-ce que j'utilise déjà un CRM ?
2. Si non, est-ce que je veux tester Dolibarr, Twenty, ou Google Sheets d'abord ?
3. Est-ce que je veux un outil local/self-host ou SaaS ?
4. Est-ce que mon premier usage est suivi de leads, relance devis, ou preuve d'email envoyé ?
5. Quel est l'objet CRM minimal à mettre à jour : note, statut, tâche, ou ligne de suivi ?
6. Est-ce que je veux commencer par le plus réaliste marché local ou le plus rapide à tester ?

Recommended default:

- If no existing CRM: start with Google Sheets for fastest end-to-end proof, then Dolibarr for real local-market CRM.
- If founder wants a modern self-host CRM: test Twenty in parallel as dogfood.

## Recommended next issue order

- 022B — First-User CRM Sandbox Setup
- 022C — Concrete CRM Push-back MVP
- 022D — CRM Push-back Hardening / Idempotency / Error Handling
- 022E — Second CRM Connector only after first connector is proven

Do not force a generic adapter before a second connector exists.
