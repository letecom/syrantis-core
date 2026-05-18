# Client Inbox UI Reference

Issue: 023AE Client App Design System + Inbox Product Contract

## Reference

The visual north star for the client Inbox is:

- `docs/implementation/UIInboxClient.png`

This image defines the direction for layout, density, hierarchy, color, and product tone. Future
client Inbox implementation should treat the mock preview route as a contract preview, not as live
backend behavior.

## Layout

The Boîte de réception surface uses a four-zone shell:

- Sidebar: brand, Tableau de bord, Boîte de réception, Configuration, workspace card, user card.
- Topbar: page title, subtitle, search, workspace selector, notification icon, help icon.
- Filters: compact chips for triage states and a small sort control.
- Work area: three columns.

The work area columns are:

- Prioritized message list: sender, company, subject, preview, score, category, contact state, draft
  state, selected highlight.
- Mail reading panel: selected subject, message metadata, readable full client-visible body,
  quick context, attachments.
- Syrantis intelligence panel: analysis, contact context, company/policy context, draft reply, Gmail
  export controls.

## Visual Tone

The client Inbox should feel premium, calm, and operational:

- white surfaces
- soft app background
- blue/violet accent for active navigation and AI elements
- pastel badge taxonomy
- subtle shadows
- compact control heights
- clear typography hierarchy
- no admin-table density
- no dark debug panels
- no raw logs or JSON

Spacing should be compact but breathable. The center reading panel must remain comfortable enough
for French email bodies and draft text.

## Client Copy

Client-facing copy should be French-first when it describes user work. Product labels may retain a
small amount of English where the visual reference does and where the term is already understood by
the customer.

Preferred labels:

- Boîte de réception
- Messages et demandes priorisés par l’IA
- Analyse IA Syrantis
- Brouillon IA
- Brouillon prêt
- Exporter vers Gmail
- Valider

Do not expose raw classifier names, provider fields, IDs, workspace identifiers, payload keys, prompt
content, or debug-only labels.

## Initial Mock Entity Set

The visual preview uses only mock data:

- Workspace/client: Lumière Services
- User: Thomas Martin
- Selected contact: Pierre Belanger
- Selected company: Belanger Rénovation
- Selected subject: Demande de devis – Isolation garage
- Score: Chaud 82
- Category: Demande de devis
- Contact state: Contact existant
- Draft state: Brouillon prêt

The live version may localize accents and typography more richly, but the mock route must remain
mock-only and must not introduce provider calls, API clients, mutations, or customer data.

## Interaction Limits

023AE preview controls are static. Future live Inbox interactions need a dedicated Client Inbox
Domain before they become real:

- select message
- edit draft
- request Gmail export
- cancel Gmail export
- request rewrite

Do not retrofit these actions onto admin queues.
