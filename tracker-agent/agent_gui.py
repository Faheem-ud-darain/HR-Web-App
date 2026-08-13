#!/usr/bin/env python3
"""
DelCargo Tracker — Desktop Screenshot Tracking Agent (GUI edition)
====================================================================

A small, professional-looking desktop app for Windows and Mac that
periodically captures a screenshot and uploads it to the DelCargo HR
dashboard, for employees who have been enabled for remote screen tracking
by HR/Admin. This is the packaged/GUI version of the plain
`delcargo_tracker_agent.py` script — same capture/upload logic, but with:

  - A one-time setup screen: paste a single setup code from the HR/Admin
    "Setup Agent" dialog (no manually copying URLs/tokens into a text file).
  - A system tray / menu-bar icon so it runs quietly in the background.
  - Optional "start automatically when I log in" (Windows + macOS).
  - A status window showing connection state, tracking on/off, and the
    last capture time — instead of a bare terminal.

WHY THIS EXISTS
---------------
A web browser tab cannot silently screenshot the whole desktop in the
background — that requires either a real background OS service (this app)
or the browser's Screen Capture API (which needs an open tab, an explicit
share prompt, and a visible "you are sharing your screen" indicator).

HOW IT WORKS
------------
1. On first launch, the employee pastes a one-time setup code (from HR/
   Admin's Screen Tracking → Setup Agent screen) into this app.
2. The app decodes the code into a PocketBase URL and agent token,
   confirms it can find a matching tracking-settings row, and saves it
   locally (never re-asks unless "Disconnect" or "Use a Different Setup
   Code" is used from the dashboard).
3. In the background, it polls PocketBase every ~60s to check whether
   tracking is currently enabled for this token and what interval to use.
4. If enabled, it takes a screenshot, compresses it, and uploads it, then
   waits out the configured interval (checking for a "disable" in between).

Images are uploaded as real files into the dedicated `hr_screenshots`
PocketBase collection (see migration_data/create_screenshots_collection.py),
not embedded as base64 JSON rows — smaller uploads, and the dashboard can
serve/thumbnail them natively.

This file is meant to be packaged into a standalone .exe (Windows) / .app
or binary (macOS) with PyInstaller — see build_windows.bat / build_mac.sh
in this same folder — so employees never need to install Python themselves.
"""

import base64
import binascii
import io
import json
import os
import platform
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from datetime import datetime, timedelta, timezone

import tkinter as tk
from tkinter import ttk, messagebox

try:
    import requests
except ImportError:
    print("Missing dependency 'requests'. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import pyautogui
except ImportError:
    print("Missing dependency 'pyautogui'. Run: pip install -r requirements.txt")
    sys.exit(1)

from PIL import Image, ImageDraw

try:
    import pystray
except ImportError:
    pystray = None  # Tray icon becomes optional; app still runs as a normal window.

APP_NAME = "DelCargo Tracker"
APP_DIR = os.path.join(os.path.expanduser("~"), ".delcargo_tracker")
CONFIG_FILE = os.path.join(APP_DIR, "config.json")

# ── Auto-update ───────────────────────────────────────────────────────────
# Bump APP_VERSION and push a matching "tracker-agent-vX.Y" git tag (see
# tracker-agent/README.md and .github/workflows/build-tracker-agent.yml)
# together whenever a new build is released — this string (compared
# component-by-component via _parse_version below, not as plain text) is
# the only thing the update check trusts against the tag GitHub reports as
# latest.
APP_VERSION = "9"
GITHUB_REPO = "SPARXzeux/HR-Web-App"
GITHUB_LATEST_RELEASE_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_RELEASES_PAGE = f"https://github.com/{GITHUB_REPO}/releases/latest"
GITHUB_WINDOWS_INSTALLER_URL = f"https://github.com/{GITHUB_REPO}/releases/latest/download/DelCargo_Tracker_Setup.exe"
GITHUB_MAC_ZIP_URL = f"https://github.com/{GITHUB_REPO}/releases/latest/download/DelCargo-Tracker-Mac.zip"

MAX_WIDTH = 1280
WEBP_QUALITY = 80  # WebP at 80 looks visually equivalent to (often better than) JPEG
                   # at much higher settings, while producing a smaller file
SETTINGS_POLL_SECONDS = 20  # how often we re-check tracking/shift status (was 60s — this is how
                            # quickly the app notices you clocked in and flips to "Tracking Active")

MOUSE_POLL_SECONDS = 5       # how often we sample the cursor position
INACTIVITY_THRESHOLD_SECONDS = 180  # 3 minutes — matches the HR/Admin-facing spec

# 37 minutes of CONTINUOUS idle time (mouse hasn't moved at all, checked
# live while still idle — not the completed-interval log above, which only
# gets written once the mouse moves again) auto-ends the shift and marks
# the employee absent for the day, per explicit product decision. This is
# deliberately a separate constant from INACTIVITY_THRESHOLD_SECONDS above
# (3 min) — that one is just the HR/Admin reporting threshold for what
# counts as a loggable idle stretch at all; this one is the much longer
# "you weren't actually working" cutoff that has a real payroll
# consequence. See handle_inactivity_auto_absence() below.
AUTO_ABSENT_INACTIVITY_SECONDS = 37 * 60

MAX_ERROR_DISPLAY_LEN = 140  # see _short_error() below


# ── macOS Native Permission Helper ──────────────────────────────────────────
def request_mac_permissions():
    """On macOS, triggers a native system permission request for Screen Recording
    and Accessibility if not already granted, preventing headless crash errors."""
    if platform.system() != "Darwin":
        return

    try:
        # Trigger an initial py_capture test to force macOS Gatekeeper / Screen Recording prompt
        # CGPreflightScreenCaptureAccess is checked or triggered via screencapture check
        cmd = ["screencapture", "-x", "-c"]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
    except Exception as e:
        print(f"[macOS Permission Trigger] Warning: {e}")

    try:
        # Check accessibility API permission status via osascript
        check_script = 'tell application "System Events" to get name of first process'
        res = subprocess.run(["osascript", "-e", check_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0 and "not allowed" in res.stderr.lower():
            # Trigger System Settings open to Privacy & Security -> Screen Recording
            print("[macOS Permission] Accessibility or Screen Recording permission missing. Directing user to Settings.")
    except Exception:
        pass


def _short_error(msg) -> str:
    """Truncates a raw exception/error string before it goes into the
    dashboard's status card. A long message (raw network/SSL exception text
    can easily run to several hundred characters) wraps across enough lines
    at the card's fixed width to grow the whole card taller than the
    window — and since the window used to be fixed-size and non-resizable,
    that pushed the action buttons (Use a Different Setup Code, Disconnect)
    below the visible area entirely, making them unclickable with no way to
    reach them. Employees also don't need the full raw exception text to
    understand "couldn't reach the server" — short is strictly better UX
    here, not just a layout workaround."""
    msg = str(msg)
    return msg if len(msg) <= MAX_ERROR_DISPLAY_LEN else msg[: MAX_ERROR_DISPLAY_LEN - 1].rstrip() + "…"

# ── Brand palette — kept in lockstep with the web dashboard's Tailwind
# tokens (src/app/globals.css / the orange-600 accent used throughout
# Sidebar.tsx, TopNav.tsx, Badge.tsx) so the desktop app reads as the same
# product, not a bolted-on utility.
ACCENT = "#ea580c"        # orange-600 — primary buttons, active states
ACCENT_HOVER = "#c2410c"  # orange-700 — hover/active press state
ACCENT_SOFT = "#fff7ed"   # orange-50  — soft badge/callout backgrounds
INK = "#1e293b"           # slate-800  — headings / primary text
MUTED = "#64748b"         # slate-500  — secondary text
BORDER = "#e2e8f0"        # slate-200  — card/input borders
BG = "#f8fafc"            # slate-50   — app background
CARD_BG = "#ffffff"
SUCCESS = "#10b981"       # emerald-500 — "Active"/"Connected" states
SUCCESS_SOFT = "#ecfdf5"  # emerald-50
WARNING = "#f59e0b"       # amber-500 — "Paused" state
WARNING_SOFT = "#fffbeb"  # amber-50
DANGER = "#e11d48"        # rose-600 — errors / disconnect
DANGER_SOFT = "#fff1f2"   # rose-50


def _font_family():
    """Closest system-native equivalent to the web dashboard's default UI
    font on each OS — Segoe UI on Windows, San Francisco (via the Helvetica
    Neue alias Tk resolves to SF on modern macOS) on Mac."""
    return "SF Pro Text" if platform.system() == "Darwin" else "Segoe UI"


FONT = _font_family()


def _round_rect(canvas, x1, y1, x2, y2, radius=12, **kwargs):
    """Draws a filled rounded rectangle on a Tk Canvas (Tkinter has no
    native rounded-rect primitive) — used everywhere the web app uses
    Tailwind's rounded-xl/rounded-2xl cards, pills, and buttons."""
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class Card(tk.Frame):
    """A white, rounded, bordered container — the desktop equivalent of the
    web app's <Card> component (rounded-2xl, border-slate-200, bg-white)."""

    def __init__(self, parent, padding=16, radius=14, **kwargs):
        super().__init__(parent, bg=BG, highlightthickness=0, **kwargs)
        self._canvas = tk.Canvas(self, bg=BG, highlightthickness=0, bd=0)
        self._canvas.pack(fill="both", expand=True)
        self.inner = tk.Frame(self._canvas, bg=CARD_BG)
        self._radius = radius
        self._padding = padding
        self._win = self._canvas.create_window(0, 0, window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", self._on_inner_configure)
        self._canvas.bind("<Configure>", self._on_canvas_configure)

    def _on_inner_configure(self, _evt=None):
        w = self.inner.winfo_reqwidth() + self._padding * 2
        h = self.inner.winfo_reqheight() + self._padding * 2
        self._canvas.configure(width=w, height=h)
        self._redraw(w, h)

    def _on_canvas_configure(self, evt):
        self._redraw(evt.width, evt.height)
        self._canvas.itemconfig(self._win, width=max(0, evt.width - self._padding * 2))

    def _redraw(self, w, h):
        self._canvas.delete("bg")
        if w > 2 and h > 2:
            _round_rect(self._canvas, 1, 1, w - 1, h - 1, radius=self._radius,
                         fill=CARD_BG, outline=BORDER, width=1, tags="bg")
            self._canvas.tag_lower("bg")
        self._canvas.coords(self._win, self._padding, self._padding)


class PillButton(tk.Canvas):
    """A pill/rounded button matching the web app's button styling — Tk's
    stock ttk.Button can't do rounded corners or a true brand-orange fill
    reliably across platforms, so this draws its own."""

    VARIANTS = {
        "primary": dict(bg=ACCENT, hover=ACCENT_HOVER, fg="white"),
        "secondary": dict(bg="#f1f5f9", hover="#e2e8f0", fg=INK),
        "danger": dict(bg=DANGER_SOFT, hover="#ffe4e6", fg=DANGER),
    }

    def __init__(self, parent, text, command=None, variant="primary", width=None, height=38, font_size=10, **kwargs):
        super().__init__(parent, height=height, highlightthickness=0, bd=0, bg=BG, **kwargs)
        self.command = command
        self.text = text
        self.colors = self.VARIANTS.get(variant, self.VARIANTS["primary"])
        self._hovering = False
        self._min_width = width
        self._height = height
        self.font = (FONT, font_size, "bold")
        self.bind("<Configure>", lambda e: self._draw())
        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", lambda e: self._set_hover(True))
        self.bind("<Leave>", lambda e: self._set_hover(False))
        self.configure(cursor="hand2")
        if width:
            self.configure(width=width)
        self.after(10, self._draw)

    def set_text(self, text):
        self.text = text
        self._draw()

    def set_enabled(self, enabled):
        self.command_enabled = enabled
        self._draw()

    def _set_hover(self, state):
        self._hovering = state
        self._draw()

    def _on_click(self, _evt):
        if self.command:
            self.command()

    def _draw(self):
        self.delete("all")
        w = self.winfo_width() or self._min_width or 140
        h = self.winfo_height() or self._height
        fill = self.colors["hover"] if self._hovering else self.colors["bg"]
        _round_rect(self, 1, 1, max(w - 1, 20), h - 1, radius=h / 2, fill=fill, outline="")
        self.create_text(w / 2, h / 2, text=self.text, fill=self.colors["fg"], font=self.font)


def badge(parent, text, variant="default"):
    """Small rounded status pill matching the web app's <Badge> component."""
    colors = {
        "success": (SUCCESS_SOFT, SUCCESS),
        "warning": (WARNING_SOFT, "#b45309"),
        "danger": (DANGER_SOFT, DANGER),
        "default": ("#f1f5f9", MUTED),
    }
    bg_c, fg_c = colors.get(variant, colors["default"])
    c = tk.Canvas(parent, height=22, highlightthickness=0, bd=0, bg=parent["bg"] if "bg" in parent.keys() else BG)
    f = (FONT, 8, "bold")
    tmp = tk.Label(parent, text=text, font=f)
    tmp.update_idletasks()
    tw = tmp.winfo_reqwidth() + 20
    tmp.destroy()
    c.configure(width=tw)
    c.after(10, lambda: (_round_rect(c, 0, 0, tw, 22, radius=11, fill=bg_c, outline=""),
                          c.create_text(tw / 2, 11, text=text.upper(), fill=fg_c, font=f)))
    return c


# ─────────────────────────── setup code helpers ────────────────────────────

def encode_setup_code(url, token):
    """Encodes url + agent token into a base64url setup code (no API key needed)."""
    payload = json.dumps({"u": url, "t": token}).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decode_setup_code(code):
    code = (code or "").strip()
    # Tolerate accidental whitespace/newlines from copy-paste.
    code = "".join(code.split())
    padded = code + "=" * (-len(code) % 4)
    data = base64.urlsafe_b64decode(padded.encode("ascii"))
    obj = json.loads(data.decode("utf-8"))
    url, token = obj.get("u"), obj.get("t")
    # Back-compat: old codes had a 'k' (anon key) field — ignore it.
    if not (url and token):
        raise ValueError("Setup code is missing required fields.")
    return url.rstrip("/"), token


# ───────────────────────── single-instance lock ─────────────────────────────
# Prevents a second copy of the app from opening (e.g. double-clicking the
# installer shortcut twice, or autostart launching it while it's already
# running from a previous login). Implemented as a bind on a localhost-only
# TCP port rather than a PID/lock file — a lock file can be left behind (and
# wrongly treated as "still running") after a crash or forced kill, whereas
# an OS-level socket bind is automatically released the instant the process
# actually exits, crash or not.

SINGLE_INSTANCE_PORT = 47231  # arbitrary local-only port, used purely as a lock — never listens for real traffic
_single_instance_socket = None  # kept alive for the process lifetime so the OS never releases the port early


def acquire_single_instance_lock():
    """Returns True if this is the only running instance (and claims the
    lock for the rest of the process's life). Returns False if another
    instance already holds it."""
    global _single_instance_socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        s.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        s.listen(1)
    except OSError:
        s.close()
        return False
    _single_instance_socket = s
    return True


# ─────────────────────────── local config storage ───────────────────────────

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return None


def save_config(cfg):
    os.makedirs(APP_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f)


def clear_config():
    try:
        os.remove(CONFIG_FILE)
    except OSError:
        pass


# ───────────────────────────── autostart helpers ────────────────────────────

def _current_executable():
    """Path to launch on login. When frozen by PyInstaller, sys.executable
    is the standalone app itself; otherwise fall back to the python
    interpreter + this script (dev mode)."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    return f'"{sys.executable}" "{os.path.abspath(__file__)}"'


def set_autostart(enabled):
    system = platform.system()
    try:
        if system == "Windows":
            import winreg
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                if enabled:
                    winreg.SetValueEx(key, "DelCargoTracker", 0, winreg.REG_SZ, _current_executable())
                else:
                    try:
                        winreg.DeleteValue(key, "DelCargoTracker")
                    except FileNotFoundError:
                        pass
        elif system == "Darwin":
            plist_path = os.path.join(
                os.path.expanduser("~"), "Library", "LaunchAgents", "com.delcargo.tracker.plist"
            )
            if enabled:
                exe = sys.executable if getattr(sys, "frozen", False) else sys.executable
                args = [exe] if getattr(sys, "frozen", False) else [exe, os.path.abspath(__file__)]
                arg_xml = "\n        ".join(f"<string>{a}</string>" for a in args)
                plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.delcargo.tracker</string>
    <key>ProgramArguments</key>
    <array>
        {arg_xml}
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"""
                os.makedirs(os.path.dirname(plist_path), exist_ok=True)
                with open(plist_path, "w") as f:
                    f.write(plist)
                os.system(f'launchctl load "{plist_path}" >/dev/null 2>&1')
            else:
                os.system(f'launchctl unload "{plist_path}" >/dev/null 2>&1')
                try:
                    os.remove(plist_path)
                except OSError:
                    pass
        # Other platforms: no-op (Linux desktop-entry autostart intentionally
        # left out — this agent targets Windows/Mac employee machines).
    except Exception as e:
        print(f"[warn] Could not set autostart: {e}")


# ── PocketBase REST helpers ───────────────────────────────────────────────────
# PocketBase public (open-rule) collections need no auth header.
# All reads use filter params; upserts do GET-then-PATCH-or-POST.

PB_COLLECTION = "hr_delcargo_store"
JSON_HEADERS = {"Content-Type": "application/json"}


def pb_get_kv(base_url, key):
    """Fetch a single key from hr_delcargo_store. Returns (record_id, value) or (None, None)."""
    url = f"{base_url}/api/collections/{PB_COLLECTION}/records"
    params = {"filter": f'(key="{key}")', "perPage": 1}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        return None, None
    row = items[0]
    return row.get("id"), row.get("value")


def pb_set_kv(base_url, key, value):
    """Upsert a key/value pair in hr_delcargo_store."""
    record_id, _ = pb_get_kv(base_url, key)
    payload = json.dumps({"key": key, "value": value})
    if record_id:
        url = f"{base_url}/api/collections/{PB_COLLECTION}/records/{record_id}"
        resp = requests.patch(url, headers=JSON_HEADERS, data=payload, timeout=20)
    else:
        url = f"{base_url}/api/collections/{PB_COLLECTION}/records"
        resp = requests.post(url, headers=JSON_HEADERS, data=payload, timeout=20)
    resp.raise_for_status()


def supabase_headers(anon_key):  # kept as alias so old configs don't break
    return JSON_HEADERS


def get_tracking_settings(base_url, _unused_key, agent_token):
    """Fetch this agent's tracking settings by looking up its token in the KV store."""
    _, value = pb_get_kv(base_url, "hr_tracking_settings_prod_v1")
    if value is None:
        return None
    all_settings = value if isinstance(value, list) else []
    for s in all_settings:
        if s.get("agentToken") == agent_token:
            return s
    return None


def check_active_shift(base_url, _unused_key, employee_email):
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
    url = f"{base_url}/api/collections/hr_timesheets/records"
    params = {"filter": '(clock_out="")', "perPage": 200}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    # employee_id on hr_timesheets actually stores the employee's email
    # (matches employeeEmail convention used everywhere else in the app).
    return any((it.get("employee_id") or "").lower() == employee_email.lower() for it in items)


def _format_duration_between(start_iso, end_iso):
    """Mirrors formatDurationBetween() in src/lib/hrData.ts ("{h}h {m}m") so
    a shift auto-ended from here looks identical to one ended from the web
    app."""
    try:
        start = datetime.fromisoformat((start_iso or "").replace("Z", "+00:00"))
        end = datetime.fromisoformat((end_iso or "").replace("Z", "+00:00"))
        total_minutes = max(0, round((end - start).total_seconds() / 60))
        return f"{total_minutes // 60}h {total_minutes % 60}m"
    except Exception:
        return ""


def auto_clock_out(base_url, employee_email):
    """Ends (clocks out) this employee's currently open shift, if any —
    used when the tracker app is quit while tracking is required for an
    active shift, so a closed tracker can never leave a shift silently
    un-monitored. Mirrors hrActions.clockOut() in src/lib/hrData.ts."""
    if not employee_email:
        return False
    url = f"{base_url}/api/collections/hr_timesheets/records"
    params = {"filter": f'(employee_id="{employee_email}" && clock_out="")', "perPage": 1}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        return False
    record = items[0]
    now_iso = datetime.now(timezone.utc).isoformat()
    patch_url = f"{base_url}/api/collections/hr_timesheets/records/{record['id']}"
    payload = {
        "clock_out": now_iso,
        "duration": _format_duration_between(record.get("clock_in"), now_iso),
    }
    resp = requests.patch(patch_url, headers=JSON_HEADERS, data=json.dumps(payload), timeout=20)
    resp.raise_for_status()
    return True


def shift_stop_signal_key_for(email):
    return "shift_stop_signal_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def notify_shift_auto_stopped(base_url, employee_email, reason="tracker_closed"):
    """Writes a one-shot "your shift was just auto-ended" signal the web
    dashboard polls for (see shiftStopSignalKeyFor/getShiftStopSignal in
    hrData.ts). Called right after a successful auto_clock_out() so the
    Employee dashboard — if it happens to be open in a browser somewhere —
    can pop up an explanation immediately, instead of the employee only
    finding out at their next login (see the existing shift_auto_stopped_*
    localStorage flag, which still covers the "wasn't looking at the
    dashboard right now" case)."""
    if not employee_email:
        return
    try:
        pb_set_kv(base_url, shift_stop_signal_key_for(employee_email), {
            "employeeEmail": employee_email,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
        })
    except Exception as e:
        print(f"[warn] Writing shift-stop signal failed: {e}")


# ─────────────────────── connection heartbeat / single-device claim ─────────
#
# Lets the web dashboard show a live "app is connected" indicator, and makes
# connecting from a second computer automatically supersede the first one —
# without needing a real backend. Each employee gets their own individual
# delcargo_store row (key: tracker_heartbeat_<slug>), matching db.ts's
# heartbeatKeyFor() on the web side. Whichever device most recently WROTE
# its deviceId into this row is the "claimed" device; every other device
# that later notices a mismatch treats itself as superseded and stops.

def heartbeat_key_for(email):
    return "tracker_heartbeat_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def get_device_label():
    try:
        return platform.node() or "Unknown device"
    except Exception:
        return "Unknown device"


def tray_location_hint():
    """OS-specific instructions for finding the app again after closing the
    window — this is the #1 "I closed it, how do I get it back" question."""
    system = platform.system()
    if system == "Windows":
        return "Look for its icon in the system tray near the clock (bottom-right) — click the ^ arrow there if it's hidden — and click it to reopen."
    if system == "Darwin":
        return "Look for its icon in the menu bar (top-right of the screen) and click it to reopen."
    return "Look for its icon in your system tray and click it to reopen."


def get_heartbeat(base_url, _unused_key, employee_email):
    key = heartbeat_key_for(employee_email)
    _, value = pb_get_kv(base_url, key)
    return value


def upsert_heartbeat(base_url, _unused_key, employee_email, device_id, device_label, connected_at=None):
    """Claims (or refreshes) this device's heartbeat row."""
    key = heartbeat_key_for(employee_email)
    now = datetime.now(timezone.utc).isoformat()
    value = {
        "employeeEmail": employee_email,
        "deviceId": device_id,
        "deviceLabel": device_label,
        "connectedAt": connected_at or now,
        "lastSeenAt": now,
        # Included so the web dashboard can show an "update available" prompt
        # when the employee's installed build is older than TRACKER_MIN_VERSION
        # (see trackerSetup.ts / employee/tracker/page.tsx).
        "agentVersion": APP_VERSION,
    }
    pb_set_kv(base_url, key, value)


def clear_heartbeat(base_url, employee_email):
    """Removes this employee's heartbeat row entirely (rather than just
    letting it go stale) when the app quits. Without this, the web
    dashboard's "is the tracker connected" checks — including the Start
    Shift gate on the Employee dashboard (see isHeartbeatLive/hrData.ts) —
    would keep reporting the agent as connected for up to
    TRACKER_HEARTBEAT_STALE_MS (3 minutes) after it was actually closed,
    since nothing had told the server it went away."""
    key = heartbeat_key_for(employee_email)
    record_id, _ = pb_get_kv(base_url, key)
    if not record_id:
        return
    url = f"{base_url}/api/collections/{PB_COLLECTION}/records/{record_id}"
    resp = requests.delete(url, timeout=15)
    resp.raise_for_status()


# ── 5-Signal Tracker Reliability System ──────────────────────────────────────
# KV key helpers — slug pattern matches _slugify() in hrData.ts
# (email lowercased, non-alphanumeric chars replaced with '_').

def quit_intent_key_for(email):
    """Signal 2 key: written by tracker on deliberate quit, read by portal."""
    return "tracker_quit_intent_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def ping_key_for(email):
    """Signal 3 key: written by portal before Start Shift, read by tracker."""
    return "tracker_ping_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def pong_key_for(email):
    """Signal 4 key: written by tracker in response to a ping, read by portal."""
    return "tracker_pong_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def stop_cmd_key_for(email):
    """Signal 5 key: written by portal on End Shift, read by tracker agent."""
    return "tracker_stop_cmd_" + re.sub(r"[^a-z0-9]", "_", (email or "").lower())


def write_quit_intent(base_url, employee_email):
    """Signal 2: Writes an explicit 'I am deliberately quitting' signal to
    PocketBase. The web portal checks this key to distinguish a deliberate
    quit (clock out immediately) from a server blip (wait grace period).
    Retried up to 3 times with 3s spacing because the server may be slow
    or timing out right at the moment the employee quits the app."""
    key = quit_intent_key_for(employee_email)
    payload = {
        "employeeEmail": employee_email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    for attempt in range(3):
        try:
            pb_set_kv(base_url, key, payload)
            return True
        except Exception as e:
            if attempt < 2:
                print(f"[info] write_quit_intent attempt {attempt + 1} failed, retrying: {e}")
                time.sleep(3)
            else:
                print(f"[warn] write_quit_intent failed after 3 attempts: {e}")
    return False


def write_pong(base_url, employee_email, request_id):
    """Signal 4: Writes the pong response to a portal ping.
    Called when the realtime SSE loop detects a ping key in hr_delcargo_store.
    The requestId from the ping is echoed back so the portal can validate it."""
    key = pong_key_for(employee_email)
    payload = {
        "employeeEmail": employee_email,
        "requestId": request_id,
        "respondedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        pb_set_kv(base_url, key, payload)
    except Exception as e:
        print(f"[warn] write_pong failed: {e}")


def clear_stop_cmd(base_url, employee_email):
    """Signal 5 cleanup: Deletes the stop command key after the tracker has
    acted on it, so it does not re-trigger on the next poll cycle."""
    key = stop_cmd_key_for(employee_email)
    try:
        record_id, _ = pb_get_kv(base_url, key)
        if record_id:
            url = f"{base_url}/api/collections/{PB_COLLECTION}/records/{record_id}"
            requests.delete(url, timeout=10)
    except Exception as e:
        print(f"[warn] clear_stop_cmd failed: {e}")

# ─────────────────────────────────────────────────────────────────────────────

def capture_and_encode():
    """Captures a screenshot, resizes/compresses it, and returns raw WebP
    bytes plus its final width/height (no base64 — uploaded as a real file,
    see upload_screenshot). WebP at this quality/method settings is
    noticeably smaller than JPEG at a visually equivalent quality — cuts
    storage/bandwidth per screenshot without a visible quality loss."""
    img = pyautogui.screenshot()
    w, h = img.size
    if w > MAX_WIDTH:
        new_h = int(h * (MAX_WIDTH / w))
        img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)
        w, h = MAX_WIDTH, new_h
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue(), w, h


def upload_screenshot(base_url, employee_email, webp_bytes, width, height, device_id=None, device_label=None, agent_token=None):
    """Uploads a screenshot as a real file into the hr_screenshots collection
    (multipart/form-data) — replaces the old approach of embedding a base64
    data URL inside a JSON row in hr_delcargo_store. See
    migration_data/create_screenshots_collection.py for the collection
    schema (mimeTypes there must include image/webp)."""
    timestamp = datetime.now(timezone.utc).isoformat()
    filename = f"scr_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.webp"
    url = f"{base_url}/api/collections/hr_screenshots/records"
    data = {
        "employee_email": employee_email or "",
        "captured_at": timestamp,
        "width": str(width),
        "height": str(height),
    }
    if device_id:
        data["device_id"] = device_id
    if device_label:
        data["device_label"] = device_label
    if agent_token:
        data["agent_token"] = agent_token
    files = {"image": (filename, webp_bytes, "image/webp")}
    resp = requests.post(url, data=data, files=files, timeout=30)
    resp.raise_for_status()
    return timestamp


def upload_inactivity(base_url, employee_email, start_dt, end_dt, device_id=None, device_label=None, agent_token=None):
    """Uploads one completed mouse-inactivity interval (>= 3 minutes with no
    cursor movement) into the hr_inactivity_logs collection — see
    migration_data/create_inactivity_logs_collection.py for the schema."""
    duration_seconds = int((end_dt - start_dt).total_seconds())
    url = f"{base_url}/api/collections/hr_inactivity_logs/records"
    data = {
        "employee_email": employee_email or "",
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "duration_seconds": str(duration_seconds),
    }
    if device_id:
        data["device_id"] = device_id
    if device_label:
        data["device_label"] = device_label
    if agent_token:
        data["agent_token"] = agent_token
    resp = requests.post(url, headers=JSON_HEADERS, data=json.dumps(data), timeout=20)
    resp.raise_for_status()


# ── Real-time inactivity auto-absence ────────────────────────────────────
# See AUTO_ABSENT_INACTIVITY_SECONDS above and _inactivity_loop below for
# where this actually gets triggered. Everything here uses the same
# no-auth/public-rule REST pattern as the rest of this file (see the
# "PocketBase REST helpers" comment above pb_get_kv) — no new auth model
# needed, hr_absence_records_v1 (inside hr_delcargo_store) and
# hr_notifications both already have public createRule = "".

def _get_ny_date_string():
    """Calendar date (YYYY-MM-DD) in America/New_York — matches
    getNYDateString() in src/lib/timezone.ts, so a record created here lands
    on the exact same date the web app would compute. Requires the `tzdata`
    package on Windows (Windows has no system IANA timezone database) — see
    requirements.txt. Falls back to a fixed UTC-5 approximation if zoneinfo/
    tzdata isn't available yet (e.g. an employee hasn't updated the agent),
    which is correct except for the ~1 hour around a DST transition."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
    except Exception:
        return (datetime.now(timezone.utc) - timedelta(hours=5)).strftime("%Y-%m-%d")


def _fetch_profile_for_deduction(base_url, employee_email):
    """Best-effort fetch of full_name + base_salary so the deduction amount
    shown to the employee/HR matches what computePayrollView would compute
    server-side (2 days' pay at base_salary/22/day). Returns (full_name, 0)
    if the fetch fails or the field isn't present with this agent's public
    read access — a 0 base salary means create_inactivity_absence_record
    still records the absence itself (with reason + date), just with
    deductionAmount 0 rather than guessing wrong; HR can correct it on the
    Absent Details / Payroll pages if this ever happens."""
    try:
        url = f"{base_url}/api/collections/hr_profiles/records"
        params = {"filter": f'(email="{employee_email}")', "perPage": 1}
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return employee_email, 0
        row = items[0]
        return (row.get("full_name") or employee_email), float(row.get("base_salary") or 0)
    except Exception as e:
        print(f"[warn] _fetch_profile_for_deduction failed: {e}")
        return employee_email, 0


def create_inactivity_absence_record(base_url, employee_email, employee_name, inactivity_minutes, deduction_amount):
    """Directly creates an AbsenceRecord (see AbsenceRecord/runAbsenceCheck in
    src/lib/hrData.ts) for a real-time inactivity-triggered absence. This
    mirrors what runAbsenceCheck() would eventually create server-side from
    a completed hr_inactivity_logs row, but fires immediately from here —
    only the agent can observe "still idle right now"; hr_inactivity_logs
    only gets a completed interval once the mouse moves again, which would
    be too late for a live stop. Same record `id` shape
    (`${email}_${date}`) as the web-side system, so this is naturally
    idempotent (e.g. if the agent restarts mid-idle-stretch, it won't create
    a duplicate for a date already recorded) and shows up identically on the
    Absent Details pages and folds into payroll the same way regardless of
    which side created it."""
    date_str = _get_ny_date_string()
    record_id = f"{employee_email.lower()}_{date_str}"
    try:
        _, existing = pb_get_kv(base_url, "hr_absence_records_v1")
        records = existing if isinstance(existing, list) else []
    except Exception:
        records = []
    if any((r or {}).get("id") == record_id for r in records):
        return False  # already recorded for today — don't duplicate
    records.append({
        "id": record_id,
        "employeeEmail": employee_email,
        "employeeName": employee_name or employee_email,
        "date": date_str,
        "reason": "inactivity",
        "inactivityMinutes": inactivity_minutes,
        "deductionAmount": deduction_amount,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "acknowledged": False,
    })
    pb_set_kv(base_url, "hr_absence_records_v1", records)
    return True


def create_notification(base_url, recipient_email, recipient_role, message, category="leave_task"):
    """Creates an hr_notifications row directly via the same public REST
    pattern as everything else in this file — bypasses hrActions.
    addNotification in the web app entirely, but PocketBase's
    push_notifications.pb.js hook fires on record creation regardless of
    which client created it, so OneSignal pushes still go out normally."""
    try:
        url = f"{base_url}/api/collections/hr_notifications/records"
        payload = {
            "recipient_email": recipient_email,
            "recipient_role": recipient_role,
            "message": message,
            "read": False,
            "category": category,
            "push_title": "",
            "sender_email": "",
            "link": "",
            "timestamp": datetime.now(timezone.utc).strftime("%I:%M %p"),
        }
        resp = requests.post(url, headers=JSON_HEADERS, data=json.dumps(payload), timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"[warn] create_notification failed: {e}")


def handle_inactivity_auto_absence(base_url, employee_email, elapsed_seconds):
    """Called exactly once per idle stretch, the moment continuous mouse
    inactivity crosses AUTO_ABSENT_INACTIVITY_SECONDS *while still idle*
    (see the guard in _inactivity_loop below that prevents this firing more
    than once per stretch). Ends the shift immediately, records why (both
    server-side for HR/Admin/the Absent Details pages, and via the existing
    shift-stop-signal the web dashboard already polls every 10s), and
    returns the (employee_name, inactivity_minutes, deduction_amount) tuple
    so the caller can show a local popup with the same numbers."""
    inactivity_minutes = round(elapsed_seconds / 60)

    try:
        auto_clock_out(base_url, employee_email)
    except Exception as e:
        print(f"[warn] auto_clock_out (inactivity) failed: {e}")

    full_name, base_salary = _fetch_profile_for_deduction(base_url, employee_email)
    daily_rate = (base_salary / 22) if base_salary else 0
    deduction_amount = round(2 * daily_rate) if daily_rate else 0

    try:
        create_inactivity_absence_record(base_url, employee_email, full_name, inactivity_minutes, deduction_amount)
    except Exception as e:
        print(f"[warn] create_inactivity_absence_record failed: {e}")

    deduction_text = f"${deduction_amount}" if deduction_amount else "a 2-day pay penalty"
    reason_text = (
        f"{full_name} was inactive for over {inactivity_minutes} minutes during their shift and was "
        f"automatically marked absent — {deduction_text} deducted (2 days' pay)."
    )
    try:
        create_notification(base_url, "all", "hr", reason_text)
        create_notification(base_url, "all", "admin", reason_text)
    except Exception as e:
        print(f"[warn] absence notifications failed: {e}")

    try:
        notify_shift_auto_stopped(base_url, employee_email, reason="inactivity_absence")
    except Exception as e:
        print(f"[warn] notify_shift_auto_stopped (inactivity) failed: {e}")

    return full_name, inactivity_minutes, deduction_amount


# ─────────────────────────────── tray icon image ─────────────────────────────

def _app_icon_path():
    """Locates the brand icon next to this script in dev mode, or bundled
    alongside the frozen executable in a packaged build (see the
    --add-data flag in build_windows.bat / build_mac.sh)."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "icon.png")
    return path if os.path.exists(path) else None


_ICON_SOURCE = None  # lazily loaded, cached Pillow Image of icon.png


def build_tray_image(status_mode):
    """Uses the real DelCargo brand mark (icon.png) for the tray icon with a
    status-colored status dot indicator:
      - 'active' (Green): Tracking is active during an ongoing shift
      - 'paused' (Amber): HR enabled tracking, waiting for employee to clock in
      - 'off' / False (Gray): Tracking disabled
    Falls back to a drawn monitor glyph if icon asset isn't present."""
    global _ICON_SOURCE
    size = 64
    icon_path = _app_icon_path()

    # Resolve status mode string
    if isinstance(status_mode, bool):
        mode = "active" if status_mode else "off"
    else:
        mode = str(status_mode or "off").lower()

    # Determine status dot RGBA color
    if mode == "active":
        dot_color = (16, 185, 129, 255)   # emerald green
    elif mode == "paused":
        dot_color = (245, 158, 11, 255)   # amber yellow
    else:
        dot_color = (148, 163, 184, 255)  # slate gray

    if icon_path:
        if _ICON_SOURCE is None:
            _ICON_SOURCE = Image.open(icon_path).convert("RGBA")
        img = _ICON_SOURCE.resize((size, size), Image.LANCZOS).copy()
        if mode == "off":
            gray = Image.new("RGBA", img.size, (100, 116, 139, 255))
            img = Image.blend(img.convert("RGBA"), gray, 0.35)
        d = ImageDraw.Draw(img)
        d.ellipse([42, 2, 62, 22], fill=dot_color, outline=(255, 255, 255, 255), width=2)
        return img

    # Fallback: simple monitor glyph drawn in-memory
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    monitor_color = (234, 88, 12, 255) if mode != "off" else (100, 116, 139, 255)
    d.rounded_rectangle([8, 12, 56, 42], radius=5, outline=monitor_color, width=5)
    d.rectangle([26, 46, 38, 52], fill=monitor_color)
    d.rectangle([18, 52, 46, 56], fill=monitor_color)
    d.ellipse([40, 4, 60, 24], fill=dot_color, outline=(255, 255, 255, 255), width=1)
    return img


# ─────────────────────────────── auto-update ─────────────────────────────────

def _parse_version(v: str):
    """"1.4" -> (1, 4); "2" -> (2,); used for both APP_VERSION and whatever
    tag GitHub reports, so "1.10" correctly compares as newer than "1.9"
    (a plain string/float compare would get that backwards)."""
    return tuple(int(part) for part in v.strip().split("."))


def check_for_update():
    """Pings GitHub's "latest release" API and returns the new version
    string (e.g. "1.5") if one is available, or None if already up to
    date, or if the check failed/couldn't be interpreted for any reason
    (offline, GitHub rate-limited or down, tag doesn't match the expected
    "tracker-agent-vX.Y" format, etc.). Must never raise — a broken update
    check should never be able to stop the app from starting normally."""
    try:
        resp = requests.get(
            GITHUB_LATEST_RELEASE_API,
            timeout=6,
            headers={"Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
        tag = resp.json().get("tag_name", "") or ""
        m = re.match(r"tracker-agent-v([\d.]+)$", tag.strip())
        if not m:
            return None
        latest_str = m.group(1)
        return latest_str if _parse_version(latest_str) > _parse_version(APP_VERSION) else None
    except Exception as e:
        print(f"[info] Update check skipped: {e}")
        return None


def _download_with_progress(url, dest_path, on_progress=None):
    """Streams url to dest_path, calling on_progress(downloaded_bytes,
    total_bytes_or_None) after each chunk so the caller can drive a
    progress bar. total is None when the server doesn't send a
    Content-Length header — callers should fall back to an indeterminate
    display in that case."""
    resp = requests.get(url, stream=True, timeout=30)
    resp.raise_for_status()
    total = resp.headers.get("Content-Length")
    total = int(total) if total else None
    downloaded = 0
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=256 * 1024):
            if not chunk:
                continue
            f.write(chunk)
            downloaded += len(chunk)
            if on_progress:
                on_progress(downloaded, total)


def _perform_update(root, latest_version):
    """Downloads and (on Windows) launches the new installer, quitting this
    process afterward so the installer can freely overwrite the running
    app's files. macOS gets a safer, more manual hand-off: auto-replacing a
    running unsigned .app bundle from within itself is fragile (Gatekeeper
    quarantine flags, the OS refusing to overwrite an open executable, a
    half-replaced bundle if anything goes wrong), so instead this downloads
    the zip, reveals it in Finder, and tells the person exactly what to do."""
    system = platform.system()
    if system not in ("Windows", "Darwin"):
        # No packaged build for this platform (e.g. Linux) — just point them
        # at the releases page instead of trying to guess a download.
        webbrowser.open(GITHUB_RELEASES_PAGE)
        return

    url = GITHUB_WINDOWS_INSTALLER_URL if system == "Windows" else GITHUB_MAC_ZIP_URL
    filename = "DelCargo_Tracker_Setup.exe" if system == "Windows" else "DelCargo-Tracker-Mac.zip"
    # macOS installers/downloads conventionally land in ~/Downloads, where
    # someone would expect to find one; Windows just needs any scratch
    # space since the installer is launched programmatically, not found by
    # hand — the system temp dir is the right place for that.
    dest_dir = os.path.join(os.path.expanduser("~"), "Downloads") if system == "Darwin" else tempfile.gettempdir()
    if not os.path.isdir(dest_dir):
        dest_dir = tempfile.gettempdir()
    dest_path = os.path.join(dest_dir, filename)

    progress_win = tk.Toplevel(root)
    progress_win.title(APP_NAME)
    progress_win.geometry("340x130")
    progress_win.resizable(False, False)
    progress_win.configure(bg=BG)
    progress_win.transient(root)
    progress_win.grab_set()
    tk.Label(progress_win, text=f"Downloading update (v{latest_version})…",
             bg=BG, fg=INK, font=(FONT, 10, "bold")).pack(pady=(22, 10))
    pbar = ttk.Progressbar(progress_win, length=280, mode="determinate")
    pbar.pack()
    status_var = tk.StringVar(value="Starting download…")
    tk.Label(progress_win, textvariable=status_var, bg=BG, fg=MUTED, font=(FONT, 9)).pack(pady=(8, 0))
    progress_win.update()

    def on_progress(downloaded, total):
        if total:
            pbar["value"] = (downloaded / total) * 100
            status_var.set(f"{downloaded // 1024} KB / {total // 1024} KB")
        else:
            # No Content-Length from the server — show something moving
            # rather than a bar stuck at 0 the whole time.
            pbar["mode"] = "indeterminate"
            pbar.step(5)
            status_var.set(f"{downloaded // 1024} KB downloaded…")
        progress_win.update_idletasks()

    try:
        _download_with_progress(url, dest_path, on_progress)
    except Exception as e:
        progress_win.destroy()
        messagebox.showerror(
            APP_NAME,
            f"Update download failed: {_short_error(e)}\n\n"
            "You can download it manually from the GitHub Releases page instead.",
            parent=root,
        )
        webbrowser.open(GITHUB_RELEASES_PAGE)
        return

    progress_win.destroy()

    if system == "Windows":
        messagebox.showinfo(
            APP_NAME,
            "Update downloaded. The installer will now open — finish the setup "
            "wizard, and this app will close automatically so it can be replaced.",
            parent=root,
        )
        try:
            subprocess.Popen([dest_path], close_fds=True)
        except Exception as e:
            messagebox.showerror(
                APP_NAME,
                f"Couldn't launch the installer automatically: {_short_error(e)}\n\n"
                f"Open it yourself from:\n{dest_path}",
                parent=root,
            )
            return
        # Let the installer take over — it needs this process to fully exit
        # before it can overwrite the currently-running executable.
        sys.exit(0)
    else:  # Darwin
        try:
            subprocess.run(["open", "-R", dest_path], check=False)
        except Exception:
            pass  # Non-critical — the instructions below still name the exact path.
        messagebox.showinfo(
            APP_NAME,
            f"Update downloaded to:\n{dest_path}\n\n"
            "Quit this app, unzip it, then drag the new \"DelCargo Tracker\" app "
            "into your Applications folder, replacing the old one.",
            parent=root,
        )


def _check_and_prompt_update():
    """Runs before anything else in main() — see the module-level flow at
    the bottom of this file. Uses its own short-lived, hidden root so it
    doesn't depend on (or delay) the real TrackerApp/dashboard window."""
    latest = check_for_update()
    if latest is None:
        return
    root = tk.Tk()
    root.withdraw()
    proceed = messagebox.askyesno(
        APP_NAME,
        f"A new version of {APP_NAME} is available — you have v{APP_VERSION}, "
        f"v{latest} is out.\n\nUpdate now?",
        parent=root,
    )
    if proceed:
        _perform_update(root, latest)
    root.destroy()


# ───────────────────────────────── main app ──────────────────────────────────

class TrackerApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("440x740")
        # Height is resizable (width isn't, to preserve the designed layout)
        # as a safety net alongside _short_error() above: if the status
        # card's content ever ends up taller than the window for any reason
        # not covered by that truncation, the window itself can grow instead
        # of silently clipping the action buttons below the visible,
        # unpressable area — which is exactly what happened with a fixed,
        # non-resizable window before this.
        self.root.resizable(True, True)
        self.root.minsize(380, 520)
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self._set_window_icon()

        # Canvas-based vertical scrolling container for dynamic responsiveness across screen resolutions
        self.main_canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0, bd=0)
        self.scrollbar = ttk.Scrollbar(self.root, orient="vertical", command=self.main_canvas.yview)
        self.scroll_content = tk.Frame(self.main_canvas, bg=BG)

        self.scroll_win = self.main_canvas.create_window((0, 0), window=self.scroll_content, anchor="nw")
        self.main_canvas.configure(yscrollcommand=self.scrollbar.set)

        self.scroll_content.bind("<Configure>", self._on_scroll_configure)
        self.main_canvas.bind("<Configure>", self._on_canvas_resize)
        
        # Mousewheel scroll binding for macOS & Windows
        self.root.bind_all("<MouseWheel>", self._on_mousewheel)
        self.root.bind_all("<Button-4>", self._on_mousewheel)
        self.root.bind_all("<Button-5>", self._on_mousewheel)

        self.main_canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        self.cfg = load_config()
        self.state_lock = threading.Lock()
        self.state = {
            "connected": self.cfg is not None,
            "enabled": False,
            "employee_email": (self.cfg or {}).get("employee_email", ""),
            "interval": None,
            "last_capture": None,
            "last_error": None,
            "connection_status": "unknown",  # "connected" | "disconnected" | "superseded"
            "superseded_device": None,
            "heartbeat_error": None,
        }
        self.stop_event = threading.Event()
        self.worker = None
        self.inactivity_worker = None
        self.realtime_worker = None
        self.heartbeat_worker = None
        # Set by the realtime subscription (see _realtime_loop) the instant
        # this employee's hr_timesheets row changes on the web dashboard —
        # lets _worker_loop's between-capture sleep wake up and re-check
        # shift/tracking status immediately instead of waiting out the rest
        # of SETTINGS_POLL_SECONDS. Purely a latency optimization: if the
        # realtime channel never connects (e.g. blocked by a firewall), the
        # regular poll in _worker_loop still catches every change on its own
        # within SETTINGS_POLL_SECONDS, same as before this existed.
        self.wake_event = threading.Event()
        self.tray_icon = None
        # Set when we should (re)claim the device slot on the worker loop's
        # next pass: a brand new connect, an upgrade from an older install
        # that never had a device_id, or a manual "Reconnect" click.
        self.force_claim_next = False

        if self.cfg and not self.cfg.get("device_id"):
            self.cfg["device_id"] = uuid.uuid4().hex
            self.cfg["device_label"] = get_device_label()
            save_config(self.cfg)
            self.force_claim_next = True

        self._build_style()
        if self.cfg:
            self._build_dashboard()
            self._start_worker()
        else:
            self._build_setup_screen()

        if pystray:
            self._start_tray()

        self.root.after(500, self._tick)

    def _on_scroll_configure(self, _evt=None):
        self.main_canvas.configure(scrollregion=self.main_canvas.bbox("all"))

    def _on_canvas_resize(self, evt):
        self.main_canvas.itemconfig(self.scroll_win, width=evt.width)

    def _on_mousewheel(self, evt):
        if platform.system() == "Darwin":
            self.main_canvas.yview_scroll(int(-1 * (evt.delta)), "units")
        else:
            self.main_canvas.yview_scroll(int(-1 * (evt.delta / 120)), "units")

    # ---------- window icon ----------

    def _set_window_icon(self):
        """Sets the title-bar/taskbar icon from icon.png (see
        generate_icons.py). Uses iconphoto (cross-platform, works from a
        PNG) rather than iconbitmap, which on Windows only accepts .ico.
        No-ops quietly if the icon hasn't been generated yet."""
        icon_path = _app_icon_path()
        if not icon_path:
            return
        try:
            self._icon_image = tk.PhotoImage(file=icon_path)  # kept on self: must outlive this call
            self.root.iconphoto(True, self._icon_image)
        except Exception:
            pass  # Non-critical — app still runs fine without a window icon.

    # ---------- styling ----------

    def _build_style(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Accent.TButton", background=ACCENT, foreground="white", font=(FONT, 10, "bold"), padding=8)
        style.map("Accent.TButton", background=[("active", ACCENT_HOVER)])
        style.configure("Muted.TButton", padding=8, font=(FONT, 10))
        style.configure("TFrame", background=BG)
        style.configure("TLabel", background=BG, foreground=INK, font=(FONT, 10))
        style.configure("Title.TLabel", background=BG, foreground=INK, font=(FONT, 16, "bold"))
        style.configure("Muted.TLabel", background=BG, foreground=MUTED, font=(FONT, 9))
        style.configure("TCheckbutton", background=BG, foreground=INK, font=(FONT, 9, "bold"))
        style.configure("Card.TCheckbutton", background=CARD_BG, foreground=INK, font=(FONT, 9, "bold"))
        style.map("Card.TCheckbutton", background=[("active", CARD_BG)])
        # ttk.Checkbutton doesn't accept -wraplength as a constructor kwarg
        # (unlike tk.Label) — it has to be set on the style instead, or Tcl
        # raises "unknown option -wraplength". Used for the consent
        # checkbox's longer text on the setup screen.
        style.configure("Wrap.Card.TCheckbutton", background=CARD_BG, foreground=INK, font=(FONT, 9, "bold"), wraplength=340)
        style.map("Wrap.Card.TCheckbutton", background=[("active", CARD_BG)])

    def _brand_header(self, parent, subtitle=None):
        """Wordmark header matching the web dashboard's "DelCargo HR" mark
        (Sidebar.tsx: bold, orange-600, no icon) — kept text-only here too
        so the desktop app and web app read as the same brand, not a
        different logo bolted on."""
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", anchor="w")
        tk.Label(row, text="DelCargo", font=(FONT, 17, "bold"), bg=BG, fg=INK).pack(side="left")
        tk.Label(row, text=" Tracker", font=(FONT, 17, "bold"), bg=BG, fg=ACCENT).pack(side="left")
        if subtitle:
            tk.Label(parent, text=subtitle, font=(FONT, 9), bg=BG, fg=MUTED,
                     wraplength=340, justify="left").pack(anchor="w", pady=(2, 0))

    # ---------- setup screen ----------

    def _build_setup_screen(self):
        for w in self.scroll_content.winfo_children():
            w.destroy()
        frame = tk.Frame(self.scroll_content, bg=BG, padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        self._brand_header(frame, "Paste the one-time setup code your HR/Admin gave you (Screen Tracking → Setup Agent).")

        setup_card = Card(frame, padding=16)
        setup_card.pack(fill="x", pady=(18, 6))
        card_body = setup_card.inner

        tk.Label(card_body, text="SETUP CODE", font=(FONT, 8, "bold"), bg=CARD_BG, fg=MUTED).pack(anchor="w", pady=(0, 6))
        self.code_var = tk.StringVar()
        entry = tk.Text(card_body, height=5, width=40, wrap="word", font=("Consolas", 9),
                         relief="solid", borderwidth=1, highlightthickness=1,
                         highlightbackground=BORDER, highlightcolor=ACCENT)
        entry.pack(fill="x")
        self.code_entry = entry

        # Auto-detect a plausible setup code already sitting on the clipboard.
        try:
            clip = self.root.clipboard_get()
            decode_setup_code(clip)
            entry.insert("1.0", clip.strip())
        except Exception:
            pass

        # Monitoring consent — must be explicitly checked before Connect will
        # do anything (enforced in _handle_connect, not just visually).
        # Re-shown (and re-required) every time this screen is reached,
        # including "Use a Different Setup Code", so switching accounts on a
        # shared machine can't silently carry over someone else's consent.
        consent_card = Card(frame, padding=14)
        consent_card.pack(fill="x", pady=(0, 6))
        self.consent_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            consent_card.inner,
            text="While tracking is active please Avoid Personal Browsing, Messages or accounts on this device while on shift",
            variable=self.consent_var,
            style="Wrap.Card.TCheckbutton",
        ).pack(anchor="w")

        self.setup_error_var = tk.StringVar()
        tk.Label(frame, textvariable=self.setup_error_var, fg=DANGER, bg=BG,
                 font=(FONT, 9, "bold"), wraplength=380, justify="left").pack(anchor="w", pady=(10, 10))

        PillButton(frame, "Connect", command=self._handle_connect, variant="primary").pack(fill="x", ipady=0, pady=(0, 8))

        # Only shown when getting here via "Use a Different Setup Code" from
        # an already-connected dashboard (not on first-ever launch) — lets
        # someone back out without losing their existing working connection.
        if self.cfg:
            PillButton(frame, "Cancel", command=self._build_dashboard, variant="secondary").pack(fill="x", pady=(0, 8))

        tk.Label(
            frame,
            text="This app only tracks activity while your employer has actively turned tracking on for your account, and only while shown as “Connected — Active” below.",
            font=(FONT, 9), bg=BG, fg=MUTED, wraplength=380, justify="left"
        ).pack(anchor="w", pady=(16, 0))

    def _handle_connect(self):
        if not self.consent_var.get():
            self.setup_error_var.set("Please check the monitoring consent box above before connecting.")
            return

        raw = self.code_entry.get("1.0", "end").strip()
        try:
            url, token = decode_setup_code(raw)
        except Exception:
            self.setup_error_var.set("That doesn't look like a valid setup code. Ask HR/Admin to re-copy it from the Setup Agent screen.")
            return

        self.setup_error_var.set("Checking…")
        self.root.update_idletasks()

        def worker():
            try:
                settings = get_tracking_settings(url, None, token)
            except Exception as e:
                self.root.after(0, lambda: self.setup_error_var.set(f"Couldn't reach the server: {e}"))
                return
            if settings is None:
                self.root.after(0, lambda: self.setup_error_var.set(
                    "This code isn't recognized. Ask HR/Admin to generate a fresh setup code for you."
                ))
                return

            # RBAC safeguard: the email this computer will report screenshots
            # under always comes from the server-side settings row matched
            # by the token — never from anything the user typed.
            resolved_email = settings.get("employeeEmail", "(unknown)")

            def confirm_and_save():
                ok = messagebox.askyesno(
                    APP_NAME,
                    f"This setup code belongs to:\n\n{resolved_email}\n\n"
                    "Is this you? Only continue if this is your own email address — "
                    "do not connect this computer using a coworker's code.",
                )
                if not ok:
                    self.setup_error_var.set("Setup cancelled. Paste your own setup code to continue.")
                    return
                self.cfg = {
                    "url": url, "token": token,
                    "employee_email": resolved_email,
                    "autostart": False,
                    "device_id": uuid.uuid4().hex,
                    "device_label": get_device_label(),
                    "consent_accepted": True,
                    "consent_at": datetime.now(timezone.utc).isoformat(),
                }
                save_config(self.cfg)
                # This is a brand new connection — claim the device slot
                # outright. If some other computer was previously connected
                # for this account, it will notice on its next check-in that
                # it's no longer the claimed device and stop itself.
                self.force_claim_next = True
                self._on_connected()

            self.root.after(0, confirm_and_save)

        threading.Thread(target=worker, daemon=True).start()

    def _on_connected(self):
        self.state["connected"] = True
        self.state["employee_email"] = self.cfg.get("employee_email", "")
        self._build_dashboard()
        self._start_worker()

    # ---------- dashboard screen ----------

    def _build_dashboard(self):
        for w in self.scroll_content.winfo_children():
            w.destroy()
        frame = tk.Frame(self.scroll_content, bg=BG, padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        self._brand_header(frame)
        tk.Label(frame, text=f"Connected as {self.state['employee_email']}", font=(FONT, 9), bg=BG, fg=MUTED).pack(anchor="w", pady=(2, 6))

        conn_row = tk.Frame(frame, bg=BG)
        conn_row.pack(fill="x", pady=(0, 14))
        self.conn_status_var = tk.StringVar(value="Checking connection…")
        tk.Label(conn_row, textvariable=self.conn_status_var, bg=BG, fg=MUTED, font=(FONT, 9, "bold"),
                 anchor="w", justify="left", wraplength=300).pack(side="left", fill="x", expand=True)
        self.reconnect_btn = PillButton(conn_row, "Reconnect", command=self._handle_reconnect,
                                         variant="secondary", width=100, height=28, font_size=8)
        self.reconnect_btn.pack(side="right")

        # Status card — the desktop equivalent of the dashboard's status
        # cards (rounded-2xl white card, bold status line + muted detail).
        status_card = Card(frame, padding=18)
        status_card.pack(fill="x", pady=(0, 16))
        self.status_var = tk.StringVar(value="Checking status…")
        self.status_label = tk.Label(status_card.inner, textvariable=self.status_var, bg=CARD_BG, fg=INK,
                                      font=(FONT, 13, "bold"), anchor="w", justify="left")
        self.status_label.pack(fill="x", anchor="w")
        self.detail_var = tk.StringVar(value="")
        tk.Label(status_card.inner, textvariable=self.detail_var, bg=CARD_BG, fg=MUTED,
                 font=(FONT, 9), justify="left", anchor="w", wraplength=320).pack(fill="x", anchor="w", pady=(6, 0))

        PillButton(frame, "Minimize to Tray", command=self.hide_window, variant="secondary").pack(fill="x", pady=(0, 10))

        settings_card = Card(frame, padding=14)
        settings_card.pack(fill="x", pady=(0, 14))
        self.autostart_var = tk.BooleanVar(value=bool(self.cfg.get("autostart", False)))
        ttk.Checkbutton(settings_card.inner, text="Start automatically when I log in",
                         variable=self.autostart_var, command=self._toggle_autostart,
                         style="Card.TCheckbutton").pack(anchor="w", pady=(0, 8))
        self.close_to_tray_var = tk.BooleanVar(value=bool(self.cfg.get("close_to_tray", True)))
        ttk.Checkbutton(settings_card.inner, text="Closing the window (✕) minimizes to tray instead of quitting",
                         variable=self.close_to_tray_var, command=self._toggle_close_to_tray,
                         style="Card.TCheckbutton", state=("normal" if pystray else "disabled")).pack(anchor="w")

        tk.Label(
            frame,
            text=(tray_location_hint() if pystray and self.close_to_tray_var.get()
                  else "Closing this window (✕) fully quits the app." if not (pystray and self.close_to_tray_var.get())
                  else ""),
            font=(FONT, 9), bg=BG, fg=MUTED, wraplength=380, justify="left"
        ).pack(anchor="w", pady=(0, 16))

        PillButton(frame, "Use a Different Setup Code", command=self._build_setup_screen, variant="secondary").pack(fill="x", pady=(0, 8))
        PillButton(frame, "Disconnect this computer", command=self._handle_disconnect, variant="danger").pack(fill="x")

        tk.Label(
            frame,
            text="\"Use a Different Setup Code\" keeps the app open and just swaps which account it reports to — handy for reconnecting or switching accounts. \"Disconnect\" fully removes setup and stops the app until reconnected.",
            font=(FONT, 9), bg=BG, fg=MUTED, wraplength=380, justify="left"
        ).pack(anchor="w", pady=(16, 0))

    def _toggle_autostart(self):
        enabled = self.autostart_var.get()
        self.cfg["autostart"] = enabled
        save_config(self.cfg)
        threading.Thread(target=set_autostart, args=(enabled,), daemon=True).start()

    def _toggle_close_to_tray(self):
        # Explicit user preference — previously the app always hid to tray
        # on close whenever a tray icon was available, with no way to opt
        # out short of "Quit" from the tray menu. Some users would rather
        # ✕ just quit the app outright.
        self.cfg["close_to_tray"] = self.close_to_tray_var.get()
        save_config(self.cfg)

    def _auto_disconnect_superseded(self):
        superseded_device = self.state.get("superseded_device", "another device")
        self.stop_event.set()
        clear_config()
        if self.cfg and self.cfg.get("autostart"):
            set_autostart(False)
        self.cfg = None
        self.state = {
            "connected": False, "enabled": False, "employee_email": "", "interval": None,
            "last_capture": None, "last_error": None, "connection_status": "unknown",
            "superseded_device": None, "heartbeat_error": None,
        }
        self.force_claim_next = False
        self.stop_event = threading.Event()
        self._build_setup_screen()
        messagebox.showinfo(
            APP_NAME, 
            f"Your profile was logged into {superseded_device}. This tracker has been automatically disconnected."
        )

    def _handle_disconnect(self):
        if not messagebox.askyesno(APP_NAME, "Disconnect this computer from screen tracking? You'll need a new setup code from HR/Admin to reconnect."):
            return
        self.stop_event.set()
        # Same reasoning as quit_app(): tell the server this device is gone
        # right now rather than leaving the web dashboard's "connected"
        # indicator (and the Start Shift gate) stale for up to
        # TRACKER_HEARTBEAT_STALE_MS after disconnecting.
        if self.cfg:
            try:
                clear_heartbeat(self.cfg["url"], self.cfg.get("employee_email"))
            except Exception as e:
                print(f"[warn] Clearing heartbeat on disconnect failed: {e}")
        clear_config()
        if self.cfg.get("autostart"):
            set_autostart(False)
        self.cfg = None
        self.state = {
            "connected": False, "enabled": False, "employee_email": "", "interval": None,
            "last_capture": None, "last_error": None, "connection_status": "unknown",
            "superseded_device": None, "heartbeat_error": None,
        }
        self.force_claim_next = False
        self.stop_event = threading.Event()
        self._build_setup_screen()

    # ---------- background worker ----------

    def _start_worker(self):
        # If a previous worker thread is still running (e.g. this is a
        # "change setup code" reconnect, not the first-ever connect), stop
        # it first. Each thread is handed its own cfg/stop_event snapshot
        # (see _worker_loop) rather than reading self.cfg live, specifically
        # so an old thread can never silently keep running against stale
        # credentials after the user connects with a different code.
        if self.worker and self.worker.is_alive():
            self.stop_event.set()
            self.worker.join(timeout=2)
        if self.inactivity_worker and self.inactivity_worker.is_alive():
            self.inactivity_worker.join(timeout=2)
        if self.realtime_worker and self.realtime_worker.is_alive():
            self.realtime_worker.join(timeout=2)
        if self.heartbeat_worker and self.heartbeat_worker.is_alive():
            self.heartbeat_worker.join(timeout=2)
        self.stop_event = threading.Event()
        self.wake_event.clear()
        self.worker = threading.Thread(target=self._worker_loop, args=(self.cfg, self.stop_event), daemon=True)
        self.worker.start()
        self.inactivity_worker = threading.Thread(target=self._inactivity_loop, args=(self.cfg, self.stop_event), daemon=True)
        self.inactivity_worker.start()
        self.realtime_worker = threading.Thread(target=self._realtime_loop, args=(self.cfg, self.stop_event), daemon=True)
        self.realtime_worker.start()
        self.heartbeat_worker = threading.Thread(target=self._heartbeat_loop, args=(self.cfg, self.stop_event), daemon=True)
        self.heartbeat_worker.start()

    def _checkin(self, cfg):
        """Claims (first run / reconnect) or refreshes this device's
        heartbeat row. Returns False if another device has since claimed
        this account (this device should stand down)."""
        force = self.force_claim_next
        self.force_claim_next = False
        try:
            if not force:
                # These PocketBase collections are open/public (no anon key
                # needed) — the middle arg is intentionally None; see
                # _unused_key params on get_heartbeat/upsert_heartbeat/etc.
                hb = get_heartbeat(cfg["url"], None, cfg["employee_email"])
                if hb and hb.get("deviceId") and hb.get("deviceId") != cfg.get("device_id"):
                    # The heartbeat belongs to another device. Check if that device is actually alive.
                    last_seen_iso = hb.get("lastSeenAt")
                    is_stale = False
                    if last_seen_iso:
                        try:
                            last_seen_dt = datetime.fromisoformat(last_seen_iso.replace("Z", "+00:00"))
                            if (datetime.now(timezone.utc) - last_seen_dt).total_seconds() > 180:
                                is_stale = True
                        except Exception:
                            pass
                    
                    if not is_stale:
                        with self.state_lock:
                            self.state["connection_status"] = "superseded"
                            self.state["superseded_device"] = hb.get("deviceLabel") or "another computer"
                            self.state["heartbeat_error"] = None
                        return False
                preserved_connected_at = (hb or {}).get("connectedAt")
            else:
                preserved_connected_at = None

            upsert_heartbeat(
                cfg["url"], None, cfg["employee_email"],
                cfg.get("device_id"), cfg.get("device_label", ""),
                connected_at=preserved_connected_at,
            )
            with self.state_lock:
                self.state["connection_status"] = "connected"
                self.state["superseded_device"] = None
                self.state["heartbeat_error"] = None
            return True
        except Exception as e:
            with self.state_lock:
                self.state["connection_status"] = "disconnected"
                self.state["heartbeat_error"] = _short_error(f"Couldn't reach the server: {e}")
            # A network blip shouldn't permanently stand this device down —
            # keep trying tracking settings/capture as before; only an
            # explicit supersede (a different deviceId) stops the agent.
            return True

    def _handle_reconnect(self):
        if not self.cfg:
            return
        self.force_claim_next = True
        with self.state_lock:
            self.state["heartbeat_error"] = None
        if not (self.worker and self.worker.is_alive()):
            self._start_worker()

        def worker():
            try:
                upsert_heartbeat(
                    self.cfg["url"], None, self.cfg["employee_email"],
                    self.cfg.get("device_id"), self.cfg.get("device_label", ""),
                )
                with self.state_lock:
                    self.state["connection_status"] = "connected"
                    self.state["superseded_device"] = None
                    self.state["heartbeat_error"] = None
                self.force_claim_next = False
            except Exception as e:
                with self.state_lock:
                    self.state["heartbeat_error"] = _short_error(f"Reconnect failed: {e}")
                    self.state["connection_status"] = "disconnected"

        threading.Thread(target=worker, daemon=True).start()

    def _handle_ping(self, ping_data):
        """Signal 3/4 handler: called from _realtime_loop when a
        tracker_ping_<email> key is created/updated in hr_delcargo_store.
        Validates the ping is recent and intended for this employee, then
        writes a pong (Signal 4) so the portal can confirm the tracker is live
        before starting a shift."""
        if not self.cfg:
            return
        employee_email = self.cfg.get("employee_email", "").strip().lower()
        ping_email = (ping_data.get("employeeEmail") or "").strip().lower()
        if ping_email != employee_email:
            return  # not for this employee

        request_id = ping_data.get("requestId")
        requested_at_iso = ping_data.get("requestedAt", "")
        if not request_id:
            return

        # Ignore stale pings (> 30 seconds old) to avoid responding to
        # a leftover ping from a previous failed start-shift attempt.
        try:
            requested_at = datetime.fromisoformat(requested_at_iso.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - requested_at).total_seconds()
            if age_seconds > 30:
                print(f"[info] Ignoring stale ping (age={age_seconds:.0f}s)")
                return
        except Exception:
            return

        # Write pong in a background thread so the SSE loop isn't blocked
        threading.Thread(
            target=write_pong,
            args=(self.cfg["url"], employee_email, request_id),
            daemon=True,
        ).start()

    def _handle_stop_cmd(self, stop_cmd_data):
        """Signal 5 handler: called from _realtime_loop when a
        tracker_stop_cmd_<email> key is created/updated in hr_delcargo_store.
        Validates the command is recent and intended for this employee, then
        immediately wakes the worker loop so it re-checks shift status and
        stops screenshot capturing without waiting for the next poll interval."""
        if not self.cfg:
            return
        employee_email = self.cfg.get("employee_email", "").strip().lower()
        cmd_email = (stop_cmd_data.get("employeeEmail") or "").strip().lower()
        if cmd_email != employee_email:
            return  # not for this employee

        issued_at_iso = stop_cmd_data.get("issuedAt", "")
        # Ignore stale stop commands (> 60 seconds old)
        try:
            issued_at = datetime.fromisoformat(issued_at_iso.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - issued_at).total_seconds()
            if age_seconds > 60:
                print(f"[info] Ignoring stale stop command (age={age_seconds:.0f}s)")
                return
        except Exception:
            return

        print("[info] Stop command received from portal — waking worker loop to stop capturing")
        # Wake the worker loop immediately so it calls check_active_shift()
        # and notices the shift has ended, stopping captures right away.
        self.wake_event.set()
        # Clean up the stop command key in background (best-effort)
        threading.Thread(
            target=clear_stop_cmd,
            args=(self.cfg["url"], employee_email),
            daemon=True,
        ).start()

    def _heartbeat_loop(self, cfg, stop_event):
        while not stop_event.is_set():
            # Retry heartbeat up to 3 times on network/timeout error.
            # PocketBase screenshot uploads can block the server for 30s+,
            # making a single heartbeat attempt time out. Retrying with a
            # short pause keeps lastSeenAt fresh even under server load.
            for attempt in range(3):
                try:
                    self._checkin(cfg)
                    break  # success — no more retries needed
                except Exception as e:
                    if attempt < 2:
                        print(f"[info] Heartbeat attempt {attempt + 1} failed, retrying in 5s: {e}")
                        stop_event.wait(5.0)
                    else:
                        print(f"[warn] Heartbeat failed after 3 attempts: {e}")
            stop_event.wait(60.0)

    def _worker_loop(self, cfg, stop_event):
        # cfg and stop_event are captured as explicit arguments (a snapshot
        # at the moment this thread was started) rather than read live off
        # self — if the user later connects with a different setup code,
        # _start_worker() stops this exact stop_event and spawns a brand
        # new thread with the new cfg, so there's never any ambiguity about
        # which credentials an old, lingering thread might still be using.
        while not stop_event.is_set():
            with self.state_lock:
                superseded = (self.state.get("connection_status") == "superseded")
            
            if superseded:
                # Superseded by another device — automatically disconnect
                self.root.after(0, self._auto_disconnect_superseded)
                break

            try:
                settings = get_tracking_settings(cfg["url"], None, cfg["token"])
            except Exception as e:
                with self.state_lock:
                    self.state["last_error"] = _short_error(e)
                stop_event.wait(SETTINGS_POLL_SECONDS)
                continue

            if settings is None:
                with self.state_lock:
                    self.state["enabled"] = False
                    self.state["last_error"] = "Setup token not recognized — ask HR/Admin to check your setup."
                stop_event.wait(SETTINGS_POLL_SECONDS)
                continue

            enabled_by_hr = bool(settings.get("enabled"))
            employee_email = settings.get("employeeEmail")
            
            try:
                shift_active = check_active_shift(cfg["url"], None, employee_email)
            except Exception as e:
                with self.state_lock:
                    self.state["last_error"] = _short_error(f"Shift check failed: {e}")
                stop_event.wait(SETTINGS_POLL_SECONDS)
                continue

            enabled = enabled_by_hr and shift_active
            # 1 minute is the enforced floor (matches the minimum HR/Admin can
            # set on the dashboard — see TrackingView.tsx's interval input);
            # this max() is just a safety net for any older saved settings.
            interval_minutes = max(1.0, float(settings.get("intervalMinutes", 15)))
            with self.state_lock:
                self.state["enabled"] = enabled
                self.state["enabled_by_hr"] = enabled_by_hr
                self.state["shift_active"] = shift_active
                self.state["interval"] = interval_minutes
                self.state["last_error"] = None

            if enabled:
                try:
                    webp_bytes, w, h = capture_and_encode()
                    ts = upload_screenshot(
                        cfg["url"], settings.get("employeeEmail"), webp_bytes, w, h,
                        device_id=cfg.get("device_id"), device_label=cfg.get("device_label"),
                        agent_token=cfg.get("token"),
                    )
                    with self.state_lock:
                        self.state["last_capture"] = ts
                except Exception as e:
                    with self.state_lock:
                        self.state["last_error"] = _short_error(f"Capture/upload failed: {e}")

            remaining = interval_minutes * 60 if enabled else SETTINGS_POLL_SECONDS
            waited = 0
            while waited < remaining and not stop_event.is_set():
                # Ticks in short (1s) increments — rather than one big
                # SETTINGS_POLL_SECONDS sleep — so a realtime wake_event
                # signal (a shift just started/ended on the web dashboard,
                # see _realtime_loop) is noticed within about a second
                # instead of waiting out the rest of this interval.
                if self.wake_event.is_set():
                    self.wake_event.clear()
                    break
                chunk = min(1.0, remaining - waited)
                stop_event.wait(chunk)
                waited += chunk

    def _realtime_loop(self, cfg, stop_event):
        """Keeps a live PocketBase realtime (SSE) subscription open on the
        hr_timesheets collection so a shift started/ended from the web
        dashboard reaches this agent almost immediately — instead of only
        being noticed on the next SETTINGS_POLL_SECONDS poll in
        _worker_loop — closing the gap between the real clock-in/out time
        and when the agent actually starts/stops capturing.

        This is a pure latency optimization layered on top of the existing
        poll, not a replacement for it: if this never manages to connect
        (corporate firewall blocking SSE, PocketBase temporarily down,
        etc.), _worker_loop's regular poll still catches every shift change
        on its own, exactly as it did before this existed — so failures
        here are logged and retried with backoff, never fatal or
        user-facing.

        Protocol (PocketBase realtime): GET /api/realtime opens an SSE
        stream; the first event ("PB_CONNECT") carries a clientId. POSTing
        {"clientId": ..., "subscriptions": ["hr_timesheets"]} back to the
        same endpoint then subscribes it to every create/update/delete on
        that collection network-wide — filtered down to just this
        employee's own row here, client-side, by comparing employee_id.
        """
        base_url = cfg["url"]
        employee_email = (cfg.get("employee_email") or "").strip().lower()
        backoff = 3

        while not stop_event.is_set():
            resp = None
            try:
                resp = requests.get(
                    f"{base_url}/api/realtime",
                    headers={"Accept": "text/event-stream"},
                    stream=True,
                    timeout=(10, 90),
                )
                resp.raise_for_status()

                client_id = None
                event_name = None
                for raw_line in resp.iter_lines(decode_unicode=True):
                    if stop_event.is_set():
                        break
                    if raw_line is None:
                        continue
                    line = raw_line.strip()
                    if not line:
                        event_name = None  # blank line ends one SSE event block
                        continue
                    if line.startswith(":"):
                        continue  # keep-alive comment — nothing to do
                    if line.startswith("event:"):
                        event_name = line[len("event:"):].strip()
                        continue
                    if not line.startswith("data:"):
                        continue

                    payload = line[len("data:"):].strip()
                    try:
                        data = json.loads(payload)
                    except Exception:
                        continue

                    if event_name == "PB_CONNECT" and client_id is None:
                        client_id = data.get("clientId")
                        if client_id:
                            try:
                                sub_resp = requests.post(
                                    f"{base_url}/api/realtime",
                                    headers=JSON_HEADERS,
                                    data=json.dumps({
                                        "clientId": client_id,
                                        # Subscribe to both hr_timesheets (shift start/stop)
                                        # and hr_delcargo_store (ping/pong + stop commands)
                                        "subscriptions": ["hr_timesheets", "hr_delcargo_store"],
                                    }),
                                    timeout=15,
                                )
                                sub_resp.raise_for_status()
                                backoff = 3  # clean connect + subscribe — reset backoff for next time
                            except Exception as e:
                                print(f"[info] Realtime subscribe request failed, will retry: {e}")
                    elif event_name == "hr_timesheets":
                        record = data.get("record") or {}
                        # employee_id on hr_timesheets stores the employee's
                        # email (see check_active_shift) — matches this
                        # agent's own connected email regardless of which
                        # employee's shift change triggered the event.
                        record_email = (record.get("employee_id") or "").strip().lower()
                        if record_email and record_email == employee_email:
                            self.wake_event.set()

                    elif event_name == "hr_delcargo_store":
                        # Filter KV store events for keys relevant to this employee.
                        try:
                            record = data.get("record") or {}
                            kv_key = record.get("key") or ""
                            kv_value = record.get("value") or {}
                            
                            # PocketBase sometimes sends JSON fields as strings over SSE
                            if isinstance(kv_value, str):
                                try:
                                    kv_value = json.loads(kv_value)
                                except Exception:
                                    kv_value = {}

                            if kv_key == ping_key_for(employee_email):
                                # Portal wants to confirm we're alive — respond with a pong (Signal 4)
                                self._handle_ping(kv_value)
                            elif kv_key == stop_cmd_key_for(employee_email):
                                # Portal ended the shift — stop capturing immediately (Signal 5)
                                self._handle_stop_cmd(kv_value)
                        except Exception as inner_e:
                            print(f"[warn] Failed to process hr_delcargo_store event: {inner_e}")
            except Exception as e:
                print(f"[info] Realtime connection unavailable ({e}); relying on regular polling.")
            finally:
                if resp is not None:
                    try:
                        resp.close()
                    except Exception:
                        pass

            if stop_event.is_set():
                break
            stop_event.wait(backoff)
            backoff = min(backoff * 2, 30)

    def _inactivity_loop(self, cfg, stop_event):
        """Samples the cursor position every MOUSE_POLL_SECONDS. Whenever the
        mouse hasn't moved for at least INACTIVITY_THRESHOLD_SECONDS and then
        moves again, uploads that whole idle stretch as one completed
        interval — matching how HR/Admin want to see "how long and when"
        inactivity happened within a shift, not a running live counter.

        Only counts idle time while tracking is actually enabled AND the
        employee's shift is active (self.state['enabled'], kept up to date by
        _worker_loop) — same gating screenshots use, so time spent off-shift
        or with tracking off is never reported as "inactivity". Runs as its
        own tight loop separate from _worker_loop, which only wakes up every
        SETTINGS_POLL_SECONDS/capture-interval and would miss short idle
        windows entirely.
        """
        last_pos = None
        last_move_time = time.monotonic()
        was_enabled = False
        # Guards handle_inactivity_auto_absence() from firing more than once
        # for the same continuous idle stretch — reset to False whenever the
        # mouse actually moves (a new stretch begins) or tracking/shift
        # toggles off. Deliberately separate from the >=INACTIVITY_
        # THRESHOLD_SECONDS upload below, which is a completed-interval LOG
        # (fires once the mouse moves again); this one fires live, while
        # still idle, the moment AUTO_ABSENT_INACTIVITY_SECONDS is crossed.
        auto_absent_fired = False

        while not stop_event.is_set():
            stop_event.wait(MOUSE_POLL_SECONDS)
            if stop_event.is_set():
                break

            with self.state_lock:
                enabled = bool(self.state.get("enabled"))
                employee_email = self.state.get("employee_email") or cfg.get("employee_email")

            now = time.monotonic()

            if not enabled:
                # Tracking just turned off (or shift ended) — don't let a gap
                # from before that moment get reported once it turns back on.
                last_pos = None
                last_move_time = now
                was_enabled = False
                auto_absent_fired = False
                continue

            if not was_enabled:
                # Tracking/shift just started — begin the idle clock fresh
                # rather than counting time from before we were watching.
                last_pos = None
                last_move_time = now
                was_enabled = True
                auto_absent_fired = False

            try:
                pos = pyautogui.position()
            except Exception:
                # Position lookup can occasionally fail (e.g. display/session
                # transitions) — skip this sample rather than crash the loop.
                continue

            if last_pos is None:
                last_pos = pos
                last_move_time = now
                continue

            if pos != last_pos:
                idle_seconds = now - last_move_time
                if idle_seconds >= INACTIVITY_THRESHOLD_SECONDS:
                    end_wall = datetime.now(timezone.utc)
                    start_wall = end_wall - timedelta(seconds=idle_seconds)
                    try:
                        upload_inactivity(
                            cfg["url"], employee_email, start_wall, end_wall,
                            device_id=cfg.get("device_id"), device_label=cfg.get("device_label"),
                            agent_token=cfg.get("token"),
                        )
                    except Exception as e:
                        with self.state_lock:
                            self.state["last_error"] = _short_error(f"Inactivity log upload failed: {e}")
                last_pos = pos
                last_move_time = now
                auto_absent_fired = False  # mouse moved — a fresh idle stretch starts from here
            else:
                # Still idle. Checked on every poll (not just when the mouse
                # eventually moves) so this can trigger DURING the idle
                # stretch instead of waiting for it to end.
                idle_seconds = now - last_move_time
                if idle_seconds >= AUTO_ABSENT_INACTIVITY_SECONDS and not auto_absent_fired:
                    auto_absent_fired = True
                    try:
                        full_name, inactivity_minutes, deduction_amount = handle_inactivity_auto_absence(
                            cfg["url"], employee_email, idle_seconds
                        )
                        # Tkinter widgets/dialogs must run on the main thread
                        # — this loop runs on its own background thread, so
                        # the actual popup call is marshaled via
                        # self.root.after(0, ...), same pattern used
                        # elsewhere in this file (see e.g. _connect_and_save).
                        self.root.after(0, lambda m=inactivity_minutes, d=deduction_amount: self._show_inactivity_absence_popup(m, d))
                    except Exception as e:
                        with self.state_lock:
                            self.state["last_error"] = _short_error(f"Inactivity auto-absence failed: {e}")

    # ---------- periodic UI refresh ----------

    def _tick(self):
        if self.cfg and hasattr(self, "status_var"):
            with self.state_lock:
                s = dict(self.state)

            if hasattr(self, "conn_status_var"):
                conn = s.get("connection_status")
                if conn == "superseded":
                    self.conn_status_var.set(f"\U0001f7e0 Connected elsewhere ({s.get('superseded_device') or 'another computer'}) — click Reconnect to take over here")
                elif conn == "connected":
                    label = (self.cfg or {}).get("device_label", "")
                    self.conn_status_var.set(f"\U0001f7e2 App Connected" + (f" ({label})" if label else ""))
                elif conn == "disconnected":
                    self.conn_status_var.set("\U0001f534 Not connected — " + (s.get("heartbeat_error") or "check your internet connection"))
                else:
                    self.conn_status_var.set("Checking connection…")

            tray_mode = "off"
            if s.get("last_error"):
                self.status_var.set("⚠ Connection issue")
                self.detail_var.set(s["last_error"])
                tray_mode = "off"
            elif s.get("enabled"):
                self.status_var.set("🟢 Tracking Active")
                self.detail_var.set("Your screen activity is being monitored for this shift, per your employer's tracking policy.")
                tray_mode = "active"
            elif s.get("enabled_by_hr") and not s.get("shift_active"):
                self.status_var.set("⏸ Tracking Paused")
                self.detail_var.set("Waiting for your shift to start.\nTracking will automatically resume when you clock in.")
                tray_mode = "paused"
            else:
                self.status_var.set("⚪ Tracking Off")
                self.detail_var.set("Waiting for HR/Admin to enable tracking for your account.\nNothing is being captured right now.")
                tray_mode = "off"

            if self.tray_icon:
                try:
                    self.tray_icon.icon = build_tray_image(tray_mode)
                except Exception:
                    pass
        self.root.after(2000, self._tick)

    def _show_inactivity_absence_popup(self, inactivity_minutes, deduction_amount):
        """Native desktop popup shown the moment the agent auto-ends a shift
        for inactivity (see handle_inactivity_auto_absence /
        _inactivity_loop) — runs on the main/Tk thread via self.root.after,
        since this is called from a background thread. Shown regardless of
        whether the employee has the web dashboard open at all (unlike the
        web-side shift-stop-signal poll in employee/page.tsx, which only
        helps if a browser tab happens to be open) — this is the one
        guaranteed-to-be-seen notice, since it's the same machine the
        employee was just idle on."""
        deduction_text = f"${deduction_amount}" if deduction_amount else "a 2-day pay penalty"
        messagebox.showwarning(
            APP_NAME,
            f"Your shift has been ended automatically.\n\n"
            f"You were inactive for over {inactivity_minutes} minutes and have been marked absent for today "
            f"— {deduction_text} has been deducted from your pay.\n\n"
            f"If you believe this is a mistake, contact HR.",
        )

    @staticmethod
    def _format_time(iso_str):
        try:
            dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00")).astimezone()
            return dt.strftime("%I:%M %p").lstrip("0")
        except Exception:
            return iso_str

    # ---------- window/tray lifecycle ----------

    def hide_window(self):
        self.root.withdraw()
        # One-time reminder of where to find the app again — this is the
        # most common point of confusion ("I closed it, how do I reopen
        # it?"). Only shown once per run so it isn't annoying on every
        # minimize.
        if not getattr(self, "_shown_tray_hint", False):
            self._shown_tray_hint = True
            if self.tray_icon:
                try:
                    self.tray_icon.notify(tray_location_hint(), title=APP_NAME + " is still running")
                except Exception:
                    pass  # Notifications aren't supported on every OS/config — non-critical.

    def show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def on_close(self):
        # Respects the "Closing the window minimizes to tray" setting (see
        # _toggle_close_to_tray) — previously this always hid to tray
        # whenever a tray icon existed, with no opt-out.
        close_to_tray = bool((self.cfg or {}).get("close_to_tray", True))
        if pystray and self.tray_icon and close_to_tray:
            self.hide_window()
        else:
            self.quit_app()

    def quit_app(self):
        # If a shift is currently active and being tracked, quitting the app
        # outright (not just minimizing to tray) would otherwise leave that
        # shift running with no agent reporting screenshots/inactivity at
        # all. Rather than let that happen silently, warn the employee and
        # auto-end (clock out) the shift as part of quitting — matches
        # ending it manually from the web dashboard.
        with self.state_lock:
            shift_active = bool(self.state.get("shift_active"))
            enabled_by_hr = bool(self.state.get("enabled_by_hr"))
            employee_email = self.state.get("employee_email") or (self.cfg or {}).get("employee_email")

        if self.cfg and shift_active and enabled_by_hr:
            proceed = messagebox.askyesno(
                APP_NAME,
                "Your shift is currently active and being tracked.\n\n"
                "Quitting this app now will automatically end (clock out) your shift, "
                "so it's never left running un-monitored.\n\n"
                "Quit and end your shift now?",
            )
            if not proceed:
                return
            # Signal 2: Write quit intent FIRST (with retry) so the portal
            # immediately knows this was a deliberate quit, even if the
            # auto_clock_out call below fails due to server timeouts.
            write_quit_intent(self.cfg["url"], employee_email)
            try:
                if auto_clock_out(self.cfg["url"], employee_email):
                    notify_shift_auto_stopped(self.cfg["url"], employee_email, reason="tracker_closed")
            except Exception as e:
                print(f"[warn] Auto clock-out on quit failed: {e}")

        # Tell the server this device is gone right now, rather than letting
        # the web dashboard keep showing "connected" until the last
        # heartbeat ages past its staleness window (see clear_heartbeat).
        if self.cfg:
            try:
                clear_heartbeat(self.cfg["url"], employee_email)
            except Exception as e:
                print(f"[warn] Clearing heartbeat on quit failed: {e}")

        self.stop_event.set()
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        self.root.after(100, self.root.destroy)

    def _start_tray(self):
        def on_show(icon, item):
            self.root.after(0, self.show_window)

        def on_quit(icon, item):
            # Don't stop the tray icon here — quit_app() may prompt to
            # confirm ending an active tracked shift and return early on
            # "No", in which case the app (and its tray icon) should keep
            # running normally. quit_app() itself stops the tray icon once
            # it actually decides to exit.
            self.root.after(0, self.quit_app)

        menu = pystray.Menu(
            pystray.MenuItem("Open " + APP_NAME, on_show, default=True),
            pystray.MenuItem("Quit", on_quit),
        )
        self.tray_icon = pystray.Icon(APP_NAME, build_tray_image(False), APP_NAME, menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()


def main():
    # Trigger macOS native permission prompt on launch if running on Darwin
    request_mac_permissions()

    # The very first thing this app does on every launch: check GitHub for a
    # newer release and offer to update before anything else happens (before
    # the single-instance check, before loading saved config, before any
    # tracking/heartbeat work starts). Never blocks startup on failure —
    # check_for_update() swallows every error and just returns None.
    _check_and_prompt_update()

    if not acquire_single_instance_lock():
        # Another copy is already running — surface a clear popup instead of
        # silently opening a second window (which would run a second,
        # redundant capture/heartbeat loop and fight the first instance for
        # the device-connection slot).
        root = tk.Tk()
        root.withdraw()
        messagebox.showwarning(
            APP_NAME,
            f"{APP_NAME} is already running.\n\n" + tray_location_hint(),
        )
        root.destroy()
        sys.exit(0)

    root = tk.Tk()
    TrackerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
