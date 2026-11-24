"""Produksi variasi Video jadi: satu aset -> N video utuh, masing-masing dengan resep tampilan berbeda.

Resep per video = tema border + tagline & font papan + teks brand (font, posisi, ukuran, lebar maks,
gaya, animasi) + intro/outro. Resep disimpan di klip (fx.border_theme, fx.frame_title,
fx.brand_override, fx.bumper_intro/outro), jadi pengaturan brand global tidak pernah ditimpa.

Bisa dilanjutkan: klip yang file hasilnya sudah ada dilewati, jadi batch yang terhenti (mati listrik,
backend ditutup) tinggal dijalankan lagi dan meneruskan dari video terakhir.
"""
import json
import random
import shutil
import time
import uuid
from pathlib import Path

from .. import config, storage
from . import autoproduce, border, bumper, frames, media, readymade, renderer

_ST = json.loads((Path(__file__).with_name("variasi_styles.json")).read_text(encoding="utf-8"))
STYLES = {s["id"]: s for s in _ST["styles"]}
FX_NONE = _ST["none"]

MAX_FILES = 20
MAX_N = 20

# Kelompok tema (dari kata di nama frame) -> font, gaya, dan intro yang serasi.
GROUPS = {
    "mewah": {
        "kata": ("royal", "mewah", "keraton", "mesir", "islami", "ramadan", "batik", "steampunk", "rustic"),
        "font": ("Cinzel Decorative", "Cinzel", "Playfair Display SC", "Yeseva One", "Marcellus SC",
                 "Abril Fatface", "Rozha One", "Limelight"),
        "gaya": ("gold_real", "glitter", "ruby", "stone", "chrome_real"),
        "intro": ("gold_burst", "gold_burst", "slam_impact"),
    },
    "tekno": {
        "kata": ("cyber", "neon", "synthwave", "toxic", "glitch", "hud", "chroma", "vhs", "y2k", "arcade",
                 "pixel", "angkasa", "liquid"),
        "font": ("Orbitron", "Audiowide", "Zen Dots", "Michroma", "Chakra Petch", "Russo One", "Righteous",
                 "Turret Road", "Exo 2", "Rajdhani"),
        "gaya": ("neon_tube", "glitch", "holo", "y2k", "ombre", "tri", "chrome_real", "neon_tube_brand"),
        "intro": ("neon_glitch", "neon_glitch", "slam_impact"),
    },
    "aksi": {
        "kata": ("esports", "racing", "petir", "api", "naga", "lava", "horor", "gothic"),
        "font": ("Russo One", "Black Ops One", "Anton", "Bebas Neue", "Racing Sans One", "Kanit Black Italic",
                 "Passion One", "Staatliches", "Alfa Slab One", "Saira Stencil One", "Teko"),
        "gaya": ("chrome_real", "ruby", "stone", "glitch", "tri", "gold_real"),
        "intro": ("slam_impact", "slam_impact", "neon_glitch"),
    },
    "ceria": {
        "kata": ("sakura", "permen", "laut", "es ", "hutan"),
        "font": ("Luckiest Guy", "Lilita One", "Titan One", "Bangers", "Sigmar One", "Coiny", "Chango",
                 "Righteous"),
        "gaya": ("jelly", "puffy", "ombre", "holo", "glitter", "y2k"),
        "intro": ("gold_burst", "neon_glitch", "slam_impact"),
    },
}
UMUM = {
    "font": ("Archivo Black", "Bebas Neue", "Anton", "Russo One", "Righteous", "Passion One", "Oswald"),
    "gaya": ("chrome_real", "gold_real", "tri", "ombre", "holo", "puffy"),
    "intro": ("slam_impact", "gold_burst", "neon_glitch"),
}
ANIM = ("float", "wobble", "pulse", "shine", "wave", "bounce", "flicker", "glitch")
ANIM_IN = ("pop", "slide", "glitchin", "type", "letters", "assemble")
TAGLINES = (
    "GAME HOT TERKINI", "UPDATE TERBARU SETIAP HARI", "HIBURAN KELAS ATAS", "MOMEN PALING SERU",
    "JANGAN SAMPAI KETINGGALAN", "TONTON SAMPAI HABIS", "SIMPAN DAN BAGIKAN", "SERU SETIAP HARI",
    "IKUTI UNTUK UPDATE", "HIBURAN TANPA HENTI", "VIRAL HARI INI", "WAJIB TONTON", "PALING DICARI",
    "FYP HARI INI", "TRENDING SEKARANG", "PILIHAN TERBAIK", "SELALU ADA YANG BARU", "BAGIKAN KE TEMANMU",
    "TONTON SEKARANG", "KONTEN PILIHAN",
)


def _group(name: str) -> dict:
    low = f"{name.lower()} "
    for g in GROUPS.values():
        if any(k in low for k in g["kata"]):
            return g
    return UMUM


BLOCK_KINDS = ("theme", "font", "gaya", "anim", "anim_in", "intro")


def _prefs_file() -> Path:
    return config.DATA_DIR / "variasi_prefs.json"


def load_prefs() -> dict:
    """Pilihan dari galeri: unsur yang tidak boleh dipakai lagi + resep favorit yang dipakai ulang."""
    try:
        d = json.loads(_prefs_file().read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001  belum ada / rusak -> kosong
        d = {}
    blocked = d.get("blocked") if isinstance(d.get("blocked"), dict) else {}
    return {"blocked": {k: [str(v) for v in blocked.get(k) or []] for k in BLOCK_KINDS},
            "favorites": [f for f in d.get("favorites") or [] if isinstance(f, dict) and f.get("key")]}


def save_prefs(d: dict):
    tmp = _prefs_file().with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_prefs_file())


def recipe_key(r: dict) -> str:
    return "|".join(str(r.get(k)) for k in ("theme", "font", "board_font", "gaya", "anim", "anim_in", "pos",
                                             "size", "width", "intro"))


def set_block(kind: str, value: str, on: bool) -> dict:
    if kind not in BLOCK_KINDS:
        raise ValueError("Jenis tidak dikenal.")
    d = load_prefs()
    cur = [v for v in d["blocked"][kind] if v != value]
    d["blocked"][kind] = cur + [value] if on else cur
    save_prefs(d)
    return d


def set_favorite(recipe: dict, on: bool) -> dict:
    d = load_prefs()
    key = recipe_key(recipe)
    d["favorites"] = [f for f in d["favorites"] if f["key"] != key]
    if on:
        d["favorites"].append({"key": key, "recipe": recipe, "ts": time.time()})
    save_prefs(d)
    return d


def _allowed(options, blocked) -> list:
    """Buang yang diblokir; kalau semuanya diblokir, pakai daftar asli supaya produksi tetap jalan."""
    keep = [o for o in options if o not in blocked]
    return keep or list(options)


def theme_pool(blocked=()) -> list[dict]:
    """Frame yang cocok untuk variasi: punya papan dan menerima teks brand global."""
    out = []
    for f in frames.list_frames():
        if frames.PREFIX + f["id"] in blocked:
            continue
        if not f.get("board"):
            continue
        if f.get("source") == "studio" and f.get("has_brand") is not False:
            continue  # frame studio sudah membawa brand sendiri
        out.append(f)
    return out


class _Picker:
    """Pilih yang paling jarang dipakai (acak di antara yang seri), supaya variasi merata."""

    def __init__(self, rng):
        self.rng, self.used = rng, {}

    def pick(self, kind: str, options, avoid=()):
        opts = [o for o in options if o not in avoid] or list(options)
        low = min(self.used.get((kind, o), 0) for o in opts)
        o = self.rng.choice([o for o in opts if self.used.get((kind, o), 0) == low])
        self.used[(kind, o)] = self.used.get((kind, o), 0) + 1
        return o


def make_recipes(n_assets: int, n_per: int, intro: bool = True, outro: bool = True,
                 seed: int | None = None) -> list[list[dict]]:
    """-> resep[aset][variasi]. Tidak ada dua video dengan kombinasi yang sama dalam satu batch."""
    rng = random.Random(seed)
    prefs = load_prefs()
    bl = prefs["blocked"]
    pool = theme_pool(bl["theme"])
    if not pool:
        raise RuntimeError("Tidak ada frame berpapan yang bisa dipakai. Tambah frame di Frame Studio, "
                           "atau buka blokir tema di Galeri variasi.")
    fonts_ok = set(border.FONTS) - set(bl["font"])
    anims, anim_ins = _allowed(ANIM, bl["anim"]), _allowed(ANIM_IN, bl["anim_in"])
    pool_ids = {frames.PREFIX + f["id"] for f in pool}
    # resep favorit dipakai ulang: paling banyak separuh variasi tiap aset, digilir antar aset
    favs = [f["recipe"] for f in prefs["favorites"]
            if f["recipe"].get("theme") in pool_ids and f["recipe"].get("font") in fonts_ok
            and f["recipe"].get("gaya") in STYLES and f["recipe"].get("gaya") not in bl["gaya"]]
    rng.shuffle(favs)
    fav_i = 0
    pk = _Picker(rng)
    seen = set()
    themes = []
    out = []
    for _a in range(n_assets):
        rows, in_asset = [], set()
        for _f in range(min(n_per // 2, len(favs))):
            fav = dict(favs[fav_i % len(favs)])
            fav_i += 1
            fid = fav["theme"][len(frames.PREFIX):]
            if fid in in_asset:
                continue
            fav["intro"] = (fav.get("intro") if fav.get("intro") not in bl["intro"] else "") if intro else ""
            fav["outro"] = bool(outro)
            fav["favorit"] = True
            in_asset.add(fid)
            rows.append(fav)
        for _v in range(n_per - len(rows)):
            if not themes:
                themes = pool[:]
                rng.shuffle(themes)
            # tema yang sudah dipakai aset ini ditunda dulu
            idx = next((i for i, t in enumerate(themes) if t["id"] not in in_asset), 0)
            fr = themes.pop(idx)
            in_asset.add(fr["id"])
            g = _group(fr["name"])
            g_fonts = ([f for f in g["font"] if f in fonts_ok] or [f for f in UMUM["font"] if f in fonts_ok]
                       or [f for f in g["font"] if f in border.FONTS])
            g_styles = _allowed([s for s in g["gaya"] if s in STYLES] or [s for s in UMUM["gaya"] if s in STYLES],
                                bl["gaya"])
            for _try in range(40):
                font = pk.pick("font", g_fonts)
                r = {
                    "theme": frames.PREFIX + fr["id"], "theme_name": fr["name"],
                    "tagline": pk.pick("tag", TAGLINES),
                    "board_font": pk.pick("bfont", g_fonts),
                    "font": font,
                    "pos": "board" if rng.random() < 0.3 else "top_in",
                    "size": rng.choice((78, 84, 92, 96, 100, 104, 110, 116, 120, 126)),
                    "width": rng.choice((60, 68, 72, 76, 80, 84, 88, 92, 95)),
                    "gaya": pk.pick("gaya", g_styles),
                    "anim": pk.pick("anim", anims),
                    "anim_in": pk.pick("anim_in", anim_ins),
                    "speed": rng.choice((1.5, 2, 2, 2.5, 3)),
                    "amount": rng.choice((35, 45, 50, 55, 60)),
                    "spacing": rng.choice((1, 2, 2, 4, 6)),
                    "intro": pk.pick("intro", _allowed(g["intro"], bl["intro"])) if intro else "",
                    "intro_font": font,
                    "outro": bool(outro),
                    "outro_font": pk.pick("ofont", g_fonts),
                    "outro_pos": pk.pick("opos", ("bawah", "tengah")),
                    "bell": pk.pick("bell", ("pojok", "atas", "tanpa")),
                }
                key = (r["theme"], r["font"], r["gaya"], r["anim"], r["anim_in"], r["pos"])
                if key not in seen:
                    seen.add(key)
                    break
            rows.append(r)
        out.append(rows)
    return out


def clip_fx(r: dict) -> dict:
    """Resep -> isi fx klip. Semua penimpaan hanya berlaku untuk klip ini."""
    if r.get("acak"):  # mode Acak gaya (Tahap 4, 18 Nov): gaya dari koleksi Frame Studio
        from . import acak_gaya
        return acak_gaya.clip_fx(r)
    st = STYLES.get(r["gaya"]) or STYLES["gold_real"]
    bt = {**border.BRAND_TEXT_DEFAULT, "stroke": "", "strokeWidth": 0, **FX_NONE, **st["fx"],
          "enabled": True, "text": "{brand}", "position": r["pos"], "offset_y": 0, "width": r["width"],
          "font": r["font"], "size": r["size"], "bold": True, "italic": False, "uppercase": True,
          "letterSpacing": r["spacing"], "anim": r["anim"], "animIn": r["anim_in"],
          "animSpeed": r["speed"], "animAmount": r["amount"]}
    fx = {**storage.DEFAULT_FX, **readymade.READY_FX,
          "border_theme": r["theme"], "frame_title": r["tagline"],
          "brand_override": {"font": r["board_font"], "label": r["tagline"], "brand_text": bt}}
    if r["intro"] and r["intro"] in bumper.TEMPLATES:
        fx["bumper_intro"] = {"enabled": True, "template": r["intro"], "font": r["intro_font"],
                              "tag_font": r["board_font"], "vars": {"brand": "{brand}", "tagline": r["tagline"]}}
    else:
        fx["bumper_intro"] = {"enabled": False}
    if r["outro"]:
        fx["bumper_outro"] = {"enabled": True, "font": r["outro_font"], "tag_font": r["outro_font"],
                              "vars": {"pos": r["outro_pos"], "bell": r["bell"]}}
    else:
        fx["bumper_outro"] = {"enabled": False}
    return fx


def new_batch_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]


def batch_folder(bid: str) -> Path:
    return config.OUTPUT_DIR / f"{bid[:4]}-{bid[4:6]}-{bid[6:8]} Variasi {bid[9:15]}"


def _info(p: dict) -> dict | None:
    v = (p.get("options") or {}).get("variasi")
    return v if isinstance(v, dict) and v.get("batch") else None


def _ratio(theme: str, w, h) -> str:
    fr = frames.get(theme[len(frames.PREFIX):]) if theme.startswith(frames.PREFIX) else None
    return readymade.auto_ratio(*fr["size"]) if fr else readymade.auto_ratio(w, h)


def _prepare(job, pid: str) -> dict:
    """Probe video lalu buat N klip utuh dari resep (sekali saja; dipakai ulang saat dilanjutkan)."""
    p = storage.get(pid)
    if not p or not p.get("source_file"):
        raise RuntimeError("File video tidak ditemukan.")
    info = _info(p)
    job.set(stage="Cek codec video")
    playable = media.ensure_browser_playable(
        p["source_file"], lambda f: job.set(stage="Konversi HEVC ke H.264", progress=0.3 * f))
    if playable != p["source_file"]:
        p["source_file"] = playable
    dur, w, h = media.probe(p["source_file"])
    p.update(duration=round(dur, 2), width=w, height=h)
    if not p.get("clips"):
        p["clips"] = [{
            "id": f"c{i}", "start": 0.0, "end": round(dur, 2),
            "title": f"{p.get('title') or 'Video'} · {r['theme_name']}",
            "hook": "", "score": 0,
            "reason": "Variasi Video jadi (utuh, tanpa dipotong)",
            "style": dict(storage.DEFAULT_STYLE),
            "hook_style": {**storage.DEFAULT_HOOK_STYLE, "enabled": False},
            "fx": clip_fx(r), "exports": [],
            "variasi": {"recipe": r, "file": ""},
        } for i, r in enumerate(info.get("recipes") or [], 1)]
    storage.save(p)
    if storage.get_transcript(pid) is None:
        storage.save_transcript(pid, {"segments": []})  # tanpa subtitle
    return p


def _pending(p: dict, folder: Path) -> list[dict]:
    return [c for c in p.get("clips") or []
            if isinstance(c.get("variasi"), dict)
            and not (c["variasi"].get("file") and (folder / c["variasi"]["file"]).exists())]


def _write_list(folder: Path, bid: str):
    """daftar_variasi.json: resep tiap video yang sudah jadi di batch ini."""
    rows = []
    for p in _batch_projects(bid):
        for c in p.get("clips") or []:
            v = c.get("variasi") or {}
            if v.get("file") and (folder / v["file"]).exists():
                r = v.get("recipe") or {}
                row = {
                    "file": v["file"], "aset": p.get("title"), "tema_border": r.get("theme_name"),
                    "papan": {"teks": r.get("tagline"), "font": r.get("board_font")},
                    "teks_brand": {"font": r.get("font"), "posisi": r.get("pos"), "ukuran": r.get("size"),
                                   "lebar_maks": r.get("width"),
                                   "gaya": (STYLES.get(r.get("gaya")) or {}).get("name"),
                                   "animasi_jalan": r.get("anim"), "animasi_masuk": r.get("anim_in")},
                    "intro": r.get("intro") or "tanpa", "outro": "follow_cta" if r.get("outro") else "tanpa",
                }
                if r.get("acak"):  # Acak gaya: nama gaya + kode
                    from . import acak_gaya
                    acak_gaya.lengkapi_daftar(row, r)
                rows.append(row)
    rows.sort(key=lambda x: x["file"])
    (folder / "daftar_variasi.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def run_one(job, pid: str) -> dict:
    """Render semua variasi satu aset yang belum jadi. -> {"done": n, "failed": [...]}"""
    p = storage.get(pid)
    if not p or not _info(p):
        raise RuntimeError("Project variasi tidak ditemukan.")
    info = _info(p)
    folder = Path(info.get("folder") or batch_folder(info["batch"]))
    try:
        p["status"], p["error"] = "processing", ""
        storage.save(p)
        if not media.has_ffmpeg():
            raise RuntimeError("ffmpeg tidak ditemukan di PATH.")
        job.set(stage="Membaca info video", progress=0.01)
        p = _prepare(autoproduce._SubJob(job, 0.01, 0.05), pid)
        folder.mkdir(parents=True, exist_ok=True)
        todo = _pending(p, folder)
        total = len(p.get("clips") or [])
        failed = []
        for k, clip in enumerate(todo):
            num = int(clip["id"][1:])
            r = clip["variasi"]["recipe"]
            lo = 0.05 + 0.95 * k / max(1, len(todo))
            hi = 0.05 + 0.95 * (k + 1) / max(1, len(todo))
            sub = autoproduce._SubJob(job, lo, hi, prefix=f"Variasi {num}/{total} ({r['theme_name']}): ")
            try:
                rec = renderer.render(sub, pid, clip["id"], _ratio(r["theme"], p.get("width"), p.get("height")), "mp4")
                name = (f"{int(info.get('index') or 1):02d}_{autoproduce._slug(p.get('title'), 30)}"
                        f"_v{num:02d}_{autoproduce._slug(r['theme_name'], 30)}.mp4")
                tmp = folder / (name + ".part")
                shutil.copy(storage.project_dir(pid) / "exports" / rec["file"], tmp)
                tmp.replace(folder / name)  # file hasil hanya muncul kalau salinannya utuh
                p = storage.get(pid)
                for c in p["clips"]:
                    if c["id"] == clip["id"]:
                        c["variasi"]["file"] = name
                storage.save(p)
                _write_list(folder, info["batch"])
            except Exception as e:  # noqa: BLE001  satu variasi gagal, sisanya tetap jalan
                failed.append({"clip": clip["id"], "error": str(e)[:300]})
        p = storage.get(pid)
        files = [c["variasi"]["file"] for c in p["clips"]
                 if (c.get("variasi") or {}).get("file") and (folder / c["variasi"]["file"]).exists()]
        p["auto_output"] = {"folder": str(folder), "files": files, "ts": time.time()}
        if failed:
            p["status"] = "error"
            p["error"] = f"{len(failed)} dari {total} variasi gagal: {failed[0]['error']}"
        else:
            p["status"], p["error"] = "ready", ""
        storage.save(p)
        return {"done": len(files), "failed": failed}
    except Exception as e:  # noqa: BLE001
        p = storage.get(pid) or p
        p["status"] = "error"
        p["error"] = f"Variasi gagal: {e}"
        storage.save(p)
        raise


def run(job, pids: list[str]) -> dict:
    """Render beberapa aset berurutan (satu ffmpeg pada satu waktu)."""
    total = len(pids)
    done, failed = 0, []
    for i, pid in enumerate(pids):
        sub = autoproduce._SubJob(job, i / total, (i + 1) / total,
                                  prefix=f"Aset {i + 1}/{total} · " if total > 1 else "")
        try:
            res = run_one(sub, pid)
            done += res["done"]
            failed += [{"id": pid, **f} for f in res["failed"]]
        except Exception as e:  # noqa: BLE001
            failed.append({"id": pid, "error": str(e)})
    if failed and not done:
        raise RuntimeError(failed[0]["error"])
    job.set(stage="Selesai — variasi siap upload", progress=1.0)
    return {"done": done, "failed": failed}


def _batch_projects(bid: str | None = None) -> list[dict]:
    out = []
    for item in storage.list_all():
        if item.get("source_type") != "readymade":
            continue
        p = storage.get(item["id"])
        info = _info(p) if p else None
        if info and (bid is None or info["batch"] == bid):
            out.append(p)
    return out


def batches(job_lookup) -> list[dict]:
    """Ringkasan tiap batch untuk panel: jumlah jadi, sisa, dan apakah sedang berjalan."""
    groups: dict[str, dict] = {}
    for p in _batch_projects():
        info = _info(p)
        folder = Path(info.get("folder") or batch_folder(info["batch"]))
        b = groups.setdefault(info["batch"], {
            "id": info["batch"], "folder": str(folder), "assets": 0, "total": 0, "done": 0,
            "running": False, "stage": "", "progress": 0.0, "errors": [], "projects": []})
        n = len(info.get("recipes") or [])
        b["assets"] += 1
        b["total"] += n
        b["done"] += n - len(_pending(p, folder)) if p.get("clips") else 0
        b["projects"].append(p["id"])
        if p.get("error"):
            b["errors"].append(p["error"])
        job = job_lookup(p.get("job_id") or "")
        if job and job.status == "running":
            b.update(running=True, stage=job.stage, progress=round(job.progress, 4))
    out = sorted(groups.values(), key=lambda b: b["id"], reverse=True)
    for b in out:
        b["finished"] = b["done"] >= b["total"]
    return out


def unfinished(bid: str) -> list[str]:
    """Project di batch ini yang masih punya variasi belum jadi (urut seperti saat dibuat)."""
    ps = sorted(_batch_projects(bid), key=lambda p: int(_info(p).get("index") or 0))
    out = []
    for p in ps:
        info = _info(p)
        folder = Path(info.get("folder") or batch_folder(info["batch"]))
        if not p.get("clips") or _pending(p, folder):
            out.append(p["id"])
    return out


LABEL = {
    "anim": {"float": "melayang", "wobble": "goyang", "pulse": "denyut", "shine": "kilau", "wave": "gelombang",
             "bounce": "pantul", "flicker": "kedip", "glitch": "glitch"},
    "anim_in": {"pop": "pop", "slide": "geser", "glitchin": "glitch", "type": "ketik", "letters": "per huruf",
                "assemble": "rakit"},
    "pos": {"top_in": "dalam video", "board": "papan", "top": "header", "bottom": "bawah"},
}


def gallery() -> dict:
    """Semua video variasi yang sudah jadi, lengkap dengan resep dan tanda favorit."""
    prefs = load_prefs()
    fav_keys = {f["key"] for f in prefs["favorites"]}
    arsip = [Path(d) for d in (config.load_settings().get("arsip_dirs") or []) if d]
    items, batch_ids, folders = [], [], {}
    for p in _batch_projects():
        info = _info(p)
        folder = Path(info.get("folder") or batch_folder(info["batch"]))
        if not folder.is_dir():  # isi Siap Upload lama sudah dipindah -> cari folder bernama sama di arsip
            folder = next((a / folder.name for a in arsip if (a / folder.name).is_dir()), folder)
        folders.setdefault(info["batch"], str(folder))
        if info["batch"] not in batch_ids:
            batch_ids.append(info["batch"])
        for c in p.get("clips") or []:
            v = c.get("variasi") or {}
            if not v.get("file"):
                continue
            r = v.get("recipe") or {}
            ex = (c.get("exports") or [{}])[-1]
            items.append({
                "batch": info["batch"], "pid": p["id"], "clip": c["id"], "aset": p.get("title"),
                "index": int(info.get("index") or 0), "file": v["file"],
                "exists": (folder / v["file"]).exists(), "url": ex.get("url") or "",
                "recipe": r, "key": recipe_key(r), "favorite": recipe_key(r) in fav_keys,
            })
    items.sort(key=lambda x: (x["batch"], x["index"], x["file"]))
    names = {
        "theme": {frames.PREFIX + f["id"]: f["name"] for f in frames.list_frames()},
        "gaya": {k: s["name"] for k, s in STYLES.items()},
        "intro": {k: t["name"] for k, t in bumper.TEMPLATES.items()},
        "anim": LABEL["anim"], "anim_in": LABEL["anim_in"], "pos": LABEL["pos"],
    }
    from . import acak_gaya  # Acak gaya (Tahap 4): nama tambahan, nama lama tidak ditimpa
    for k, extra in acak_gaya.names().items():
        names[k] = {**extra, **names[k]}
    return {"items": items, "batches": sorted(batch_ids, reverse=True), "prefs": prefs, "names": names,
            "folders": {b: folders.get(b) or str(batch_folder(b)) for b in batch_ids}}


def find_recipe(pid: str, cid: str) -> dict | None:
    p = storage.get(pid) if storage.valid_pid(pid) else None
    for c in (p or {}).get("clips") or []:
        if c.get("id") == cid and isinstance(c.get("variasi"), dict):
            return c["variasi"].get("recipe")
    return None
