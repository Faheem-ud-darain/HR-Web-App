# 032: Communication trail

**Why.** Ticket replies sent from the shared HR login could not be traced to a device or place. PocketBase's own request log keeps that for only 5 days and cannot say which account was signed in.

**What it does.** Every ticket opened, reply, close/reopen, chat message (including the HR & Admin line) and announcement is stamped by the server into `hr_communication_audit`: the signed-in account (verified from the session), the visitor's address and country (Cloudflare headers), the device (`describeDevice`), the device id, the time, and the account the message itself claims. A row where the two accounts differ is flagged. Message text is never copied.

**Hidden and unchangeable.**
- The table's rules are all null: nothing in the browser can read, write, change or delete it. Only `POST /api/audit/communication` (admin token) adds a row.
- `GET /api/admin/audit` is the only reader: HR and Admin only, read-only (no write method exists).
- The page is `/admin/audit-trail` and `/hr/audit-trail`. It is in no menu on purpose.

**Run once (Admin).** The table must be created before anything is recorded; until then the route answers `{ configured: false }` and the app works exactly as before.
1. `{ "action": "ensureCommunicationAudit" }` against `/api/admin/schema-migration` (a dry run, reports "would create").
2. `{ "action": "ensureCommunicationAudit", "dryRun": false }` to create it.

**Known limits.**
- The browser reports a message right after saving it, so a modified client could skip the report. Using the app normally, every message is recorded. A message with no row is the sign of that.
- Entries start from when the table is created. Nothing before that can be recovered (PocketBase keeps only 5 days).
- The address shows the network's owner and country, not a street location.
