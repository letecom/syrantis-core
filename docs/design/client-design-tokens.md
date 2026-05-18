# Client Design Tokens

Issue: 023AE Client App Design System + Inbox Product Contract

## File

Client UI tokens live in:

- `apps/web/src/styles/client-design-tokens.css`

The file uses `--client-*` variables to avoid colliding with existing admin Tailwind colors. 023AE
imports the file only from `ClientInboxPreviewPage`, so existing admin pages keep their current
visual system.

## Token Groups

Core surfaces:

- `--client-app-bg`
- `--client-card-surface`
- `--client-sidebar-surface`
- `--client-border`
- `--client-border-strong`

Text:

- `--client-text`
- `--client-text-muted`
- `--client-text-soft`

Accents:

- `--client-primary-blue`
- `--client-primary-blue-soft`
- `--client-violet`
- `--client-violet-soft`
- `--client-success-green`
- `--client-success-soft`
- `--client-warning-amber`
- `--client-warning-soft`
- `--client-danger-red`
- `--client-danger-soft`

Badge tokens:

- `--client-hot-score-bg`
- `--client-hot-score-text`
- `--client-warm-score-bg`
- `--client-warm-score-text`
- `--client-cold-score-bg`
- `--client-cold-score-text`
- `--client-ignored-bg`
- `--client-ignored-text`
- `--client-ready-draft-bg`
- `--client-ready-draft-text`

Shape and elevation:

- `--client-radius-xs`
- `--client-radius-sm`
- `--client-radius-md`
- `--client-radius-lg`
- `--client-shadow-sm`
- `--client-shadow-md`

Layout:

- `--client-sidebar-width`
- `--client-inbox-list-width`
- `--client-ai-panel-width`
- `--client-topbar-height`

## Rules

Use the client token layer for future `app.syrantis.fr` surfaces before creating new visual
constants. Keep admin surfaces on their existing Tailwind theme unless a separate admin design issue
approves changes.

Client tokens must support the Inbox-first layout first, then Dashboard and Config. New colors
should map to product meaning, not decoration.
