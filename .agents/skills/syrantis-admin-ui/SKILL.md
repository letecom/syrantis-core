---
name: syrantis-admin-ui
description: Use this skill for Syrantis Core admin UI work in apps/web, including login, session restore, protected shell, read-only admin panels, pushback status lookup, future replay UI, and future Google Sheets setup UI. Do not use for backend-only issues.
---

# Syrantis Admin UI Skill

## UI Doctrine

Syrantis Admin is an internal control surface for a backend-first B2B action layer. It is not a CRM, customer dashboard, analytics product, chatbot, or frontend-first SaaS. Build only the narrow operator workflow requested by the issue.

Prefer restrained, dense, inspectable UI. Do not add fake business data, demo tables, metrics, charts, broad navigation, or speculative screens.

## Allowed Stack

- `apps/web`
- Vite
- React
- TypeScript strict mode
- React Router
- TanStack Query
- Tailwind CSS
- Vitest
- Testing Library
- Zod for response validation
- Shared DTO contracts from `@syrantis/shared` when they are designed for frontend use

## Forbidden Stack

- Next.js
- Remix
- server-side frontend routes
- API routes inside `apps/web`
- Redux, Zustand, Jotai, or new global state stores
- GraphQL
- tRPC
- chart libraries
- realtime or WebSocket UI
- direct provider SDKs
- provider HTTP clients
- broad component frameworks unless explicitly approved

## Auth And Session Rules

- Use opaque server session cookies only.
- Use `credentials: "include"` on every request.
- Do not store tokens.
- Do not use `localStorage` or `sessionStorage` for auth.
- Do not read or write `document.cookie`.
- Do not add an `Authorization` header.
- Do not invent `/api/auth/*` routes.
- Discover and use the existing backend auth routes.
- Session restore must call a backend session/user route and redirect unauthenticated users to `/login`.
- Logout must call the backend logout route, clear frontend query state, and redirect to `/login`.

## API Client Rules

- Production frontend requests must go through one central API client.
- The API client is the only production file that may call `fetch`.
- Always send `credentials: "include"`.
- Use generic user-facing errors.
- Never log request bodies, response bodies, passwords, cookies, or raw errors.
- Validate responses with Zod where practical.
- Strip unknown fields from auth/session responses before storing frontend state.

## Route Rules

Allowed 023A routes:

- `/login`
- `/app`
- `/app/pushback`
- not found route

Forbidden route patterns:

- workspace route params
- tenant selectors
- global CRM tables
- settings pages unless the issue explicitly approves them
- user management
- provider setup screens unless the issue explicitly approves them

## Component Conventions

- Keep components small and workflow-specific.
- Use accessible labels for forms.
- Use simple loading, empty, and error states.
- Use cards only for individual items or framed tools.
- Do not nest cards inside cards.
- Do not add marketing hero sections.
- Do not add raw JSON/debug panels.

## Data Exposure Rules

Render only explicit safe DTO fields requested by the issue. Prefer allowlists over pass-through rendering.

Allowed pushback status display fields when present:

- target type
- target id
- send status
- delivery status
- pushback status
- latest source
- latest event type
- `canReplay` as read-only text
- replay eligibility as read-only text
- diagnostic trace id
- error code
- error summary
- counts
- timestamps
- manual replay count
- total pushback events

## Forbidden Fields

Never render, log, store, or pass through:

- `workspaceId`
- `workspace_id`
- `provider_message_id`
- `providerMessageId`
- raw webhook payloads
- raw Google error bodies
- raw provider payloads
- raw provider errors
- `metadata_json`
- `payload_json`
- `subject`
- `htmlBody`
- `textBody`
- contact email
- lead label
- recipient fields
- full spreadsheet IDs
- Google credential JSON
- `private_key`
- `client_email`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `GOOGLE_SHEETS_CREDENTIALS_JSON`
- `OPENROUTER_API_KEY`
- API keys
- prompt, output, cost, or token internals

## Tenant Boundary Rules

- Never trust client tenant input.
- Never send tenant identifiers in headers, bodies, query strings, route params, or client state.
- The backend must derive tenant context from trusted server context.
- Do not add tenant switchers.

## Provider Rules

- Frontend must never call Google, Resend, OpenRouter, CRMs, or email providers directly.
- Frontend must consume only Syrantis backend routes.
- Provider setup or replay actions require a dedicated issue and backend-approved route.

## Testing Rules

- Use Vitest and Testing Library.
- Cover login, validation, session restore, protected routes, logout, and read-only panel behavior.
- Mock backend routes through fetch mocks or the repo-standard test helper.
- Test that unsafe fields are ignored even if mock responses contain them.
- Do not add Playwright unless the issue explicitly asks for it.

## Security Grep Checks

Run issue-specific greps for:

- token storage APIs
- cookie access
- tenant identifiers in frontend source
- forbidden provider fields
- raw metadata/payload rendering
- sensitive body/content fields
- secret names or credential markers
- `fetch(` outside the central API client
- `Authorization` or `Bearer`
- direct provider domains
- raw JSON/debug rendering
- chart libraries
- forbidden infra/env/migration files

Investigate every match before reporting the issue complete.

## Allowed Files For UI Issues

- `apps/web/**/*`
- `.agents/skills/syrantis-admin-ui/SKILL.md`
- docs for the current UI issue
- README minimal current-state updates
- workspace package/config files needed for web build/test/lint
- minimal backend CORS config only when strictly necessary for local credentialed browser calls

## Forbidden Files For UI Issues

- production runtime repo files
- production env files
- `.env` files
- Caddyfile
- Dockerfile
- docker-compose files
- database migrations
- database schema
- auth or tenant middleware behavior
- backend business routes, services, and repositories unless the issue explicitly approves the backend change
- provider implementations
- webhook implementations
- replay services
