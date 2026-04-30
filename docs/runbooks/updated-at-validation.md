# Updated At Validation Runbook

## Verify Function

```sh
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "select proname from pg_proc where proname = 'syrantis_set_updated_at';"
```

Expected: one row with `syrantis_set_updated_at`.

## Verify Triggers

```sh
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "select event_object_table, trigger_name from information_schema.triggers where trigger_name like '%set_updated_at%' order by event_object_table;"
```

Expected covered tables:

- `approvals`
- `contacts`
- `drafts`
- `leads`
- `opportunities`
- `organizations`
- `tasks`
- `templates`
- `users`
- `workspaces`

## Test Via API PATCH Task

1. Login and keep the `syrantis_session` cookie.
2. Create or reuse a task.
3. Note the returned `updatedAt`.
4. Wait at least two seconds.
5. PATCH the task.
6. Verify the returned `updatedAt` is strictly greater than the original value.

Example:

```sh
curl -i -X PATCH http://127.0.0.1:8787/api/tasks/<task_id> \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"title":"Updated at validation"}'
```

## Rollback SQL

```sql
DROP TRIGGER IF EXISTS workspaces_set_updated_at_trg ON workspaces;
DROP TRIGGER IF EXISTS users_set_updated_at_trg ON users;
DROP TRIGGER IF EXISTS organizations_set_updated_at_trg ON organizations;
DROP TRIGGER IF EXISTS contacts_set_updated_at_trg ON contacts;
DROP TRIGGER IF EXISTS leads_set_updated_at_trg ON leads;
DROP TRIGGER IF EXISTS opportunities_set_updated_at_trg ON opportunities;
DROP TRIGGER IF EXISTS tasks_set_updated_at_trg ON tasks;
DROP TRIGGER IF EXISTS drafts_set_updated_at_trg ON drafts;
DROP TRIGGER IF EXISTS approvals_set_updated_at_trg ON approvals;
DROP TRIGGER IF EXISTS templates_set_updated_at_trg ON templates;
DROP FUNCTION IF EXISTS syrantis_set_updated_at();
```
