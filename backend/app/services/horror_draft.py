"""Naskah horor (storyboard) yang bisa diperiksa & diedit SEBELUM produksi.

Alur: AI menulis cerita -> disimpan sebagai draf -> pemilik mengedit narasi, prompt gambar, judul,
deskripsi -> "Produksi" membuat project horor biasa dengan horror_state.json berisi cerita itu.
horror.full_run lalu MELANJUTKAN dari state tersebut (mekanisme resume yang sudah ada), jadi cerita
tidak ditulis ulang oleh AI. Modul horror.py tidak diubah.
"""
import json
import os
import random
import re
import time
import uuid

from .. import config, jobs, storage
from . import horror, horror_sfx

DRAFT_DIR = config.DATA_DIR / "horror_drafts"
TOPIC_MAX = 1500   # endpoint horor biasa memotong 300; di sini topik panjang (mis. riset Hermes) muat utuh
WORDS_MIN, WORDS_MAX = 80, 140
_ID_RE = re.compile(r"^[0-9a-f\-]{8,40}$")
_REAL_RE = re.compile(r"kisah nyata|cerita nyata|kejadian nyata|true story", re.I)


def _file(did: str):
    if not _ID_RE.match(did or ""):
        raise KeyError(did)
    return DRAFT_DIR / f"{did}.json"


def _save(d: dict) -> dict:
    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    f = _file(d["id"])
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, f)
    return d


def get(did: str) -> dict | None:
    try:
        return json.loads(_file(did).read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def delete(did: str) -> bool:
    try:
        _file(did).unlink()
        return True
    except Exception:  # noqa: BLE001
        return False


def list_all() -> list[dict]:
    out = []
    for f in DRAFT_DIR.glob("*.json") if DRAFT_DIR.exists() else []:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": d["id"], "title": d["story"]["title"], "ts": d.get("ts", 0),
                        "pid": d.get("pid", ""), "scenes": len(d["story"]["scenes"])})
        except Exception:  # noqa: BLE001
            continue
    return sorted(out, key=lambda x: -x["ts"])


def clean(story: dict) -> dict:
    """Rapikan cerita hasil edit dengan aturan yang sama seperti cerita dari AI (satu twist, batas panjang)."""
    out = horror._parse_story(json.dumps([story], ensure_ascii=False))
    if not out:
        raise ValueError("Cerita butuh minimal 4 adegan, masing-masing dengan narasi dan prompt gambar.")
    return out


def warnings(story: dict) -> list[str]:
    out = list(horror._story_problems(story))
    words = sum(len(s["narration"].split()) for s in story["scenes"])
    if words < WORDS_MIN:
        out.append(f"narasi hanya {words} kata; video akan lebih pendek dari 45 detik")
    elif words > WORDS_MAX:
        out.append(f"narasi {words} kata; video bisa lebih dari 60 detik")
    if _REAL_RE.search(story["description"] + " " + story["title"]):
        out.append("judul atau deskripsi menyebut 'kisah nyata', padahal ceritanya fiksi")
    if not story["protagonist"]:
        out.append("deskripsi tokoh utama kosong; tokoh bisa berubah-ubah antar gambar")
    return out


def view(d: dict) -> dict:
    words = sum(len(s["narration"].split()) for s in d["story"]["scenes"])
    return {**d, "warnings": warnings(d["story"]), "words": words,
            "sfx_names": ["none", *horror_sfx.NAMES]}


def _write(d: dict) -> dict:
    """Minta AI menulis (ulang) cerita untuk draf ini."""
    settings = config.load_settings()
    provider = d.get("llm_provider") or settings["llm_provider"]
    pov = d["pov"] if d["pov"] in horror.POVS else random.choice(list(horror.POVS))
    avoid = [h.get("title", "") for h in horror._history()]
    story = horror.generate_story(random.choice(horror.CATEGORIES), d["topic"], avoid, provider, settings, pov)
    story["pov"] = pov
    d["story"] = story
    d["ts"] = time.time()
    return _save(d)


def create(topic: str, pov: str, style: str, voice: str, llm_provider: str = "") -> dict:
    d = {"id": uuid.uuid4().hex[:16], "topic": topic.strip()[:TOPIC_MAX], "pov": pov, "style": style,
         "voice": voice, "llm_provider": llm_provider, "pid": ""}
    return _write(d)


def rewrite(did: str) -> dict | None:
    d = get(did)
    return _write(d) if d else None


def update(did: str, story: dict, voice: str = "", style: str = "") -> dict | None:
    d = get(did)
    if not d:
        return None
    new = clean(story)
    new["pov"] = d["story"].get("pov") or "kamu"
    d["story"] = new
    if voice:
        d["voice"] = voice
    if style in horror.STYLES:
        d["style"] = style
    return _save(d)


def produce(did: str) -> dict:
    """Buat project horor dari draf dan mulai produksi dengan cerita yang sudah diedit."""
    d = get(did)
    if not d:
        raise KeyError(did)
    story = clean(d["story"])
    story["pov"] = d["story"].get("pov") or "kamu"
    topic = d["topic"][:300]
    pov = story["pov"]
    p = storage.create(story["title"], "horror")
    p["horror"] = {"n": 1, "voice": d["voice"], "topic": topic, "style": d["style"], "pov": pov, "draft": did}
    if d.get("llm_provider"):
        p["options"] = {"llm_provider": d["llm_provider"]}
    p["status"] = "processing"
    storage.save(p)
    # full_run membaca state ini sebagai "proses terputus" dan langsung memakai ceritanya
    horror._write_state(storage.project_dir(p["id"]) / "horror_state.json",
                        {"done": False, "attempts": 0, "stories": [story]})
    job = jobs.start("horror", horror.full_run, p["id"], 1, d["voice"], topic, d["style"], pov)
    p = storage.get(p["id"])
    p["job_id"] = job.id
    storage.save(p)
    d["pid"] = p["id"]
    _save(d)
    return {"pid": p["id"], "job_id": job.id, "title": story["title"]}
