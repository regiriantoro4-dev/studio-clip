"""Bumper intro/outro animasi (HyperFrames).

Template HTML ada di app/bumper_templates/<id>.html dan mendeklarasikan variabel
(teks, warna). Bumper dirender sekali per kombinasi template + teks + warna + font
menjadi WebM transparan (VP9 alpha), disimpan di data/bumpers/cache, lalu ditempel
ke video oleh renderer. Render ulang hanya terjadi kalau isinya berubah.
"""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

from .. import config
from . import border

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "bumper_templates"
TOOLS = config.BASE_DIR.parent / "tools" / "hyperframes"

TEMPLATES = {
    "gold_burst": {"name": "Ledakan emas", "kind": "intro", "duration": 2.6,
                   "desc": "Cahaya meledak, huruf jatuh berurutan, sinar emas berputar, kilau, tagline."},
    "neon_glitch": {"name": "Neon glitch", "kind": "intro", "duration": 2.4,
                    "desc": "Teks neon muncul dengan glitch RGB, garis scan, bingkai neon, berkedip."},
    "slam_impact": {"name": "Hentakan", "kind": "intro", "duration": 2.4,
                    "desc": "Teks raksasa menghantam layar, gelombang kejut, guncangan, pita tagline."},
    "follow_cta": {"name": "Ajakan follow", "kind": "outro", "duration": 3.0,
                   "desc": "Kartu brand + handle, tombol follow diklik, lonceng bergoyang."},
}

DEFAULT = {
    "intro": {"enabled": False, "template": "gold_burst", "font": "Cinzel Decorative", "tag_font": "Archivo Black",
              "vars": {"brand": "{brand}", "tagline": "GAMING HIGHLIGHT"}},
    "outro": {"enabled": False, "template": "follow_cta", "font": "Archivo Black", "tag_font": "Archivo Black",
              "vars": {"brand": "{brand}", "tagline": "FOLLOW", "handle": "{handle}"}},
}


class BumperError(RuntimeError):
    pass


def cache_dir() -> Path:
    d = config.DATA_DIR / "bumpers" / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def declared(template: str) -> list[dict]:
    """Variabel yang dideklarasikan template (id, type, label, default)."""
    html = (TEMPLATE_DIR / f"{template}.html").read_text(encoding="utf-8")
    start = html.find("data-composition-variables='")
    if start < 0:
        return []
    start += len("data-composition-variables='")
    return json.loads(html[start:html.index("'", start)])


def list_templates() -> list[dict]:
    out = []
    for tid, meta in TEMPLATES.items():
        if (TEMPLATE_DIR / f"{tid}.html").exists():
            out.append({"id": tid, **meta, "variables": declared(tid)})
    return out


def settings_for(brand: dict, kind: str) -> dict:
    cur = ((brand or {}).get("bumper") or {}).get(kind) or {}
    base = DEFAULT[kind]
    return {**base, **cur, "vars": {**base["vars"], **(cur.get("vars") or {})}}


def resolve_vars(template: str, vars_: dict, brand: dict) -> dict:
    """Gabungkan default template + isian user, ganti token {brand}/{handle}/{tagline}."""
    out = {}
    tokens = {"{brand}": str(brand.get("name") or ""), "{handle}": str(brand.get("handle") or ""),
              "{tagline}": str(brand.get("tagline") or "")}
    for v in declared(template):
        val = vars_.get(v["id"], v.get("default", ""))
        if v.get("type") == "color":
            val = str(val or v.get("default") or "#FFFFFF")
            if not (val.startswith("#") and len(val) in (4, 7)):
                val = v.get("default") or "#FFFFFF"
        elif v.get("options"):
            allowed = [o[0] for o in v["options"]]
            val = str(val) if str(val) in allowed else str(v.get("default", allowed[0]))
        else:
            val = str(val if val is not None else "")
            for k, t in tokens.items():
                val = val.replace(k, t)
            val = val[:60]
        out[v["id"]] = val
    return out


def _font_file(name: str) -> Path:
    file, _w = border.FONTS.get(name) or border.FONTS["Archivo Black"]
    return config.DATA_DIR / "assets" / "fonts" / file


def _hf_cmd() -> list[str]:
    exe = TOOLS / "node_modules" / ".bin" / ("hyperframes.cmd" if os.name == "nt" else "hyperframes")
    if not exe.exists():
        raise BumperError("HyperFrames belum terpasang. Jalankan: cd tools/hyperframes && npm install")
    return [str(exe)]


def render(template: str, vars_: dict, font: str, tag_font: str) -> Path:
    """-> path WebM transparan (dari cache bila sudah pernah dirender)."""
    if template not in TEMPLATES:
        raise BumperError(f"Template bumper tidak dikenal: {template}")
    src = TEMPLATE_DIR / f"{template}.html"
    key = json.dumps([template, src.stat().st_mtime_ns, vars_, font, tag_font], sort_keys=True, ensure_ascii=False)
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    out = cache_dir() / f"{template}_{h}.webm"
    if out.exists() and out.stat().st_size > 1000:
        return out
    work = config.DATA_DIR / "bumpers" / "work" / h
    shutil.rmtree(work, ignore_errors=True)
    (work / "fonts").mkdir(parents=True)
    (work / "vendor").mkdir()
    shutil.copy(src, work / "index.html")
    shutil.copy(TOOLS / "node_modules" / "gsap" / "dist" / "gsap.min.js", work / "vendor" / "gsap.min.js")
    shutil.copy(_font_file(font), work / "fonts" / "brand.ttf")
    shutil.copy(_font_file(tag_font), work / "fonts" / "tag.ttf")
    (work / "vars.json").write_text(json.dumps(vars_, ensure_ascii=False), encoding="utf-8")
    tmp = work / "out.webm"
    cmd = _hf_cmd() + ["render", str(work), "--format", "webm", "-o", str(tmp), "--variables-file",
                       str(work / "vars.json"), "--quiet"]
    try:
        r = subprocess.run(cmd, cwd=str(TOOLS), capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=600, shell=False)
    except subprocess.TimeoutExpired as e:
        raise BumperError("Render bumper terlalu lama (lebih dari 10 menit).") from e
    if r.returncode != 0 or not tmp.exists():
        msg = (r.stderr or r.stdout or "").strip().splitlines()[-3:]
        raise BumperError("Render bumper gagal: " + " | ".join(msg)[:300])
    shutil.move(str(tmp), out)
    shutil.rmtree(work, ignore_errors=True)
    return out


def for_brand(brand: dict, kind: str, override: dict | None = None) -> dict | None:
    """Bumper aktif untuk satu video: {path, duration, kind} atau None.
    override (per video, mis. dari Pabrik Konten) menimpa pengaturan brand."""
    cfg = settings_for(brand, kind)
    if override:
        cfg = {**cfg, **override, "vars": {**cfg["vars"], **(override.get("vars") or {})}}
    if not cfg.get("enabled"):
        return None
    tid = cfg.get("template") if cfg.get("template") in TEMPLATES else DEFAULT[kind]["template"]
    vars_ = resolve_vars(tid, cfg.get("vars") or {}, brand or {})
    path = render(tid, vars_, cfg.get("font") or "Archivo Black", cfg.get("tag_font") or "Archivo Black")
    return {"path": str(path), "duration": TEMPLATES[tid]["duration"], "kind": kind, "template": tid}
