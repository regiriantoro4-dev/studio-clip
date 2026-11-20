import json
import time

import pytest

from app import jobs
from app.services import telemetry

from .test_jobctx import wait_until


@pytest.fixture(autouse=True)
def tmp_telemetry(tmp_path, monkeypatch):
    monkeypatch.setattr(telemetry, "_dir", lambda: tmp_path)
    yield tmp_path


def agent(summary, aid):
    return next(a for a in summary["agents"] if a["id"] == aid)


def test_inflight_visible_during_call():
    seen = {}

    def speak():
        seen["s"] = telemetry.summarize(24)

    telemetry.wrap(speak, "tts", lambda: "Suara uji")()
    s = seen["s"]
    assert [i["agent"] for i in s["inflight"]] == ["tts"]
    assert s["inflight"][0]["task"] == "Suara uji"
    assert agent(s, "tts")["running"] == 1


def test_inflight_cleared_after_success_and_error():
    telemetry.wrap(lambda: None, "tts")()

    def boom():
        raise ValueError("gagal")

    with pytest.raises(ValueError):
        telemetry.wrap(boom, "renderer")()
    s = telemetry.summarize(24)
    assert s["inflight"] == []
    assert agent(s, "tts")["running"] == 0
    assert agent(s, "renderer")["running"] == 0


def test_record_fills_job_from_context(tmp_telemetry):
    j = jobs.start("tes", lambda job: telemetry.wrap(lambda: None, "tts")())
    wait_until(lambda: j.status == "done")
    evs = [json.loads(line) for line in (tmp_telemetry / "events.jsonl").read_text(encoding="utf-8").splitlines()]
    tts = [e for e in evs if e["agent"] == "tts"]
    assert tts and tts[0]["job"] == j.id


def test_inflight_carries_job_kind():
    seen = {}

    def ask():
        seen["s"] = telemetry.summarize(24)

    j = jobs.start("horror", lambda job: telemetry.wrap(ask, "llm:groq")())
    wait_until(lambda: j.status == "done")
    inf = seen["s"]["inflight"][0]
    assert (inf["agent"], inf["job"], inf["job_kind"]) == ("llm:groq", j.id, "horror")


def test_scene_health_uses_last_hour():
    old = time.time() - 3 * 3600
    for k in range(3):
        telemetry.record("renderer", "Render", "error", old + k, old + k + 1, error="x")
    a = agent(telemetry.summarize(24), "renderer")
    assert a["health"] == "error"
    assert a["scene_health"] == "idle"


def test_horror_agent_registered():
    a = agent(telemetry.summarize(24), "job:horror")
    assert a["name"] == "Studio Horor"
    assert a["group"] == "kerja"
