# Company Context Pack Runbook

## Purpose

The company context profile stores workspace-level business context for future lead scoring and draft generation.

In 023P, it is storage and admin API only. It is not consumed by scoring, draft generation, workers, Google Sheets, or providers.

## Access

Routes:

```txt
GET /api/workspace-context
PUT /api/workspace-context
```

Access requires an authenticated Syrantis admin/founder session cookie. Workspace API keys and Bearer tokens cannot access these routes.

The workspace is always derived from server session context. Do not send workspace identifiers in body, query, params, or headers.

## Update Context

Use the admin session route with the strict workspace context DTO. Example shape:

```json
{
  "companyName": "Example Chauffage",
  "sector": "Plomberie et chauffage",
  "language": "fr",
  "timezone": "Europe/Paris",
  "companySummary": "Short safe business summary.",
  "offers": [{ "name": "Depannage chaudiere", "description": null, "category": "Chauffage" }],
  "serviceAreas": [{ "region": "Ile-de-France", "country": "FR", "restrictions": null }],
  "idealCustomerProfile": {
    "industries": ["batiment"],
    "companySize": "5-25",
    "roles": ["dirigeant"],
    "painPoints": ["devis en retard"],
    "description": null
  },
  "badFitSignals": [],
  "qualificationRules": [],
  "commonObjections": [],
  "proofPoints": [],
  "tone": null,
  "ctaPreference": null,
  "forbiddenClaims": [],
  "handoffRules": {
    "requireHumanFor": [],
    "escalationContact": null,
    "autoRespondThreshold": null
  }
}
```

The route upserts in-place. There is no version history or inactive profile list.

## Audit

Create/update writes safe activity logs only:

- action
- `workspace_context_profile` entity type
- `profileId`
- top-level `changedFields`
- `source = admin_api`

Activity logs must not include context values, raw `context_json`, old/new values, request bodies, workspace IDs, prompts, provider payloads, credentials, tokens, or API keys.

`GET` creates no activity log.

## Troubleshooting

If `GET` returns `profile: null`, no profile exists for the current workspace or the row is invisible under tenant RLS.

If `PUT` returns `400`, check for unknown fields, tenant/workspace fields, forbidden prompt/provider/secret-like field names, nested size limits, array limits, or total serialized payload size over 50KB.

If `PUT` returns `403`, the session user is not an admin or founder.
