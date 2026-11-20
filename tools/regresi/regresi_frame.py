"""Cek regresi Frame Studio: bukti bahwa fitur lama tidak berubah setelah kode diubah.

Merender ulang semua yang sudah ada lalu membandingkan "sidik jari" (hash SHA-1 piksel) dengan
pembanding yang disimpan sebelumnya:
  gaya   -> semua gaya teks (TEXT_STYLES di frontend/src/studio/model.js) x 6 varian layout
  anim   -> semua gerakan & animasi muncul (textfx.ANIM_LOOPS / ANIM_INS) + kombinasinya
  font   -> setiap font di border.FONTS dirender teks contoh
  tema   -> 6 tema bingkai bawaan (border.draw) di 9:16

Pakai (dari folder auto-clipper, dengan python venv backend):
  backend/.venv/Scripts/python.exe tools/regresi/regresi_frame.py simpan   # rekam pembanding
  backend/.venv/Scripts/python.exe tools/regresi/regresi_frame.py cek      # bandingkan
  ... cek --bagian gaya,anim                                               # sebagian saja
  ... simpan --tambah                                                     # hanya rekam item BARU,
                                                                          # item lama tetap

Hasil cek: exit 0 = semua item lama identik; exit 1 = ada yang berubah/hilang.
Item baru (belum ada di pembanding) dilaporkan sebagai "baru", tidak dianggap gagal.
Tidak menyentuh data app; hanya membaca kode & file font.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.services import border, textfx  # noqa: E402
from app.services import font_catalog  # noqa: E402,F401 -- mendaftarkan 47 font tambahan + font unggahan ke border.FONTS

BASELINE = Path(__file__).with_name("baseline.json")
MODEL_JS = ROOT / "frontend" / "src" / "studio" / "model.js"
PRESET = {"primary": "#111418", "secondary": "#2A2F3A", "accent": "#3BE8B0", "text": "#FFFFFF"}
BAGIAN = ("gaya", "anim", "font", "tema")


def _h(*parts) -> str:
    h = hashlib.sha1()
    for p in parts:
        h.update(p if isinstance(p, bytes) else repr(p).encode())
    return h.hexdigest()


def _img_hash(img, extra=()):
    return _h(img.tobytes(), (img.mode, img.size), *extra)


def _model():
    """TEXT_STYLES + TEXT_FX_NONE dibaca langsung dari model.js lewat node."""
    js = ("import('" + MODEL_JS.as_uri() + "').then(m=>process.stdout.write("
          "JSON.stringify({styles:m.TEXT_STYLES, none:m.TEXT_FX_NONE})))")
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


def _res(v):
    return PRESET.get(v[1:], "#888888") if isinstance(v, str) and v.startswith("@") else v


# ---------------------------------------------------------------- bagian

BASE = dict(type="text", x=140, y=100, w=800, h=220, rotation=0, opacity=1, text="", font="Anton", size=72,
            color="#FFFFFF", align="center", bold=True, italic=False, uppercase=False, letterSpacing=0, lineHeight=1.1,
            bg="", bgOpacity=1, radius=0, padding=0, stroke="", strokeWidth=0)
VARIANTS = {
    "biasa": ({}, "Halo Dunia"),
    "dua_baris": ({"w": 420}, "Judul Panjang Sekali Ya"),
    "kotak": ({"bg": "#202020", "radius": 30, "padding": 12}, "Halo Dunia"),
    "miring_spasi": ({"italic": True, "letterSpacing": 6, "align": "left"}, "Miring Kiri"),
    "putar_tipis": ({"rotation": 7, "opacity": 0.8, "uppercase": True}, "putar"),
    "judul": ({"text": "{judul}", "font": "Bebas Neue"}, "Judul video yang cukup panjang sekali untuk dikecilkan"),
}


def run_gaya():
    data = _model()
    out = {}
    for s in data["styles"]:
        for vn, (extra, txt) in VARIANTS.items():
            spec = {k: _res(v) for k, v in {**BASE, **data["none"], **s["fx"], **extra}.items()}
            img, pos = textfx.render_layer(spec, txt)
            out[f"gaya|{s['id']}|{vn}"] = _img_hash(img, (pos,))
    return out


ANIM_BASE = dict(type="text", x=100, y=100, w=600, h=160, rotation=0, opacity=1, font="Anton", size=70,
                 color="#FFE14D", align="center", bold=True, stroke="#000000", strokeWidth=5, lineHeight=1.1,
                 animSpeed=1.0, animAmount=60)


def run_anim():
    combos = [(lp, "") for lp in textfx.ANIM_LOOPS] + [("", it) for it in textfx.ANIM_INS]
    combos += [(lp, "pop") for lp in textfx.ANIM_LOOPS] + [("float", it) for it in textfx.ANIM_INS]
    out = {}
    for lp, it in dict.fromkeys(combos):
        spec = {**ANIM_BASE, "anim": lp, "animIn": it}
        bx = []
        img, _ = textfx.render_layer(spec, "Halo Dunia", bx)
        seq, pad, n_in, n_loop = textfx.anim_frames(img, spec, 10, 1.0, bx)
        h = hashlib.sha1(repr((pad, n_in, n_loop, seq[0].size)).encode())
        for f in seq:
            h.update(f.tobytes())
        out[f"anim|{lp or '-'}|{it or '-'}"] = h.hexdigest()
    return out


def run_font():
    from PIL import Image, ImageDraw
    out = {}
    for name in sorted(border.FONTS):
        f = border.load_font(name, 48)
        im = Image.new("L", (900, 80), 0)
        ImageDraw.Draw(im).text((10, 40), "Halo Dunia 123 ?!", font=f, fill=255, anchor="lm")
        out[f"font|{name}"] = _h(border.FONTS[name], Path(f.path).name, im.tobytes())
    return out


def run_tema():
    out = {}
    for theme in border.THEMES:
        brand = {"theme": theme, "brand": "Nama Brand", "name": "Nama Brand", "handle": "@akunmu",
                 "tagline": "Tagline brand", "accent": "#3BE8B0", "primary": "#111418", "font": "Space Grotesk"}
        try:
            img, win, _meta = border.draw(brand, "Judul video contoh", 540, 960, placeholder=True)
            out[f"tema|{theme}"] = _img_hash(img, (win,))
        except Exception as e:  # noqa: BLE001 -- dicatat sebagai hasil, supaya perubahan perilaku tetap terdeteksi
            out[f"tema|{theme}"] = "ERROR " + type(e).__name__
    return out


RUNNERS = {"gaya": run_gaya, "anim": run_anim, "font": run_font, "tema": run_tema}


def main():
    ap = argparse.ArgumentParser(description="Cek regresi Frame Studio")
    ap.add_argument("mode", choices=["simpan", "cek"])
    ap.add_argument("--bagian", default=",".join(BAGIAN), help="gaya,anim,font,tema")
    ap.add_argument("--tambah", action="store_true", help="simpan: hanya tambahkan item baru")
    args = ap.parse_args()
    parts = [p.strip() for p in args.bagian.split(",") if p.strip()]
    bad = [p for p in parts if p not in RUNNERS]
    if bad:
        sys.exit(f"bagian tidak dikenal: {bad}")

    now = {}
    for p in parts:
        t0 = time.time()
        r = RUNNERS[p]()
        now.update(r)
        print(f"  {p:5s}: {len(r):4d} item  ({time.time() - t0:.1f} dtk)")

    base = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else {}
    if args.mode == "simpan":
        if args.tambah:
            added = {k: v for k, v in now.items() if k not in base}
            base.update(added)
            print(f"DISIMPAN: {len(added)} item baru ditambahkan (item lama tidak diubah)")
        else:
            base = {k: v for k, v in base.items() if k.split("|")[0] not in parts}
            base.update(now)
            print(f"DISIMPAN: pembanding {parts} direkam ulang ({len(now)} item)")
        BASELINE.write_text(json.dumps(dict(sorted(base.items())), indent=0), encoding="utf-8")
        return 0

    if not base:
        sys.exit("Belum ada pembanding. Jalankan dulu: regresi_frame.py simpan")
    scope = {k: v for k, v in base.items() if k.split("|")[0] in parts}
    changed = sorted(k for k in scope if k in now and now[k] != scope[k])
    missing = sorted(k for k in scope if k not in now)
    new = sorted(k for k in now if k not in base)
    print(f"Dicek {len(scope)} item lama: {len(changed)} berubah, {len(missing)} hilang; {len(new)} item baru.")
    for title, items in (("BERUBAH", changed), ("HILANG", missing), ("baru (belum ada pembanding)", new)):
        if items:
            print(f"- {title}:")
            for k in items[:40]:
                print("   ", k)
            if len(items) > 40:
                print(f"    ... dan {len(items) - 40} lagi")
    if changed or missing:
        print("HASIL: ADA REGRESI")
        return 1
    print("HASIL: IDENTIK (fitur lama tidak berubah)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
