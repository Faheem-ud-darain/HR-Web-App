"""
One-time migration: adds the forward_* fields to the EXISTING `hr_messages`
PocketBase collection, for the new "HR & Admin Line" feature (a permanent,
shared hr_messages channel visible only to hr/admin, with a "Forward"
action on tickets/announcements/chat messages that lands a message in that
channel — see hrActions.forwardToHrAdminLine in src/lib/hrData.ts).

This is a companion to create_messages_collection.py, not a replacement —
it only ADDS fields to whatever hr_messages already looks like on the live
instance; it doesn't touch team_id/sender_email/text/attachment/etc. or any
existing rows. Nothing here touches RLS/auth or existing data — additive
schema change only, explicitly approved by the user.

New fields added
-----------------
- is_forward        (bool)   — true only on messages created via
                                forwardToHrAdminLine; false/absent for every
                                regular chat/announcement message.
- forward_kind       (text)  — 'ticket' | 'announcement' | 'chat'.
- forward_label      (text)  — the source's title (ticket/announcement) or
                                source channel's display name (chat) — see
                                the Message.forwardLabel comment in
                                hrData.ts for exactly what this holds.
- forward_link       (text)  — the source record's raw id (ticket id /
                                announcement id / source teamId).
                                Deliberately NOT a pre-built path — see the
                                Message.forwardLink comment in hrData.ts
                                for why the real "View original" URL is
                                resolved client-side at render time instead.
- forward_note       (text)  — optional note the forwarder typed before
                                sending; absent when skipped.

Until this script is run against the live instance, PocketBase silently
drops these keys on write (same as every other "field doesn't exist yet"
case in this app — see the addNotification `link` field comment in
hrData.ts for the established precedent) and toMessage()'s forward_* reads
all come back undefined, so a forwarded message just renders as an
empty-looking plain message with no card — not a crash, just missing the
extra styling until this migration is applied.

Security note (matches the rest of this app's current, deliberate posture)
----------------------------------------------------------------------------
No rule changes here — hr_messages' listRule/viewRule/createRule stay
exactly as create_messages_collection.py left them (open, no PocketBase
auth session on the client yet). Forward-only-visible-to-hr/admin is
enforced in the UI (the "HR & Admin" nav item and hr-admin/page.tsx routes
are gated by role, same as every other role-gated screen in this app), not
by the database.

This script is idempotent: safe to re-run any time. If a field already
exists it's left alone; only genuinely missing fields are added.

Usage:
    pip install requests --break-system-packages   # if not already installed
    python migration_data/add_forward_fields_to_messages.py

NOT YET RUN against the live PocketBase instance as of this writing — the
user needs to run this themselves with their own admin credentials before
the forward_* fields actually exist on hr_messages.
"""

import json
import sys

import requests

PB_URL = "http://157.230.7.89"
ADMIN_EMAIL = "studiozsparx@gmail.com"
ADMIN_PASSWORD = "Fah123@123"

COLLECTION_NAME = "hr_messages"


def get_admin_token():
    resp = requests.post(
        f"{PB_URL}/api/admins/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def get_collection(token, name):
    resp = requests.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def build_new_fields():
    return [
        {
            "name": "is_forward",
            "type": "bool",
            "required": False,
            "unique": False,
            "options": {},
        },
        {
            "name": "forward_kind",
            "type": "text",
            "required": False,
            "unique": False,
            "options": {"min": None, "max": None, "pattern": ""},
        },
        {
            "name": "forward_label",
            "type": "text",
            "required": False,
            "unique": False,
            "options": {"min": None, "max": None, "pattern": ""},
        },
        {
            "name": "forward_link",
            "type": "text",
            "required": False,
            "unique": False,
            "options": {"min": None, "max": None, "pattern": ""},
        },
        {
            "name": "forward_note",
            "type": "text",
            "required": False,
            "unique": False,
            "options": {"min": None, "max": 4000, "pattern": ""},
        },
    ]


def sync_missing_fields(token, existing):
    existing_names = {f["name"] for f in existing.get("schema", [])}
    missing = [f for f in build_new_fields() if f["name"] not in existing_names]
    if not missing:
        print(f"Collection '{COLLECTION_NAME}' already has all forward_* fields — nothing to do.")
        return

    payload = dict(existing)
    payload["schema"] = existing["schema"] + missing
    resp = requests.patch(
        f"{PB_URL}/api/collections/{existing['id']}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=20,
    )
    if resp.status_code >= 300:
        print(f"Failed to update collection: HTTP {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    added = ", ".join(f["name"] for f in missing)
    print(f"Added missing field(s) to '{COLLECTION_NAME}': {added}")


def main():
    token = get_admin_token()
    existing = get_collection(token, COLLECTION_NAME)
    if not existing:
        print(
            f"Collection '{COLLECTION_NAME}' does not exist yet on {PB_URL} — "
            "run migration_data/create_messages_collection.py first."
        )
        sys.exit(1)
    sync_missing_fields(token, existing)


if __name__ == "__main__":
    main()
