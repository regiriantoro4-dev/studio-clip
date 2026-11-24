"""Telemetri agent untuk halaman Command Center.

"Agent" = bagian AutoClipper yang mengerjakan tugas sendiri-sendiri:
  - agent kerja (job): Analis klip, Video jadi, Auto-Produce, Affiliate, Narasi, dll.
  - agent layanan: Pengunduh, Transkripsi, Otak AI per provider, Render, Thumbnail, Suara TTS.
Setiap tugas dicatat satu baris JSON di data/telemetry/events.jsonl (mulai, selesai, durasi,
status, error). Pencatatan dipasang dengan membungkus fungsi yang sudah ada (install()),
jadi kode lama tidak diubah, dan kegagalan menulis log tidak pernah mengganggu proses.
"""
import functools
import json
import shutil
import threading
import time
from collections import deque
from urllib.parse import urlparse

from .. import config

_LOCK = threading.Lock()
MAX_READ = 20000  # baris terakhir yang dibaca untuk statistik

AGENTS = {
    # id: (nama, peran, kelompok)
    "job:process": ("Analis klip", "Unduh, transkrip, dan pilih momen terbaik jadi klip", "kerja"),
    "job:readymade": ("Video jadi", "Pasang frame/border ke video siap upload", "kerja"),
    "job:autoproduce": ("Auto-Produce", "Produksi banyak klip siap upload sekaligus", "kerja"),
    "job:affiliate": ("Affiliate", "Video produk affiliate dengan narasi", "kerja"),
    "job:narrate": ("Narasi film", "Naskah + suara narator untuk video", "kerja"),
    "job:fix-transcript": ("Perbaikan transkrip", "Merapikan transkrip dengan AI", "kerja"),
    "job:annotate": ("Anotasi", "Menandai momen penting di klip", "kerja"),
    "job:horror": ("Studio Horor", "Cerita, gambar, suara & video horor AI", "kerja"),
    "downloader": ("Pengunduh", "Mengambil video dari link (yt-dlp)", "layanan"),
    "transcriber": ("Transkripsi", "Mengubah suara jadi teks", "layanan"),
    "renderer": ("Render video", "Menyusun video akhir dengan FFmpeg", "layanan"),
    "thumbnail": ("Thumbnail", "Membuat gambar sampul", "layanan"),
    "tts": ("Suara narator", "Text-to-speech (Edge / Gemini)", "layanan"),
    "bumper": ("Animator bumper", "Render intro/outro animasi (HyperFrames)", "layanan"),
}
SKIP_JOBS = {"render"}  # job render sudah tercatat oleh agent layanan "renderer"
# Jenis project -> agent yang memprosesnya (untuk alert "project tertahan")
_STUCK_AGENT = {"affiliate": "job:affiliate", "horror": "job:horror", "readymade": "job:readymade"}


def _dir():
    d = config.DATA_DIR / "telemetry"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file():
    return _dir() / "events.jsonl"


def agent_info(aid: str) -> dict:
    if aid in AGENTS:
        n, r, g = AGENTS[aid]
    elif aid.startswith("llm:"):
        prov = aid[4:]
        n, r, g = f"Otak AI · {prov.capitalize()}", f"Panggilan model bahasa lewat {prov}", "layanan"
    elif aid.startswith("job:"):
        n, r, g = aid[4:].replace("-", " ").capitalize(), "Tugas latar belakang", "kerja"
    else:
        n, r, g = aid, "", "layanan"
    return {"id": aid, "name": n, "role": r, "group": g}


# Panggilan layanan/LLM yang SEDANG berjalan (wrap() mendaftar saat mulai, menghapus saat selesai/gagal).
# Tanpa ini agent layanan tidak pernah tampil "bekerja" di kantor — hanya tercatat setelah selesai.
_INFLIGHT: dict[int, dict] = {}
_IF_LOCK = threading.Lock()
_IF_SEQ = iter(range(1, 1 << 62))


def _job_ctx() -> dict:
    from .. import jobctx
    return jobctx.current() or {}


def record(agent: str, task: str, status: str, started: float, ended: float | None = None,
           error: str = "", ref: str = "", job: str = ""):
    ended = ended if ended is not None else time.time()
    job = job or _job_ctx().get("id", "")  # panggilan di dalam thread job: tandai job asalnya
    try:
        from .media import ringkas_error  # simpan penyebab (akhir log ffmpeg), bukan banner di depannya
        error = ringkas_error(error or "", 400)
    except Exception:  # noqa: BLE001
        pass
    ev = {"agent": agent, "task": str(task)[:120], "status": status, "start": round(started, 3),
          "end": round(ended, 3), "dur": round(max(0.0, ended - started), 3),
          "error": str(error or "")[:400], "ref": str(ref or "")[:60], "job": job}
    try:
        with _LOCK, open(_file(), "a", encoding="utf-8") as f:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _ref_of(args):
    a = args[0] if args else ""
    if isinstance(a, (list, tuple)):
        return f"{len(a)} project" if len(a) != 1 else str(a[0])
    return str(a) if isinstance(a, (str, int)) else ""


def wrap(fn, agent, task_fn=None, ref_fn=None):
    """Bungkus fungsi: catat durasi + sukses/gagal ke log, lalu teruskan hasil/error apa adanya."""
    if getattr(fn, "_telemetry", False):
        return fn

    @functools.wraps(fn)
    def inner(*args, **kwargs):
        aid = agent(*args, **kwargs) if callable(agent) else agent
        task = task_fn(*args, **kwargs) if task_fn else fn.__name__
        ref = ref_fn(*args, **kwargs) if ref_fn else ""
        t0 = time.time()
        ctx = _job_ctx()
        with _IF_LOCK:
            key = next(_IF_SEQ)
            _INFLIGHT[key] = {"agent": aid, "task": str(task)[:120], "job": ctx.get("id", ""),
                              "job_kind": ctx.get("kind", ""), "since": round(t0, 3)}
        try:
            out = fn(*args, **kwargs)
        except BaseException as e:
            record(aid, task, "error", t0, error=str(e) or type(e).__name__, ref=ref)
            raise
        finally:
            with _IF_LOCK:
                _INFLIGHT.pop(key, None)
        record(aid, task, "done", t0, ref=ref)
        return out

    inner._telemetry = True
    return inner


def _provider(cfg) -> str:
    host = urlparse(str((cfg or {}).get("base_url") or "")).netloc.lower()
    for key, name in (("groq", "groq"), ("googleapis", "gemini"), ("openai", "openai"), ("moonshot", "moonshot"),
                      ("anthropic", "anthropic"), ("openrouter", "openrouter"), ("deepseek", "deepseek")):
        if key in host:
            return name
    return host.split(":")[0] or "llm"


def install():
    """Pasang pencatat di fungsi layanan yang sudah ada (dipanggil sekali saat server start)."""
    from . import bumper, downloader, llm, narrate, renderer, thumbnail, transcriber

    downloader.download = wrap(downloader.download, "downloader", lambda url, *a, **k: "Unduh video",
                               lambda url, *a, **k: str(url)[:60])
    transcriber.transcribe = wrap(transcriber.transcribe, "transcriber",
                                  lambda job, workdir, source, provider, *a, **k: f"Transkrip ({provider})",
                                  lambda job, workdir, *a, **k: getattr(workdir, "name", ""))
    llm.chat = wrap(llm.chat, lambda cfg, *a, **k: "llm:" + _provider(cfg),
                    lambda cfg, *a, **k: f"Chat {cfg.get('llm_model') or ''}".strip())
    renderer.render = wrap(renderer.render, "renderer",
                           lambda job, pid, cid, ratio, fmt, *a, **k: f"Render {fmt.upper()} {ratio}",
                           lambda job, pid, cid, *a, **k: f"{pid}/{cid}")
    thumbnail.generate = wrap(thumbnail.generate, "thumbnail", lambda pid, cid, *a, **k: "Buat thumbnail",
                              lambda pid, cid, *a, **k: f"{pid}/{cid}")
    bumper.render = wrap(bumper.render, "bumper", lambda template, *a, **k: f"Bumper {template}")
    narrate.synthesize = wrap(narrate.synthesize, "tts",
                              lambda text, voice, *a, **k: f"Suara {str(voice).split(':')[-1]}")


# ---------------------------------------------------------------- baca & ringkas

def read_events(since: float = 0) -> list[dict]:
    f = _file()
    if not f.exists():
        return []
    out = deque(maxlen=MAX_READ)
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("end", 0) >= since:
                out.append(ev)
    return list(out)


def backfill_if_empty():
    """Pertama kali: isi log dari riwayat export & status project yang sudah ada."""
    f = _file()
    if f.exists() and f.stat().st_size > 0:
        return 0
    from .. import storage
    n = 0
    for p in storage.list_all():
        full = storage.get(p["id"]) or {}
        for c in full.get("clips", []):
            for ex in c.get("exports", []) or []:
                ts = float(ex.get("ts") or 0)
                if ts:
                    record("renderer", f"Render {str(ex.get('format', 'mp4')).upper()} {ex.get('ratio', '')}",
                           "done", ts, ts, ref=f"{full['id']}/{c.get('id')}", job="riwayat")
                    n += 1
        if full.get("status") == "error":
            ts = _ts(full.get("created_at"))
            record("job:process", "Proses project", "error", ts, ts, error=full.get("error") or "", ref=full["id"],
                   job="riwayat")
            n += 1
    return n


def _ts(v):
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return time.mktime(time.strptime(str(v)[:19], "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, TypeError):
        return time.time()


def summarize(hours: float | None = 24) -> dict:
    from .. import jobs, storage
    from . import media

    now = time.time()
    since = now - hours * 3600 if hours else 0
    evs = sorted(read_events(since), key=lambda e: e.get("end", 0))  # urut waktu: terakhir & beruntun benar
    all_recent = read_events(now - 7 * 86400) if hours and hours < 168 else evs

    # agent yang dikenal selalu tampil, walau belum pernah jalan
    stats = {aid: {**agent_info(aid), "total": 0, "done": 0, "error": 0, "dur_sum": 0.0, "dur_n": 0, "dur_max": 0.0,
                   "last": None, "last_error": None, "streak_fail": 0, "running": 0, "series": [0] * 24}
             for aid in AGENTS}
    for ev in evs:
        aid = ev["agent"]
        st = stats.setdefault(aid, {**agent_info(aid), "total": 0, "done": 0, "error": 0, "dur_sum": 0.0, "dur_n": 0,
                                    "dur_max": 0.0, "last": None, "last_error": None, "streak_fail": 0,
                                    "running": 0, "series": [0] * 24})
        st["total"] += 1
        st[ev["status"] if ev["status"] in ("done", "error") else "done"] += 1
        if ev.get("job") != "riwayat":  # riwayat lama tidak punya durasi
            st["dur_sum"] += ev.get("dur", 0)
            st["dur_n"] += 1
            st["dur_max"] = max(st["dur_max"], ev.get("dur", 0))
        st["last"] = ev
        if ev["status"] == "error":
            st["last_error"] = ev
            st["streak_fail"] += 1
        else:
            st["streak_fail"] = 0
        if hours:  # sebaran tugas per jam/slot untuk grafik kecil
            slot = min(23, int((ev["end"] - since) / (hours * 3600) * 24))
            st["series"][max(0, slot)] += 1

    running = []
    for j in list(jobs.JOBS.values()):
        if j.status != "running":
            continue
        started = getattr(j, "started", now)
        aid = "job:" + j.kind if j.kind not in SKIP_JOBS else "renderer"
        if aid in stats:
            stats[aid]["running"] += 1
        else:
            stats[aid] = {**agent_info(aid), "total": 0, "done": 0, "error": 0, "dur_sum": 0.0, "dur_n": 0, "dur_max": 0.0,
                          "last": None, "last_error": None, "streak_fail": 0, "running": 1, "series": [0] * 24}
        running.append({"id": j.id, "agent": aid, "name": agent_info(aid)["name"], "stage": j.stage,
                        "progress": round(j.progress, 3), "elapsed": round(now - started, 1)})

    with _IF_LOCK:
        inflight = sorted((dict(v) for v in _INFLIGHT.values()), key=lambda v: v["since"])
    for inf in inflight:  # layanan/LLM yang sedang dipakai ikut terhitung "bekerja"
        st = stats.setdefault(inf["agent"], {**agent_info(inf["agent"]), "total": 0, "done": 0, "error": 0,
                                             "dur_sum": 0.0, "dur_n": 0, "dur_max": 0.0, "last": None,
                                             "last_error": None, "streak_fail": 0, "running": 0,
                                             "series": [0] * 24})
        st["running"] += 1

    # Kesehatan untuk adegan kantor: jendela tetap 1 jam, tidak ikut rentang panel (kegagalan lama
    # tidak boleh membuat ruangan berkedip merah berhari-hari).
    scene = {}
    for ev in sorted(read_events(now - 3600), key=lambda e: e.get("end", 0)):
        s = scene.setdefault(ev["agent"], {"total": 0, "done": 0, "streak": 0})
        s["total"] += 1
        if ev["status"] == "error":
            s["streak"] += 1
        else:
            s["done"] += 1
            s["streak"] = 0

    agents = []
    for st in stats.values():
        tot = st["total"]
        rate = (st["done"] / tot) if tot else None
        health = _health(tot, st["done"], st["streak_fail"], st["running"])
        sc = scene.get(st["id"], {"total": 0, "done": 0, "streak": 0})
        scene_health = _health(sc["total"], sc["done"], sc["streak"], st["running"])
        agents.append({
            "id": st["id"], "name": st["name"], "role": st["role"], "group": st["group"],
            "total": tot, "done": st["done"], "error": st["error"], "success_rate": rate,
            "avg_dur": round(st["dur_sum"] / st["dur_n"], 2) if st["dur_n"] else None,
            "max_dur": round(st["dur_max"], 2) if st["dur_n"] else None,
            "last_at": st["last"]["end"] if st["last"] else None,
            "last_status": st["last"]["status"] if st["last"] else None,
            "last_error": (st["last_error"] or {}).get("error"), "last_error_at": (st["last_error"] or {}).get("end"),
            "streak_fail": st["streak_fail"], "running": st["running"], "health": health,
            "scene_health": scene_health, "series": st["series"],
        })
    order = {"error": 0, "warning": 1, "running": 2, "ok": 3, "idle": 4}
    agents.sort(key=lambda a: (order[a["health"]], a["group"] != "kerja", -(a["total"] or 0), a["name"]))

    alerts = _alerts(agents, running, all_recent, now, storage, media)
    tot = sum(a["total"] for a in agents)
    ok = sum(a["done"] for a in agents)
    log = sorted(evs, key=lambda e: e["end"], reverse=True)[:300]
    for ev in log:
        ev["agent_name"] = agent_info(ev["agent"])["name"]
    return {
        "now": now, "hours": hours,
        "summary": {"tasks": tot, "done": ok, "error": tot - ok, "success_rate": (ok / tot) if tot else None,
                    "running": len(running), "agents_active": sum(1 for a in agents if a["total"] or a["running"]),
                    "alerts": len(alerts), "critical": sum(1 for a in alerts if a["level"] == "critical"),
                    "avg_dur": _avg([e.get("dur", 0) for e in evs if e.get("job") != "riwayat"])},
        "agents": agents, "running": running, "inflight": inflight, "log": log, "alerts": alerts,
    }


def _health(total: int, done: int, streak_fail: int, running: int) -> str:
    """running > idle/ok; kegagalan beruntun / rasio sukses rendah -> warning/error (warning tidak menimpa running)."""
    rate = (done / total) if total else None
    if total and (streak_fail >= 3 or (total >= 3 and rate < 0.4)):
        return "error"
    if total and (streak_fail >= 1 or (total >= 3 and rate < 0.7)):
        return "running" if running else "warning"
    if running:
        return "running"
    return "ok" if total else "idle"


def _avg(vals):
    return round(sum(vals) / len(vals), 2) if vals else None


def _alerts(agents, running, recent, now, storage, media) -> list[dict]:
    out = []

    def add(level, title, detail, agent=None):
        out.append({"level": level, "title": title, "detail": detail, "agent": agent})

    if not media.has_ffmpeg():
        add("critical", "FFmpeg tidak ditemukan", "Render dan Video jadi tidak bisa berjalan sampai FFmpeg ada di PATH.")
    for a in agents:
        if not a["total"]:
            continue
        if a["streak_fail"] >= 3:
            add("critical", f"{a['name']} gagal {a['streak_fail']}x berturut-turut",
                a["last_error"] or "Lihat task log untuk detail.", a["id"])
        elif a["total"] >= 3 and a["success_rate"] is not None and a["success_rate"] < 0.7:
            lvl = "critical" if a["success_rate"] < 0.4 else "warning"
            add(lvl, f"Tingkat gagal {a['name']} tinggi ({round((1 - a['success_rate']) * 100)}%)",
                f"{a['error']} dari {a['total']} tugas gagal di rentang waktu ini.", a["id"])
    for r in running:
        if r["elapsed"] > 20 * 60:
            add("warning", f"{r['name']} berjalan {int(r['elapsed'] // 60)} menit",
                f"Tahap terakhir: {r['stage'] or '-'}. Mungkin macet atau videonya panjang.", r["agent"])
    limit = [e for e in recent if e["status"] == "error" and e["agent"].startswith("llm:") and now - e["end"] < 3600
             and any(k in e.get("error", "").lower() for k in ("429", "rate", "limit", "quota", "kuota"))]
    if limit:
        provs = sorted({e["agent"][4:] for e in limit})
        add("warning", "Kuota / rate limit AI tercapai", f"{len(limit)} panggilan kena limit dalam 1 jam terakhir "
            f"({', '.join(provs)}). Isi provider cadangan di Pengaturan atau tunggu reset.", limit[-1]["agent"])
    try:
        from .. import jobs
        for p in storage.list_all():
            if p.get("status") != "processing":
                continue
            full = storage.get(p["id"]) or {}
            # Tertahan = job milik project ITU tidak sedang berjalan (job lain yang jalan tidak dihitung;
            # setelah backend restart job lama hilang dari memori -> juga tertahan)
            job = jobs.get(full.get("job_id") or "")
            if job and job.status == "running":
                continue
            agent = _STUCK_AGENT.get(full.get("source_type"), "job:process")
            # Umur dari aktivitas terakhir (project.json disimpan tiap tahap), bukan dari waktu dibuat
            try:
                last = storage.project_dir(p["id"]).joinpath("project.json").stat().st_mtime
            except (OSError, ValueError):
                last = _ts(p.get("created_at"))
            age = now - last
            if age > 30 * 60:
                lama = f"{int(age // 3600)} jam" if age >= 3600 else f"{int(age // 60)} menit"
                add("warning", "Project tertahan di status 'processing'",
                    f"{p.get('title') or p['id']} ({p['id']}) tidak punya proses aktif; aktivitas terakhir "
                    f"{lama} lalu. Proses ulang atau hapus dari Riwayat.", agent)
    except Exception:  # noqa: BLE001
        pass
    try:
        free = shutil.disk_usage(config.DATA_DIR).free / 1e9
        if free < 2:
            add("critical", f"Disk hampir penuh ({free:.1f} GB tersisa)", "Render bisa gagal. Hapus export lama.")
        elif free < 8:
            add("warning", f"Ruang disk menipis ({free:.1f} GB tersisa)", "Pertimbangkan menghapus export lama.")
    except OSError:
        pass
    try:
        s = config.load_settings()
        if not any((v or {}).get("api_key") for v in (s.get("providers") or {}).values()):
            add("info", "Belum ada API key AI", "Judul, hook, dan analisis klip butuh minimal satu provider di Pengaturan.")
    except Exception:  # noqa: BLE001
        pass
    rank = {"critical": 0, "warning": 1, "info": 2}
    out.sort(key=lambda a: rank[a["level"]])
    return out
