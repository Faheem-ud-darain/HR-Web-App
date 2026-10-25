"""hr_tracker_signals row-id cache: a warm heartbeat is a single PATCH."""
from unittest.mock import MagicMock


class Resp:
    def __init__(self, code=200, body=None):
        self.status_code, self._body, self.ok = code, body or {}, code < 400

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def make_http(state, calls):
    http = MagicMock()

    def get(url, params=None, **kw):
        calls.append("GET")
        return Resp(200, {"items": [{"id": state["id"]}] if state["exists"] else []})

    def patch(url, **kw):
        calls.append("PATCH")
        return Resp(200) if state["exists"] and url.endswith("/" + state["id"]) else Resp(404)

    def post(url, **kw):
        calls.append("POST")
        state["exists"] = True
        return Resp(200, {"id": state["id"]})

    http.get, http.patch, http.post = get, patch, post
    return http


def test_cold_then_warm_heartbeat(agent, monkeypatch):
    calls, state = [], {"id": "row1", "exists": True}
    monkeypatch.setattr(agent, "_http", make_http(state, calls))
    agent.set_tracker_signal_field("http://x", "Josh@delcargo.us", "heartbeat", {"n": 1})
    assert calls == ["GET", "PATCH"]
    calls.clear()
    agent.set_tracker_signal_field("http://x", "josh@delcargo.us", "heartbeat", {"n": 2})
    assert calls == ["PATCH"]  # cached id, case-insensitive email


def test_stale_cached_id_recovers(agent, monkeypatch):
    calls, state = [], {"id": "row1", "exists": True}
    monkeypatch.setattr(agent, "_http", make_http(state, calls))
    agent.set_tracker_signal_field("http://x", "a@b.us", "heartbeat", {})
    state["id"] = "row2"  # row deleted and recreated
    calls.clear()
    agent.set_tracker_signal_field("http://x", "a@b.us", "heartbeat", {})
    assert calls == ["PATCH", "GET", "PATCH"]


def test_ensure_row_creates_when_missing_then_caches(agent, monkeypatch):
    calls, state = [], {"id": "row9", "exists": False}
    monkeypatch.setattr(agent, "_http", make_http(state, calls))
    assert agent.ensure_tracker_signals_row_id("http://x", "a@b.us") == "row9"
    assert calls == ["GET", "POST"]
    calls.clear()
    assert agent.ensure_tracker_signals_row_id("http://x", "a@b.us") == "row9"
    assert calls == []
