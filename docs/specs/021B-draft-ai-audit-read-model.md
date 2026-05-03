# Issue 021B: Draft AI Audit Read Model

## Goal

Add a safe read-only audit endpoint for AI-generated drafts:

`GET /api/drafts/:id/ai-audit`

The route gives operators proof of the AI run and source score used to create a draft without exposing prompt contents, generated body content, contact PII, costs, tokens, provider payloads, approval state changes, or email send behavior.

## Contract

Success response:

```json
{
  "success": true,
  "data": null
}
```

or:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "leadId": "uuid",
    "origin": "ai_draft_generation",
    "generatedAt": "ISO datetime",
    "promptTemplateId": "draft-email-v1",
    "aiRun": {
      "id": "uuid",
      "status": "success",
      "provider": "openrouter",
      "model": "mistralai/mistral-small-2603",
      "finishReason": "completed",
      "latencyMs": 1234,
      "completedAt": "ISO datetime"
    },
    "sourceScore": {
      "id": "uuid",
      "score": 86,
      "qualification": "hot",
      "confidence": 91,
      "scoredAt": "ISO datetime"
    },
    "warnings": []
  }
}
```

Warnings:

- `AI_RUN_NOT_FOUND`
- `AI_RUN_INVALID`
- `SOURCE_SCORE_NOT_FOUND`
- `AI_DRAFT_METADATA_INVALID`
- `AI_RUN_FINISH_REASON_WARNING`

## Behavior

- Non-existent, archived, or cross-workspace drafts return `404`.
- Drafts whose metadata origin is not `ai_draft_generation` return `200` with `data: null`.
- AI-generated drafts return the audit read model.
- Missing, invalid, cross-workspace, or non-existent AI runs are treated as non-leaking partial audit data.
- Missing, invalid, cross-workspace, or non-existent source scores are treated as non-leaking partial audit data.
- Finish reasons map as:
  - `stop` to `completed`
  - `length` to `truncated`
  - `content_filter` to `filtered`
  - null, empty, or unknown values to `unknown`
- Any finish reason other than `completed` adds `AI_RUN_FINISH_REASON_WARNING`.

## Security

The route uses `tenantGuard` and derives `workspaceId` only from trusted server context. `workspaceId` is not accepted in the URL, query, headers, or body.

The repository selects only audit-safe columns. It must not select or return:

- draft subject or body fields
- contact email, phone, or names
- AI prompt, input, output, provider request, or provider response payloads
- AI output text
- AI errors
- AI cost or token fields

The route is read-only. It must not insert, update, delete, create activity logs, enqueue jobs, call an AI provider, call an email provider, request approval, or send email.
