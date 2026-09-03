#!/usr/bin/env python3
"""
DelCargo HR — Desktop Screenshot Tracking Agent
================================================

A small, free, cross-platform (Windows/Mac) helper that periodically takes a
screenshot of the desktop and uploads it to the DelCargo HR dashboard, for
employees who have been enabled for remote screen tracking by HR/Admin.

WHY THIS EXISTS
---------------
A web browser tab cannot silently screenshot the whole desktop in the
background — that requires either a real background OS service (this
script) or the Screen Capture API (which needs an open tab, an explicit
share prompt, and a visible "you are sharing your screen" indicator). This
script is the background-service approach.

HOW IT WORKS
------------
1. On each cycle, it asks the DelCargo PocketBase server (the public
   `hr_tracking_settings` collection, matched by this agent's token — no
   auth needed) whether tracking is currently enabled for this agent's
   token, and what interval to use.
2. If enabled, it takes a screenshot, compresses it, and uploads it.
3. It sleeps for the configured interval and repeats.

SETUP
-----
1. Install Python 3.9+ from https://python.org (check "Add to PATH" on Windows).
2. Open a terminal / command prompt in this file's folder and run:
       pip install pyautogui pillow requests --break-system-packages
   (drop --break-system-packages on Windows if it errors)
3. Get your POCKETBASE_URL and AGENT_TOKEN from HR/Admin
   (Screen Tracking page → Setup Agent for your account). Either:
     a) create a file named config.txt next to this script with:
            POCKETBASE_URL=...
            AGENT_TOKEN=...
         (one per line, no quotes)
     b) or set them as environment variables before running.
4. Run it:
       python delcargo_tracker_agent.py
   Leave the terminal window open (or set it up to run at login — see
   the bottom of this file for basic autostart notes). It will do nothing
   until HR/Admin flips your tracking toggle to "Active" on the dashboard.

PRIVACY NOTE
------------
This tool takes real screenshots of your screen at the configured interval
while tracking is enabled for your account. Only run this if you have
agreed to this with your employer.
"""

import base64
import io
import json
import os
import platform
import re
import sys
import time
import uuid
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("Missing dependency 'requests'. Run: pip install pyautogui pillow requests --break-system-packages")
    sys.exit(1)

try:
    import pyautogui
except ImportError:
    print("Missing dependency 'pyautogui'. Run: pip install pyautogui pillow requests --break-system-packages")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Missing dependency 'pillow'. Run: pip install pyautogui pillow requests --break-system-packages")
    sys.exit(1)

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.txt")

# Screenshots are resized/compressed before upload to keep payloads small.
# Tune these down further if you have many employees or a short retention window.
MAX_WIDTH = 1280
WEBP_QUALITY = 80  # WebP at 80 looks visually equivalent to (often better than) JPEG
                   # at much higher settings, while producing a smaller file

# How often to re-check whether tracking is still enabled / interval has
# changed, even between capture cycles (in case HR/Admin disables tracking
# mid-cycle).
SETTINGS_POLL_SECONDS = 20  # how often we re-check tracking/shift status (was 60s — this is how
                            # quickly the app notices you clocked in and starts capturing)

PB_COLLECTION = "hr_delcargo_store"


def load_config():
    config = {
        "POCKETBASE_URL": os.environ.get("POCKETBASE_URL", ""),
        "AGENT_TOKEN": os.environ.get("AGENT_TOKEN", ""),
    }
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if key in config and value:
                    config[key] = value
    missing = [k for k, v in config.items() if not v]
    if missing:
        print(f"Missing config values: {', '.join(missing)}")
        print(f"Set them in {CONFIG_FILE} or as environment variables. See the setup instructions at the top of this file.")
        sys.exit(1)
    return config


# ── PocketBase REST helpers ──────────────────────────────────────────────────
# PocketBase's public collections (open listRule/viewRule) need no auth header.
# POST/PATCH to open createRule/updateRule collections likewise need none.

JSON_HEADERS = {"Content-Type": "application/json"}


def pb_get_kv(base_url, key):
    """Fetch a single key from hr_delcargo_store. Returns the 'value' field or None."""
    url = f"{base_url}/api/collections/{PB_COLLECTION}/records"
    params = {"filter": f'(key="{key}")', "perPage": 1}
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return None, None
        row = items[0]
        return row.get("id"), row.get("value")
    except Exception as e:
        print(f"[warn] pb_get_kv({key}) failed: {e}")
        return None, None


def pb_set_kv(base_url, key, value):
    """Upsert a key/value pair in hr_delcargo_store."""
    record_id, _ = pb_get_kv(base_url, key)
    payload = json.dumps({"key": key, "value": value})
    try:
        if record_id:
            url = f"{base_url}/api/collections/{PB_COLLECTION}/records/{record_id}"
            resp = requests.patch(url, headers=JSON_HEADERS, data=payload, timeout=20)
        else:
            url = f"{base_url}/api/collections/{PB_COLLECTION}/records"
            resp = requests.post(url, headers=JSON_HEADERS, data=payload, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"[warn] pb_set_kv({key}) failed: {e}")


def get_tracking_settings(base_url, agent_token):
    """Fetch this agent's tracking settings from the real hr_tracking_settings
    collection, filtered by this agent's token.

    Fixed 2026-08-25 — this used to read a KV row (hr_tracking_settings_prod_v1)
    from before the web app migrated tracking settings to a real PocketBase
    collection with a unique index on employeeEmail (see hrData.ts's
    getAllTrackingSettings/updateTrackingSettings). The web app stopped
    writing to that KV key entirely once the migration landed, so this
    lookup always returned None: this script printed "Could not find
    tracking settings for this token" and sat idle forever, no matter how
    fresh the setup code was. Same bug, same fix as get_tracking_settings in
    tracker-agent/agent_gui.py (fixed there 2026-08-18) — this standalone
    "Advanced: raw script" copy just never got the same treatment."""
    if not agent_token:
        return None
    url = f"{base_url}/api/collections/hr_tracking_settings/records"
    params = {"filter": f'(agentToken="{agent_token}")', "perPage": 1}
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        return items[0] if items else None
    except Exception as e:
        print(f"[warn] get_tracking_settings failed: {e}")
        return None


def heartbeat_key_for(email):
    return "tracker_heartbeat_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def get_device_label():
    try:
        return platform.node() or "Unknown device"
    except Exception:
        return "Unknown device"


def upsert_heartbeat(base_url, employee_email, device_id, device_label):
    key = heartbeat_key_for(employee_email)
    now = datetime.now(timezone.utc).isoformat()
    value = {
        "employeeEmail": employee_email,
        "deviceId": device_id,
        "deviceLabel": device_label,
        "connectedAt": now,
        "lastSeenAt": now,
    }
    pb_set_kv(base_url, key, value)


def check_active_shift(base_url, employee_email):
    """Checks the real hr_timesheets collection for an open shift for this
    employee. IMPORTANT: hr_timesheets has no literal "in_progress" status
    value — its fixed status enum is pending/approved/rejected only. An
    open shift is represented by clock_out still being empty (see
    TimesheetEntry's derived .status in src/lib/hrData.ts and
    Notes/SCHEMA_REFERENCE.md). This used to read a KV row
    (hr_timesheets_prod_v1) from before the PocketBase migration, which the
    web app no longer writes to — that was silently making the agent stay
    "Paused" forever regardless of actual shift status."""
    if not employee_email:
        return False
    try:
        url = f"{base_url}/api/collections/hr_timesheets/records"
        params = {"filter": '(clock_out="")', "perPage": 200}
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        # employee_id on hr_timesheets actually stores the employee's email
        # (matches employeeEmail convention used everywhere else in the app).
        return any((it.get("employee_id") or "").lower() == employee_email.lower() for it in items)
    except Exception as e:
        print(f"[warn] check_active_shift failed: {e}")
        return False


def _is_black_frame(img, grid=8) -> bool:
    """Cheap black-frame detector (samples an 8x8 grid rather than scanning
    every pixel) — see the same helper in tracker-agent/agent_gui.py, this
    is a deliberate copy since this standalone script has no shared import
    with that PyInstaller build."""
    try:
        w, h = img.size
        if w == 0 or h == 0:
            return True
        step_x, step_y = max(1, w // grid), max(1, h // grid)
        px = img.convert("RGB").load()
        for y in range(0, h, step_y):
            for x in range(0, w, step_x):
                if any(c > 8 for c in px[x, y]):
                    return False
        return True
    except Exception:
        return False  # can't tell — don't discard a possibly-fine frame


def capture_and_encode():
    """Captures a screenshot, resizes/compresses it, and returns raw WebP
    bytes plus its final width/height (no base64 — uploaded as a real file,
    see upload_screenshot). WebP at this quality/method settings is
    noticeably smaller than JPEG at a visually equivalent quality."""
    img = pyautogui.screenshot()

    # pyautogui/Pillow's ImageGrab silently returns a solid black frame on
    # macOS (no exception) when this script hasn't been granted Screen
    # Recording permission (System Settings > Privacy & Security) — without
    # this check that black frame just gets uploaded as if it were a real
    # capture, indistinguishable on the HR dashboard from one that's
    # actually working. See the matching fix + longer explanation in
    # tracker-agent/agent_gui.py's capture_and_encode().
    if _is_black_frame(img):
        if platform.system() == "Darwin":
            raise RuntimeError(
                "Screen capture blocked - macOS Screen Recording permission "
                "not granted. Open System Settings > Privacy & Security > "
                "Screen Recording, enable this script/Terminal/Python, then re-run."
            )
        raise RuntimeError("Screen capture returned a black frame")

    w, h = img.size
    if w > MAX_WIDTH:
        new_h = int(h * (MAX_WIDTH / w))
        img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)
        w, h = MAX_WIDTH, new_h
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue(), w, h


def upload_screenshot(base_url, employee_email, webp_bytes, width, height, agent_token=None):
    """Uploads a screenshot as a real file into the hr_screenshots collection
    (multipart/form-data) — replaces the old approach of embedding a base64
    data URL inside a JSON row in hr_delcargo_store. See
    migration_data/create_screenshots_collection.py for the collection
    schema (mimeTypes there must include image/webp)."""
    timestamp = datetime.now(timezone.utc).isoformat()
    filename = f"scr_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.webp"
    try:
        url = f"{base_url}/api/collections/hr_screenshots/records"
        data = {
            "employee_email": employee_email or "",
            "captured_at": timestamp,
            "width": str(width),
            "height": str(height),
        }
        if agent_token:
            data["agent_token"] = agent_token
        files = {"image": (filename, webp_bytes, "image/webp")}
        resp = requests.post(url, data=data, files=files, timeout=30)
        if resp.status_code >= 300:
            print(f"[warn] Upload failed ({resp.status_code}): {resp.text[:200]}")
            return False
        print(f"[ok] Uploaded screenshot at {timestamp}")
        return True
    except Exception as e:
        print(f"[warn] Upload error: {e}")
        return False


def main():
    config = load_config()
    base_url = config["POCKETBASE_URL"].rstrip("/")
    agent_token = config["AGENT_TOKEN"]
    device_id = uuid.uuid4().hex
    device_label = get_device_label()

    print("DelCargo HR tracking agent starting. Waiting for tracking to be enabled by HR/Admin...")

    while True:
        settings = get_tracking_settings(base_url, agent_token)

        if settings is None:
            print("[warn] Could not find tracking settings for this token. Check your config and ask HR/Admin to confirm setup. Retrying in 60s.")
            time.sleep(SETTINGS_POLL_SECONDS)
            continue

        if not settings.get("enabled"):
            time.sleep(SETTINGS_POLL_SECONDS)
            continue

        employee_email = settings.get("employeeEmail")
        upsert_heartbeat(base_url, employee_email, device_id, device_label)

        if not check_active_shift(base_url, employee_email):
            time.sleep(SETTINGS_POLL_SECONDS)
            continue

        # 1 minute is the enforced floor (matches the minimum HR/Admin can
        # set on the dashboard — see TrackingView.tsx's interval input);
        # this max() is just a safety net for any older saved settings.
        interval_minutes = max(1.0, float(settings.get("intervalMinutes", 15)))

        try:
            webp_bytes, w, h = capture_and_encode()
            upload_screenshot(base_url, employee_email, webp_bytes, w, h, agent_token=agent_token)
        except Exception as e:
            print(f"[warn] Capture failed: {e}")

        # Sleep in short chunks so a mid-interval "disable tracking" from
        # HR/Admin is noticed promptly rather than waiting out the full interval.
        remaining = interval_minutes * 60
        while remaining > 0:
            chunk = min(SETTINGS_POLL_SECONDS, remaining)
            time.sleep(chunk)
            remaining -= chunk


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")

# ── Optional: run automatically at login ──────────────────────────────────
# Windows: create a shortcut to this script in
#   shell:startup  (Win+R, type shell:startup, Enter)
# using a target like:
#   pythonw.exe "C:\path\to\delcargo_tracker_agent.py"
#
# macOS: create ~/Library/LaunchAgents/com.delcargo.tracker.plist that runs
#   /usr/bin/python3 /path/to/delcargo_tracker_agent.py
# and load it with: launchctl load ~/Library/LaunchAgents/com.delcargo.tracker.plist
