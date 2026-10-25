"""Imports agent_gui without a display or the desktop-only packages: GUI and
screen-capture modules are replaced with stubs when they aren't importable (CI
runs headless on Linux). Pillow and requests are used for real when present."""
import importlib
import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

for _name in ("tkinter", "tkinter.ttk", "tkinter.messagebox", "tkinter.font"):
    sys.modules[_name] = MagicMock()  # never needs a real display

for _name in ("pyautogui", "mss", "pystray", "psutil", "pynput", "pynput.mouse", "pynput.keyboard",
              "PIL", "PIL.Image", "PIL.ImageDraw", "PIL.ImageTk"):
    try:
        importlib.import_module(_name)
    except Exception:
        sys.modules[_name] = MagicMock()

import agent_gui  # noqa: E402


@pytest.fixture
def agent(tmp_path, monkeypatch):
    """agent_gui with its temp dir and app dir pointed at a throwaway folder."""
    monkeypatch.setattr(agent_gui.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(agent_gui, "APP_DIR", str(tmp_path / "app"))
    monkeypatch.setattr(agent_gui, "PENDING_INACTIVITY_FILE", str(tmp_path / "pending.json"))
    monkeypatch.setattr(agent_gui, "LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.setattr(agent_gui, "LOG_FILE", str(tmp_path / "logs" / "tracker.log"))
    agent_gui._TRACKER_SIGNAL_ROW_IDS.clear()
    return agent_gui
