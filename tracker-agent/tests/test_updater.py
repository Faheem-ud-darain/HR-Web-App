"""Background update staging, checksum verification and apply hand-off."""
import hashlib
import os
import subprocess
import sys
from unittest.mock import MagicMock

import pytest


def fake_download(payload=b"x" * 2_000_000, total=None):
    def _dl(url, dest, cb=None):
        with open(dest, "wb") as f:
            f.write(payload)
        return len(payload), (len(payload) if total is None else total)
    return _dl


def fake_checksum(agent, monkeypatch, payload, text=None):
    digest = hashlib.sha256(payload).hexdigest()
    resp = MagicMock(text=text if text is not None else f"{digest}  file")
    monkeypatch.setattr(agent.requests, "get", lambda *a, **k: resp)


def test_stages_verified_download(agent, monkeypatch):
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    payload = b"x" * 2_000_000
    monkeypatch.setattr(agent, "_download_with_progress", fake_download(payload))
    fake_checksum(agent, monkeypatch, payload)
    path = agent.stage_update_download("25")
    assert path.endswith("DelCargo_Tracker_Setup_v25.exe") and os.path.exists(path)
    assert not os.path.exists(path + ".part")


def test_reuses_already_staged_file(agent, monkeypatch):
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    payload = b"x" * 2_000_000
    monkeypatch.setattr(agent, "_download_with_progress", fake_download(payload))
    fake_checksum(agent, monkeypatch, payload)
    first = agent.stage_update_download("25")
    monkeypatch.setattr(agent, "_download_with_progress", lambda *a, **k: pytest.fail("re-downloaded"))
    assert agent.stage_update_download("25") == first


@pytest.mark.parametrize("label,dl,checksum_text", [
    ("truncated", fake_download(b"x" * 1_500_000, total=2_000_000), None),
    ("tiny", fake_download(b"x" * 10), None),
    ("checksum mismatch", fake_download(), "0" * 64 + "  file"),
    ("no checksum published", fake_download(), "not a checksum"),
])
def test_rejects_bad_downloads_and_cleans_up(agent, monkeypatch, tmp_path, label, dl, checksum_text):
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    monkeypatch.setattr(agent, "_download_with_progress", dl)
    fake_checksum(agent, monkeypatch, b"x" * 2_000_000, checksum_text)
    assert agent.stage_update_download("26") is None
    assert not [p for p in os.listdir(tmp_path) if "v26" in p], label


def test_checksum_fetch_failure_fails_closed(agent, monkeypatch):
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    monkeypatch.setattr(agent, "_download_with_progress", fake_download())
    monkeypatch.setattr(agent.requests, "get", MagicMock(side_effect=OSError("offline")))
    assert agent.stage_update_download("27") is None


def test_windows_launch_is_silent_and_detached(agent, monkeypatch):
    monkeypatch.setattr(agent.platform, "system", lambda: "Windows")
    popen = MagicMock()
    monkeypatch.setattr(agent.subprocess, "Popen", popen)
    assert agent.launch_staged_update("C:/tmp/setup.exe", "25") is True
    assert popen.call_args[0][0] == ["C:/tmp/setup.exe", "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]


@pytest.mark.skipif(sys.platform != "darwin", reason="runs the real macOS swap script")
def test_mac_swap_and_failure_recovery(agent, monkeypatch, tmp_path):
    root = tmp_path
    app = root / "Apps" / "DelCargo Tracker.app"
    (app / "Contents" / "MacOS").mkdir(parents=True)
    (app / "Contents" / "MacOS" / "x").write_text("old")
    src = root / "src" / "DelCargo Tracker.app" / "Contents" / "MacOS"
    src.mkdir(parents=True)
    (src / "x").write_text("new")
    zip_path = root / "DelCargo-Tracker-Mac_v25.zip"
    subprocess.check_call(["/usr/bin/ditto", "-c", "-k", "--keepParent", str(root / "src" / "DelCargo Tracker.app"), str(zip_path)])
    bin_dir = root / "bin"
    bin_dir.mkdir()
    (bin_dir / "open").write_text(f'#!/bin/sh\necho "$@" >> {root}/open.log\n')
    (bin_dir / "open").chmod(0o755)
    env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}")

    captured = {}
    # Scoped: agent.subprocess IS the subprocess module, so a lasting patch
    # would also break the real subprocess calls this test makes below.
    with monkeypatch.context() as m:
        m.setattr(agent.platform, "system", lambda: "Darwin")
        m.setattr(agent.sys, "frozen", True, raising=False)
        m.setattr(agent.sys, "executable", str(app / "Contents" / "MacOS" / "x"))
        m.setattr(agent.os, "getpid", lambda: 999999999)  # "already exited"
        m.setattr(agent.subprocess, "Popen", lambda cmd, **k: captured.setdefault("cmd", cmd))
        assert agent.launch_staged_update(str(zip_path), "25") is True
    script = captured["cmd"][1]

    subprocess.check_call(["/bin/sh", script], env=env, timeout=30)
    assert (app / "Contents" / "MacOS" / "x").read_text() == "new"
    assert not (root / "Apps" / "DelCargo Tracker.app.old").exists()

    # Corrupt zip: old app must survive, a marker stops the retry loop.
    zip_path.write_bytes(b"not a zip")
    (app / "Contents" / "MacOS" / "x").write_text("old2")
    subprocess.call(["/bin/sh", script], env=env, timeout=30)
    assert (app / "Contents" / "MacOS" / "x").read_text() == "old2"
    assert (root / "delcargo_update_failed_v25").exists()
    monkeypatch.setattr(agent.platform, "system", lambda: "Darwin")
    assert agent.stage_update_download("25") is None
