"""Pack frame buatan kode (tanpa gambar AI): 10 gaya esports/retro/modern, ada yang bergerak.

Tiap gaya digambar Pillow di kanvas 1080x1920 dengan jendela video transparan, papan
judul di bawah, lalu didaftarkan ke frames.json (source "pack"). Animasi frame (fanim)
dirender jadi urutan PNG per ukuran output dan di-cache; renderer menempelkannya
di atas frame dengan filter loop ffmpeg (sama seperti teks beranimasi).
"""
import math
import random
import shutil
import time

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from . import border, frames

W0, H0 = 1080, 1920
WIN = (60, 236, 960, 1236)          # x, y, w, h  (jendela video)
BOARD = (96, 1540, 984, 1790)       # papan judul (x0, y0, x1, y1)
RADIUS = 30
ANIM_LOOP = 2.4  # detik per putaran animasi frame


def _c(hexs, a=255):
    hexs = hexs.lstrip("#")
    return tuple(int(hexs[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def _vgrad(size, top, bot):
    w, h = size
    col = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    return col.resize((w, h))


def _solid(size, color, mask):
    img = Image.new("RGBA", size, color[:3] + (0,))
    img.putalpha(mask if color[3] == 255 else mask.point(lambda v: v * color[3] // 255))
    return img


def _glow(img, mask, color, blur, strength=2):
    halo = mask.filter(ImageFilter.GaussianBlur(blur))
    for _ in range(strength):
        img.alpha_composite(_solid(img.size, color, halo))
    img.alpha_composite(_solid(img.size, color, mask))


def _rr_outline(size, box, r, width):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=r, outline=255, width=max(1, round(width)))
    return m


def _win_box(pad=0):
    x, y, w, h = WIN
    return (x - pad, y - pad, x + w + pad, y + h + pad)


def _cut_window(img):
    m = Image.new("L", img.size, 255)
    ImageDraw.Draw(m).rounded_rectangle(_win_box(), radius=RADIUS, fill=0)
    img.putalpha(ImageChops.multiply(img.getchannel("A"), m))
    return img


def _noise(size, seed, lo=0, hi=255):
    w, h = size
    rnd = random.Random(seed)
    return Image.frombytes("L", size, bytes(rnd.randint(lo, hi) for _ in range(w * h))) if w * h < 400000 else \
        Image.frombytes("L", (w // 4, h // 4), random.Random(seed).randbytes((w // 4) * (h // 4))).resize(size)


def _brackets(d, box, length, width, color):
    """Sudut HUD: siku di 4 pojok kotak."""
    x0, y0, x1, y1 = box
    L = length
    for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line([(cx, cy + sy * L), (cx, cy), (cx + sx * L, cy)], fill=color, width=width, joint="curve")


def _plate(img, color_fill, color_line, glow=None, cut=34, line=5):
    """Papan judul bersudut potong (gaya HUD)."""
    x0, y0, x1, y1 = BOARD
    poly = [(x0 + cut, y0), (x1 - cut, y0), (x1, y0 + cut), (x1, y1 - cut), (x1 - cut, y1), (x0 + cut, y1),
            (x0, y1 - cut), (x0, y0 + cut)]
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    img.alpha_composite(_solid(img.size, color_fill, m))
    ol = Image.new("L", img.size, 0)
    ImageDraw.Draw(ol).line(poly + [poly[0]], fill=255, width=line, joint="curve")
    if glow:
        _glow(img, ol, glow, 10, 1)
    img.alpha_composite(_solid(img.size, color_line, ol))


def _text(img, xy, txt, font, size, color, anchor="mm", spacing=0):
    f = border.load_font(font, size, 700)
    d = ImageDraw.Draw(img)
    if spacing:
        x, y = xy
        total = sum(d.textlength(ch, font=f) + spacing for ch in txt) - spacing
        x -= total / 2 if anchor[0] == "m" else 0
        for ch in txt:
            d.text((x, y), ch, font=f, fill=color, anchor="l" + anchor[1])
            x += d.textlength(ch, font=f) + spacing
    else:
        d.text(xy, txt, font=f, fill=color, anchor=anchor)


# ---------------------------------------------------------------- gaya

def s_champion():
    img = _vgrad((W0, H0), _c("#16130C"), _c("#050403"))
    d = ImageDraw.Draw(img)
    for i in range(-H0, W0, 46):  # tekstur garis diagonal halus
        d.line([(i, 0), (i + H0, H0)], fill=(255, 215, 120, 10), width=2)
    gold = _c("#E8C46A")
    _glow(img, _rr_outline(img.size, _win_box(14), RADIUS + 12, 4), _c("#C9932E", 120), 14, 1)
    img.alpha_composite(_solid(img.size, gold, _rr_outline(img.size, _win_box(14), RADIUS + 12, 4)))
    img.alpha_composite(_solid(img.size, _c("#8A6420"), _rr_outline(img.size, _win_box(26), RADIUS + 22, 2)))
    _brackets(d, _win_box(40), 90, 8, gold)
    d.polygon([(340, 120), (740, 120), (700, 170), (380, 170)], fill=_c("#1E1810"), outline=gold)
    _text(img, (540, 145), "CHAMPION", "Cinzel", 34, gold, spacing=8)
    _plate(img, _c("#120E08", 235), gold, glow=_c("#C9932E", 120))
    return img, "#E8C46A", {"type": "runner", "color": "#FFE7A3"}


def s_impetus():
    img = _vgrad((W0, H0), _c("#1A0306"), _c("#070102"))
    red = _c("#FF2A3D")
    m = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(m)
    x0, y0, x1, y1 = _win_box(22)
    for (bx, a0) in (((x0 - 60, y0 - 60, x0 + 200, y0 + 200), 180), ((x1 - 200, y0 - 60, x1 + 60, y0 + 200), 270),
                     ((x0 - 60, y1 - 200, x0 + 200, y1 + 60), 90), ((x1 - 200, y1 - 200, x1 + 60, y1 + 60), 0)):
        d.arc(bx, a0, a0 + 90, fill=255, width=7)
    d.rounded_rectangle(_win_box(10), radius=RADIUS + 8, outline=255, width=3)
    for k in range(3):  # lengkung futuristik di header
        d.arc((140 - k * 40, 40 + k * 18, 940 + k * 40, 330 + k * 18), 200, 340, fill=255, width=4 - k)
    _glow(img, m, red, 16, 2)
    _plate(img, _c("#1B0407", 235), red, glow=red)
    return img, "#FF2A3D", {"type": "pulse", "color": "#FF2A3D"}


def s_diagonal():
    img = Image.new("RGBA", (W0, H0), _c("#0B0B0E"))
    d = ImageDraw.Draw(img)
    red, white = _c("#E3132C"), _c("#F4F4F4")
    for k, col in enumerate((red, white, red)):
        o = k * 46
        d.polygon([(0, 70 + o), (W0, -140 + o), (W0, -110 + o), (0, 100 + o)], fill=col)
        d.polygon([(0, H0 - 40 - o), (W0, H0 - 250 - o), (W0, H0 - 220 - o), (0, H0 - 10 - o)], fill=col)
    d.rounded_rectangle(_win_box(12), radius=RADIUS + 10, outline=white, width=6)
    d.rounded_rectangle(_win_box(24), radius=RADIUS + 20, outline=red, width=4)
    d.polygon([(WIN[0] - 24, WIN[1] - 70), (WIN[0] + 330, WIN[1] - 70), (WIN[0] + 290, WIN[1] - 24), (WIN[0] - 24, WIN[1] - 24)], fill=red)
    _text(img, (WIN[0] + 140, WIN[1] - 47), "HIGHLIGHT", "Chakra Petch", 34, white)
    _plate(img, _c("#121216", 240), white)
    return img, "#E3132C", {"type": "runner", "color": "#FFFFFF"}


def s_redglitch():
    img = Image.new("RGBA", (W0, H0), _c("#060606"))
    d = ImageDraw.Draw(img)
    for y in range(0, H0, 6):  # garis scan
        d.line([(0, y), (W0, y)], fill=(255, 30, 50, 14), width=2)
    red = _c("#FF1F3A")
    rng = random.Random(4)
    for _ in range(26):  # potongan glitch statis
        y = rng.randint(0, H0)
        x = rng.randint(-100, W0)
        d.rectangle((x, y, x + rng.randint(60, 360), y + rng.randint(3, 12)), fill=(255, 31, 58, rng.randint(40, 120)))
    m = _rr_outline(img.size, _win_box(12), RADIUS, 4)
    _glow(img, m, red, 10, 1)
    _brackets(d, _win_box(34), 70, 6, red)
    for i in range(20):  # skala tik HUD di sisi kiri
        y = WIN[1] + 40 + i * 58
        d.line([(18, y), (40 if i % 5 else 50, y)], fill=red, width=3)
    d.ellipse((80, 140, 108, 168), fill=red)
    _text(img, (124, 154), "LIVE", "Michroma", 30, (255, 255, 255, 255), anchor="lm")
    _text(img, (W0 - 80, 154), "REC 00:00", "Silkscreen", 26, red, anchor="rm")
    _plate(img, _c("#0E0607", 240), red, glow=red, cut=22)
    return img, "#FF1F3A", {"type": "glitch", "color": "#FF1F3A"}


def s_cyber77():
    img = _vgrad((W0, H0), _c("#121212"), _c("#050505"))
    d = ImageDraw.Draw(img)
    yel, pink, blue = _c("#FCEE0A"), _c("#FF2E88"), _c("#00E5FF")
    for band_y in (52, H0 - 112):  # pita hazard
        d.rectangle((0, band_y, W0, band_y + 60), fill=yel)
        for x in range(-80, W0 + 80, 70):
            d.polygon([(x, band_y), (x + 35, band_y), (x - 5, band_y + 60), (x - 40, band_y + 60)], fill=_c("#111111"))
    d.rounded_rectangle(_win_box(10), radius=8, outline=yel, width=6)
    d.line([(WIN[0] - 10, WIN[1] - 30), (WIN[0] + 380, WIN[1] - 30)], fill=pink, width=6)
    d.line([(W0 - WIN[0] - 380, WIN[1] + WIN[3] + 30), (W0 - WIN[0] + 10, WIN[1] + WIN[3] + 30)], fill=blue, width=6)
    _text(img, (W0 - 70, WIN[1] - 34), "SYS//77", "Zen Dots", 30, yel, anchor="rm")
    _text(img, (70, WIN[1] + WIN[3] + 30), "ERR_0x77 :: OVERRIDE", "Silkscreen", 22, pink, anchor="lm")
    _plate(img, _c("#141414", 240), yel, cut=26)
    return img, "#FCEE0A", {"type": "glitch", "color": "#FF2E88"}


def s_chroma():
    img = _vgrad((W0, H0), _c("#2A0B5E"), _c("#071A4A"))
    blobs = Image.new("RGBA", (W0, H0), (0, 0, 0, 0))
    d = ImageDraw.Draw(blobs)
    d.ellipse((-200, -150, 500, 450), fill=_c("#FF3EA5", 120))
    d.ellipse((600, 1400, 1300, 2100), fill=_c("#3EC5FF", 120))
    img.alpha_composite(blobs.filter(ImageFilter.GaussianBlur(120)))
    pink, blue = _c("#FF4FD8"), _c("#4FD8FF")
    _glow(img, _rr_outline(img.size, _win_box(12), RADIUS + 10, 5), pink, 14, 2)
    _glow(img, _rr_outline(img.size, _win_box(28), RADIUS + 24, 3), blue, 12, 1)
    dd = ImageDraw.Draw(img)
    for i in range(3):  # panah neon
        x = 420 + i * 90
        dd.line([(x, 120), (x + 40, 155), (x, 190)], fill=pink if i % 2 == 0 else blue, width=8, joint="curve")
    _plate(img, _c("#1A0A3E", 220), pink, glow=pink)
    return img, "#FF4FD8", {"type": "pulse", "color": "#FF4FD8"}


def s_glass():
    img = _vgrad((W0, H0), _c("#0F2A44"), _c("#1B1236"))
    blobs = Image.new("RGBA", (W0, H0), (0, 0, 0, 0))
    d = ImageDraw.Draw(blobs)
    d.ellipse((-100, 80, 520, 700), fill=_c("#38F9D7", 150))
    d.ellipse((560, 1000, 1240, 1700), fill=_c("#B06AB3", 150))
    d.ellipse((300, 1500, 900, 2100), fill=_c("#4568DC", 140))
    img.alpha_composite(blobs.filter(ImageFilter.GaussianBlur(90)))
    glass = Image.new("L", img.size, 0)
    ImageDraw.Draw(glass).rounded_rectangle(_win_box(34), radius=RADIUS + 30, fill=255)
    ImageDraw.Draw(glass).rounded_rectangle(BOARD, radius=40, fill=255)
    img.alpha_composite(_solid(img.size, (255, 255, 255, 46), glass))
    img.alpha_composite(_solid(img.size, (255, 255, 255, 170), _rr_outline(img.size, _win_box(34), RADIUS + 30, 2)))
    img.alpha_composite(_solid(img.size, (255, 255, 255, 150), _rr_outline(img.size, BOARD, 40, 2)))
    hl = Image.new("L", img.size, 0)  # kilap kaca atas
    ImageDraw.Draw(hl).rounded_rectangle((WIN[0] - 20, WIN[1] - 30, WIN[0] + WIN[2] + 20, WIN[1] - 12), radius=10, fill=120)
    img.alpha_composite(_solid(img.size, (255, 255, 255, 255), hl.filter(ImageFilter.GaussianBlur(4))))
    return img, "#BFF5FF", {"type": "sparkle", "color": "#FFFFFF"}


def s_vhs():
    img = _vgrad((W0, H0), _c("#3A2A22"), _c("#1C1412"))
    grain = _noise((W0, H0), 12, 0, 255).point(lambda v: 30 if v > 200 else 0)
    img.alpha_composite(_solid(img.size, (255, 236, 210, 255), grain))
    d = ImageDraw.Draw(img)
    for y in (300, 860, 1420):  # garis tracking
        d.rectangle((0, y, W0, y + 6), fill=(255, 255, 255, 40))
    cream = _c("#F3E3C3")
    d.rounded_rectangle(_win_box(10), radius=14, outline=cream, width=4)
    _text(img, (80, 150), "PLAY", "Silkscreen", 44, cream, anchor="lm")
    d.polygon([(250, 128), (250, 172), (286, 150)], fill=cream)  # ikon play
    _text(img, (W0 - 80, 150), "REC", "Silkscreen", 40, _c("#FF4B3E"), anchor="rm")
    d.ellipse((W0 - 230, 134, W0 - 198, 166), fill=_c("#FF4B3E"))
    _text(img, (80, WIN[1] + WIN[3] + 40), "SP  00:07:77", "Silkscreen", 30, cream, anchor="lm")
    _text(img, (W0 - 80, WIN[1] + WIN[3] + 40), "NOV 12 2026", "Silkscreen", 30, cream, anchor="rm")
    _plate(img, _c("#2A1E19", 230), cream, cut=0, line=3)
    return img, "#F3E3C3", {"type": "scan", "color": "#FFFFFF"}


def s_y2k():
    img = _vgrad((W0, H0), _c("#BFE3FF"), _c("#6FA8FF"))
    d = ImageDraw.Draw(img)
    for y in range(0, H0, 60):  # grid lembut
        d.line([(0, y), (W0, y)], fill=(255, 255, 255, 40), width=2)
    for x in range(0, W0, 60):
        d.line([(x, 0), (x, H0)], fill=(255, 255, 255, 40), width=2)
    ring = Image.new("L", img.size, 0)
    ImageDraw.Draw(ring).rounded_rectangle(_win_box(30), radius=RADIUS + 26, outline=255, width=30)
    chrome = _vgrad(img.size, _c("#FFFFFF"), _c("#5A6E8C"))
    band = _vgrad(img.size, _c("#2B3A55"), _c("#E8F1FF"))
    mix = Image.composite(band, chrome, Image.linear_gradient("L").resize(img.size).point(lambda v: 255 if 118 < v < 140 else 0))
    mix.putalpha(ring)
    img.alpha_composite(mix)
    img.alpha_composite(_solid(img.size, _c("#1C2740"), _rr_outline(img.size, _win_box(45), RADIUS + 40, 3)))
    img.alpha_composite(_solid(img.size, _c("#1C2740"), _rr_outline(img.size, _win_box(15), RADIUS + 12, 3)))
    rng = random.Random(8)
    for _ in range(14):  # bintang piksel
        x, y = rng.randint(20, W0 - 20), rng.choice([rng.randint(20, 200), rng.randint(1480, 1900)])
        s = rng.choice([6, 9, 12])
        d.rectangle((x - s, y - 2, x + s, y + 2), fill=(255, 255, 255, 230))
        d.rectangle((x - 2, y - s, x + 2, y + s), fill=(255, 255, 255, 230))
    _plate(img, _c("#1C2740", 235), _c("#FFFFFF"), cut=0, line=4)
    return img, "#2B3A55", {"type": "sparkle", "color": "#FFFFFF"}


def s_minimal():
    img = Image.new("RGBA", (W0, H0), _c("#050608"))
    cyan = _c("#22F3FF")
    _glow(img, _rr_outline(img.size, _win_box(10), RADIUS + 8, 3), cyan, 10, 1)
    d = ImageDraw.Draw(img)
    d.line([(440, 160), (640, 160)], fill=cyan, width=3)
    _plate(img, _c("#0A0C10", 240), cyan, cut=0, line=2)
    return img, "#22F3FF", {"type": "runner", "color": "#22F3FF"}


STYLES = {
    "champion": ("Esports Champion", s_champion),
    "impetus": ("Neon Impetus", s_impetus),
    "diagonal": ("Esports Diagonal", s_diagonal),
    "redglitch": ("Red Glitch HUD", s_redglitch),
    "cyber77": ("Cyberpunk 77", s_cyber77),
    "chroma": ("Chroma Neon", s_chroma),
    "glass": ("Liquid Glass", s_glass),
    "vhs": ("VHS Retro", s_vhs),
    "y2k": ("Y2K Chrome", s_y2k),
    "minimal": ("Minimal Neon", s_minimal),
}


def install(only: list[str] | None = None) -> list[dict]:
    """Gambar & daftarkan semua gaya (pasang ulang = timpa frame pack yang sama)."""
    items = frames.list_frames()
    out = []
    for key, (name, fn) in STYLES.items():
        if only and key not in only:
            continue
        img, accent, fanim = fn()
        img = _cut_window(img)
        item = next((f for f in items if f.get("pack") == key), None)
        if not item:
            fid = time.strftime("%Y%m%d%H%M%S") + key[:4]
            item = {"id": fid, "file": f"{fid}.png"}
            items.append(item)
        item.update(name=name, size=[W0, H0], win=list(WIN), board=list(BOARD), accent=accent, source="pack",
                    pack=key, fanim=fanim, v=int(time.time()))
        img.save(frames.frames_dir() / item["file"], "PNG")
        shutil.rmtree(_cache_root() / item["id"], ignore_errors=True)
        out.append(item)
    frames._save_index(items)
    return out


# ---------------------------------------------------------------- animasi frame

def _cache_root():
    p = frames.frames_dir() / "anim_cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _perimeter_point(box, t):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    p = 2 * (w + h)
    d = (t % 1.0) * p
    if d < w:
        return x0 + d, y0
    d -= w
    if d < h:
        return x1, y0 + d
    d -= h
    if d < w:
        return x1 - d, y1
    d -= w
    return x0, y1 - d


def _frame_anim(kind, color, W, H, win, n):
    """Urutan n frame RGBA W x H untuk satu putaran animasi frame."""
    s = W / W0
    x, y, w, h = win
    box = (x - 12 * s, y - 12 * s, x + w + 12 * s, y + h + 12 * s)
    col = _c(color)
    out = []
    if kind == "runner":
        for i in range(n):
            m = Image.new("L", (W, H), 0)
            d = ImageDraw.Draw(m)
            for off in (0.0, 0.5):  # dua komet berseberangan
                head = i / n + off
                for k in range(26):
                    t = head - k * 0.004
                    px, py = _perimeter_point(box, t)
                    r = (7 - k * 0.22) * s
                    if r > 0.5:
                        d.ellipse((px - r, py - r, px + r, py + r), fill=round(255 * (1 - k / 26)))
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            _glow(img, m, col, 10 * s, 2)
            img.alpha_composite(_solid((W, H), (255, 255, 255, 255), m.point(lambda v: max(0, v - 120) * 2)))
            out.append(img)
    elif kind == "pulse":
        ring = _rr_outline((W, H), box, (RADIUS + 10) * s, 6 * s)
        halo = ring.filter(ImageFilter.GaussianBlur(22 * s))
        base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for _ in range(3):
            base.alpha_composite(_solid((W, H), col, halo))
        base.alpha_composite(_solid((W, H), (255, 255, 255, 255), ring.point(lambda v: v // 2)))
        a0 = base.getchannel("A")
        for i in range(n):
            k = 0.15 + 0.85 * (0.5 - 0.5 * math.cos(2 * math.pi * i / n))
            f = base.copy()
            f.putalpha(a0.point(lambda v: round(v * k)))
            out.append(f)
    elif kind == "glitch":
        rng = random.Random(21)
        ring = _rr_outline((W, H), box, RADIUS * s, 5 * s)
        for i in range(n):
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            if i < max(3, n // 10):  # ledakan glitch singkat tiap putaran
                g = round((14 - i * 3) * s) or 1
                img.alpha_composite(_solid((W, H), (255, 0, 70, 220), ImageChops.offset(ring, -g, 0)))
                img.alpha_composite(_solid((W, H), (0, 235, 255, 220), ImageChops.offset(ring, g, 0)))
                d = ImageDraw.Draw(img)
                for _ in range(9):
                    yy = rng.randint(0, H)
                    xx = rng.randint(-50, W)
                    d.rectangle((xx, yy, xx + rng.randint(80, 420) * s, yy + rng.randint(3, 16) * s),
                                fill=col[:3] + (rng.randint(90, 200),))
            out.append(img)
    elif kind == "scan":
        bh = 160 * s
        for i in range(n):
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            cy = -bh + (H + 2 * bh) * i / n
            col_l = Image.new("L", (1, H), 0)
            for yy in range(max(0, int(cy - bh)), min(H, int(cy + bh))):
                col_l.putpixel((0, yy), round(36 * (1 - abs(yy - cy) / bh)))
            img.alpha_composite(_solid((W, H), (255, 255, 255, 255), col_l.resize((W, H))))
            if 0 <= cy < H:
                ImageDraw.Draw(img).line([(0, cy), (W, cy)], fill=(255, 255, 255, 60), width=max(1, round(2 * s)))
            out.append(img)
    elif kind == "sparkle":
        rng = random.Random(5)
        stars = []
        while len(stars) < 22:
            px, py = rng.uniform(0, W), rng.uniform(0, H)
            if box[0] - 30 * s < px < box[2] + 30 * s and box[1] - 30 * s < py < box[3] + 30 * s and \
                    not (box[0] + 40 * s < px < box[2] - 40 * s and box[1] + 40 * s < py < box[3] - 40 * s):
                stars.append((px, py, rng.random(), rng.uniform(10, 22) * s))
            elif not (box[0] < px < box[2] and box[1] < py < box[3]):
                stars.append((px, py, rng.random(), rng.uniform(8, 18) * s))
        for i in range(n):
            m = Image.new("L", (W, H), 0)
            d = ImageDraw.Draw(m)
            for px, py, ph, sz in stars:
                k = max(0.0, math.sin(2 * math.pi * (i / n + ph))) ** 3
                if k < 0.05:
                    continue
                r = sz * k
                d.polygon([(px, py - r), (px + r * 0.18, py), (px, py + r), (px - r * 0.18, py)], fill=round(255 * k))
                d.polygon([(px - r, py), (px, py + r * 0.18), (px + r, py), (px, py - r * 0.18)], fill=round(255 * k))
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            _glow(img, m, col, 4 * s, 1)
            out.append(img)
    return out


def anim_sprite(fid: str, W: int, H: int, win, fps: int) -> dict | None:
    """Urutan PNG animasi frame (di-cache per ukuran) -> sprite siap pakai renderer."""
    item = frames.get(fid) or {}
    fa = item.get("fanim") or {}
    if not fa.get("type"):
        return None
    n = max(2, round(ANIM_LOOP * fps))
    d = _cache_root() / item["id"] / f"{W}x{H}_{fps}_{item.get('v', 0)}"
    if not (d / f"f_{n - 1:04d}.png").exists():
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(_frame_anim(fa["type"], fa.get("color") or "#FFFFFF", W, H, win, n)):
            fr.save(d / f"f_{i:04d}.png", "PNG", compress_level=1)
    return {"pattern": (d / "f_%04d.png").as_posix(), "pos": (0, 0), "intro": 0, "loop": n}
