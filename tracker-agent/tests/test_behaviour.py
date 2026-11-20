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


# ── the inactivity loop, driven for real with a fake clock and a fake idle counter ──
class _Clock:
    """Stands in for the stop event: every wait() moves the fake clock forward; the loop stops after `ticks` polls."""
    def __init__(self, ticks):
        self.t, self.ticks, self.n = 1000.0, ticks, 0
    def wait(self, seconds=None):
        self.n += 1
        self.t += seconds or 0
    def is_set(self):
        return self.n >= self.ticks


def _run_inactivity_loop(agent, monkeypatch, tmp_path, idle_at, ticks, end_results):
    """Runs TrackerApp._inactivity_loop. idle_at(seconds_since_start) is the OS idle counter; end_results is the sequence of answers
    end_shift_for_inactivity gives. Returns what happened."""
    import types, threading
    monkeypatch.setattr(agent, "OPEN_IDLE_FILE", str(tmp_path / "open.json"))
    clock = _Clock(ticks)
    monkeypatch.setattr(agent.time, "monotonic", lambda: clock.t)
    monkeypatch.setattr(agent, "_get_system_idle_seconds", lambda: idle_at(clock.t - 1000.0))
    monkeypatch.setattr(agent, "recover_open_idle", lambda cfg: False)
    monkeypatch.setattr(agent.threading, "Thread", lambda *a, **k: MagicMock())
    events = {"logged": [], "end_calls": 0, "popups": 0}
    answers = list(end_results)

    def end(url, email):
        events["end_calls"] += 1
        return answers.pop(0) if answers else True

    monkeypatch.setattr(agent, "end_shift_for_inactivity", end)
    fake = types.SimpleNamespace(
        state_lock=threading.Lock(), wake_event=threading.Event(),
        state={"enabled": True, "shift_active": True, "employee_email": "a@b.us"},
        root=types.SimpleNamespace(after=lambda ms, fn: fn()),
    )
    fake._shift_marks = lambda: (None, None)
    fake._idle_seconds_in_shift = lambda idle: agent.TrackerApp._idle_seconds_in_shift(fake, idle)
    fake._submit_idle_in_shift = lambda cfg, email, start, end: events["logged"].append((end - start).total_seconds())
    fake._show_inactivity_absence_popup = lambda minutes: events.__setitem__("popups", events["popups"] + 1)
    agent.TrackerApp._inactivity_loop(fake, {"url": "http://x", "employee_email": "a@b.us"}, clock)
    events["state"] = fake.state
    return events


def test_a_37_minute_stretch_is_logged_once_and_the_shift_ended_once(agent, monkeypatch, tmp_path):
    ev = _run_inactivity_loop(agent, monkeypatch, tmp_path, idle_at=lambda s: s, ticks=520, end_results=[True])
    assert len(ev["logged"]) == 1 and ev["logged"][0] >= 37 * 60
    assert ev["end_calls"] == 1 and ev["popups"] == 1
    assert ev["state"]["shift_active"] is False and ev["state"]["enabled"] is False


def test_if_the_server_cannot_end_the_shift_it_keeps_trying_and_only_then_tells_the_employee(agent, monkeypatch, tmp_path):
    ev = _run_inactivity_loop(agent, monkeypatch, tmp_path, idle_at=lambda s: s, ticks=620, end_results=[False, False, False, True])
    assert len(ev["logged"]) == 1  # the stretch is logged once, not once per retry
    assert ev["end_calls"] == 4 and ev["popups"] == 1  # three failures, then success: one popup, after it really ended


def test_nothing_is_ended_when_the_person_comes_back_before_the_shift_end_succeeds(agent, monkeypatch, tmp_path):
    # idle for 38 min, the server is down, and at minute 39 the person moves the mouse again
    ev = _run_inactivity_loop(agent, monkeypatch, tmp_path, idle_at=lambda s: s if s < 39 * 60 else s - 39 * 60, ticks=520,
                              end_results=[False] * 50)
    assert len(ev["logged"]) == 1  # the stretch still counts (the web app makes the absence from the log)
    assert ev["popups"] == 0 and ev["end_calls"] < 10  # and it stopped trying to clock them out once they were back


def test_a_short_stretch_is_not_a_37_minute_stretch(agent, monkeypatch, tmp_path):
    ev = _run_inactivity_loop(agent, monkeypatch, tmp_path, idle_at=lambda s: s if s < 20 * 60 else 0, ticks=400, end_results=[True])
    assert ev["end_calls"] == 0 and ev["popups"] == 0


def test_end_shift_for_inactivity_reports_whether_the_server_was_reached(agent, monkeypatch):
    sent = []
    monkeypatch.setattr(agent, "notify_shift_auto_stopped", lambda *a, **k: sent.append(1))

    def down(*a):
        raise OSError("down")

    monkeypatch.setattr(agent, "auto_clock_out", down)
    assert agent.end_shift_for_inactivity("http://x", "a@b.us") is False and sent == []  # nothing happened: no notice either
    monkeypatch.setattr(agent, "auto_clock_out", lambda *a: False)  # already closed (e.g. by the server)
    assert agent.end_shift_for_inactivity("http://x", "a@b.us") is True and sent == []
    monkeypatch.setattr(agent, "auto_clock_out", lambda *a: True)
    assert agent.end_shift_for_inactivity("http://x", "a@b.us") is True and sent == [1]


def test_screenshots_taken_offline_are_parked_and_sent_oldest_first_with_their_real_time(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    now = datetime.now(timezone.utc)
    first, second = (now - timedelta(minutes=30)).isoformat(), (now - timedelta(minutes=15)).isoformat()
    assert agent.park_screenshot(b"two", 10, 5, second) and agent.park_screenshot(b"one", 10, 5, first)
    sent = []
    monkeypatch.setattr(agent, "upload_screenshot", lambda url, email, data, w, h, **kw: sent.append((data, kw["captured_at"])))
    assert agent.flush_pending_screenshots(CFG, "a@b.us") == 2
    assert [d for d, _ in sent] == [b"one", b"two"]
    assert [round(datetime.fromisoformat(t).timestamp(), 2) for _, t in sent] == [round(datetime.fromisoformat(x).timestamp(), 2) for x in (first, second)]
    assert agent._pending_shot_files() == []


def test_parked_screenshots_stay_when_the_server_is_still_down_and_old_ones_are_dropped(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    now = datetime.now(timezone.utc)
    agent.park_screenshot(b"old", 1, 1, (now - timedelta(days=5)).isoformat())
    agent.park_screenshot(b"new", 1, 1, (now - timedelta(minutes=5)).isoformat())

    def down(*a, **k):
        raise ConnectionError("down")

    monkeypatch.setattr(agent, "upload_screenshot", down)
    assert agent.flush_pending_screenshots(CFG, "a@b.us") == 0
    assert len(agent._pending_shot_files()) == 1  # the too-old one is gone, the recent one waits


def test_the_screenshot_queue_is_capped(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    monkeypatch.setattr(agent, "PENDING_SHOTS_MAX", 3)
    now = datetime.now(timezone.utc)
    for i in range(6):
        agent.park_screenshot(b"x", 1, 1, (now - timedelta(minutes=60 - i)).isoformat())
    assert len(agent._pending_shot_files()) == 3


def test_parked_inactivity_keeps_its_own_email_and_nothing_is_lost_without_one(agent, monkeypatch):
    monkeypatch.setattr(agent, "upload_inactivity", MagicMock(side_effect=OSError("down")))
    monkeypatch.setattr(agent.time, "sleep", lambda s: None)
    agent.upload_inactivity_reliably(CFG, "a@b.us", START, END)
    sent = []
    monkeypatch.setattr(agent, "upload_inactivity", lambda url, email, *a, **k: sent.append(email))
    agent.flush_pending_inactivity(CFG, None)  # e.g. the start-up flush before the email is known
    assert sent == ["a@b.us"] and agent._load_pending_inactivity() == []


def test_an_idle_stretch_cut_off_by_a_restart_is_recovered_at_next_start(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "OPEN_IDLE_FILE", str(tmp_path / "open.json"))
    now = datetime.now(timezone.utc)
    agent.journal_open_idle(now - timedelta(minutes=20), now - timedelta(minutes=1), "a@b.us")
    assert agent.recover_open_idle(CFG) is True
    parked = agent._load_pending_inactivity()
    assert len(parked) == 1 and parked[0]["email"] == "a@b.us"
    assert datetime.fromisoformat(parked[0]["end"]) == now - timedelta(minutes=1)  # ends when it was last seen idle, never later
    assert not os.path.exists(agent.OPEN_IDLE_FILE)


def test_a_too_short_or_broken_journal_is_discarded(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "OPEN_IDLE_FILE", str(tmp_path / "open.json"))
    now = datetime.now(timezone.utc)
    agent.journal_open_idle(now - timedelta(seconds=60), now, "a@b.us")
    assert agent.recover_open_idle(CFG) is False and agent._load_pending_inactivity() == []
    (tmp_path / "open.json").write_text("not json")
    assert agent.recover_open_idle(CFG) is False


def test_backoff_never_overflows_however_long_the_server_is_down(agent):
    b = agent._Backoff(60.0, cap_seconds=120.0)
    delays = [b.next_delay() for _ in range(5000)]
    assert all(0 < d <= 120.0 for d in delays)


def test_a_parked_screenshot_is_sent_under_its_owner_and_a_refused_one_does_not_block_the_rest(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    now = datetime.now(timezone.utc)
    agent.park_screenshot(b"bad", 1, 1, (now - timedelta(minutes=30)).isoformat(), "alice@x.us")
    agent.park_screenshot(b"good", 1, 1, (now - timedelta(minutes=20)).isoformat(), "alice@x.us")
    sent = []

    class Refused(Exception):
        response = MagicMock(status_code=422)

    def up(url, email, data, w, h, **kw):
        if data == b"bad":
            raise Refused()
        sent.append((email, data))

    monkeypatch.setattr(agent, "upload_screenshot", up)
    assert agent.flush_pending_screenshots(CFG, "bob@x.us") == 1  # bob is connected now, but the screenshot is alice's
    assert sent == [("alice@x.us", b"good")] and agent._pending_shot_files() == []


def test_a_file_that_cannot_be_deleted_does_not_stop_the_queue(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    agent.park_screenshot(b"x", 1, 1, datetime.now(timezone.utc).isoformat(), "a@b.us")
    monkeypatch.setattr(agent.os, "remove", MagicMock(side_effect=PermissionError("locked")))
    monkeypatch.setattr(agent, "upload_screenshot", lambda *a, **k: None)
    assert agent.flush_pending_screenshots(CFG, "a@b.us") == 1  # no exception escapes


def test_an_inactivity_log_is_on_disk_before_it_is_sent(agent, monkeypatch):
    seen = []
    monkeypatch.setattr(agent, "upload_inactivity", lambda *a, **k: seen.append(len(agent._load_pending_inactivity())))
    assert agent.upload_inactivity_reliably(CFG, "a@b.us", START, END) is True
    assert seen == [1]  # at the moment of sending, the write-ahead copy existed
    assert agent._load_pending_inactivity() == []  # and it is removed once the server has it


def test_a_stopped_heartbeat_keeps_its_last_seen_time(agent, monkeypatch):
    store = {"heartbeat": {"lastSeenAt": "2026-11-17T10:00:00+00:00", "deviceId": "d"}}
    monkeypatch.setattr(agent, "get_tracker_signal_field", lambda url, email, field: store.get(field))
    monkeypatch.setattr(agent, "set_tracker_signal_field", lambda url, email, field, value: store.__setitem__(field, value))
    agent.clear_heartbeat("http://x", "a@b.us")
    hb = store["heartbeat"]
    assert hb["lastSeenAt"] == "2026-11-17T10:00:00+00:00" and hb["stopped"] is True and hb["deviceId"] == "d"


def test_config_is_written_atomically(agent, monkeypatch, tmp_path):
    monkeypatch.setattr(agent, "APP_DIR", str(tmp_path / "app"))
    monkeypatch.setattr(agent, "CONFIG_FILE", str(tmp_path / "app" / "config.json"))
    agent.save_config({"url": "u", "token": "t"})
    assert agent.load_config() == {"url": "u", "token": "t"} and not os.path.exists(agent.CONFIG_FILE + ".tmp")


def _run_worker_loop(agent, monkeypatch, tmp_path, ticks, interval=15, shift_answers=None, settings_fail_from=None):
    """Runs TrackerApp._worker_loop on a fake clock (each wait() call = its seconds). Returns what the loop did."""
    import types, threading
    monkeypatch.setattr(agent, "PENDING_SHOTS_DIR", str(tmp_path / "shots"))
    clock = _Clock(ticks)
    monkeypatch.setattr(agent.time, "monotonic", lambda: clock.t)
    log = {"polls": 0, "shots": 0, "parked": 0}

    def settings(url, key, token):
        log["polls"] += 1
        if settings_fail_from is not None and clock.t - 1000.0 >= settings_fail_from:
            raise OSError("server down")
        return {"enabled": True, "employeeEmail": "a@b.us", "intervalMinutes": interval}

    monkeypatch.setattr(agent, "get_tracking_settings", settings)
    monkeypatch.setattr(agent, "check_active_shift", lambda *a: True)
    monkeypatch.setattr(agent, "_is_session_locked", lambda: False)
    monkeypatch.setattr(agent, "capture_and_encode", lambda: (b"img", 10, 10))
    monkeypatch.setattr(agent, "upload_screenshot", lambda *a, **k: log.__setitem__("shots", log["shots"] + 1) or "ts")
    monkeypatch.setattr(agent, "flush_pending_screenshots", lambda *a, **k: 0)
    monkeypatch.setattr(agent, "park_screenshot", lambda *a, **k: log.__setitem__("parked", log["parked"] + 1) or True)
    fake = types.SimpleNamespace(
        state_lock=threading.Lock(), wake_event=threading.Event(), state={"connection_status": "connected"},
        root=types.SimpleNamespace(after=lambda ms, fn: None),
    )
    fake._offline_capture = lambda cfg, offline: agent.TrackerApp._offline_capture(fake, cfg, offline)
    agent.TrackerApp._worker_loop(fake, {"url": "http://x", "token": "t", "device_id": "d"}, clock)
    log["state"] = fake.state
    return log


def test_the_shift_is_re_checked_every_minute_whatever_the_screenshot_interval(agent, monkeypatch, tmp_path):
    log = _run_worker_loop(agent, monkeypatch, tmp_path, ticks=20 * 60, interval=15)  # 20 minutes
    assert 18 <= log["polls"] <= 22          # about one settings/shift check a minute, not one per 15 minutes
    assert 1 <= log["shots"] <= 2            # screenshots still follow the 15-minute interval (first one staggered within 45 s)
    seen = log["state"]["shift_seen_at"]
    assert (datetime.now(timezone.utc) - seen).total_seconds() < 5  # the "shift seen" mark is fresh, which the idle logic needs


def test_a_one_minute_interval_still_captures_every_minute(agent, monkeypatch, tmp_path):
    log = _run_worker_loop(agent, monkeypatch, tmp_path, ticks=10 * 60, interval=1)
    assert 8 <= log["shots"] <= 11


def test_the_worker_keeps_capturing_into_the_queue_while_the_server_is_down(agent, monkeypatch, tmp_path):
    log = _run_worker_loop(agent, monkeypatch, tmp_path, ticks=40 * 60, interval=15, settings_fail_from=60)
    assert log["parked"] >= 1  # screenshots taken while the server was unreachable were parked, not lost


def test_a_supervised_loop_restarts_after_an_unexpected_error(agent):
    import types, threading
    stop = threading.Event()
    fake = types.SimpleNamespace(state_lock=threading.Lock(), state={})
    calls = []

    def flaky(cfg, stop_event):
        calls.append(1)
        if len(calls) < 3:
            raise TypeError("float() argument must be a string or a real number, not 'NoneType'")
        stop.set()

    stop.wait = lambda s=None: None  # no real sleeping
    agent.TrackerApp._run_supervised(fake, flaky, {}, stop)
    assert len(calls) == 3 and fake.state["worker_restarts"] == 2


def test_parked_inactivity_logs_are_retried_every_minute_by_the_inactivity_loop(agent, monkeypatch, tmp_path):
    """After an outage the screenshot worker may back off for minutes; the inactivity loop must retry parked logs on its own."""
    agent.park_inactivity(CFG, "a@b.us", START, END)
    calls = []
    monkeypatch.setattr(agent, "flush_pending_inactivity", lambda cfg, email: calls.append(1))

    class Inline:  # runs the thread's work immediately so the test can count it
        def __init__(self, target=None, args=(), **k):
            self.target, self.args = target, args
        def start(self):
            self.target(*self.args)

    import types
    monkeypatch.setattr(agent, "OPEN_IDLE_FILE", str(tmp_path / "open.json"))
    monkeypatch.setattr(agent, "recover_open_idle", lambda cfg: False)
    clock = _Clock(130)  # 130 polls x 5 s = about 11 minutes, no idle at all
    monkeypatch.setattr(agent.time, "monotonic", lambda: clock.t)
    monkeypatch.setattr(agent, "_get_system_idle_seconds", lambda: 0.5)
    monkeypatch.setattr(agent.threading, "Thread", Inline)
    fake = types.SimpleNamespace(state_lock=agent.threading.Lock(), wake_event=agent.threading.Event(),
                                 state={"enabled": True, "shift_active": True, "employee_email": "a@b.us"},
                                 root=types.SimpleNamespace(after=lambda ms, fn: fn()))
    fake._idle_seconds_in_shift = lambda idle: idle
    agent.TrackerApp._inactivity_loop(fake, {"url": "http://x", "employee_email": "a@b.us"}, clock)
    assert 8 <= len(calls) <= 12
