# Client App UI Contract

Issue: 023AE Client App Design System + Inbox Product Contract

## Product Split

Syrantis has two product surfaces with different doctrine:

- `admin.syrantis.fr`: founder, operator, admin, debug, ops, workspace/user management,
  integrations, logs, and validation surfaces.
- `app.syrantis.fr`: client-facing product app for daily commercial mail and lead workflow.

The first client app primitives are intentionally narrow:

- Dashboard: summary and status, never the main work surface.
- Inbox: primary client surface for AI-prioritized commercial mail and prepared replies.
- Config: setup assistant and business behavior configuration.

The client app must not inherit admin navigation or debug concepts. Ops, API keys, Google Sheets,
Pushback, raw logs, provider diagnostics, and queue internals stay in the admin product.

## Inbox-First Product Doctrine

The Inbox is the main client product surface. It should make the user feel that Syrantis already
sorted the mailbox, understood the important messages, prepared the reply, and left the human in
control before outbound action.

The Dashboard is only a summary. Config is only the assistant/business behavior setup. Neither
surface should expand into a CRM, Gmail clone, or operations console.

Syrantis remains:

- a controlled AI operations layer for commercial mail and lead workflows
- human-reviewed before outbound
- compatible with Gmail export first
- explicit that final send can happen in Gmail until direct send is separately approved

Syrantis is not:

- a CRM clone
- a Gmail clone
- a chatbot
- an autonomous outbound agent
- an ops/debug panel for clients

## Visual Contract

The authoritative 023AE visual reference is `docs/implementation/UIInboxClient.png`.

The target client Inbox uses:

- left sidebar with Syrantis brand, three initial nav primitives, workspace card, and user card
- topbar with title/subtitle, central search, workspace selector, notification/help icons
- filter chips for the primary operational states
- three-column Inbox layout:
  - prioritized message list
  - opened mail reading panel
  - Syrantis AI, context, and draft panel
- light premium SaaS style
- white surfaces on a soft app background
- soft borders, restrained shadows, and compact rounded corners
- blue/violet accent
- calm pastel badges for status and categories
- compact but breathable spacing
- no heavy admin table look

The UI should be dense enough for repeated work, but it must remain calm and readable. Tables are
not the default interaction model for the client Inbox.

## Component Contract

Future implementation should converge on these client components:

- `ClientSidebar`
- `TopSearchBar`
- `InboxFilterPills`
- `InboxMessageItem`
- `ScoreBadge`
- `StatusBadge`
- `MailReadingPanel`
- `QuickContextCard`
- `SyrantisAnalysisPanel`
- `ContactContextCard`
- `CompanyPolicyContextCard`
- `AiDraftReplyCard`
- `GmailExportActions`

These names define the product contract, not a required file structure for 023AE. The preview page
may implement them locally until the live client app is approved.

## Badge Taxonomy

Score bands:

- `hot`
- `warm`
- `cold`
- `unknown`

Review states:

- `needs_review`
- `ignored`
- `draft_ready`
- `needs_approval`
- `exported`

Contact states:

- `new_contact`
- `existing_contact`
- `returning`

Categories:

- `quote_request`
- `urgent_service`
- `follow_up`
- `newsletter`
- `system`
- `unknown`

Badges should use clear client-facing labels, pastel backgrounds, and enough contrast for scanning.
They should not expose classifier internals, provider metadata, raw enum names, workspace IDs, or
debug fields.

## Anti-Scope Rules

The client Inbox must not include:

- archive, delete, or spam actions
- bulk checkboxes
- read/unread mailbox management
- raw thread manager behavior
- CRM table/list UI as the primary surface
- Ops, API Keys, Google Sheets, or Pushback in client navigation
- raw JSON panels
- provider or debug metadata
- direct send behavior without a separately approved issue
- client-supplied workspace identity

## Screenshot Testing

No Playwright setup exists in this repo as of 023AE, so 023AE does not add a screenshot dependency.
When Playwright is introduced later, add a visual smoke test for `/app/client-inbox-preview` or its
live successor at desktop and mobile widths, checking that the three columns render, the canvas is
nonblank, text does not overlap, and admin-only navigation is absent.
