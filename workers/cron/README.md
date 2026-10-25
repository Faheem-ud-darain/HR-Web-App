# delcargo-cron (Cloudflare Worker)

Runs the app's scheduled jobs by calling its authenticated `/api/cron/*` routes.

| Schedule (UTC) | Does |
|---|---|
| `0 11 7 * *` | Warns HR/Admin (in-app notice) what screenshots will be deleted on the 10th |
| `*/5 * 10-20 * *` | Deletes one small batch of screenshots captured before the start of the current month |

Rule: screenshots are kept for their own month plus until the 10th of the next month. Employees
marked "exclude from auto-delete" are never touched. The route refuses to delete before the 10th
(New York time), whatever is sent.

## Deploy

```bash
cd workers/cron
npx wrangler login
npx wrangler secret put CRON_SECRET     # paste the same value that is set on the Pages project
npx wrangler deploy
```

Set the same `CRON_SECRET` (a long random string, 24+ characters) as a secret on the Pages project
`hr-web-app` (Settings → Variables and secrets) and deploy the app version that contains
`/api/cron/screenshot-retention`.

## Check it without deleting anything

```bash
curl -X POST "https://hub.delcargo.us/api/cron/screenshot-retention?mode=preview" -H "Authorization: Bearer $CRON_SECRET"
```
Returns how many screenshots are currently due; changes nothing.
