"""Pabrik konten: antrean persisten, retry sekali, lanjut setelah restart, nama file tidak menimpa."""
import time

import pytest

from app import storage
from app.services import autoproduce, factory


@pytest.fixture
def fac(tmp_path, monkeypatch):
    monkeypatch.setattr(factory, "QUEUE_FILE", tmp_path / "factory" / "queue.json")
    projects = {}

    def create(title, kind, extra=None):
        pid = f"p{len(projects) + 1}"
        projects[pid] = {"id": pid, "title": title, "source_type": kind}
        return dict(projects[pid])

    monkeypatch.setattr(storage, "create", create)
    monkeypatch.setattr(storage, "get", lambda pid: dict(projects[pid]) if pid in projects else None)
    monkeypatch.setattr(storage, "save", lambda p: projects.__setitem__(p["id"], dict(p)))
    factory._CURRENT.clear()
    return projects


def _wait(cond, timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def test_batch_runs_all_items_in_order(fac, monkeypatch):
    calls = []

    def fake_run(job, pid, n, voice, topic, style, pov):
        calls.append((pid, n, topic))
        fac[pid]["title"] = f"Judul {topic or 'AI'}"
        return {"files": [f"{len(calls):02d}_x.mp4"]}

    monkeypatch.setattr(factory.horror, "full_run", fake_run)
    factory.add_batch(3, ["topik A"], "sinematik", "kamu", "omnivoice:narator_d")
    factory.set_paused(False)
    assert _wait(lambda: factory.snapshot()["counts"]["done"] == 3)
    assert [c[2] for c in calls] == ["topik A", "", ""]
    assert all(c[1] == 1 for c in calls)
    snap = factory.snapshot()
    assert snap["items"][0]["title"] == "Judul topik A"
    assert len({it["pid"] for it in snap["items"]}) == 3


def test_failed_item_retried_once_on_same_project_then_skipped(fac, monkeypatch):
    seen = []

    def fake_run(job, pid, n, voice, topic, style, pov):
        seen.append(pid)
        if topic == "rusak":
            raise RuntimeError("ComfyUI mati")
        return {"files": []}

    monkeypatch.setattr(factory.horror, "full_run", fake_run)
    factory.add_batch(2, ["rusak", "bagus"], "sinematik", "kamu", "v")
    factory.set_paused(False)
    assert _wait(lambda: factory.snapshot()["counts"]["done"] == 1
                 and factory.snapshot()["counts"]["error"] == 1)
    items = factory.snapshot()["items"]
    assert items[0]["status"] == "error" and items[0]["attempts"] == 2
    assert "ComfyUI mati" in items[0]["error"]
    assert seen.count(items[0]["pid"]) == 2  # dicoba ulang di project yang sama (melanjutkan state)


def test_pause_keeps_queue_and_resume_on_boot(fac, monkeypatch):
    monkeypatch.setattr(factory.horror, "full_run", lambda *a, **k: {"files": []})
    factory.add_batch(2, [], "sinematik", "kamu", "v")
    snap = factory.snapshot()
    assert snap["paused"] is True and snap["counts"]["pending"] == 2
    # Simulasi backend mati saat item pertama jalan
    data = factory._load()
    data["items"][0]["status"] = "running"
    data["paused"] = False
    factory._save(data)
    factory.resume_on_boot()
    assert _wait(lambda: factory.snapshot()["counts"]["done"] == 2)


def test_remove_and_clear(fac, monkeypatch):
    factory.add_batch(2, [], "sinematik", "kamu", "v")
    ids = [it["id"] for it in factory.snapshot()["items"]]
    assert factory.remove(ids[0]) is True
    assert factory.snapshot()["counts"]["pending"] == 1
    assert factory.clear_finished() == 0


def test_unique_base_continues_numbering(tmp_path):
    (tmp_path / "01_Judul.mp4").write_text("x")
    (tmp_path / "02_Lain.mp4").write_text("x")
    assert autoproduce._unique_base(tmp_path, 1, "Judul") == "03_Judul"
    assert autoproduce._unique_base(tmp_path, 5, "Baru") == "05_Baru"
    empty = tmp_path / "kosong"
    empty.mkdir()
    assert autoproduce._unique_base(empty, 1, "A") == "01_A"
