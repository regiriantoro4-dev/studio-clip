"""Pabrik konten: antrean produksi video horor yang berjalan sendiri sampai target tercapai.

- Antrean disimpan di data/factory/queue.json (atomik), jadi tetap ada setelah backend restart.
- Satu worker thread, satu video per giliran (GPU 8 GB tidak muat dua job SDXL/parallax sekaligus).
- Tiap item = satu project horor n=1. Gagal -> dicoba lagi sekali (melanjutkan horror_state),
  lalu ditandai error dan antrean lanjut ke item berikutnya.
- Saat backend start dan antrean belum dijeda, worker otomatis lanjut (item yang terputus
  diteruskan dari state-nya).
"""
import threading
import time
import traceback
import uuid

from .. import config, jobctx, jobs, storage
from . import horror

QUEUE_FILE = config.DATA_DIR / "factory" / "queue.json"
MAX_ITEMS = 200
MAX_TOPIC = 800
MAX_ATTEMPTS = 2

_LOCK = threading.RLock()
_WORKER: threading.Thread | None = None
_CURRENT: dict = {}  # {"item": id, "job": id} selama ada yang diproduksi


def _load() -> dict:
    try:
        data = storage._read_json_retry(QUEUE_FILE) if QUEUE_FILE.exists() else {}
    except Exception:  # noqa: BLE001
        data = {}
    data.setdefault("schema", 1)
    data.setdefault("paused", True)
    data.setdefault("items", [])
    return data


def _save(data: dict) -> None:
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    storage._write_json_atomic(QUEUE_FILE, data)


def _find(data: dict, item_id: str) -> dict | None:
    return next((it for it in data["items"] if it["id"] == item_id), None)


def snapshot() -> dict:
    """Status untuk UI: antrean + progres job yang sedang jalan."""
    with _LOCK:
        data = _load()
    items = data["items"]
    count = {s: sum(1 for it in items if it["status"] == s) for s in ("pending", "running", "done", "error")}
    cur = None
    if _CURRENT.get("job"):
        j = jobs.get(_CURRENT["job"])
        if j:
            cur = {"item": _CURRENT.get("item"), "stage": j.stage, "progress": round(j.progress, 4)}
    done_t = [it["finished"] - it["started"] for it in items
              if it["status"] == "done" and it.get("started") and it.get("finished")]
    avg = sum(done_t) / len(done_t) if done_t else 0
    return {
        "paused": data["paused"],
        "worker_alive": bool(_WORKER and _WORKER.is_alive()),
        "counts": count,
        "avg_seconds": round(avg),
        "eta_seconds": round(avg * (count["pending"] + count["running"])) if avg else None,
        "current": cur,
        "items": items,
    }


def add_batch(count: int, topics: list[str], style: str, pov: str, voice: str,
              llm_provider: str = "") -> list[dict]:
    """Tambah item ke antrean. Topik diisi berurutan; sisanya kosong = AI memilih ide sendiri."""
    topics = [str(t).strip()[:MAX_TOPIC] for t in (topics or []) if str(t).strip()]
    count = max(int(count or 0), len(topics))
    with _LOCK:
        data = _load()
        room = MAX_ITEMS - len(data["items"])
        if room <= 0:
            raise ValueError(f"Antrean penuh ({MAX_ITEMS} item). Bersihkan item yang sudah selesai dulu.")
        count = min(count, room)
        new = []
        for i in range(count):
            new.append({
                "id": uuid.uuid4().hex[:10],
                "topic": topics[i] if i < len(topics) else "",
                "style": style, "pov": pov, "voice": voice, "llm_provider": llm_provider,
                "status": "pending", "attempts": 0, "pid": "", "job_id": "",
                "title": "", "files": [], "error": "",
                "created": time.time(), "started": None, "finished": None,
            })
        data["items"].extend(new)
        _save(data)
    return new


def set_paused(paused: bool) -> None:
    with _LOCK:
        data = _load()
        data["paused"] = bool(paused)
        _save(data)
    if not paused:
        ensure_worker()


def remove(item_id: str) -> bool:
    """Hapus item dari antrean (hanya yang belum/tidak berjalan). Project & video TIDAK dihapus."""
    with _LOCK:
        data = _load()
        it = _find(data, item_id)
        if not it or it["status"] == "running":
            return False
        data["items"] = [x for x in data["items"] if x["id"] != item_id]
        _save(data)
    return True


def retry(item_id: str) -> bool:
    with _LOCK:
        data = _load()
        it = _find(data, item_id)
        if not it or it["status"] != "error":
            return False
        it.update(status="pending", attempts=0, error="")
        _save(data)
    ensure_worker()
    return True


def clear_finished() -> int:
    """Buang item 'done' dari daftar antrean (file video di Siap Upload tetap ada)."""
    with _LOCK:
        data = _load()
        before = len(data["items"])
        data["items"] = [x for x in data["items"] if x["status"] != "done"]
        _save(data)
        return before - len(data["items"])


def ensure_worker() -> None:
    global _WORKER
    with _LOCK:
        if _WORKER and _WORKER.is_alive():
            return
        _WORKER = threading.Thread(target=_loop, name="pabrik-konten", daemon=True)
        _WORKER.start()


def resume_on_boot() -> None:
    """Dipanggil saat backend start: item 'running' yang terputus dikembalikan ke antrean."""
    try:
        with _LOCK:
            data = _load()
            changed = False
            for it in data["items"]:
                if it["status"] == "running":
                    it["status"] = "pending"  # pid tetap -> full_run melanjutkan horror_state
                    changed = True
            if changed:
                _save(data)
            has_work = any(it["status"] == "pending" for it in data["items"])
            paused = data["paused"]
        if has_work and not paused:
            ensure_worker()
    except Exception:  # noqa: BLE001
        traceback.print_exc()


def _next_item() -> dict | None:
    with _LOCK:
        data = _load()
        if data["paused"]:
            return None
        it = next((x for x in data["items"] if x["status"] == "pending"), None)
        if not it:
            return None
        it["status"] = "running"
        it["started"] = it.get("started") or time.time()
        _save(data)
        return dict(it)


def _update(item_id: str, **patch) -> None:
    with _LOCK:
        data = _load()
        it = _find(data, item_id)
        if it:
            it.update(patch)
            _save(data)


def _project_for(it: dict) -> str:
    """Pakai project lama item ini (supaya melanjutkan state) atau buat yang baru."""
    pid = it.get("pid") or ""
    if pid:
        try:
            if storage.get(pid):
                return pid
        except Exception:  # noqa: BLE001
            pass
    p = storage.create((it["topic"][:60] or "Pabrik konten horor"), "horror")
    p["horror"] = {"n": 1, "voice": it["voice"], "topic": it["topic"], "style": it["style"], "pov": it["pov"]}
    p["factory_item"] = it["id"]
    if it.get("llm_provider"):
        p["options"] = {"llm_provider": it["llm_provider"]}
    storage.save(p)
    _update(it["id"], pid=p["id"])
    return p["id"]


def _run_one(it: dict) -> None:
    pid = _project_for(it)
    job = jobs.Job("horror")
    jobs.JOBS[job.id] = job
    _CURRENT.update(item=it["id"], job=job.id)
    p = storage.get(pid)
    p["status"] = "processing"
    p["job_id"] = job.id
    storage.save(p)
    _update(it["id"], job_id=job.id)
    jobctx.bind(job.id, job.kind)
    try:
        out = horror.full_run(job, pid, 1, it["voice"], it["topic"], it["style"], it["pov"])
        job.result, job.progress, job.status = out, 1.0, "done"
        p = storage.get(pid) or {}
        _update(it["id"], status="done", finished=time.time(), error="",
                title=p.get("title", ""), files=list((out or {}).get("files") or []))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        job.status, job.error = "error", str(e)
        attempts = int(it.get("attempts") or 0) + 1
        if attempts < MAX_ATTEMPTS:
            _update(it["id"], status="pending", attempts=attempts, error=str(e)[:500])
        else:
            _update(it["id"], status="error", attempts=attempts, error=str(e)[:500], finished=time.time())
    finally:
        jobs._log(job, (pid,))
        _CURRENT.clear()


def _loop() -> None:
    while True:
        it = _next_item()
        if not it:
            return
        try:
            _run_one(it)
        except Exception as e:  # noqa: BLE001  (gagal sebelum job mulai, mis. disk penuh)
            traceback.print_exc()
            _update(it["id"], status="error", error=f"Gagal menyiapkan: {e}"[:500], finished=time.time())
