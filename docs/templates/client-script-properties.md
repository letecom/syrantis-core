# Client Script Properties

Set these values in Google Apps Script under `Project Settings -> Script Properties`.

Do not paste API keys into Apps Script source, Google Sheets cells, docs, screenshots, issues, or
chat. The key value must live only in Script Properties and should be created from Syrantis admin at
`/app/api-keys`.

| Key                    | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `SYRANTIS_API_BASE`    | `https://api.syrantis.fr`                                                                     |
| `SYRANTIS_API_KEY`     | `<created from admin UI>`                                                                     |
| `INTAKE_ENABLED`       | `true\|false`                                                                                 |
| `EXPORT_ENABLED`       | `true\|false`                                                                                 |
| `SYRANTIS_SOURCE`      | `gmail_apps_script_client`                                                                    |
| `SYRANTIS_GMAIL_QUERY` | `subject:"[SYRANTIS-E2E]" newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Failed"` |
| `INTAKE_BATCH_LIMIT`   | `10`                                                                                          |
| `EXPORT_BATCH_LIMIT`   | `5`                                                                                           |

## Operational Notes

- `INTAKE_ENABLED=false` prevents inbound Gmail processing.
- `EXPORT_ENABLED=false` prevents Gmail draft creation.
- The query should exclude `Syrantis/Processed` and `Syrantis/Failed` labels to avoid repeated
  intake attempts.
- Batch limits should stay small for client validation and manual operations.
- The script uses `Authorization: Bearer <SYRANTIS_API_KEY>` internally, but it must never log or
  print the key or header.
