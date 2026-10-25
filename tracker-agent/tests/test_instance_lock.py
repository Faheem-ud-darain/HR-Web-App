"""Single-instance lock, run with real separate processes."""
import os
import subprocess
import sys
import textwrap
import time

import pytest

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="uses the flock layer; Windows uses a named mutex")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHILD = textwrap.dedent("""
    import sys, time, os
    from unittest.mock import MagicMock
    for m in ['tkinter','tkinter.ttk','tkinter.messagebox','tkinter.font','pyautogui','mss','pystray','psutil','pynput','pynput.mouse','pynput.keyboard']:
        sys.modules.setdefault(m, MagicMock())
    sys.path.insert(0, {here!r})
    import agent_gui as a
    a.APP_DIR = os.environ['TEST_APP_DIR']
    a.SINGLE_INSTANCE_PORT = int(sys.argv[2])
    mode = sys.argv[1]
    if mode == 'hold':
        assert a.acquire_single_instance_lock()
        shown = []
        a.start_single_instance_listener(lambda: shown.append(1))
        print('HELD', flush=True)
        for _ in range(40):
            time.sleep(0.25)
            if shown:
                print('SHOWN', flush=True); break
        time.sleep(0.5)
    elif mode == 'try':
        print('ACQUIRED' if a.acquire_single_instance_lock() else 'BLOCKED', flush=True)
    elif mode == 'signal':
        print('SIGNALLED' if a.signal_existing_instance() else 'NO_REPLY', flush=True)
""").format(here=HERE)


def run(tmp_path, *args):
    env = dict(os.environ, TEST_APP_DIR=str(tmp_path))
    return subprocess.run([sys.executable, "-c", CHILD, *args], env=env, capture_output=True, text=True, timeout=30).stdout.strip()


def free_port():
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_second_instance_blocked_signalled_and_released(tmp_path):
    port, other_port = str(free_port()), str(free_port())
    env = dict(os.environ, TEST_APP_DIR=str(tmp_path))
    holder = subprocess.Popen([sys.executable, "-c", CHILD, "hold", port], env=env, stdout=subprocess.PIPE, text=True)
    try:
        assert holder.stdout.readline().strip() == "HELD"
        assert run(tmp_path, "try", port) == "BLOCKED"          # port + file lock
        assert run(tmp_path, "try", other_port) == "BLOCKED"    # file lock alone
        assert run(tmp_path, "signal", port) == "SIGNALLED"     # running window is told to show itself
        assert holder.stdout.readline().strip() == "SHOWN"
    finally:
        holder.wait(timeout=15)
    time.sleep(0.2)
    assert run(tmp_path, "try", port) == "ACQUIRED"             # no TIME_WAIT leftovers block a new launch
