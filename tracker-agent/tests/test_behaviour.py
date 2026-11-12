"""Backoff, logging, absence records, reliable inactivity upload, capture sizing,
self-restart helpers."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest


class Resp:
    def __init__(self, code=200, body=None, text=""):
        self.status_code, self._body, self.ok, self.text = code, body or {}, code < 400, text

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


# ── backoff ────────────────────────────────────────────────────────────────
def test_backoff_grows_with_jitter_and_caps(agent):
    b = agent._Backoff(60, cap_seconds=300)
    delays = [b.next_delay() for _ in range(6)]
    assert 30 <= delays[0] <= 60 and 60 <= delays[1] <= 120
    assert all(d <= 300 for d in delays) and delays[-1] >= 150
    b.reset()
    assert b.next_delay() <= 60


# ── logging ────────────────────────────────────────────────────────────────
def test_log_tail_redacts_tokens(agent):
    os.makedirs(agent.LOG_DIR, exist_ok=True)
    with open(agent.LOG_FILE, "w") as f:
        f.write("ok line\nfailed https://x/api?token=SECRET123&a=1 for agt_abcdef123456\n")
    tail = agent.read_log_tail()
    assert "ok line" in tail and "SECRET123" not in tail and "agt_abcdef123456" not in tail


def test_log_tail_missing_file_is_empty(agent):
    assert agent.read_log_tail() == ""


# ── reliable inactivity upload ─────────────────────────────────────────────
CFG = {"url": "http://x", "token": "agt_secret", "device_id": "d", "device_label": "L"}
START = datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc)
END = START + timedelta(minutes=5)


def test_inactivity_upload_retries_then_succeeds(agent, monkeypatch):
    attempts = []
    def flaky(*a, **k):
        attempts.append(1)
        if len(attempts) < 3:
            raise OSError("down")
    monkeypatch.setattr(agent, "upload_inactivity", flaky)
    monkeypatch.setattr(agent.time, "sleep", lambda s: None)
    assert agent.upload_inactivity_reliably(CFG, "a@b.us", START, END) is True
    assert len(attempts) == 3 and agent._load_pending_inactivity() == []


def test_inactivity_upload_parks_on_disk_and_flushes_later(agent, monkeypatch):
    monkeypatch.setattr(agent, "upload_inactivity", MagicMock(side_effect=OSError("down")))
    monkeypatch.setattr(agent.time, "sleep", lambda s: None)
    assert agent.upload_inactivity_reliably(CFG, "a@b.us", START, END) is False
    parked = agent._load_pending_inactivity()
    assert len(parked) == 1 and "token" not in json.dumps(parked)   # token never written to disk

    sent = []
    monkeypatch.setattr(agent, "upload_inactivity", lambda *a, **k: sent.append((a, k)))
    agent.flush_pending_inactivity(CFG, "a@b.us")
    assert len(sent) == 1 and sent[0][1]["agent_token"] == "agt_secret"
    assert agent._load_pending_inactivity() == []


# ── multi-monitor capture ──────────────────────────────────────────────────
def test_multi_monitor_screenshot_keeps_one_screen_width_each(agent, monkeypatch):
    Image = pytest.importorskip("PIL.Image")
    if isinstance(Image, MagicMock):
        pytest.skip("Pillow not installed")
    monkeypatch.setattr(agent, "_grab_with_mss", lambda: Image.new("RGB", (3840, 1080), (120, 120, 120)))
    monkeypatch.setattr(agent, "_is_black_frame", lambda img, grid=8: False)
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    monkeypatch.setattr(agent, "_last_monitor_count", 2)
    _, w, _ = agent.capture_and_encode()
    assert w == 2560                                   # was squashed to 1280 before
    monkeypatch.setattr(agent, "_last_monitor_count", 1)
    monkeypatch.setattr(agent, "_grab_with_mss", lambda: Image.new("RGB", (1920, 1080), (120, 120, 120)))
    _, w, _ = agent.capture_and_encode()
    assert w == 1280                                   # single monitor unchanged


# ── self-restart helpers ───────────────────────────────────────────────────
def test_relaunch_refused_when_not_packaged(agent, monkeypatch):
    monkeypatch.setattr(agent.sys, "frozen", False, raising=False)
    assert agent.relaunch_self() is False


def test_relaunch_windows_passes_wait_for_pid(agent, monkeypatch):
    monkeypatch.setattr(agent.sys, "frozen", True, raising=False)
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    monkeypatch.setattr(agent.sys, "executable", "C:/App/DelCargo Tracker.exe")
    popen = MagicMock()
    monkeypatch.setattr(agent.subprocess, "Popen", popen)
    assert agent.relaunch_self() is True
    cmd, kw = popen.call_args[0][0], popen.call_args[1]
    assert cmd[:2] == ["C:/App/DelCargo Tracker.exe", "--wait-for-pid"] and cmd[2] == str(os.getpid())
    assert kw["env"]["PYINSTALLER_RESET_ENVIRONMENT"] == "1"


@pytest.mark.skipif(sys.platform == "win32", reason="posix wait path")
def test_wait_for_pid_exit_returns_when_process_dies(agent):
    import subprocess, threading, time
    p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(0.7)"])
    threading.Thread(target=p.wait, daemon=True).start()  # reap it, as init does for a real previous instance
    started = time.monotonic()
    agent._wait_for_pid_exit(p.pid, timeout_seconds=10)
    assert 0.3 < time.monotonic() - started < 5


# ── the 37-minute stretch: the tracker logs it and ends the shift; the absence is made from the log by the web app, never here ──
def test_the_tracker_only_ends_the_shift_it_creates_no_absence_and_no_notice(agent, monkeypatch):
    calls = []
    monkeypatch.setattr(agent, "auto_clock_out", lambda *a: calls.append("clock_out") or True)
    monkeypatch.setattr(agent, "notify_shift_auto_stopped", lambda *a, **k: calls.append(("stop_signal", k.get("reason"))))
    agent.end_shift_for_inactivity("http://x", "emily@delcargo.us")
    assert calls == ["clock_out", ("stop_signal", "inactivity_absence")]
    source = open(agent.__file__, encoding="utf-8").read()
    assert "collections/hr_absence_records" not in source and "create_notification" not in source  # one creator of absences: the web check, reading the log
    assert "base_salary" not in source and "baseSalary" not in source  # and the tracker never reads or shows pay


# ── idle time is only reported for the part inside the open shift ──
def test_idle_is_cut_to_the_shift(agent):
    t = lambda m: datetime(2026, 11, 5, 16, 0, tzinfo=timezone.utc) + timedelta(minutes=m)
    # a shift seen open from minute 0 and last seen open at minute 5 (grace of 3 more minutes)
    assert agent.clip_idle_to_shift(t(-30), t(60), t(0), t(5)) == (t(0), t(5) + timedelta(seconds=agent.SHIFT_SEEN_GRACE_SECONDS))
    assert agent.clip_idle_to_shift(t(20), t(60), t(0), t(5)) is None  # began after the shift was last seen
    assert agent.clip_idle_to_shift(t(1), t(4), t(0), t(5)) == (t(1), t(4))  # fully inside: unchanged
    assert agent.clip_idle_to_shift(t(1), t(4), None, None) == (t(1), t(4))  # nothing known yet: unchanged


def test_the_stretch_that_ends_the_shift_is_logged_before_the_shift_ends(agent):
    source = open(agent.__file__, encoding="utf-8").read()
    block = source[source.index("auto_absent_fired = True\n                # The stretch is logged now"):]
    assert block.index("self._submit_idle_in_shift(") < block.index("end_shift_for_inactivity(")  # once the shift ends, tracking is off and nothing would report it
    assert source.count("INACTIVITY_THRESHOLD_SECONDS and not auto_absent_fired:") == 2  # and the resume path does not log the same stretch a second time
