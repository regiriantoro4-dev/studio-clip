"""Penyimpanan project berbasis file JSON — riwayat tersimpan di data/projects/<id>/.

Penulisan atomik (tmp + os.replace) dan pembacaan dengan retry, karena job thread
dan endpoint bisa menyentuh file yang sama hampir bersamaan.
"""
import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path

from . import config


def _write_json_atomic(path: Path, data, attempts: int = 5):
    last = None
    for i in range(attempts):
        # Nama tmp unik per penulisan — penulis paralel tidak saling bentrok
        tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex[:8]}.tmp")
        try:
            tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, path)
            return
        except OSError as e:  # PermissionError saat file tujuan sedang dibaca (Windows)
            last = e
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            time.sleep(0.05 * (i + 1))
    raise last


def _read_json_retry(path: Path, attempts: int = 4):
    last = None
    for i in range(attempts):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            last = e
            time.sleep(0.05 * (i + 1))
    raise last

DEFAULT_STYLE = {
    "preset": "beasty",
    "font": "Arial Black",
    "size": 1.0,
    "pos": 74,          # posisi vertikal teks, % dari atas
    "uppercase": True,
    "color": "#FFFFFF",
    "highlight": "#FFD100",
}

DEFAULT_HOOK_STYLE = {
    "template": "classic",  # classic | elegant | boxies | box
    "pos": 14,              # posisi vertikal hook, % dari atas
    "size": 1.0,
    "enabled": True,
}

DEFAULT_FX = {
    "zoom": True,             # punch-in zoom tiap ganti kalimat
    "zoom_strength": 0.08,    # kekuatan zoom (0.08 = 8%)
    "cut_silence": True,      # buang jeda hening (jump cut)
    "silence_gap": 0.7,       # jeda minimal yang dipotong (detik)
    "keywords": True,         # sorot kata kunci hasil anotasi AI
    "emoji": True,            # tampilkan emoji hasil anotasi AI
    "progress_bar": True,     # bar retensi di bawah video
    "progress_color": "#7C5CFF",
    "teaser": True,           # cold-open: momen dramatis ditaruh di awal klip
    "bgm": "",                # nama file musik latar di data/assets/music/
    "bgm_volume": 0.12,       # volume musik (auto-ducking saat ada suara)
    "border": True,           # pakai border brand (kalau aktif di Pengaturan)
    "border_theme": "",       # tema khusus klip ini; kosong = ikut default Pengaturan
}


# Aturan voice over per jenis project (permintaan user, 13 Nov 2026):
# - video yang DIGENERATE (gambar/foto -> video) WAJIB pakai narator
# - klip jadi (potongan video asli / video siap upload) TIDAK pakai narator, suara asli dipakai
VOICEOVER_REQUIRED = {"horror", "affiliate"}
VOICEOVER_FORBIDDEN = {"readymade"}


def voiceover_policy(p: dict) -> str:
    """'wajib' | 'dilarang' | 'opsional' untuk project ini.

    upload/youtube = klip jadi -> dilarang, kecuali Mode Narasi film (mode 'narasi') yang
    memang sengaja dibuat bernarasi.
    """
    st = p.get("source_type")
    if st in VOICEOVER_REQUIRED:
        return "wajib"
    if st in VOICEOVER_FORBIDDEN:
        return "dilarang"
    return "opsional" if p.get("mode") == "narasi" else "dilarang"


PID_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")  # format dari create(): 20261113-195851-9a5c44


def valid_pid(pid) -> bool:
    return isinstance(pid, str) and bool(PID_RE.match(pid))


def project_dir(pid: str) -> Path:
    # Satu-satunya jalan dari ID ke folder: ID aneh ("..", ".\\", path absolut) ditolak di sini,
    # supaya tidak ada endpoint yang bisa membaca/menghapus di luar data/projects.
    if not valid_pid(pid):
        raise ValueError(f"ID project tidak valid: {str(pid)[:40]!r}")
    return config.PROJECTS_DIR / pid


def _file(pid: str) -> Path:
    return project_dir(pid) / "project.json"


def create(title: str, source_type: str, extra: dict | None = None) -> dict:
    config.ensure_dirs()
    pid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    d = project_dir(pid)
    (d / "exports").mkdir(parents=True, exist_ok=True)
    p = {
        "id": pid,
        "title": title or "Tanpa Judul",
        "source_type": source_type,       # upload | youtube
        "status": "new",                  # new | processing | ready | error
        "error": "",
        "job_id": "",
        "created_at": time.time(),
        "source_file": "",
        "source_url": "",
        "duration": 0,
        "width": 0,
        "height": 0,
        "options": {},
        "clips": [],
    }
    if extra:
        p.update(extra)
    save(p)
    return p


def save(p: dict):
    _write_json_atomic(_file(p["id"]), p)


def get(pid: str) -> dict | None:
    if not valid_pid(pid):
        return None
    f = _file(pid)
    if not f.exists():
        return None
    return _read_json_retry(f)


def list_all() -> list[dict]:
    config.ensure_dirs()
    out = []
    for d in sorted(config.PROJECTS_DIR.iterdir(), reverse=True):
        f = d / "project.json"
        if not f.exists():
            continue
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        item = {k: p.get(k) for k in ("id", "title", "status", "created_at", "duration", "source_type", "error")}
        item["clips_count"] = len(p.get("clips") or [])
        out.append(item)
    return out


def delete(pid: str) -> bool:
    """Hapus SATU project: ID harus valid, folder harus berisi project.json, dan letaknya tepat
    di dalam data/projects. Tidak pernah glob/rmtree di luar itu (pernah ada insiden)."""
    if not valid_pid(pid):
        return False
    d = project_dir(pid)
    root = config.PROJECTS_DIR.resolve()
    if d.resolve().parent != root or not (d / "project.json").is_file():
        return False
    shutil.rmtree(d, ignore_errors=True)
    return True


def transcript_file(pid: str) -> Path:
    return project_dir(pid) / "transcript.json"


def get_transcript(pid: str) -> dict | None:
    f = transcript_file(pid)
    if not f.exists():
        return None
    return _read_json_retry(f)


def save_transcript(pid: str, transcript: dict):
    _write_json_atomic(transcript_file(pid), transcript)
