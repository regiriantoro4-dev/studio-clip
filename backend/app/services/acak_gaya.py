"""Acak gaya (Tahap 4 Frame Studio, 18 Nov 2026).

Satu pengacak dipakai dua tempat:
  - tombol "Acak gaya" di Frame Studio (font, gaya teks, animasi muncul, gerakan, gaya bingkai video)
  - mode "Acak gaya" di produksi variasi batch (teks brand tiap video dapat kombinasi berbeda)

Aturan main (rentang acakan) dan riwayat anti-kembar disimpan di data/, jadi keduanya berbagi aturan
yang sama. Setiap kombinasi punya kode 4 huruf (mis. A7K2) yang bisa dipanggil ulang persis.

Modul ini hanya MENAMBAH. Variasi lama tetap memakai resep kurasinya sendiri kecuali klip ditandai
`acak` (lihat variasi.clip_fx). Daftar gaya/animasi/bingkai disalin dari model.js oleh
tools/acak-gaya/sinkron_gaya.py ke acak_gaya_data.json.
"""
import json
import random
import secrets
import threading
import time
from pathlib import Path

from .. import config
from . import border, font_catalog, textfx

_DATA = json.loads(Path(__file__).with_name("acak_gaya_data.json").read_text(encoding="utf-8"))
STYLES = {s["id"]: s for s in _DATA["styles"]}
ANIM_LABEL = dict(_DATA["anims"])
ANIM_IN_LABEL = dict(_DATA["anim_ins"])
BORDERS = [b[0] for b in _DATA["borders"]]
BORDER_LABEL = {b[0]: b[1] for b in _DATA["borders"]}
FX_NONE = _DATA["fx_none"]

GROUPS = [("tiktok", "Gaya TikTok"), ("klasik", "Klasik"), ("real", "3D mewah"), ("new", "Modern")]
THIN_CATS = {"tangan", "script", "elegan"}  # font tipis/berkait: tidak dipasang gaya yang tebal
BATCH_SKIP_CATS = {"script"}  # teks brand batch selalu HURUF BESAR: font script jadi sulit dibaca
NEUTRAL = {"#FFFFFF", "#000000", "#111111"}
BT_COLORS = ("color", "fill2", "fill3", "stroke", "depthColor", "depthColor2", "shadowColor", "glow", "outline2")
KODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_RIWAYAT = 1000
MAX_KODE = 3000
P_TANPA_GERAK = 0.2
P_TANPA_MUNCUL = 0.15

DEFAULT_ATURAN = {
    "font_kategori": [c for c, _ in font_catalog.CATEGORIES],
    "gaya_grup": [g for g, _ in GROUPS],
    "animasi_muncul": True,
    "gerakan": True,
    "bingkai": True,
    "warna_brand": False,
    "anti_kembar": 30,
}

_lock = threading.Lock()


# ---------------------------------------------------------------- aturan & riwayat

def _aturan_file() -> Path:
    return config.DATA_DIR / "acak_gaya.json"


def _riwayat_file() -> Path:
    return config.DATA_DIR / "acak_gaya_riwayat.json"


def _read(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001  belum ada / rusak
        return default


def _write(path: Path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def load_aturan() -> dict:
    d = _read(_aturan_file(), {})
    a = {**DEFAULT_ATURAN, **{k: v for k, v in (d if isinstance(d, dict) else {}).items() if k in DEFAULT_ATURAN}}
    cats = {c for c, _ in font_catalog.CATEGORIES}
    a["font_kategori"] = [c for c in a["font_kategori"] if c in cats] or list(DEFAULT_ATURAN["font_kategori"])
    a["gaya_grup"] = [g for g in a["gaya_grup"] if g in dict(GROUPS)] or list(DEFAULT_ATURAN["gaya_grup"])
    for k in ("animasi_muncul", "gerakan", "bingkai", "warna_brand"):
        a[k] = bool(a[k])
    a["anti_kembar"] = max(0, min(500, int(a["anti_kembar"] or 0)))
    return a


def save_aturan(d: dict) -> dict:
    cur = load_aturan()
    cur.update({k: v for k, v in (d or {}).items() if k in DEFAULT_ATURAN})
    with _lock:
        _write(_aturan_file(), cur)
    return load_aturan()


def _riwayat() -> dict:
    d = _read(_riwayat_file(), {})
    if not isinstance(d, dict):
        d = {}
    return {"kode": d.get("kode") if isinstance(d.get("kode"), dict) else {},
            "pakai": d.get("pakai") if isinstance(d.get("pakai"), list) else []}


def _simpan_kode(combos: list[dict]):
    with _lock:
        r = _riwayat()
        for c in combos:
            r["kode"][c["kode"]] = c
        if len(r["kode"]) > MAX_KODE:
            r["kode"] = dict(list(r["kode"].items())[-MAX_KODE:])
        _write(_riwayat_file(), r)


def catat(combos: list[dict], sumber: str):
    """Catat kombinasi yang benar-benar dipakai (frame disimpan / video batch) untuk anti-kembar."""
    with _lock:
        r = _riwayat()
        now = time.time()
        for c in combos:
            if not c or not c.get("kode"):
                continue
            r["kode"].setdefault(c["kode"], c)
            r["pakai"].append({"kode": c["kode"], "key": key_of(c), "sumber": sumber, "ts": now})
        r["pakai"] = r["pakai"][-MAX_RIWAYAT:]
        _write(_riwayat_file(), r)


def recent_keys(n: int) -> set:
    if n <= 0:
        return set()
    return {p.get("key") for p in _riwayat()["pakai"][-n:]}


def riwayat(limit: int = 50) -> list[dict]:
    r = _riwayat()
    out = []
    for p in reversed(r["pakai"][-limit:]):
        c = r["kode"].get(p.get("kode")) or {}
        out.append({**p, **{k: c.get(k) for k in ("font", "gaya", "gaya_nama", "anim", "animIn", "border")}})
    return out


# ---------------------------------------------------------------- bahan acakan

def key_of(c: dict) -> str:
    return "|".join(str(c.get(k) or "") for k in ("font", "gaya", "anim", "animIn", "border"))


def _font_cats() -> dict:
    return {f["name"]: f["category"] for f in font_catalog.catalog()["fonts"] if f["name"] in border.FONTS}


def _colors(fx: dict) -> dict:
    return {k: v for k, v in fx.items() if isinstance(v, str) and v[:1] in ("#", "@")}


def _brand_safe(s: dict) -> bool:
    """Hanya warna token brand (@...) atau netral hitam/putih -> ikut warna brand channel."""
    return all(v.startswith("@") or v.upper() in NEUTRAL for v in _colors(s["fx"]).values())


def _batch_safe(s: dict) -> bool:
    """Teks brand batch hanya menerjemahkan token warna di kolom BT_COLORS."""
    return all(k in BT_COLORS for k, v in _colors(s["fx"]).items() if v.startswith("@"))


def _heavy(s: dict) -> bool:
    fx = s["fx"]
    return bool(fx.get("hollow") or (fx.get("strokeWidth") or 0) >= 10 or (fx.get("depth") or 0) >= 14
                or (fx.get("bevel") or 0) >= 10 or (fx.get("outline2Width") or 0) >= 6)


def _curved(style_id) -> bool:
    return bool((STYLES.get(style_id) or {}).get("fx", {}).get("curve"))


def _pools(aturan: dict, mode: str, blocked: dict | None = None) -> dict:
    blocked = blocked or {}
    cats = set(aturan["font_kategori"]) - (BATCH_SKIP_CATS if mode == "batch" else set())
    fonts = {n: c for n, c in _font_cats().items() if c in cats and n not in blocked.get("font", ())}
    if not fonts:  # aturan terlalu sempit -> tetap jalan dengan semua font
        fonts = _font_cats()
    styles = [s for s in STYLES.values() if s["group"] in aturan["gaya_grup"]
              and (not aturan["warna_brand"] or _brand_safe(s))
              and (mode != "batch" or _batch_safe(s))
              and "acak:" + s["id"] not in blocked.get("gaya", ())]
    if not styles:
        styles = [s for s in STYLES.values() if mode != "batch" or _batch_safe(s)]
    anims = [a for a in textfx.ANIM_LOOPS if a in ANIM_LABEL and a not in blocked.get("anim", ())]
    ins = [a for a in textfx.ANIM_INS if a in ANIM_IN_LABEL and a not in blocked.get("anim_in", ())]
    return {"fonts": fonts, "styles": styles, "anims": anims if aturan["gerakan"] else [],
            "ins": ins if aturan["animasi_muncul"] else [],
            "borders": BORDERS if aturan["bingkai"] and mode != "batch" else []}


def jumlah_kombinasi(aturan: dict | None = None) -> int:
    p = _pools(aturan or load_aturan(), "studio")
    n = len(p["fonts"]) * len(p["styles"]) * (len(p["anims"]) + 1) * (len(p["ins"]) + 1)
    return n * max(1, len(p["borders"]))


def pilihan() -> dict:
    """Daftar pilihan untuk panel aturan (dengan jumlah font per kategori)."""
    counts = {}
    for c in _font_cats().values():
        counts[c] = counts.get(c, 0) + 1
    gcount = {}
    for s in STYLES.values():
        gcount[s["group"]] = gcount.get(s["group"], 0) + 1
    return {"font_kategori": [{"id": c, "label": lbl, "jumlah": counts.get(c, 0)} for c, lbl in font_catalog.CATEGORIES],
            "gaya_grup": [{"id": g, "label": lbl, "jumlah": gcount.get(g, 0)} for g, lbl in GROUPS]}


# ---------------------------------------------------------------- mengacak

def _kombinasi(kode: str, aturan: dict, kunci: dict, mode: str, pools: dict) -> dict:
    """Deterministik: kode + aturan + kunci yang sama -> hasil sama."""
    rng = random.Random(f"acak-gaya:{kode}")
    kunci = kunci or {}
    fonts = pools["fonts"]

    if "font" in kunci:
        font = kunci.get("font")
    else:  # kategori dulu, baru font: kategori yang fontnya banyak tidak mendominasi
        cat_pick = rng.choice(sorted(set(fonts.values())))
        font = rng.choice(sorted(n for n, c in fonts.items() if c == cat_pick))
    cat = fonts.get(font) or _font_cats().get(font) or ""

    if "gaya" in kunci:
        gaya = kunci.get("gaya")
    else:
        opts = pools["styles"]
        if cat in THIN_CATS:
            opts = [s for s in opts if not _heavy(s)] or opts
        gaya = rng.choice(opts)["id"]
    curved = _curved(gaya)

    def pick(kind, pool, letter, p_none):
        if kind in kunci:
            return kunci.get(kind) or ""
        opts = [a for a in pool if not (curved and a in letter)]
        if not opts or rng.random() < p_none:
            return ""
        return rng.choice(opts)

    anim = pick("anim", pools["anims"], textfx.LETTER_LOOPS, P_TANPA_GERAK)
    anim_in = pick("animIn", pools["ins"], textfx.LETTER_INS, P_TANPA_MUNCUL)
    if "border" in kunci:
        bord = kunci.get("border") or ""
    else:
        bord = rng.choice(pools["borders"]) if pools["borders"] else None  # None = tidak diubah
    c = {"kode": kode, "font": font, "font_kategori": cat, "gaya": gaya,
         "gaya_nama": (STYLES.get(gaya) or {}).get("name", ""), "anim": anim, "animIn": anim_in,
         "border": bord, "mode": mode}
    c["key"] = key_of(c)
    return c


def _kode_baru(taken) -> str:
    while True:
        k = "".join(secrets.choice(KODE_CHARS) for _ in range(4))
        if k not in taken:
            return k


def acak(kunci: dict | None = None, kode: str | None = None, mode: str = "studio",
         hindari: set | None = None, aturan: dict | None = None, blocked: dict | None = None,
         simpan: bool = True) -> dict:
    """Satu kombinasi baru. `kunci` = bagian yang tidak boleh berubah (nilai saat ini).
    `kode` = panggil ulang kombinasi lama persis (kunci & anti-kembar diabaikan)."""
    aturan = aturan or load_aturan()
    r = _riwayat()
    if kode:
        kode = kode.strip().upper().lstrip("#")
        if kode in r["kode"]:
            return {**r["kode"][kode], "dipanggil": True}
        return {**_kombinasi(kode, aturan, {}, mode, _pools(aturan, mode, blocked)), "dipanggil": True}
    pools = _pools(aturan, mode, blocked)
    avoid = recent_keys(aturan["anti_kembar"]) | (hindari or set())
    taken = set(r["kode"])
    c = None
    for _ in range(80):
        k = _kode_baru(taken)
        taken.add(k)
        c = _kombinasi(k, aturan, kunci or {}, mode, pools)
        if c["key"] not in avoid:
            break
    if simpan:
        _simpan_kode([c])
    return c


# ---------------------------------------------------------------- produksi variasi batch (4C)

def terapkan_batch(recipes: list[list[dict]]) -> list[list[dict]]:
    """Timpa font, gaya, dan animasi teks brand tiap resep variasi dengan kombinasi acak.
    Tidak ada yang kembar dalam batch maupun dengan N video terakhir (aturan anti_kembar)."""
    from . import variasi  # impor lokal: variasi juga memanggil modul ini
    aturan = load_aturan()
    blocked = variasi.load_prefs()["blocked"]
    seen, combos = set(), []
    n_gaya = len(_pools(aturan, "batch", blocked)["styles"])
    pakai_gaya, pakai_font = set(), set()
    for rows in recipes:
        for r in rows:
            # merata: gaya & font yang sudah keluar di batch ini ditunda sampai pilihan lain habis
            if len(pakai_gaya) >= n_gaya:
                pakai_gaya.clear()
            for _try in range(25):
                c = acak(mode="batch", hindari=seen, aturan=aturan, blocked=blocked, simpan=False)
                if c["gaya"] not in pakai_gaya and c["font"] not in pakai_font:
                    break
            pakai_gaya.add(c["gaya"])
            pakai_font.add(c["font"])
            seen.add(c["key"])
            combos.append(c)
            r.update(font=c["font"], intro_font=c["font"], gaya="acak:" + c["gaya"], anim=c["anim"],
                     anim_in=c["animIn"], favorit=False,
                     acak={"kode": c["kode"], "gaya": c["gaya"], "gaya_nama": c["gaya_nama"]})
    _simpan_kode(combos)
    catat(combos, "batch")
    return recipes


def clip_fx(r: dict) -> dict:
    """Resep variasi bertanda `acak` -> fx klip: resep lama + gaya teks dari koleksi Frame Studio."""
    from . import variasi
    fx = variasi.clip_fx({**r, "acak": None, "gaya": "plain"})
    st = STYLES.get((r.get("acak") or {}).get("gaya")) or STYLES["plain"]
    bt = fx["brand_override"]["brand_text"]
    bt.update({**FX_NONE, "stroke": "", "strokeWidth": 0, "color": "#FFFFFF"})
    bt.update(st["fx"])
    return fx


def names() -> dict:
    """Nama tampilan untuk galeri variasi (gaya acak + animasi baru)."""
    return {"gaya": {"acak:" + k: f"{s['name']} (acak)" for k, s in STYLES.items()},
            "anim": {k: v.lower() for k, v in ANIM_LABEL.items()},
            "anim_in": {k: v.lower() for k, v in ANIM_IN_LABEL.items()}}


def lengkapi_daftar(row: dict, r: dict):
    """daftar_variasi.json: nama gaya acak + kode gayanya."""
    a = r.get("acak") or {}
    row["kode_gaya"] = a.get("kode")
    row["teks_brand"]["gaya"] = a.get("gaya_nama") or a.get("gaya")
