"""Batch variasi dari folder aset, dengan tema yang BELUM pernah dipakai di batch sebelumnya.

Memakai mesin variasi app (backend/app/services/variasi.py) di proses ini saja. Project dikerjakan di
folder kerja terpisah, lalu setelah selesai dipindah ke data app supaya muncul di Galeri variasi.

  python batch_baru.py <folder_aset> <jumlah_variasi_per_aset> <folder_kerja>
"""
import json
import shutil
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
from app import config, storage  # noqa: E402
from app.services import variasi  # noqa: E402

EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
REAL_PROJECTS = config.PROJECTS_DIR


def used_themes() -> set[str]:
    """Nama tema yang sudah dipakai: semua daftar_variasi.json di Siap Upload + project variasi di app."""
    used = set()
    for f in config.OUTPUT_DIR.glob("*/daftar_variasi.json"):
        try:
            for row in json.loads(f.read_text(encoding="utf-8")):
                used.add(str(row.get("tema_border") or row.get("tema_frame") or ""))
        except Exception:  # noqa: BLE001
            pass
    used.discard("")
    return used


class Job:
    def set(self, stage=None, progress=None):
        if stage and ("Render" in stage or "dilewati" in stage or "Selesai" in stage):
            print("   ", stage, flush=True)


def main(src_dir: str, n: int, work: str):
    assets = sorted(p for p in Path(src_dir).iterdir() if p.is_file() and p.suffix.lower() in EXT)
    if not assets:
        raise SystemExit("Folder aset kosong.")
    used = used_themes()
    orig_pool = variasi.theme_pool
    variasi.theme_pool = lambda blocked=(): [f for f in orig_pool(blocked) if f["name"] not in used]
    print(f"{len(assets)} aset, {n} variasi per aset. Tema yang dihindari: {len(used)}; tersedia: {len(variasi.theme_pool())}", flush=True)

    recipes = variasi.make_recipes(len(assets), n, True, True)
    bid = variasi.new_batch_id()
    folder = variasi.batch_folder(bid)
    config.PROJECTS_DIR = Path(work) / bid
    config.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

    pids = []
    for i, a in enumerate(assets):
        p = storage.create(f"Aset {i + 1}", "readymade", {"options": {
            "ratio": "auto", "theme": "", "frame_title": "",
            "variasi": {"batch": bid, "index": i + 1, "folder": str(folder), "recipes": recipes[i]}}})
        dest = storage.project_dir(p["id"]) / f"source{a.suffix.lower()}"
        shutil.copy(a, dest)
        p["source_file"] = str(dest)
        storage.save(p)
        pids.append(p["id"])
        time.sleep(1.1)  # id project memuat detik; jangan sampai kembar
    finish(pids, folder)


def resume(work_batch: str):
    """Lanjutkan batch yang terhenti: `python batch_baru.py --lanjut <folder_kerja>/<id batch>`."""
    config.PROJECTS_DIR = Path(work_batch)
    pids = sorted(d.name for d in config.PROJECTS_DIR.iterdir() if (d / "project.json").exists())
    if not pids:
        raise SystemExit("Tidak ada project di folder kerja itu.")
    info = storage.get(pids[0])["options"]["variasi"]
    print(f"melanjutkan batch {info['batch']}: {len(pids)} aset", flush=True)
    finish(pids, Path(info["folder"]))


def finish(pids, folder):
    t = time.time()
    res = variasi.run(Job(), pids)
    print("hasil:", res, f"{round(time.time() - t)} dtk", flush=True)
    if res["failed"]:
        print("ada yang gagal; project TIDAK dipindah, jalankan --lanjut lagi", flush=True)
        return

    # pindahkan project ke data app supaya tampil di Galeri variasi
    for pid in pids:
        src = config.PROJECTS_DIR / pid
        dst = REAL_PROJECTS / pid
        shutil.move(str(src), str(dst))
        pj = dst / "project.json"
        d = json.loads(pj.read_text(encoding="utf-8"))
        d["source_file"] = str(dst / Path(d["source_file"]).name)
        pj.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print("folder:", folder, flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "--lanjut":
        resume(sys.argv[2])
    else:
        main(sys.argv[1], int(sys.argv[2]), sys.argv[3])
