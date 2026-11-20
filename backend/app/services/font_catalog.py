"""Katalog font Frame Studio: kategori, 47 font tambahan (Google Fonts, OFL/Apache), dan font unggahan sendiri.

Modul ini MENAMBAH entri ke border.FONTS saat di-import (dipanggil dari router fonts di main.py), jadi
semua renderer lama (border, textfx, bumper, thumbnail) otomatis bisa memakai font baru tanpa diubah.
Variasi otomatis tidak terpengaruh: ia memilih font dari daftar kurasinya sendiri.
"""
import json
import os
import re
import threading
import uuid

from PIL import Image, ImageDraw, ImageFont

from .. import config
from . import border

FONT_DIR = config.DATA_DIR / "assets" / "fonts"
USER_DIR = FONT_DIR / "user"
USER_REG = USER_DIR / "fonts.json"
MAX_UPLOAD = 15 * 1024 * 1024
_lock = threading.Lock()

CATEGORIES = [
    ("tebal", "Tebal / Judul"),
    ("berita", "Berita / Ramping"),
    ("komik", "Komik"),
    ("lucu", "Lucu / Bulat"),
    ("tangan", "Tulisan tangan"),
    ("script", "Script / Kuas"),
    ("elegan", "Elegan / Mewah"),
    ("horor", "Horor"),
    ("retro", "Retro / Vintage"),
    ("futuristik", "Futuristik / Gaming"),
    ("user", "Font saya"),
]

# font tambahan 17 Nov 2026 (github.com/google/fonts, ofl/ & apache/): nama -> (file, bobot font variabel)
EXTRA_FONTS = {
    "Fredoka": ("Fredoka-VF.ttf", 700), "Baloo 2": ("Baloo2-VF.ttf", 800), "Chewy": ("Chewy-Regular.ttf", None),
    "Bubblegum Sans": ("BubblegumSans-Regular.ttf", None), "Sniglet": ("Sniglet-ExtraBold.ttf", None),
    "Gluten": ("Gluten-VF.ttf", 800), "Grandstander": ("Grandstander-VF.ttf", 900),
    "Mochiy Pop One": ("MochiyPopOne-Regular.ttf", None),
    "Caveat": ("Caveat-VF.ttf", 700), "Kalam": ("Kalam-Bold.ttf", None), "Patrick Hand": ("PatrickHand-Regular.ttf", None),
    "Shadows Into Light": ("ShadowsIntoLight.ttf", None), "Indie Flower": ("IndieFlower-Regular.ttf", None),
    "Gochi Hand": ("GochiHand-Regular.ttf", None), "Amatic SC": ("AmaticSC-Bold.ttf", None),
    "Rock Salt": ("RockSalt-Regular.ttf", None),
    "Kaushan Script": ("KaushanScript-Regular.ttf", None), "Yellowtail": ("Yellowtail-Regular.ttf", None),
    "Satisfy": ("Satisfy-Regular.ttf", None), "Dancing Script": ("DancingScript-VF.ttf", 700),
    "Sedgwick Ave Display": ("SedgwickAveDisplay-Regular.ttf", None),
    "DM Serif Display": ("DMSerifDisplay-Regular.ttf", None), "Cormorant Garamond": ("CormorantGaramond-VF.ttf", 700),
    "Bodoni Moda": ("BodoniModa-VF.ttf", 800), "Prata": ("Prata-Regular.ttf", None), "Italiana": ("Italiana-Regular.ttf", None),
    "League Gothic": ("LeagueGothic-VF.ttf", None), "Barlow Condensed": ("BarlowCondensed-ExtraBold.ttf", None),
    "Fjalla One": ("FjallaOne-Regular.ttf", None), "Antonio": ("Antonio-VF.ttf", 700),
    "Big Shoulders Display": ("BigShouldersDisplay-VF.ttf", 900),
    "Butcherman": ("Butcherman-Regular.ttf", None), "Eater": ("Eater-Regular.ttf", None),
    "Frijole": ("Frijole-Regular.ttf", None), "Metal Mania": ("MetalMania-Regular.ttf", None),
    "Griffy": ("Griffy-Regular.ttf", None), "Rubik Wet Paint": ("RubikWetPaint-Regular.ttf", None),
    "Jolly Lodger": ("JollyLodger-Regular.ttf", None),
    "VT323": ("VT323-Regular.ttf", None), "Shojumaru": ("Shojumaru-Regular.ttf", None),
    "Syncopate": ("Syncopate-Bold.ttf", None), "Krona One": ("KronaOne-Regular.ttf", None),
    "Tektur": ("Tektur-VF.ttf", 800),
    "Unbounded": ("Unbounded-VF.ttf", 900), "Climate Crisis": ("ClimateCrisis-VF.ttf", None),
    "Rubik": ("Rubik-VF.ttf", 900), "Lexend": ("Lexend-VF.ttf", 900),
}

_CAT_OF = {}
for _cat, _names in {
    "tebal": ["Space Grotesk", "Archivo", "Montserrat", "Poppins", "Archivo Black", "Dela Gothic One", "Lilita One",
              "Sigmar One", "Passion One", "Changa One", "Rubik Mono One", "Unbounded", "Climate Crisis", "Rubik", "Lexend"],
    "berita": ["Anton", "Bebas Neue", "Oswald", "Teko", "Staatliches", "Kanit Black Italic", "League Gothic",
               "Barlow Condensed", "Fjalla One", "Antonio", "Big Shoulders Display"],
    "komik": ["Bangers", "Luckiest Guy", "Titan One"],
    "lucu": ["Coiny", "Fredoka", "Baloo 2", "Chewy", "Bubblegum Sans", "Sniglet", "Gluten", "Grandstander", "Mochiy Pop One"],
    "tangan": ["Permanent Marker", "Caveat", "Kalam", "Patrick Hand", "Shadows Into Light", "Indie Flower", "Gochi Hand",
               "Amatic SC", "Rock Salt"],
    "script": ["Lobster", "Pacifico", "Great Vibes", "Pinyon Script", "Kaushan Script", "Yellowtail", "Satisfy",
               "Dancing Script", "Sedgwick Ave Display"],
    "elegan": ["Playfair Display", "Playfair Display SC", "Cinzel", "Cinzel Decorative", "Limelight", "Yeseva One",
               "Marcellus SC", "Rozha One", "Abril Fatface", "DM Serif Display", "Cormorant Garamond", "Bodoni Moda",
               "Prata", "Italiana"],
    "horor": ["Creepster", "Nosifer", "Butcherman", "Eater", "Frijole", "Metal Mania", "Griffy", "Rubik Wet Paint",
              "Jolly Lodger"],
    "retro": ["Bungee", "Bungee Shade", "Bungee Inline", "Monoton", "Righteous", "Press Start 2P", "Silkscreen",
              "Faster One", "Racing Sans One", "Rye", "Ewert", "Diplomata SC", "Sancreek", "Ultra", "Holtwood One SC",
              "Chango", "Fascinate", "Shrikhand", "Alfa Slab One", "VT323", "Shojumaru"],
    "futuristik": ["Orbitron", "Audiowide", "Black Ops One", "Russo One", "Exo 2", "Saira Stencil One", "Michroma",
                   "Chakra Petch", "Rajdhani", "Turret Road", "Wallpoet", "Zen Dots", "Rubik Glitch", "Syncopate",
                   "Krona One", "Tektur"],
}.items():
    for _n in _names:
        _CAT_OF[_n] = _cat


# ---------------------------------------------------------------- font unggahan

def _user_fonts() -> dict:
    try:
        reg = json.loads(USER_REG.read_text(encoding="utf-8"))
        return {k: v for k, v in reg.items() if (FONT_DIR / v).exists()}
    except Exception:  # noqa: BLE001
        return {}


def _save_user(reg: dict):
    USER_DIR.mkdir(parents=True, exist_ok=True)
    tmp = USER_REG.with_suffix(".tmp")
    tmp.write_text(json.dumps(reg, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, USER_REG)


def register():
    """Tambahkan font tambahan + unggahan ke border.FONTS (entri lama tidak ditimpa)."""
    for name, val in EXTRA_FONTS.items():
        if (FONT_DIR / val[0]).exists():
            border.FONTS.setdefault(name, val)
    for name, file in _user_fonts().items():
        border.FONTS.setdefault(name, (file, None))


def catalog() -> dict:
    user = _user_fonts()
    items = [{"name": n, "url": f"/media/assets/fonts/{f}", "category": "user" if n in user else _CAT_OF.get(n, "tebal"),
              "user": n in user} for n, (f, _w) in border.FONTS.items()]
    return {"categories": [{"id": c, "label": lbl} for c, lbl in CATEGORIES], "fonts": items}


def _check_font(path) -> str:
    """Validasi file font (bisa dimuat & menggambar huruf). -> nama keluarga font."""
    try:
        f = ImageFont.truetype(str(path), 64)
        im = Image.new("L", (900, 140))
        ImageDraw.Draw(im).text((10, 20), "Halo Dunia 123", font=f, fill=255)
    except Exception as e:  # noqa: BLE001
        raise ValueError("File bukan font yang bisa dipakai (.ttf / .otf).") from e
    if not im.getbbox():
        raise ValueError("Font tidak punya huruf latin biasa (A-Z, 0-9).")
    fam, style = f.getname()
    return f"{fam} {style}".replace(" Regular", "").strip() if style and style.lower() != "regular" else fam


def add_user_font(filename: str, data: bytes, display: str = "") -> dict:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in (".ttf", ".otf"):
        raise ValueError("Hanya file .ttf atau .otf.")
    if not data or len(data) > MAX_UPLOAD:
        raise ValueError("Ukuran font harus di bawah 15 MB.")
    USER_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex[:12]}{ext}"
    path = USER_DIR / fname
    path.write_bytes(data)
    try:
        auto = _check_font(path)
    except ValueError:
        path.unlink(missing_ok=True)
        raise
    name = re.sub(r"[^\w .&'-]", "", (display or auto)).strip()[:48] or "Font saya"
    with _lock:
        reg = _user_fonts()
        base, i = name, 2
        while name in border.FONTS:  # jangan menimpa font bawaan / unggahan lain
            name = f"{base} {i}"
            i += 1
        reg[name] = f"user/{fname}"
        _save_user(reg)
        border.FONTS[name] = (f"user/{fname}", None)
    return {"name": name, "url": f"/media/assets/fonts/user/{fname}", "category": "user", "user": True}


def delete_user_font(name: str) -> bool:
    with _lock:
        reg = _user_fonts()
        file = reg.pop(name, None)
        if not file:
            return False
        _save_user(reg)
        border.FONTS.pop(name, None)
    try:
        (FONT_DIR / file).unlink()
    except OSError:
        pass
    return True


register()
