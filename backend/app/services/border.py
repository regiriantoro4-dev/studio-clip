"""Border brand: bingkai bermerek yang membungkus video, beberapa tema.

Setiap tema digambar sebagai PNG RGBA seukuran frame. Bagian tempat video
tampil dibiarkan transparan ("jendela"); ffmpeg menaruh video di jendela itu
lalu menumpuk PNG di atasnya. Semua ukuran proporsional terhadap frame, jadi
9:16, 1:1, 16:9 dan GIF kecil memakai gambar yang sama.

draw() mengembalikan (gambar, jendela (x, y, w, h), meta):
  meta["sub_pos"] : posisi subtitle (% dari atas) atau None = pakai gaya klip
  meta["title"]   : True kalau tema menampilkan judul (hook overlay dimatikan)
  meta["blur"]    : True kalau latar di luar jendela = video yang diblur
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .. import config
from . import frames

THEMES = {
    "podcast": "Podcast",
    "minimal": "Minimal",
    "berita": "Berita",
    "neon": "Neon",
    "blur": "Kartu Blur",
    "bold": "Bold Sticker",
}

# nama tampilan -> (file di data/assets/fonts, bobot default untuk font variabel)
FONTS = {
    "Space Grotesk": ("SpaceGrotesk.ttf", 700),
    "Archivo": ("Archivo.ttf", 800),
    "Anton": ("Anton.ttf", None),
    "Bebas Neue": ("BebasNeue.ttf", None),
    "Montserrat": ("Montserrat.ttf", 800),
    "Poppins": ("Poppins.ttf", None),
    "Playfair Display": ("PlayfairDisplay.ttf", 800),
    "Permanent Marker": ("PermanentMarker.ttf", None),
    # font display tambahan (Google Fonts, OFL/Apache)
    "Bungee": ("Bungee-Regular.ttf", None),
    "Bungee Shade": ("BungeeShade-Regular.ttf", None),
    "Bungee Inline": ("BungeeInline-Regular.ttf", None),
    "Russo One": ("RussoOne-Regular.ttf", None),
    "Black Ops One": ("BlackOpsOne-Regular.ttf", None),
    "Righteous": ("Righteous-Regular.ttf", None),
    "Lobster": ("Lobster-Regular.ttf", None),
    "Pacifico": ("Pacifico-Regular.ttf", None),
    "Bangers": ("Bangers-Regular.ttf", None),
    "Luckiest Guy": ("LuckiestGuy-Regular.ttf", None),
    "Monoton": ("Monoton-Regular.ttf", None),
    "Orbitron": ("Orbitron-VF.ttf", 900),
    "Audiowide": ("Audiowide-Regular.ttf", None),
    "Cinzel Decorative": ("CinzelDecorative-Black.ttf", None),
    "Titan One": ("TitanOne-Regular.ttf", None),
    "Creepster": ("Creepster-Regular.ttf", None),
    "Rubik Mono One": ("RubikMonoOne-Regular.ttf", None),
    "Alfa Slab One": ("AlfaSlabOne-Regular.ttf", None),
    "Press Start 2P": ("PressStart2P-Regular.ttf", None),
    "Abril Fatface": ("AbrilFatface-Regular.ttf", None),
    "Oswald": ("Oswald-VF.ttf", 700),
    "Kanit Black Italic": ("Kanit-BlackItalic.ttf", None),
    "Racing Sans One": ("RacingSansOne-Regular.ttf", None),
    "Faster One": ("FasterOne-Regular.ttf", None),
    "Great Vibes": ("GreatVibes-Regular.ttf", None),
    "Rye": ("Rye-Regular.ttf", None),
    "Nosifer": ("Nosifer-Regular.ttf", None),
    "Sigmar One": ("SigmarOne-Regular.ttf", None),
    "Passion One": ("PassionOne-Black.ttf", None),
    "Staatliches": ("Staatliches-Regular.ttf", None),
    "Teko": ("Teko-VF.ttf", 700),
    # tema mewah
    "Cinzel": ("Cinzel-VF.ttf", 900),
    "Limelight": ("Limelight-Regular.ttf", None),
    "Yeseva One": ("YesevaOne-Regular.ttf", None),
    "Playfair Display SC": ("PlayfairDisplaySC-Black.ttf", None),
    "Marcellus SC": ("MarcellusSC-Regular.ttf", None),
    "Pinyon Script": ("PinyonScript-Regular.ttf", None),
    "Rozha One": ("RozhaOne-Regular.ttf", None),
    # tema gaming / esports
    "Exo 2": ("Exo2-VF.ttf", 800),
    "Saira Stencil One": ("SairaStencilOne-Regular.ttf", None),
    "Michroma": ("Michroma-Regular.ttf", None),
    "Chakra Petch": ("ChakraPetch-Bold.ttf", None),
    "Rajdhani": ("Rajdhani-Bold.ttf", None),
    "Turret Road": ("TurretRoad-ExtraBold.ttf", None),
    "Wallpoet": ("Wallpoet-Regular.ttf", None),
    "Zen Dots": ("ZenDots-Regular.ttf", None),
    "Silkscreen": ("Silkscreen-Regular.ttf", None),
    # tema kasino / retro / western
    "Ewert": ("Ewert-Regular.ttf", None),
    "Diplomata SC": ("DiplomataSC-Regular.ttf", None),
    "Sancreek": ("Sancreek-Regular.ttf", None),
    "Shrikhand": ("Shrikhand-Regular.ttf", None),
    "Ultra": ("Ultra-Regular.ttf", None),
    "Holtwood One SC": ("HoltwoodOneSC-Regular.ttf", None),
    "Chango": ("Chango-Regular.ttf", None),
    "Fascinate": ("Fascinate-Regular.ttf", None),
    # tema viral / tebal
    "Lilita One": ("LilitaOne-Regular.ttf", None),
    "Archivo Black": ("ArchivoBlack-Regular.ttf", None),
    "Dela Gothic One": ("DelaGothicOne-Regular.ttf", None),
    "Rubik Glitch": ("RubikGlitch-Regular.ttf", None),
    "Coiny": ("Coiny-Regular.ttf", None),
    "Changa One": ("ChangaOne-Regular.ttf", None),
}
FALLBACK_FONTS = ["arialbd.ttf", "arial.ttf"]

WAVE = [40, 70, 55, 90, 35, 65, 80, 45, 60, 95, 50, 70, 30, 85, 55, 40, 75, 50, 65, 35]

_NON_TEXT = re.compile(r"[^\u0000-\u218F]")  # emoji & simbol yang tak ada di font
CLEAR = (0, 0, 0, 0)


# ---------------------------------------------------------------- utilitas

def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", _NON_TEXT.sub("", str(s or ""))).strip()


def _hex(c: str, default: str) -> tuple[int, int, int]:
    c = str(c or default).lstrip("#")
    if len(c) != 6:
        c = default.lstrip("#")
    try:
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return _hex(default, "#000000")


def ink(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    """Warna teks (hitam/putih) yang terbaca di atas rgb."""
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    lum = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
    return (17, 17, 17) if lum > 0.4 else (255, 255, 255)


def load_font(name: str, size: float, weight: int | None = None):
    size = max(8, int(size))
    file, default_w = FONTS.get(name, FONTS["Space Grotesk"])
    path = config.DATA_DIR / "assets" / "fonts" / file
    if path.exists():
        f = ImageFont.truetype(str(path), size)
        w = weight or default_w
        if w:
            try:
                vals = []
                for ax in f.get_variation_axes():
                    nm = ax.get("name")
                    nm = nm.decode() if isinstance(nm, bytes) else str(nm)
                    if nm.lower().startswith("weight"):
                        vals.append(max(ax["minimum"], min(ax["maximum"], w)))
                    else:
                        vals.append(ax.get("default", ax["minimum"]))
                f.set_variation_by_axes(vals)
            except Exception:  # noqa: BLE001 — font statis
                pass
        return f
    for fb in FALLBACK_FONTS:
        p = Path("C:/Windows/Fonts") / fb
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _even(v: float) -> int:
    return int(round(v / 2)) * 2


def _kind(W: int, H: int) -> str:
    r = H / W
    return "portrait" if r > 1.3 else ("square" if r > 0.8 else "landscape")


def _unit(W: int, H: int) -> float:
    """Satuan dasar (≈ 1% lebar frame portrait); dipakai semua tema."""
    return min(W / 100, H / 100 * 0.75)


def _wrap(draw, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        cand = f"{cur} {word}".strip()
        if cur and draw.textlength(cand, font=font) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines


def _fit(draw, text, font_name, box_w, box_h, max_lines, start_size, weight=None, lh_mul=1.08):
    """Font terbesar (mulai start_size) yang membuat teks muat di kotak."""
    size = int(start_size)
    while size > 10:
        f = load_font(font_name, size, weight)
        lines = _wrap(draw, text, f, box_w)
        lh = int(size * lh_mul)
        if len(lines) <= max_lines and lh * len(lines) <= box_h:
            return f, lines, lh
        size = int(size * 0.92)
    f = load_font(font_name, 10, weight)
    return f, _wrap(draw, text, f, box_w)[:max_lines], 12


def _glow(img: Image.Image, paint, radius: float, passes: int = 2):
    """Efek menyala: gambar paint(draw) di layer, blur, tumpuk, lalu versi tajam."""
    layer = Image.new("RGBA", img.size, CLEAR)
    paint(ImageDraw.Draw(layer))
    soft = layer.filter(ImageFilter.GaussianBlur(max(1, radius)))
    for _ in range(passes):
        img.alpha_composite(soft)
    img.alpha_composite(layer)


def _logo(brand: dict, size: float, accent, accent_ink, font_name) -> Image.Image:
    size = max(8, int(size))
    rel = str(brand.get("logo") or "")
    if rel:
        p = (config.DATA_DIR / rel).resolve()
        if p.exists():
            try:
                im = Image.open(p).convert("RGBA")
                im.thumbnail((size, size), Image.LANCZOS)
                canvas = Image.new("RGBA", (size, size), CLEAR)
                canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
                return canvas
            except Exception:  # noqa: BLE001
                pass
    words = clean_text(brand.get("name") or "B").split() or ["B"]
    initials = (words[0][0] + (words[1][0] if len(words) > 1 else "")).upper()
    k = 4
    big = Image.new("RGBA", (size * k, size * k), CLEAR)
    d = ImageDraw.Draw(big)
    d.ellipse([0, 0, size * k - 1, size * k - 1], fill=accent + (255,))
    f = load_font(font_name, size * k * 0.42, 800)
    d.text((size * k / 2, size * k / 2), initials, font=f, fill=accent_ink, anchor="mm")
    return big.resize((size, size), Image.LANCZOS)


def _paste_logo(img, logo, x, cy):
    img.alpha_composite(logo, (int(x), int(cy - logo.height / 2)))


def _pill(d, x, cy, text, font, bg, fg, pad_x, pad_y, radius=None, outline=None, width=0, align="left"):
    """Pill berisi teks; align left: x = tepi kiri, center: x = tengah, right: x = tepi kanan."""
    tw = d.textlength(text, font=font)
    h = font.size + pad_y * 2
    w = tw + pad_x * 2
    x0 = {"left": x, "center": x - w / 2, "right": x - w}[align]
    d.rounded_rectangle(
        [x0, cy - h / 2, x0 + w, cy + h / 2],
        radius=h / 2 if radius is None else radius, fill=bg, outline=outline, width=int(width),
    )
    d.text((x0 + w / 2, cy), text, font=font, fill=fg, anchor="mm")
    return x0, w, h


def _colors(brand):
    bg = _hex(brand.get("color"), "#111418")
    ac = _hex(brand.get("accent"), "#3BE8B0")
    font = brand.get("font") if brand.get("font") in FONTS else "Space Grotesk"
    return bg, ac, ink(bg), ink(ac), font


def _over_video(brand):
    """Warna elemen yang menempel langsung di atas video: warna utama kalau cukup
    terang/berwarna, kalau gelap (hampir hitam) pakai aksen supaya tetap terlihat."""
    bg, ac, bg_ink, ac_ink, _ = _colors(brand)
    if max(bg) - min(bg) < 40 and max(bg) < 70:
        return ac, ac_ink
    return bg, bg_ink


def _placeholder(d, win, label="VIDEO KLIP"):
    x, y, w, h = win
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=(48, 50, 56, 255))
    pf = load_font("Space Grotesk", min(w, h) * 0.09, 700)
    d.text((x + w / 2, y + h / 2), label, font=pf, fill=(130, 132, 140), anchor="mm")


def _meta(sub_pos=None, title=True, blur=False, hook_min=None):
    # hook_min: posisi hook minimal (% dari atas) supaya tidak menabrak elemen border
    return {"sub_pos": sub_pos, "title": title, "blur": blur, "hook_min": hook_min}


def _sub(win, H, frac=0.82):
    x, y, w, h = win
    return round((y + h * frac) / H * 100, 2)


# ---------------------------------------------------------------- Podcast

def layout(W: int, H: int) -> dict:
    """Posisi elemen tema Podcast. win = jendela video (x, y, w, h) dalam piksel."""
    pad = W * 0.07
    k = _kind(W, H)
    if k == "portrait":
        return {
            "kind": k, "pad": pad, "label_y": H * 0.05,
            "title": (pad, H * 0.05 + W * 0.075, W - 2 * pad, H * 0.335 - W * 0.05 - (H * 0.05 + W * 0.075), 3),
            "win": (0, _even(H * 0.335), W, _even(W * 9 / 16)),
            "brand_cy": H * 0.75, "logo": W * 0.13,
            "wave": (pad, H * 0.835, W - 2 * pad, H * 0.065),
        }
    if k == "square":
        wh = H * 0.5
        return {
            "kind": k, "pad": pad, "label_y": H * 0.045,
            "title": (pad, H * 0.045 + W * 0.065, W - 2 * pad, H * 0.27 - H * 0.03 - (H * 0.045 + W * 0.065), 2),
            "win": (_even((W - wh * 16 / 9) / 2), _even(H * 0.27), _even(wh * 16 / 9), _even(wh)),
            "brand_cy": H * 0.885, "logo": W * 0.09,
            "wave": (W * 0.55, H * 0.85, W * 0.45 - pad, H * 0.07),
        }
    wh = H * 0.68
    pad = H * 0.06
    return {
        "kind": k, "pad": pad, "label_y": H * 0.035,
        "title": (pad, H * 0.035 + H * 0.06, W - 2 * pad, H * 0.17 - H * 0.095, 1),
        "win": (_even((W - wh * 16 / 9) / 2), _even(H * 0.19), _even(wh * 16 / 9), _even(wh)),
        "brand_cy": H * 0.935, "logo": H * 0.085,
        "wave": (W * 0.62, H * 0.9, W * 0.38 - pad, H * 0.07),
    }


def draw_podcast(brand, title, W, H, placeholder=False, part=None):
    L = layout(W, H)
    bg, ac, bg_ink, ac_ink, fn = _colors(brand)
    img = Image.new("RGBA", (W, H), bg + (255,))
    d = ImageDraw.Draw(img)
    pad = L["pad"]

    label = clean_text(brand.get("label") or "").upper()
    if label:
        lf = load_font(fn, max(W, H * 0.6) * 0.026 if L["kind"] != "landscape" else H * 0.032, 700)
        _pill(d, pad, L["label_y"] + lf.size * 0.78, label, lf, ac + (255,), ac_ink,
              lf.size * 0.55, lf.size * 0.28, radius=lf.size * 0.3)

    tx, ty, tw_box, th_box, max_lines = L["title"]
    text = clean_text(title)
    if text:
        start = W * 0.085 if L["kind"] == "portrait" else (W * 0.06 if L["kind"] == "square" else H * 0.055)
        f, lines, lh = _fit(d, text, fn, tw_box, th_box, max_lines, start)
        y = ty + lh * 0.1
        for line in lines:
            d.text((tx, y), line, font=f, fill=bg_ink)
            y += lh

    wx, wy, ww, wh = L["win"]
    t = max(2, int(min(W, H) * 0.009))
    if L["kind"] == "portrait":
        d.rectangle([0, wy - t, W, wy + wh + t - 1], fill=ac + (255,))
    else:
        d.rounded_rectangle([wx - t, wy - t, wx + ww + t - 1, wy + wh + t - 1], radius=t * 2, fill=ac + (255,))
    if placeholder:
        _placeholder(d, L["win"])
    else:
        d.rectangle([wx, wy, wx + ww - 1, wy + wh - 1], fill=CLEAR)

    ls = int(L["logo"])
    cy = L["brand_cy"]
    _paste_logo(img, _logo(brand, ls, ac, ac_ink, fn), pad, cy)
    name, handle = clean_text(brand.get("name")), clean_text(brand.get("handle"))
    nx = pad + ls * 1.25
    nf, hf = load_font(fn, ls * 0.40, 800), load_font(fn, ls * 0.27, 500)
    if name and handle:
        d.text((nx, cy - ls * 0.04), name, font=nf, fill=bg_ink, anchor="ls")
        d.text((nx, cy + ls * 0.08), handle, font=hf, fill=bg_ink + (205,), anchor="lt")
    elif name or handle:
        d.text((nx, cy), name or handle, font=nf, fill=bg_ink, anchor="lm")

    vx, vy, vw, vh = L["wave"]
    n = 34 if L["kind"] == "portrait" else 22
    gap = vw / n * 0.45
    bw = (vw - gap * (n - 1)) / n
    for i in range(n):
        bh = max(2, vh * WAVE[i % len(WAVE)] / 100)
        x0 = vx + i * (bw + gap)
        d.rounded_rectangle([x0, vy + (vh - bh) / 2, x0 + bw, vy + (vh + bh) / 2], radius=bw / 2, fill=ac + (220,))

    return img, L["win"], _meta(sub_pos=_sub(L["win"], H, 0.80))


# ---------------------------------------------------------------- Minimal

def draw_minimal(brand, title, W, H, placeholder=False, part=None):
    """Video penuh, garis tipis + logo kecil + handle. Hook tetap tampil seperti biasa."""
    u = _unit(W, H)
    _, _, _, _, fn = _colors(brand)
    bg, bg_ink = _over_video(brand)
    img = Image.new("RGBA", (W, H), CLEAR)
    d = ImageDraw.Draw(img)
    win = (0, 0, W, H)
    if placeholder:
        _placeholder(d, win)

    inset = 3.5 * u
    d.rounded_rectangle([inset, inset, W - inset, H - inset], radius=4 * u,
                        outline=bg + (255,), width=max(2, int(0.7 * u)))

    ls = 8 * u
    cy = 7 * u + ls / 2
    _paste_logo(img, _logo(brand, ls, bg, bg_ink, fn), 7.5 * u, cy)
    name = clean_text(brand.get("name"))
    if name:
        f = load_font(fn, 4 * u, 700)
        d.text((7.5 * u + ls + 2 * u, cy), name, font=f, fill=(255, 255, 255), anchor="lm",
               stroke_width=max(1, int(0.35 * u)), stroke_fill=(0, 0, 0, 150))

    handle = clean_text(brand.get("handle"))
    if handle:
        f = load_font(fn, 3.6 * u, 700)
        h = f.size + 2 * u
        _pill(d, W / 2, H - 6.5 * u - h / 2, handle, f, bg + (255,), bg_ink, 3 * u, u, align="center")

    return img, win, _meta(sub_pos=None, title=False, hook_min=round((15 * u + 9 * u) / H * 100 + 4, 1))


# ---------------------------------------------------------------- Berita

def draw_berita(brand, title, W, H, placeholder=False, part=None):
    """Video penuh + lower-third ala TV + ticker di bawah."""
    u = _unit(W, H)
    k = _kind(W, H)
    bg, ac, bg_ink, ac_ink, fn = _colors(brand)
    img = Image.new("RGBA", (W, H), CLEAR)
    d = ImageDraw.Draw(img)
    win = (0, 0, W, H)
    if placeholder:
        _placeholder(d, win)
    name, handle = clean_text(brand.get("name")), clean_text(brand.get("handle"))

    # tag brand kiri atas
    ls = 7 * u
    nf = load_font(fn, 3.6 * u, 700)
    tw = d.textlength(name, font=nf) if name else 0
    px, top = 5 * u, 6 * u
    ph = ls + 2.8 * u
    pw = 1.4 * u + ls + (2 * u + tw if name else 0) + 3 * u
    d.rounded_rectangle([px, top, px + pw, top + ph], radius=ph / 2, fill=(0, 0, 0, 140))
    _paste_logo(img, _logo(brand, ls, *_over_video(brand), fn), px + 1.4 * u, top + ph / 2)
    if name:
        d.text((px + 1.4 * u + ls + 2 * u, top + ph / 2), name, font=nf, fill=(255, 255, 255), anchor="lm")

    # ticker (statis)
    th = 8 * u
    d.rectangle([0, H - th, W, H], fill=(13, 13, 15, 255))
    tf = load_font(fn, 3.4 * u, 800)
    lab = (name or "INFO").upper()
    lw = d.textlength(lab, font=tf) + 5.2 * u
    d.rectangle([0, H - th, lw, H], fill=ac + (255,))
    d.text((lw / 2, H - th / 2), lab, font=tf, fill=ac_ink, anchor="mm")
    run = "   •   ".join(x for x in [clean_text(title), f"ikuti {handle}" if handle else "", name] if x)
    if run:
        x = lw + 4 * u
        piece = run + "   •   "
        while x < W:
            d.text((x, H - th / 2), piece, font=tf, fill=(255, 255, 255), anchor="lm")
            x += d.textlength(piece, font=tf)
        d.rectangle([0, H - th, lw, H], fill=ac + (255,))  # tutup ulang label
        d.text((lw / 2, H - th / 2), lab, font=tf, fill=ac_ink, anchor="mm")

    # lower-third: kicker + headline
    box_w = W - 8 * u if k == "portrait" else min(W - 8 * u, 100 * u)
    bottom = H - th - 5 * u
    text = clean_text(title) or name
    f, lines, lh = _fit(d, text, fn, box_w - 6 * u, 30 * u, 3 if k == "portrait" else 2, 6 * u, 800, 1.12)
    hh = lh * len(lines) + 4.8 * u
    htop = bottom - hh
    d.rectangle([4 * u, htop, 4 * u + box_w, bottom], fill=bg + (255,))
    y = htop + 2.4 * u
    for line in lines:
        d.text((7 * u, y), line, font=f, fill=bg_ink)
        y += lh
    kicker = clean_text(brand.get("label") or "").upper() or "TERBARU"
    kf = load_font(fn, 3.4 * u, 800)
    kh = kf.size + 2 * u
    kw = d.textlength(kicker, font=kf) + 5.2 * u
    d.rectangle([4 * u, htop - kh, 4 * u + kw, htop], fill=ac + (255,))
    d.text((4 * u + kw / 2, htop - kh / 2), kicker, font=kf, fill=ac_ink, anchor="mm")

    sub_pos = round(max(30.0, (htop - kh - 7 * u) / H * 100), 2)
    return img, win, _meta(sub_pos=sub_pos)


# ---------------------------------------------------------------- Neon

def draw_neon(brand, title, W, H, placeholder=False, part=None):
    """Latar gelap, bingkai video menyala warna aksen."""
    u = _unit(W, H)
    k = _kind(W, H)
    bg, ac, bg_ink, ac_ink, fn = _colors(brand)
    img = Image.new("RGBA", (W, H), (7, 6, 12, 255))
    d = ImageDraw.Draw(img)

    if k == "portrait":
        ww = W - 14 * u
        wh = ww * 5 / 4
        wx, wy = 7 * u, 28 * u
        brand_y, title_box, handle_y = 13 * u, (wy + wh + 5 * u, H - 14 * u - (wy + wh + 5 * u), 2), H - 7 * u
    else:
        wh = H * 0.6
        ww = wh * 4 / 5 if k == "square" else wh * 16 / 9 * 0.82
        wx, wy = (W - ww) / 2, H * 0.17
        brand_y, title_box, handle_y = H * 0.085, (wy + wh + H * 0.04, H * 0.09, 1), H * 0.94
    win = (_even(wx), _even(wy), _even(ww), _even(wh))
    wx, wy, ww, wh = win

    name = clean_text(brand.get("name")).upper()
    if name:
        f = load_font(fn, (8 if k == "portrait" else 6) * u, 800)
        _glow(img, lambda dd: dd.text((W / 2, brand_y), name, font=f, fill=ac + (255,), anchor="mm"), 2 * u)

    s = max(2, int(0.8 * u))
    r = 3 * u
    _glow(img, lambda dd: dd.rounded_rectangle([wx - s, wy - s, wx + ww + s, wy + wh + s], radius=r,
                                                outline=ac + (255,), width=s), 3 * u, passes=3)
    d = ImageDraw.Draw(img)
    if placeholder:
        _placeholder(d, win)
    else:
        d.rounded_rectangle([wx, wy, wx + ww, wy + wh], radius=r - s, fill=CLEAR)
        # sudut bulat: isi lagi pojok di luar lengkungan dengan latar
        mask = Image.new("L", (int(ww) + 1, int(wh) + 1), 255)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, ww, wh], radius=r - s, fill=0)
        img.paste((7, 6, 12, 255), (int(wx), int(wy)), mask)
        d.rounded_rectangle([wx - s, wy - s, wx + ww + s, wy + wh + s], radius=r, outline=ac + (255,), width=s)

    ty, th_box, max_lines = title_box
    text = clean_text(title)
    if text:
        f, lines, lh = _fit(d, text, fn, W - 16 * u, th_box, max_lines, (5.6 if k == "portrait" else 4.4) * u, 700, 1.15)
        y = ty
        for line in lines:
            d.text((W / 2, y), line, font=f, fill=(255, 255, 255), anchor="ma")
            y += lh

    handle = clean_text(brand.get("handle"))
    if handle:
        col = bg if ink(bg) == (17, 17, 17) else ac  # warna utama terang -> pakai, gelap -> aksen
        hf = load_font(fn, 3.8 * u, 700)
        _glow(img, lambda dd: dd.text((W / 2, handle_y), handle, font=hf, fill=col + (255,), anchor="mm"), 1.6 * u)

    return img, win, _meta(sub_pos=_sub(win, H, 0.86))


# ---------------------------------------------------------------- Kartu Blur

def draw_blur(brand, title, W, H, placeholder=False, part=None):
    """Latar = video yang diblur (dibuat ffmpeg); video asli jadi kartu di tengah."""
    u = _unit(W, H)
    k = _kind(W, H)
    bg, ac, bg_ink, ac_ink, fn = _colors(brand)
    img = Image.new("RGBA", (W, H), CLEAR)
    if placeholder:
        img = Image.new("RGBA", (W, H), (34, 30, 36, 255))

    if k == "portrait":
        ww = wh = W - 14 * u
        wx, wy = 7 * u, 50 * u
        tbox, max_lines, pill_cy = (8 * u, 12 * u, W - 16 * u, wy - 6 * u - 12 * u), 3, H - 20 * u
    else:
        wh = H * 0.58
        ww = wh if k == "square" else wh * 16 / 9
        wx, wy = (W - ww) / 2, H * 0.21
        tbox, max_lines, pill_cy = (6 * u, H * 0.04, W - 12 * u, H * 0.14), (2 if k == "square" else 1), H * 0.9
    win = (_even(wx), _even(wy), _even(ww), _even(wh))
    wx, wy, ww, wh = win

    # bayangan kartu
    sh = Image.new("RGBA", (W, H), CLEAR)
    ImageDraw.Draw(sh).rounded_rectangle([wx, wy + 2 * u, wx + ww, wy + wh + 2 * u], radius=2 * u, fill=(0, 0, 0, 160))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(4 * u)))
    d = ImageDraw.Draw(img)
    if placeholder:
        _placeholder(d, win)
    else:
        d.rectangle([wx, wy, wx + ww - 1, wy + wh - 1], fill=CLEAR)
    o = max(2, int(0.6 * u))
    d.rounded_rectangle([wx - o, wy - o, wx + ww + o, wy + wh + o], radius=o * 2,
                        outline=(255, 255, 255, 50), width=o)

    # judul, kata terakhir warna aksen
    text = clean_text(title)
    if text:
        tx, ty, tw_box, th_box = tbox
        f, lines, lh = _fit(d, text, fn, tw_box, th_box, max_lines, (8.4 if k == "portrait" else 6) * u, 800, 1.05)
        y = ty + (th_box - lh * len(lines)) / 2
        stroke = dict(stroke_width=max(1, int(0.3 * u)), stroke_fill=(0, 0, 0, 110))
        for i, line in enumerate(lines):
            if i == len(lines) - 1 and " " in line:
                head, last = line.rsplit(" ", 1)
                head += " "
                full = d.textlength(head + last, font=f)
                x0 = W / 2 - full / 2
                d.text((x0, y), head, font=f, fill=(255, 255, 255), **stroke)
                d.text((x0 + d.textlength(head, font=f), y), last, font=f, fill=ac + (255,), **stroke)
            else:
                d.text((W / 2, y), line, font=f, fill=(255, 255, 255), anchor="ma", **stroke)
            y += lh

    # pill logo + handle
    handle = clean_text(brand.get("handle")) or clean_text(brand.get("name"))
    ls = 8 * u
    hf = load_font(fn, 4 * u, 700)
    tw = d.textlength(handle, font=hf) if handle else 0
    ph = ls + 3.2 * u
    pw = 1.6 * u + ls + (2.4 * u + tw if handle else 0) + (4 * u if handle else 1.6 * u)
    x0 = W / 2 - pw / 2
    d.rounded_rectangle([x0, pill_cy - ph / 2, x0 + pw, pill_cy + ph / 2], radius=ph / 2, fill=bg + (255,))
    _paste_logo(img, _logo(brand, ls, ac, ac_ink, fn), x0 + 1.6 * u, pill_cy)
    if handle:
        d.text((x0 + 1.6 * u + ls + 2.4 * u, pill_cy), handle, font=hf, fill=bg_ink, anchor="lm")

    return img, win, _meta(sub_pos=_sub(win, H, 0.86), blur=not placeholder)


# ---------------------------------------------------------------- Bold Sticker

def draw_bold(brand, title, W, H, placeholder=False, part=None):
    """Bingkai tebal warna brand, judul besar kapital, stiker Part N / label."""
    u = _unit(W, H)
    k = _kind(W, H)
    bg, ac, bg_ink, ac_ink, fn = _colors(brand)
    img = Image.new("RGBA", (W, H), bg + (255,))
    d = ImageDraw.Draw(img)

    if k == "portrait":
        tbox, max_lines = (6 * u, 8 * u, W - 12 * u, 46 * u - 12 * u), 3
        wx, wy, ww = 6 * u, 46 * u, W - 12 * u
        wh = H - 30 * u - wy
        foot_cy = H - 14 * u
    else:
        tbox, max_lines = (6 * u, H * 0.05, W - 12 * u, H * 0.19), (2 if k == "square" else 1)
        wy, wh = H * 0.29, H * 0.53
        ww = min(W - 12 * u, wh * 16 / 9)
        wx = (W - ww) / 2
        foot_cy = H * 0.915
    win = (_even(wx), _even(wy), _even(ww), _even(wh))
    wx, wy, ww, wh = win

    text = clean_text(title).upper()
    if text:
        tx, ty, tw_box, th_box = tbox
        f, lines, lh = _fit(d, text, fn, tw_box, th_box, max_lines, (11 if k == "portrait" else 8) * u, 800, 0.98)
        y = ty
        for line in lines:
            d.text((tx, y), line, font=f, fill=bg_ink)
            y += lh

    b = 1.2 * u
    d.rounded_rectangle([wx - b, wy - b, wx + ww + b, wy + wh + b], radius=2.4 * u, fill=bg_ink + (255,))
    if placeholder:
        _placeholder(d, win)
    else:
        d.rounded_rectangle([wx, wy, wx + ww, wy + wh], radius=1.2 * u, fill=CLEAR)

    sticker = part or clean_text(brand.get("label") or "").upper()
    if sticker:
        sf = load_font(fn, 4.6 * u, 800)
        sw = d.textlength(sticker, font=sf) + 6.8 * u
        shh = sf.size + 3.2 * u
        bw = max(2, int(u))
        st = Image.new("RGBA", (int(sw + bw * 2 + 2), int(shh + bw * 2 + 2)), CLEAR)
        sd = ImageDraw.Draw(st)
        sd.rounded_rectangle([bw / 2, bw / 2, sw + bw * 1.5, shh + bw * 1.5], radius=2 * u,
                             fill=ac + (255,), outline=bg_ink + (255,), width=bw)
        sd.text(((sw + bw * 2) / 2, (shh + bw * 2) / 2), sticker, font=sf, fill=ac_ink, anchor="mm")
        st = st.rotate(-8, expand=True, resample=Image.BICUBIC)
        right = min(W - 3 * u, wx + ww + 3 * u)  # menempel di sudut kanan atas bingkai
        img.alpha_composite(st, (int(right - st.width), int(wy - st.height / 2)))

    name, handle = clean_text(brand.get("name")).upper(), clean_text(brand.get("handle"))
    if name:
        d.text((wx, foot_cy), name, font=load_font(fn, 5.4 * u, 800), fill=bg_ink, anchor="lm")
    if handle:
        hf = load_font(fn, 3.8 * u, 700)
        _pill(d, wx + ww, foot_cy, handle, hf, None, bg_ink, 2.4 * u, 0.8 * u,
              outline=bg_ink, width=max(2, int(0.6 * u)), align="right")

    return img, win, _meta(sub_pos=_sub(win, H, 0.86))


DRAWERS = {
    "podcast": draw_podcast,
    "minimal": draw_minimal,
    "berita": draw_berita,
    "neon": draw_neon,
    "blur": draw_blur,
    "bold": draw_bold,
}


# ---------------------------------------------------------------- API modul

def all_themes() -> dict:
    """Tema bawaan + frame upload user (id 'frame:<id>')."""
    return {**THEMES, **frames.themes()}


def _board_text(img, board, brand, title):
    """Isi papan bawah frame ornamen: logo (kalau ada) + nama brand + hook/tagline."""
    bx0, by0, bx1, by1 = board["box"]
    bw, bh = bx1 - bx0, by1 - by0
    ix, iy = bw * 0.09, bh * 0.14
    cx0, cy0, cw, ch = bx0 + ix, by0 + iy, bw - 2 * ix, bh - 2 * iy
    _, _, _, _, fn = _colors(brand)
    accent = _hex(board.get("accent"), "#F2C66D")
    dark = tuple(int(v * 0.12) for v in accent)
    name = clean_text(brand.get("name"))
    line2 = clean_text(title) or clean_text(brand.get("label"))
    if not name and not line2:
        return

    layer = Image.new("RGBA", img.size, CLEAR)
    d = ImageDraw.Draw(layer)

    if brand.get("logo"):
        ls = int(min(ch, cw * 0.25))
        logo = _logo(brand, ls, accent, ink(accent), fn)
        layer.alpha_composite(logo, (int(cx0), int(cy0 + (ch - ls) / 2)))
        cx0 += ls + cw * 0.04
        cw -= ls + cw * 0.04
    mid = cx0 + cw / 2

    blocks = []  # (font, lines, line_height, fill, stroke)
    if name:
        nh = ch * (0.56 if line2 else 0.8)
        f, lines, lh = _fit(d, name, fn, cw, nh, 1, nh * 1.05, 800, lh_mul=1.0)
        blocks.append((f, lines, lh, accent, dark))
    if line2:
        th = ch * (0.38 if name else 0.8)
        f, lines, lh = _fit(d, line2, fn, cw, th, 2, th * 0.62, 600, lh_mul=1.05)
        blocks.append((f, lines, lh, (255, 255, 255), (0, 0, 0)))
    gap = ch * 0.04
    total = sum(lh * len(lines) for _, lines, lh, _, _ in blocks) + gap * (len(blocks) - 1)
    y = cy0 + (ch - total) / 2
    for f, lines, lh, fill, stroke in blocks:
        sw = max(1, int(f.size * 0.07))
        for line in lines:
            d.text((mid, y + lh / 2), line, font=f, fill=fill + (255,), anchor="mm",
                   stroke_width=sw, stroke_fill=stroke + (255,))
            y += lh
        y += gap

    shadow = Image.new("RGBA", img.size, CLEAR)
    shadow.putalpha(layer.getchannel("A").filter(ImageFilter.GaussianBlur(max(2, ch * 0.05))))
    off = max(1, int(ch * 0.03))
    img.alpha_composite(shadow, (0, off))
    img.alpha_composite(layer)


# ---------------------------------------------------------------- teks brand global di frame
# Diatur sekali (Video jadi / settings.brand.brand_text), dipasang di setiap tema frame:
# frame ornamen AI, frame upload, dan frame Frame Studio yang tidak punya layer {brand} sendiri.

BRAND_TEXT_DEFAULT = {
    "enabled": False, "text": "{brand}", "position": "top_in", "offset_y": 0, "width": 90,
    "font": "Cinzel Decorative", "size": 96, "bold": True, "italic": False, "uppercase": True,
    "letterSpacing": 2, "color": "#FFF1A8", "fill2": "#B8860B", "shine": True,
    "stroke": "#5A3A00", "strokeWidth": 4, "depth": 10, "depthColor": "#4A2C00", "depthAngle": 90,
    "shadowColor": "#000000", "shadowBlur": 18, "shadowX": 0, "shadowY": 6,
    "glow": "", "glowSize": 30, "outline2": "", "outline2Width": 0,
    "anim": "", "animIn": "", "animSpeed": 2, "animAmount": 50,
}
_BT_COLORS = ("color", "fill2", "fill3", "stroke", "depthColor", "depthColor2", "shadowColor", "glow", "outline2")
_BT_SCALED = ("size", "strokeWidth", "outline2Width", "depth", "shadowBlur", "shadowX", "shadowY",
              "glowSize", "letterSpacing", "bevel", "glitch")


def _bt_color(c, brand):
    if not isinstance(c, str) or not c.startswith("@"):
        return c or ""
    bg, ac, *_ = _colors(brand)
    hexc = lambda t: "#%02X%02X%02X" % tuple(t)  # noqa: E731
    return {"@accent": hexc(ac), "@primary": hexc(bg), "@secondary": hexc(tuple(int(v * 0.6) for v in bg)),
            "@text": "#FFFFFF"}.get(c, "#FFFFFF")


def brand_text_active(fid: str, brand: dict) -> dict | None:
    bt = {**BRAND_TEXT_DEFAULT, **((brand or {}).get("brand_text") or {})}
    if not bt.get("enabled"):
        return None
    item = frames.get(fid) or {}
    # frame Frame Studio sudah berisi brand sendiri, kecuali tercatat tanpa layer {brand}
    if item.get("source") == "studio" and item.get("has_brand") is not False:
        return None
    return bt


def _brand_text(img, win, board, brand, bt, sprites=None):
    """Gambar teks brand global. -> kotak (x0, y0, x1, y1) yang dipakai, atau None."""
    W, H = img.size
    k = W / 1080
    x, y, w, h = win
    text = str(bt.get("text") or "{brand}")
    text = text.replace("{brand}", str(brand.get("name") or "")).replace("{handle}", str(brand.get("handle") or ""))
    text = clean_text(text)
    if not text:
        return None
    size = float(bt.get("size") or 96) * k
    off = float(bt.get("offset_y") or 0) * k
    wp = max(20, min(100, float(bt.get("width") or 90))) / 100
    pos = bt.get("position") or "top_in"
    bh = size * 1.45
    if pos == "board" and board:
        bx0, by0, bx1, by1 = board["box"]
        bw = (bx1 - bx0) * 0.86 * wp / 0.9
        cx, cy = (bx0 + bx1) / 2, by0 + (by1 - by0) * 0.3
        bh = min(bh, (by1 - by0) * 0.55)
    elif pos == "top":
        bw, cx, cy = W * wp, W / 2, y / 2
    elif pos == "bottom" or pos == "board":
        bw, cx, cy = W * wp, W / 2, (y + h + H) / 2
    else:  # top_in: menempel di bagian atas jendela video
        bw, cx, cy = w * wp, x + w / 2, y + h * 0.015 + bh / 2
    cy += off
    spec = {**bt, "type": "text", "text": text, "singleLine": True, "autoFit": True,
            "x": cx - bw / 2, "y": cy - bh / 2, "w": bw, "h": bh, "align": "center",
            "lineHeight": 1.1, "padding": 0, "rotation": 0, "opacity": 1}
    for key in _BT_SCALED:
        spec[key] = float(bt.get(key) or 0) * k
    spec["size"] = size
    for key in _BT_COLORS:
        spec[key] = _bt_color(bt.get(key), brand)
    if spec["font"] not in FONTS:
        spec["font"] = _colors(brand)[4]
    from . import textfx
    bx = []
    r = textfx.render_layer(spec, text, bx)
    if r and sprites is not None and textfx.has_anim(spec):
        sprites.append({"img": r[0], "pos": r[1], "spec": spec, "scale": 1.0, "boxes": bx})  # dianimasikan renderer
    elif r:
        textfx._paste(img, *r)
    return (spec["x"], spec["y"], spec["x"] + bw, spec["y"] + bh)


def draw_frame(fid, W, H, placeholder=False, brand=None, title="", anim=False):
    """anim=True (render video): layer beranimasi tidak digambar di frame, tapi
    dikembalikan sebagai sprite di meta["anims"] untuk dianimasikan ffmpeg."""
    brand = brand or {}
    frame, win, board, dyn = frames.render_full(fid, W, H, title, skip_anim=anim)
    sprites = frames.anim_layers(fid, W, H, title) if anim else None
    if anim:  # frame pack bergerak: animasi bingkai di bawah teks beranimasi
        from . import framepack
        fsp = framepack.anim_sprite(fid, W, H, win, 30)
        if fsp:
            sprites.insert(0, fsp)
    if placeholder:
        img = Image.new("RGBA", (W, H), CLEAR)
        _placeholder(ImageDraw.Draw(img), win)
        img.alpha_composite(frame)
    else:
        img = frame.copy()
    bt = brand_text_active(fid, brand)
    use_board = not dyn and board is not None and brand.get("frame_text", True) is not False
    if use_board:
        bboard, bbrand = board, brand
        if bt:  # nama brand sudah dari teks brand global -> papan hanya untuk judul
            bbrand = {**brand, "name": "", "logo": "" if bt.get("position") == "board" else brand.get("logo")}
            if bt.get("position") == "board":
                bx0, by0, bx1, by1 = board["box"]
                bboard = {**board, "box": (bx0, round(by0 + (by1 - by0) * 0.5), bx1, by1)}
        _board_text(img, bboard, bbrand, title)
    x, y, w, h = win
    hook_min = round((y + h * 0.06) / H * 100, 2)
    if bt:
        box = _brand_text(img, win, board, brand, bt, sprites)
        if box and bt.get("position", "top_in") == "top_in":
            hook_min = max(hook_min, round((box[3] + h * 0.01) / H * 100, 2))
    # judul tampil di frame (papan otomatis / layer {judul}) -> overlay hook di dalam video dimatikan
    meta = _meta(sub_pos=_sub(win, H, 0.8), title=use_board or dyn, hook_min=hook_min)
    if sprites:
        meta["anims"] = sprites
    return img, win, meta


def draw(brand: dict, title: str, W: int, H: int, placeholder: bool = False, part: str | None = None,
         anim: bool = False):
    theme = str(brand.get("theme") or "podcast")
    if theme.startswith(frames.PREFIX):
        try:
            return draw_frame(theme[len(frames.PREFIX):], W, H, placeholder, brand, title, anim)
        except (KeyError, OSError):
            theme = "podcast"  # frame sudah dihapus -> tema bawaan
    fn = DRAWERS.get(theme, draw_podcast)
    img, win, meta = fn(brand, title, W, H, placeholder, part)
    x, y, w, h = (int(v) for v in win)
    return img, (x, y, w, h), meta


def preview(brand: dict, title: str, ratio_wh: tuple[int, int], placeholder: bool,
            scale: float = 0.5, part: str | None = None) -> dict:
    W, H = ratio_wh
    w, h = _even(W * scale), _even(H * scale)
    img, (x, y, ww, wh), meta = draw(brand, title, w, h, placeholder, part)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return {
        "image": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
        "win": [x / w, y / h, ww / w, wh / h],
        **meta,
    }


def theme_for(brand: dict, fx: dict) -> str:
    """Tema per klip (fx.border_theme) mengalahkan default di Pengaturan."""
    t = str((fx or {}).get("border_theme") or "")
    known = all_themes()
    return t if t in known else (brand.get("theme") if brand.get("theme") in known else "podcast")


def clip_title(clip: dict) -> str:
    """Judul di border: hook (kalau aktif) atau judul klip."""
    hs = clip.get("hook_style") or {}
    hook = str(clip.get("hook") or "").strip()
    if hook and hs.get("enabled", True) is not False:
        return hook
    return str(clip.get("title") or "")


def border_title(clip: dict, theme: str) -> str:
    """Teks yang dikirim ke draw(). Frame: judul frame per klip (fx.frame_title), kalau kosong
    hook (kosong -> tagline/teks cadangan), karena judul klip Video jadi berasal dari nama file."""
    if str(theme).startswith(frames.PREFIX):
        own = str((clip.get("fx") or {}).get("frame_title") or "").strip()
        if own:
            return own
        hs = clip.get("hook_style") or {}
        hook = str(clip.get("hook") or "").strip()
        return hook if hook and hs.get("enabled", True) is not False else ""
    return clip_title(clip)


def clip_part(clip: dict) -> str | None:
    m = re.search(r"\(Part\s*(\d+)\)", str(clip.get("title") or ""), re.I)
    return f"PART {m.group(1)}" if m else None
