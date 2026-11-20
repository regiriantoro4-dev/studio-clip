"""Render layer teks Frame Studio di server (Pillow), meniru TextNode Konva di editor.

Dipakai untuk layer yang isinya berubah per video (token {judul}) dan nanti untuk
layer animasi. Urutan lapisan sama dengan editor (belakang -> depan):
glow -> ekstrusi 3D (+ bayangan di lapisan terdalam) -> garis tepi luar -> teks utama.
Koordinat dalam piksel desain (1080x1920).
"""
import math

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFilter

from . import border

TOKEN = "{judul}"
ITALIC_SKEW = 0.25  # kemiringan italic sintetis browser
SHINE = (0.42, 0.5, 0.56)


def _rgba(c, default=(0, 0, 0, 0)):
    if not c:
        return default
    try:
        v = ImageColor.getrgb(str(c))
    except ValueError:
        return default
    return v if len(v) == 4 else v + (255,)


def _solid(size, color, mask):
    """Gambar RGBA warna polos dengan alpha = mask * alpha warna."""
    img = Image.new("RGBA", size, color[:3] + (0,))
    a = mask if color[3] == 255 else mask.point(lambda v: v * color[3] // 255)
    img.putalpha(a)
    return img


def _lerp(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def _gradient(size, stops, y0, y1):
    """Gradasi vertikal: stops = [(posisi 0..1, (r,g,b,a)), ...] antara y0..y1."""
    w, h = size
    col = Image.new("RGBA", (1, h))
    span = max(1.0, y1 - y0)
    for y in range(h):
        t = min(1.0, max(0.0, (y - y0) / span))
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if t <= p1 or i == len(stops) - 2:
                k = 0.0 if p1 <= p0 else min(1.0, max(0.0, (t - p0) / (p1 - p0)))
                col.putpixel((0, y), _lerp(c0, c1, k))
                break
    return col.resize((w, h))


def _gradient_h(size, stops, x0, x1):
    """Gradasi horizontal antara x0..x1."""
    w, h = size
    row = Image.new("RGBA", (w, 1))
    span = max(1.0, x1 - x0)
    for x in range(w):
        t = min(1.0, max(0.0, (x - x0) / span))
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if t <= p1 or i == len(stops) - 2:
                k = 0.0 if p1 <= p0 else min(1.0, max(0.0, (t - p0) / (p1 - p0)))
                row.putpixel((x, 0), _lerp(c0, c1, k))
                break
    return row.resize((w, h))


HOLO = ["#FF9AD5", "#9AE6FF", "#B8FFB0", "#FFF59A", "#FFB59A", "#D49AFF", "#FF9AD5"]


def _fill_image(spec, size, c1, bbox, th_box, lines_h):
    """Gambar isi teks (RGBA penuh) sesuai gaya isi; None = warna polos c1."""
    gt = spec.get("gradType") or ""
    c2 = _rgba(spec.get("fill2")) if spec.get("fill2") else None
    x0, y0, x1, y1 = bbox
    white = (255, 255, 255, 255)
    if gt == "horizontal" and c2:
        return _gradient_h(size, [(0, c1), (1, c2)], x0, x1)
    if gt == "tri" and c2:
        c3 = _rgba(spec.get("fill3")) if spec.get("fill3") else _lerp(c1, c2, 0.5)
        return _gradient(size, [(0, c1), (0.5, c3), (1, c2)], y0, y1)
    if gt == "chrome":  # krom Y2K: langit terang, garis cakrawala gelap tajam, pantulan bawah
        dark = c2 or (27, 43, 74, 255)
        return _gradient(size, [(0, white), (0.36, c1), (0.49, _lerp(c1, dark, 0.35)), (0.5, dark),
                                (0.62, _lerp(dark, white, 0.55)), (0.86, c1), (1, _lerp(c1, dark, 0.5))], y0, y1)
    if gt == "holo":  # hologram: pelangi pastel miring + sedikit warna dasar
        n = len(HOLO) - 1
        g = _gradient_h(size, [(i / n, _rgba(c)) for i, c in enumerate(HOLO)], x0, x1)
        g = g.transform(size, Image.AFFINE, (1, -0.6, (y0 + y1) / 2 * 0.6, 0, 1, 0), Image.BILINEAR)
        tint = Image.new("RGBA", size, c1[:3] + (255,))
        return Image.blend(g, tint, 0.18)
    if c2:
        if spec.get("shine"):
            stops = [(0, c2), (SHINE[0], c1), (SHINE[1], white), (SHINE[2], c2), (1, c1)]
        else:
            stops = [(0, c1), (1, c2)]
        return _gradient(size, stops, th_box[0], th_box[1])
    return None


def _erode(mask, r):
    r = max(0, round(r))
    return mask.filter(ImageFilter.MinFilter(2 * r + 1)) if r else mask


def _glitch(out, g, slices, seed=5):
    """Pecah RGB: salinan merah & cyan bergeser di belakang + potongan horizontal bergeser."""
    import random
    size = out.size
    a = out.getchannel("A")
    base = Image.new("RGBA", size, (0, 0, 0, 0))
    base.alpha_composite(_solid(size, (255, 0, 70, 255), _shift(a, -g, 0).point(lambda v: v * 3 // 4)))
    base.alpha_composite(_solid(size, (0, 235, 255, 255), _shift(a, g, 0).point(lambda v: v * 3 // 4)))
    base.alpha_composite(out)
    if slices:
        bb = a.getbbox()
        if bb:
            rng = random.Random(seed)
            y0, y1 = bb[1], bb[3]
            for _ in range(3):
                hh = max(2, round((y1 - y0) * rng.uniform(0.05, 0.11)))
                yy = rng.randint(y0, max(y0, y1 - hh))
                band = base.crop((0, yy, size[0], yy + hh))
                clear = Image.new("RGBA", band.size, (0, 0, 0, 0))
                base.paste(clear, (0, yy))
                base.alpha_composite(band, (round(rng.choice((-1, 1)) * g * rng.uniform(0.8, 1.6)), yy))
    return base


def _char_boxes(origin, spec, font, lines, fsize):
    """Kotak tiap huruf (x0, x1, atas, bawah) di kanvas lokal, untuk animasi per huruf."""
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    ox, oy = origin
    w, h, pad = spec["w"], spec["h"], spec.get("padding") or 0
    lh = fsize * (spec.get("lineHeight") or 1.1)
    ls = spec.get("letterSpacing") or 0
    align = spec.get("align") or "center"
    top = oy + (h - lh * len(lines)) / 2
    out = []
    for i, line in enumerate(lines):
        lw = d.textlength(line, font=font) + ls * len(line)
        x = ox + pad if align == "left" else ox + w - pad - lw if align == "right" else ox + (w - lw) / 2
        for j, ch in enumerate(line):
            a = x + d.textlength(line[:j], font=font) + ls * j
            b = x + d.textlength(line[:j + 1], font=font) + ls * j
            if ch.strip():
                out.append((a, b, top + lh * i, top + lh * (i + 1)))
    return out


def _wrap(draw, text, font, max_w, ls):
    def width(s):
        return draw.textlength(s, font=font) + ls * len(s)

    lines = []
    for para in str(text).split("\n"):
        words, cur = para.split(" "), ""
        for wd in words:
            cand = wd if not cur else cur + " " + wd
            if width(cand) <= max_w or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = wd
            while width(cur) > max_w and len(cur) > 1:  # kata kepanjangan: potong per huruf
                cut = len(cur)
                while cut > 1 and width(cur[:cut]) > max_w:
                    cut -= 1
                lines.append(cur[:cut])
                cur = cur[cut:]
        lines.append(cur)
    return lines


def _layout(spec, text):
    """-> (font, lines, size) dengan font dikecilkan bila teks judul tak muat."""
    w, h, pad = spec["w"], spec["h"], spec.get("padding") or 0
    lh = spec.get("lineHeight") or 1.1
    ls = spec.get("letterSpacing") or 0
    size = float(spec.get("size") or 64)
    weight = 700 if spec.get("bold") else 400
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    one = bool(spec.get("singleLine"))  # teks brand: selalu 1 baris, dikecilkan sampai muat
    fit = one or spec.get("autoFit", TOKEN in str(spec.get("text", "")))
    min_size = size * (0.2 if one else 0.35)
    while True:
        font = border.load_font(spec.get("font") or "Space Grotesk", size, weight)
        lines = _wrap(probe, text, font, max(10, w - 2 * pad), ls)
        ok = len(lines) == 1 if one else len(lines) * size * lh <= h - 2 * pad
        if not fit or size <= min_size or ok:
            break
        size *= 0.92
    max_lines = max(1, int((h - 2 * pad) // (size * lh)) or 1)
    if len(lines) > max_lines:  # tetap kepanjangan -> potong + elipsis (seperti Konva)
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip() + "…"
    return font, lines, size


def _mask(size, origin, spec, font, lines, fsize, r):
    """Mask teks (L) dengan garis tepi radius r di kanvas lokal."""
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    ox, oy = origin
    w, h, pad = spec["w"], spec["h"], spec.get("padding") or 0
    lh = fsize * (spec.get("lineHeight") or 1.1)
    ls = spec.get("letterSpacing") or 0
    align = spec.get("align") or "center"
    top = oy + (h - lh * len(lines)) / 2
    r = max(0, round(r))
    for i, line in enumerate(lines):
        cy = top + lh * (i + 0.5)
        lw = d.textlength(line, font=font) + ls * len(line)
        if align == "left":
            x = ox + pad
        elif align == "right":
            x = ox + w - pad - lw
        else:
            x = ox + (w - lw) / 2
        if ls:
            for ch in line:
                d.text((x, cy), ch, font=font, fill=255, anchor="lm", stroke_width=r, stroke_fill=255)
                x += d.textlength(ch, font=font) + ls
        else:
            d.text((x, cy), line, font=font, fill=255, anchor="lm", stroke_width=r, stroke_fill=255)
    if spec.get("italic"):
        cy = oy + h / 2
        m = m.transform(size, Image.AFFINE, (1, ITALIC_SKEW, -ITALIC_SKEW * cy, 0, 1, 0), Image.BICUBIC)
    return m


def _shift(mask, dx, dy):
    return ImageChops.offset(mask, round(dx), round(dy))


# ---------------------------------------------------------------- efek 3D realistis (tahap 2)
# Semua deterministik (noise ber-seed), supaya pratinjau = hasil export, dan nanti
# animasi tidak berkedip antar frame.

def _noise(size, seed):
    import random
    w, h = size
    return Image.frombytes("L", (w, h), random.Random(seed).randbytes(w * h))


def _gain(img, k):
    return img.point(lambda v: min(255, round(v * k)))


def _overlay(out, size, signal, mask, k):
    """signal (L, 128 = netral): >128 menerangkan, <128 menggelapkan, hanya di dalam mask."""
    light = ImageChops.multiply(_gain(signal.point(lambda v: max(0, v - 128) * 2), k), mask)
    dark = ImageChops.multiply(_gain(signal.point(lambda v: max(0, 128 - v) * 2), k), mask)
    out.alpha_composite(_solid(size, (0, 0, 0, 255), dark))
    out.alpha_composite(_solid(size, (255, 255, 255, 255), light))


def _texture(out, size, kind, strength, mask, fsize):
    k = max(0.0, min(1.0, strength / 100))
    if not k:
        return
    w, h = size
    if kind == "brushed":  # logam sikat: guratan halus horizontal
        small = _noise((max(2, w // 28), h), 11)
        sig = small.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.6))
        _overlay(out, size, sig, mask, 0.4 * k)
    elif kind == "grain":  # butiran halus (cat logam / batu)
        sig = _noise(size, 23).filter(ImageFilter.GaussianBlur(0.7))
        sig = sig.point(lambda v: 128 + (v - 128) * 3)
        _overlay(out, size, sig, mask, 0.45 * k)
    elif kind == "glitter":  # kilau glitter: titik-titik cahaya tersebar
        sp = _noise(size, 37).point(lambda v: 255 if v >= 254 else 0)
        r = max(3, round(fsize / 40)) | 1
        sp = sp.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.GaussianBlur(max(0.6, r / 4)))
        sp = ImageChops.multiply(_gain(sp, 1.8 * k), mask)
        out.alpha_composite(_solid(size, (255, 255, 255, 255), sp))
        sig = _noise(size, 41).filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 128 + (v - 128) * 2)
        _overlay(out, size, sig, mask, 0.25 * k)


def _bevel(out, size, mask, b, strength, light):
    """Bevel/emboss: tepi yang menghadap cahaya terang, sisi seberangnya gelap."""
    k = max(0.0, min(1.0, strength / 100))
    if b <= 0 or not k:
        return
    hmap = mask.filter(ImageFilter.GaussianBlur(max(0.8, b / 2)))
    d = max(1.0, b / 2)
    lx, ly = math.cos(light), math.sin(light)
    hi = ImageChops.subtract(hmap, _shift(hmap, -lx * d, -ly * d))
    sh = ImageChops.subtract(hmap, _shift(hmap, lx * d, ly * d))
    g = 3.2 * k
    hi = ImageChops.multiply(_gain(hi, g), mask)
    sh = ImageChops.multiply(_gain(sh, g * 0.85), mask)
    out.alpha_composite(_solid(size, (0, 0, 0, 255), sh))
    out.alpha_composite(_solid(size, (255, 255, 255, 255), hi))


def _gloss(out, size, mask, box):
    """Kilap kaca: pantulan lengkung di separuh atas teks."""
    x0, y0, x1, y1 = box
    h = y1 - y0
    w, H = size
    ell = Image.new("L", size, 0)
    ImageDraw.Draw(ell).ellipse((x0 - (x1 - x0) * 0.35, y0 - h * 1.25, x1 + (x1 - x0) * 0.35, y0 + h * 0.52), fill=255)
    ell = ell.filter(ImageFilter.GaussianBlur(max(1, h * 0.03)))
    col = Image.new("L", (1, H), 0)
    for y in range(H):
        t = (y - y0) / max(1, h)
        col.putpixel((0, y), round(max(0.0, min(1.0, 1 - t / 0.55)) * 150 + (40 if 0 <= t <= 0.55 else 0)))
    a = ImageChops.multiply(ImageChops.multiply(col.resize(size), ell), mask)
    out.alpha_composite(_solid(size, (255, 255, 255, 255), a))


# ---------------------------------------------------------------- efek TikTok (Frame Studio tahap 2, 17 Nov)
# Kotak per baris, sorot kata, stabilo, bayangan panjang, teks melengkung. Semua aktif
# hanya bila field-nya diisi; tanpa field itu render_layer menghasilkan gambar yang sama
# persis dengan sebelumnya (diuji regresi hash piksel).

def _tiktok_on(spec) -> bool:
    return bool(spec.get("lineBox") or spec.get("marker") or _hl_on(spec)
                or (spec.get("longShadow") or 0) > 0 or (spec.get("curve") or 0))


def _hl_on(spec) -> bool:
    return bool((spec.get("hlColor") or spec.get("hlBg")) and (spec.get("hlWords") or spec.get("hlAuto")))


def _curve_amp(spec) -> float:
    """Batas atas simpangan lengkung (px) untuk ruang tepi; + = pelangi (ujung turun), - = senyum."""
    c = max(-100.0, min(100.0, float(spec.get("curve") or 0)))
    return c / 100 * spec["w"] * 0.4


def _tiktok_margin(spec) -> int:
    if not _tiktok_on(spec):
        return 0
    size = float(spec.get("size") or 64)
    m = 0.0
    if spec.get("lineBox"):
        m = max(m, size * max(0.0, float(spec.get("lineBoxPad", 30) or 0)) / 100 + 4)
    if spec.get("marker") or spec.get("hlBg"):
        m = max(m, size * 0.4)
    m += max(0.0, float(spec.get("longShadow") or 0))
    m += abs(_curve_amp(spec))
    return int(m) + 2


def _lines_geo(origin, spec, font, lines, fsize):
    """-> [(x kiri, lebar, cy, teks baris)] persis seperti _mask menata baris."""
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    ox, oy = origin
    w, h, pad = spec["w"], spec["h"], spec.get("padding") or 0
    lh = fsize * (spec.get("lineHeight") or 1.1)
    ls = spec.get("letterSpacing") or 0
    align = spec.get("align") or "center"
    top = oy + (h - lh * len(lines)) / 2
    out = []
    for i, line in enumerate(lines):
        lw = d.textlength(line, font=font) + ls * len(line)
        x = ox + pad if align == "left" else ox + w - pad - lw if align == "right" else ox + (w - lw) / 2
        out.append((x, lw, top + lh * (i + 0.5), line))
    return out


def _skew_like_text(m, spec, origin, size):
    """Miringkan mask dengan transformasi italic yang sama dengan _mask."""
    if spec.get("italic"):
        cy = origin[1] + spec["h"] / 2
        m = m.transform(size, Image.AFFINE, (1, ITALIC_SKEW, -ITALIC_SKEW * cy, 0, 1, 0), Image.BICUBIC)
    return m


def _ink_v(font):
    """Batas atas/bawah tinta relatif garis tengah (anchor 'lm'), dari huruf 'Hg'."""
    _l, t, _r, b = font.getbbox("Hg", anchor="lm")
    return t, b


def _line_box_mask(size, origin, spec, font, lines, fsize):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    t, b = _ink_v(font)
    px = fsize * max(0.0, float(spec.get("lineBoxPad", 30) or 0)) / 100
    py = px * 0.45
    rk = max(0.0, min(100.0, float(spec.get("lineBoxRadius", 30) if spec.get("lineBoxRadius") is not None else 30))) / 100
    for x, lw, cy, line in _lines_geo(origin, spec, font, lines, fsize):
        if not line.strip():
            continue
        box = (x - px, cy + t - py, x + lw + px, cy + b + py)
        r = (box[3] - box[1]) / 2 * rk
        d.rounded_rectangle(box, radius=r, fill=255)
    return _skew_like_text(m, spec, origin, size)


def _marker_mask(size, origin, spec, font, lines, fsize):
    """Coretan stabilo kasar di separuh bawah tiap baris (deterministik)."""
    import random
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    t, b = _ink_v(font)
    for i, (x, lw, cy, line) in enumerate(_lines_geo(origin, spec, font, lines, fsize)):
        if not line.strip():
            continue
        rng = random.Random(97 + i * 31 + len(line))
        y0, y1 = cy + t * 0.18, cy + b * 0.92
        x0, x1 = x - fsize * 0.18, x + lw + fsize * 0.18
        j = fsize * 0.035
        n = max(3, int((x1 - x0) / (fsize * 0.45)))
        tilt = rng.uniform(-1, 1) * fsize * 0.05
        top = [(x0 + (x1 - x0) * k / n, y0 + tilt * (k / n - 0.5) + rng.uniform(-j, j)) for k in range(n + 1)]
        bot = [(x0 + (x1 - x0) * k / n + fsize * 0.06, y1 + tilt * (k / n - 0.5) + rng.uniform(-j, j)) for k in range(n, -1, -1)]
        d.polygon(top + bot, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(max(0.6, fsize / 90)))
    return _skew_like_text(m, spec, origin, size)


def _norm_word(s):
    import re
    return re.sub(r"[^\w]", "", str(s), flags=re.UNICODE).lower()


def _word_spans(origin, spec, font, lines, fsize):
    """-> [(x0, x1, cy, kata)] semua kata (urutan tampil), x0/x1 = tepi tinta kira-kira."""
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    ls = spec.get("letterSpacing") or 0
    out = []
    for x, _lw, cy, line in _lines_geo(origin, spec, font, lines, fsize):
        j = 0
        for word in line.split(" "):
            if word:
                a = x + d.textlength(line[:j], font=font) + ls * j
                b = x + d.textlength(line[:j + len(word)], font=font) + ls * (j + len(word))
                out.append((a, b, cy, word))
            j += len(word) + 1
    return out


def _hl_pick(spec, spans):
    words = [_norm_word(s[3]) for s in spans]
    pick = set()
    keys = {_norm_word(k) for part in str(spec.get("hlWords") or "").replace("\n", ",").split(",") for k in part.split()}
    keys.discard("")
    for i, wd in enumerate(words):
        if wd and wd in keys:
            pick.add(i)
    idx = [i for i, wd in enumerate(words) if wd]
    auto = spec.get("hlAuto") or ""
    if idx and auto == "first":
        pick.add(idx[0])
    elif idx and auto == "last":
        pick.add(idx[-1])
    elif idx and auto == "longest":
        pick.add(max(idx, key=lambda i: len(words[i])))
    return pick


def _hl_masks(size, origin, spec, font, lines, fsize, fill_m):
    """-> (mask isi kata sorot, mask kotak di belakang kata sorot) atau (None, None)."""
    spans = _word_spans(origin, spec, font, lines, fsize)
    pick = _hl_pick(spec, spans)
    if not pick:
        return None, None
    lh = fsize * (spec.get("lineHeight") or 1.1)
    space = ImageDraw.Draw(Image.new("L", (1, 1))).textlength(" ", font=font) + (spec.get("letterSpacing") or 0)
    reg = Image.new("L", size, 0)
    rd = ImageDraw.Draw(reg)
    boxes = Image.new("L", size, 0)
    bd = ImageDraw.Draw(boxes)
    t, b = _ink_v(font)
    px = fsize * 0.14
    for i in sorted(pick):
        a, z, cy, _w = spans[i]
        rd.rectangle((a - space / 2, cy - lh / 2, z + space / 2, cy + lh / 2), fill=255)
        bd.rounded_rectangle((a - px, cy + t - px * 0.55, z + px, cy + b + px * 0.35), radius=fsize * 0.16, fill=255)
    reg = _skew_like_text(reg, spec, origin, size)
    boxes = _skew_like_text(boxes, spec, origin, size)
    return ImageChops.multiply(reg, fill_m), boxes


def _long_shadow(mask, angle_deg, length):
    """Gabungan mask yang digeser 0..length piksel searah sudut (doubling, O(log n))."""
    a = math.radians(angle_deg)
    dx, dy = math.cos(a), math.sin(a)
    ext, n = mask, 0
    while n < length:
        s = min(n + 1, length - n)
        ext = ImageChops.lighter(ext, _shift(ext, dx * s, dy * s))
        n += s
    return ext


def _long_layers(out, size, back_m, spec):
    L = max(0, min(800, round(float(spec.get("longShadow") or 0))))
    if not L:
        return
    col = _rgba(spec.get("longColor") or "#000000")
    ang = spec.get("longAngle", 45) if spec.get("longAngle") is not None else 45
    if not spec.get("longFade"):
        out.alpha_composite(_solid(size, col, _long_shadow(back_m, ang, L)))
        return
    # memudar halus: ext = max(mask, geser(ext) * decay) per langkah -> alpha turun eksponensial
    a = math.radians(ang)
    steps = min(L, 220)
    st = L / steps
    decay = 0.04 ** (1 / steps)
    lut = [round(v * decay) for v in range(256)]
    ext = back_m
    px = py = 0  # posisi bulat kumulatif, supaya sudut tetap akurat walau tiap langkah < 1 px
    for i in range(1, steps + 1):
        nx, ny = round(math.cos(a) * st * i), round(math.sin(a) * st * i)
        ext = ImageChops.lighter(back_m, ImageChops.offset(ext, nx - px, ny - py).point(lut))
        px, py = nx, ny
    out.alpha_composite(_solid(size, col, ext))


def _curve(img, cx, half_w, amp):
    """Lengkungkan seluruh gambar: tiap kolom digeser vertikal amp * u^2 (u = -1..1 di tepi kotak)."""
    if not amp:
        return img
    w, h = img.size
    step = 6
    mesh = []

    def off(x):
        u = max(-1.4, min(1.4, (x - cx) / max(1.0, half_w)))
        return amp * u * u

    for x0 in range(0, w, step):
        x1 = min(w, x0 + step)
        o0, o1 = off(x0), off(x1)
        mesh.append(((x0, 0, x1, h), (x0, -o0, x0, h - o0, x1, h - o1, x1, -o1)))
    return img.transform((w, h), Image.MESH, mesh, Image.BICUBIC)


def render_layer(spec: dict, text: str, boxes: list | None = None):
    """-> (gambar RGBA, (x, y) posisi tempel di kanvas desain) atau None bila teks kosong.
    boxes (opsional): diisi kotak tiap huruf di koordinat gambar (untuk animasi kinetik)."""
    if spec.get("uppercase"):
        text = text.upper()
    if not text.strip():
        return None
    w, h = spec["w"], spec["h"]
    sw = spec.get("strokeWidth") or 0 if spec.get("stroke") else 0
    ow = spec.get("outline2Width") or 0 if spec.get("outline2") else 0
    depth = max(0, min(80, round(spec.get("depth") or 0)))
    blur = spec.get("shadowBlur", 20) if spec.get("shadowColor") else 0
    sx = spec.get("shadowX", 0) if spec.get("shadowColor") else 0
    sy = spec.get("shadowY", 8) if spec.get("shadowColor") else 0
    gsize = spec.get("glowSize", 30) if spec.get("glow") else 0
    rot = spec.get("rotation") or 0
    gl = max(0.0, float(spec.get("glitch") or 0))
    M = int(depth + sw + 2 * ow + 2 * max(blur, gsize) + abs(sx) + abs(sy) + 24 + gl * 3)
    M += _tiktok_margin(spec)  # 0 bila efek tahap 2 tidak dipakai
    if rot:
        M += int(max(w, h))
    size = (int(w + 2 * M), int(h + 2 * M))
    origin = (M, M)

    font, lines, fsize = _layout(spec, text)
    curved = bool(spec.get("curve"))
    if boxes is not None and not rot and not curved:
        boxes.extend(_char_boxes(origin, spec, font, lines, fsize))
    fill_m = _mask(size, origin, spec, font, lines, fsize, 0)
    stroke_m = _mask(size, origin, spec, font, lines, fsize, sw / 2) if sw else fill_m
    back_r = sw / 2 + ow
    back_m = _mask(size, origin, spec, font, lines, fsize, back_r) if back_r else fill_m

    out = Image.new("RGBA", size, (0, 0, 0, 0))
    if spec.get("bg"):
        bgc = _rgba(spec["bg"])
        bgc = bgc[:3] + (round(bgc[3] * (spec.get("bgOpacity", 1) if spec.get("bgOpacity") is not None else 1)),)
        rr = min(spec.get("radius") or 0, h / 2, w / 2)
        ImageDraw.Draw(out).rounded_rectangle((M, M, M + w, M + h), radius=rr, fill=bgc)

    hl_fill = hl_box = None
    if _tiktok_on(spec):  # efek tahap 2 di belakang teks: kotak per baris, stabilo, kotak kata sorot
        if spec.get("lineBox"):
            lbc = _rgba(spec.get("lineBoxColor") or "#FFFFFF")
            op_k = max(0.0, min(100.0, float(spec.get("lineBoxOpacity", 100) if spec.get("lineBoxOpacity") is not None else 100))) / 100
            out.alpha_composite(_solid(size, lbc[:3] + (round(lbc[3] * op_k),), _line_box_mask(size, origin, spec, font, lines, fsize)))
        if spec.get("marker"):
            out.alpha_composite(_solid(size, _rgba(spec["marker"]), _marker_mask(size, origin, spec, font, lines, fsize)))
        if _hl_on(spec):
            hl_fill, hl_box = _hl_masks(size, origin, spec, font, lines, fsize, fill_m)
        if (spec.get("longShadow") or 0) > 0:
            _long_layers(out, size, back_m, spec)

    def shadow_of(mask):
        if not spec.get("shadowColor"):
            return
        s = _shift(mask, sx, sy)
        if blur:
            s = s.filter(ImageFilter.GaussianBlur(blur / 2))
        out.alpha_composite(_solid(size, _rgba(spec["shadowColor"]), s))

    hollow = bool(spec.get("hollow")) and sw > 0
    ring = ImageChops.subtract(stroke_m, _erode(fill_m, sw / 2)) if hollow else None
    if hollow:
        back_m = ring if not ow else back_m  # neon tabung: pendar & bayangan mengikuti cincin
    if spec.get("glow"):
        g = _rgba(spec["glow"])
        halo = back_m.filter(ImageFilter.GaussianBlur(max(1, gsize / 2)))
        for _ in range(2):
            out.alpha_composite(_solid(size, g, halo))
            if not hollow:
                out.alpha_composite(_solid(size, g, back_m))

    if depth:
        a = math.radians(spec.get("depthAngle", 45) if spec.get("depthAngle") is not None else 45)
        dx, dy = math.cos(a), math.sin(a)
        shadow_of(_shift(back_m, dx * depth, dy * depth))
        far = _rgba(spec.get("depthColor") or "#000000")
        if spec.get("depthColor2") and depth > 1:  # sisi 3D bergradasi: dekat muka terang -> belakang gelap
            near = _rgba(spec["depthColor2"])
            for k in range(depth, 0, -1):
                out.alpha_composite(_solid(size, _lerp(near, far, (k - 1) / (depth - 1)), _shift(back_m, dx * k, dy * k)))
        else:
            ext = Image.new("L", size, 0)
            for k in range(depth, 0, -1):
                ext = ImageChops.lighter(ext, _shift(back_m, dx * k, dy * k))
            out.alpha_composite(_solid(size, far, ext))

    if ow:
        if not depth:
            shadow_of(back_m)
        out.alpha_composite(_solid(size, _rgba(spec["outline2"]), back_m))

    c1 = _rgba(spec.get("color"), (255, 255, 255, 255))
    if hollow:  # neon tabung: cincin warna garis tepi + inti tipis warna teks
        if not depth and not ow:
            shadow_of(ring)
        out.alpha_composite(_solid(size, _rgba(spec["stroke"]), ring))
        cr = max(1.0, sw / 6)
        core = ImageChops.subtract(_mask(size, origin, spec, font, lines, fsize, cr), _erode(fill_m, cr))
        out.alpha_composite(_solid(size, c1, core.filter(ImageFilter.GaussianBlur(0.6))))
        fill_m = ring  # bevel/kilap/tekstur mengikuti cincin
    else:
        if not depth and not ow:
            shadow_of(stroke_m)
        if sw:
            out.alpha_composite(_solid(size, _rgba(spec["stroke"]), stroke_m))
        if hl_box is not None and spec.get("hlBg"):  # label kata sorot: di atas garis tepi, di bawah isi
            out.alpha_composite(_solid(size, _rgba(spec["hlBg"]), hl_box))
        th = fsize * (spec.get("lineHeight") or 1.1) * len(lines)
        grad = _fill_image(spec, size, c1, fill_m.getbbox() or (M, M, M + w, M + h),
                           (M + (h - th) / 2, M + (h + th) / 2), th)
        if grad is not None:
            grad.putalpha(ImageChops.multiply(grad.getchannel("A"), fill_m))
            out.alpha_composite(grad)
        else:
            out.alpha_composite(_solid(size, c1, fill_m))
        if hl_fill is not None and spec.get("hlColor"):  # warna kata sorot menimpa isi teks
            out.alpha_composite(_solid(size, _rgba(spec["hlColor"]), hl_fill))

    if spec.get("texture"):
        _texture(out, size, spec["texture"], spec.get("textureStrength", 60), fill_m, fsize)
    la = math.radians(spec.get("lightAngle", 240) if spec.get("lightAngle") is not None else 240)
    if spec.get("bevel"):
        _bevel(out, size, fill_m, float(spec["bevel"]), spec.get("bevelStrength", 70), la)
    if spec.get("gloss"):
        th = fsize * (spec.get("lineHeight") or 1.1) * len(lines)
        _gloss(out, size, fill_m, (M, M + (h - th) / 2 + fsize * 0.12, M + w, M + (h + th) / 2))

    if gl:
        out = _glitch(out, gl, bool(spec.get("glitchSlices")))

    if curved:
        bb = (_mask(size, origin, spec, font, lines, fsize, 0) if hollow else fill_m).getbbox()
        if bb:
            half = (bb[2] - bb[0]) / 2
            c = max(-100.0, min(100.0, float(spec.get("curve") or 0)))
            out = _curve(out, (bb[0] + bb[2]) / 2, half, c / 100 * half * 0.4)

    op = spec.get("opacity", 1)
    if op is not None and op < 1:
        out.putalpha(out.getchannel("A").point(lambda v: round(v * op)))
    if rot:
        out = out.rotate(-rot, resample=Image.BICUBIC, center=origin)
    return out, (round(spec["x"] - M), round(spec["y"] - M))


def resolve(spec: dict, title: str) -> str:
    """Isi teks layer: token {judul} diganti judul klip; judul kosong -> teks cadangan."""
    raw = str(spec.get("text") or "")
    if TOKEN not in raw:
        return raw
    t = border.clean_text(title)
    if not t:
        return border.clean_text(spec.get("fallback") or "")
    return raw.replace(TOKEN, t)


def render_layers(layers: list[dict], size, title: str) -> Image.Image:
    """Semua layer dinamis digabung jadi satu overlay seukuran frame asli."""
    canvas = Image.new("RGBA", tuple(size), (0, 0, 0, 0))
    for spec in layers or []:
        if spec.get("visible") is False:
            continue
        r = render_layer(spec, resolve(spec, title))
        if r:
            img, pos = r
            _paste(canvas, img, pos)
    return canvas


def _paste(canvas, img, pos):
    x, y = pos
    W, H = canvas.size
    sx0, sy0 = max(0, -x), max(0, -y)
    dx0, dy0 = max(0, x), max(0, y)
    w = min(img.width - sx0, W - dx0)
    h = min(img.height - sy0, H - dy0)
    if w > 0 and h > 0:
        canvas.alpha_composite(img.crop((sx0, sy0, sx0 + w, sy0 + h)), (dx0, dy0))


# ---------------------------------------------------------------- animasi teks (tahap 3)
# Layer beranimasi dirender sekali (pose diam), lalu tiap frame animasi dibentuk dari
# gambar itu: geser (melayang), putar (goyang), skala (denyut / pop-in), atau sapuan
# cahaya (kilau berjalan). Urutan frame = intro (pop-in, sekali) + satu putaran loop;
# renderer menempelkannya ke video dengan filter loop ffmpeg.

# gelombang 1 animasi baru (17 Nov): ditangani _loop_new / _intro_new, animasi lama tidak tersentuh
NEW_LOOPS = ("shake", "jitter", "heartbeat", "swing", "jelly", "tada", "breathe", "rainbow", "beat", "flip3d")
NEW_INS = ("words", "drop", "zoomin", "blurin", "slideup", "slidedown", "slideright", "wipe", "spinin", "flip",
           "rubber", "neonon")
ANIM_LOOPS = ("float", "wobble", "pulse", "shine", "wave", "bounce", "flicker", "glitch") + NEW_LOOPS
ANIM_INS = ("pop", "slide", "glitchin", "type", "letters", "assemble") + NEW_INS
LETTER_LOOPS = ("wave", "bounce", "jitter")
LETTER_INS = ("type", "letters", "assemble", "words")
POP_DUR = 0.45  # detik


def has_anim(spec: dict) -> bool:
    return (spec or {}).get("anim") in ANIM_LOOPS or (spec or {}).get("animIn") in ANIM_INS


def _ease_back(p):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2


def _shine(img, phase, a):
    """Pita cahaya miring yang menyapu teks pada 60% awal putaran, lalu jeda.
    Inti putih di dalam huruf + pendar (bloom) di sekitar huruf, supaya tetap terlihat
    walau teksnya sendiri sudah putih/terang."""
    if phase > 0.6:
        return img
    w, h = img.size
    p = phase / 0.6
    band = max(10, w * 0.12)
    cx = -band * 2 + (w + h * 0.35 + band * 4) * p
    row = Image.new("L", (w + h, 1), 0)
    for x in range(w + h):
        d = abs(x - cx) / band
        if d < 1:
            row.putpixel((x, 0), round((1 - d * d) * 255))
    sweep = row.resize((w + h, h)).transform((w, h), Image.AFFINE, (1, 0.35, 0, 0, 1, 0))
    k = min(1.0, 0.45 + a)
    alpha = img.getchannel("A")
    # pendar di sekitar huruf (ikut keluar dari huruf, terlihat di latar apa pun)
    bloom = alpha.filter(ImageFilter.GaussianBlur(max(2, h * 0.05)))
    bloom = ImageChops.multiply(_gain(ImageChops.multiply(bloom, sweep), 1.6 * k), Image.new("L", (w, h), 255))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(_solid((w, h), (255, 248, 220, 255), bloom))
    out.alpha_composite(img)
    # inti kilau di dalam huruf
    core = _gain(ImageChops.multiply(sweep, alpha), k)
    out.alpha_composite(_solid((w, h), (255, 255, 255, 255), core))
    star = _gain(ImageChops.multiply(sweep.point(lambda v: max(0, v - 200) * 4), alpha), 1.0)
    out.alpha_composite(_solid((w, h), (255, 255, 255, 255), star))
    return out


def anim_frames(img: Image.Image, spec: dict, fps: int = 30, scale: float = 1.0, boxes: list | None = None):
    """-> (frames, pad, intro, loop): semua frame seukuran img + 2*pad, diletakkan di pos - pad.

    Gerakan berulang (anim): float, wobble, pulse, shine (seluruh teks) dan kinetik per huruf:
    wave (gelombang), bounce (lompat bergantian), flicker (neon berkedip), glitch (glitch berkala).
    Intro (animIn): pop, slide, glitchin (seluruh teks); type, letters, assemble (per huruf).
    boxes: kotak tiap huruf dari render_layer(..., boxes) di koordinat img (sudah diskalakan)."""
    kind = spec.get("anim") if spec.get("anim") in ANIM_LOOPS else ""
    intro_kind = spec.get("animIn") if spec.get("animIn") in ANIM_INS else ""
    a = max(0.0, min(1.0, float(spec.get("animAmount", 50) if spec.get("animAmount") is not None else 50) / 100))
    T = max(0.5, min(8.0, float(spec.get("animSpeed") or 2)))
    w, h = img.size
    th = max(10.0, float(spec.get("h") or h) * scale)  # tinggi kotak teks
    pieces = _pieces(img, boxes) if (kind in LETTER_LOOPS or intro_kind in LETTER_INS) else None
    n_l = len(pieces or [])

    # ruang tambahan: lp untuk gerak per huruf, pad untuk gerak seluruh teks
    lp = 0
    if pieces:
        lp = int(th * (0.7 if intro_kind == "assemble" else 0.3))
    amp = max(2.0, a * 0.16 * th)
    big = max(w, h) + 2 * lp
    pad = 0
    if kind == "wobble":
        pad = int(big * 0.13)
    elif kind == "pulse" or intro_kind == "pop":
        pad = int(big * 0.09)
    if kind == "float":
        pad = max(pad, int(amp) + 2)
    if intro_kind == "slide":
        pad = max(pad, 2)
    if kind in NEW_LOOPS or intro_kind in NEW_INS:  # ruang gerak animasi baru (animasi lama: tidak berubah)
        pad = max(pad, _new_pad(kind, intro_kind, big, th, a))
    bw, bh = w + 2 * lp, h + 2 * lp
    size = (bw + 2 * pad, bh + 2 * pad)
    gl = max(3.0, a * 0.09 * th)

    def letters(params):
        """params(i) -> (dx, dy, skala, rotasi, opasitas) per huruf -> gambar bw x bh."""
        out = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        for i, (pc, x0, y0) in enumerate(pieces):
            dx, dy, sc, rot, op = params(i)
            if op <= 0.003:
                continue
            im = pc
            if sc != 1:
                im = im.resize((max(1, round(pc.width * sc)), max(1, round(pc.height * sc))), Image.BICUBIC)
            if rot:
                im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
            if op < 1:
                im = im.copy()
                im.putalpha(im.getchannel("A").point(lambda v: round(v * op)))
            _paste(out, im, (round(lp + x0 + dx - (im.width - pc.width) / 2), round(lp + y0 + dy - (im.height - pc.height) / 2)))
        return out

    rest = None

    def base_rest():
        nonlocal rest
        if rest is None:
            rest = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
            rest.alpha_composite(img, (lp, lp))
        return rest

    def whole(im, sc=1.0, ang=0.0, dx=0.0, dy=0.0, op=1.0):
        if sc != 1:
            im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.BICUBIC)
        if ang:
            im = im.rotate(ang, resample=Image.BICUBIC, expand=True)
        if op < 1:
            im = im.copy()
            im.putalpha(im.getchannel("A").point(lambda v: round(v * op)))
        out = Image.new("RGBA", size, (0, 0, 0, 0))
        _paste(out, im, (round(size[0] / 2 - im.width / 2 + dx), round(size[1] / 2 - im.height / 2 + dy)))
        return out

    # ---- satu putaran gerakan berulang
    def loop_frame(i, n):
        phase = i / n
        s2 = math.sin(2 * math.pi * phase)
        if kind == "wave" and pieces:
            base = letters(lambda j: (0, -amp * 0.8 * math.sin(2 * math.pi * (phase - j / max(1, n_l) * 0.8)), 1, 0, 1))
        elif kind == "bounce" and pieces:
            def hop(j):
                t = (phase * n_l * 1.0 - j) % n_l  # tiap huruf lompat bergiliran
                y = -amp * 1.3 * math.sin(math.pi * t) if t < 1 else 0
                return (0, y, 1 + (0.06 * a * math.sin(math.pi * t) if t < 1 else 0), 0, 1)
            base = letters(hop)
        else:
            base = base_rest()
        if kind == "shine":
            base = base.copy()
            base.paste(_shine(img, phase, a), (lp, lp))
        op = 1.0
        if kind == "flicker":  # neon rusak: padam sebentar di titik tetap tiap putaran
            for p0, p1, v in ((0.08, 0.11, 0.15), (0.14, 0.16, 0.5), (0.55, 0.57, 0.1), (0.6, 0.62, 0.6)):
                if p0 <= phase < p1:
                    op = 1 - max(0.3, a) * (1 - v)
        if kind == "glitch" and phase < 0.14:  # ledakan glitch singkat di awal tiap putaran
            base = _glitch(base, gl * (1.4 - phase * 5), True, seed=i + 1)
        sc, ang, dy = 1.0, 0.0, 0.0
        if kind == "float":
            dy = -amp * s2
        elif kind == "wobble":
            ang = a * 7 * s2
        elif kind == "pulse":
            sc = 1 + a * 0.1 * (0.5 - 0.5 * math.cos(2 * math.pi * phase))
        return whole(base, sc, ang, 0, dy, min(1.0, op))

    # ---- intro (sekali di awal)
    def intro_frames():
        if not intro_kind:
            return []
        if intro_kind in LETTER_INS and not pieces:  # tanpa data huruf -> pop biasa
            return [whole(base_rest(), max(0.02, _ease_back(p)), op=min(1.0, p * 2.5)) for p in _steps(POP_DUR, fps)]
        if intro_kind == "pop":
            return [whole(base_rest(), max(0.02, _ease_back(p)), op=min(1.0, p * 2.5)) for p in _steps(POP_DUR, fps)]
        if intro_kind == "slide":
            dist = size[0] * 0.6
            return [whole(base_rest(), dx=-dist * (1 - p) ** 3, op=min(1.0, p * 1.8)) for p in _steps(0.5, fps)]
        if intro_kind == "glitchin":
            out = []
            for k, p in enumerate(_steps(0.6, fps)):
                b = _glitch(base_rest(), gl * 2.2 * (1 - p) + 1, True, seed=k + 3)
                out.append(whole(b, op=0.0 if k % 4 == 1 and p < 0.6 else 1.0))
            return out
        st = min(0.09, 0.9 / max(1, n_l))  # jeda antar huruf
        if intro_kind == "type":
            dur = st * n_l + 0.12
            res = []
            for p in _steps(dur, fps):
                t = p * dur
                res.append(whole(letters(lambda j: (0, 0, 1.0 + 0.25 * max(0.0, 1 - (t - j * st) / 0.08) if t >= j * st else 1,
                                                    0, 1.0 if t >= j * st else 0.0))))
            return res
        if intro_kind == "letters":
            ld = 0.35
            dur = st * (n_l - 1) + ld
            res = []
            for p in _steps(dur, fps):
                t = p * dur
                def f(j):
                    q = min(1.0, max(0.0, (t - j * st) / ld))
                    return (0, (1 - q) * th * 0.25, max(0.02, _ease_back(q)) if q > 0 else 0.02, 0, min(1.0, q * 2.5))
                res.append(whole(letters(f)))
            return res
        if intro_kind == "assemble":
            import random
            rng = random.Random(9)
            seeds = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)) for _ in range(n_l)]
            res = []
            for p in _steps(0.8, fps):
                e = 1 - (1 - p) ** 3
                def f(j):
                    sx, sy, sr = seeds[j]
                    return (sx * th * 0.65 * (1 - e), sy * th * 0.6 * (1 - e), 1 + 0.3 * (1 - e), sr * 50 * (1 - e), min(1.0, p * 2))
                res.append(whole(letters(f)))
            return res
        return []

    ctx = {"size": size, "bw": bw, "bh": bh, "lp": lp, "th": th, "a": a, "fps": fps, "img": img,
           "pieces": pieces, "boxes": boxes, "letters": letters, "base_rest": base_rest}
    if intro_kind in NEW_INS:
        intro = _intro_new(intro_kind, ctx)
    else:
        intro = intro_frames()
    n = max(1, round(T * fps)) if kind else 1
    if kind in NEW_LOOPS:
        loop = [_loop_new(kind, i, n, ctx) for i in range(n)]
    else:
        loop = [loop_frame(i, n) for i in range(n)]
    return intro + loop, pad + lp, len(intro), len(loop)


# ---------------------------------------------------------------- animasi gelombang 1 (17 Nov)
# Gerakan standar ala preset teks editor video (rumus ditulis ulang, tanpa pustaka luar).

def _new_pad(kind, intro_kind, big, th, a):
    p = 0
    if kind == "shake":
        p = max(p, int(max(2.0, a * 0.06 * th)) + int(big * 0.02) + 3)
    if kind in ("heartbeat", "beat", "jelly"):
        p = max(p, int(big * 0.09))
    if kind == "tada":
        p = max(p, int(big * 0.13))
    if kind == "swing":
        p = max(p, int(big * 0.22))
    if kind == "breathe":
        p = max(p, int(th * 0.16) + 4)
    if intro_kind == "drop":
        p = max(p, int(th * 0.8))
    if intro_kind == "zoomin":
        p = max(p, int(big * 0.3))
    if intro_kind == "blurin":
        p = max(p, int(th * 0.25) + 2)
    if intro_kind in ("spinin", "rubber", "flip"):
        p = max(p, int(big * 0.12))
    if intro_kind in ("slideup", "slidedown", "slideright", "wipe", "neonon", "words"):
        p = max(p, 2)
    return p


def _ease_out_bounce(p):
    n, d = 7.5625, 2.75
    if p < 1 / d:
        return n * p * p
    if p < 2 / d:
        p -= 1.5 / d
        return n * p * p + 0.75
    if p < 2.5 / d:
        p -= 2.25 / d
        return n * p * p + 0.9375
    p -= 2.625 / d
    return n * p * p + 0.984375


def _place(size, im, sx=1.0, sy=1.0, ang=0.0, dx=0.0, dy=0.0, op=1.0, pivot_top=False):
    """Tempel im di tengah kanvas size: skala (boleh tak seragam), putar, geser, opasitas.
    pivot_top: putaran bertumpu di tengah atas (ayunan bandul)."""
    if sx != 1 or sy != 1:
        im = im.resize((max(1, round(im.width * sx)), max(1, round(im.height * sy))), Image.BICUBIC)
    if ang:
        h0 = im.height
        im = im.rotate(ang, resample=Image.BICUBIC, expand=True)
        if pivot_top:
            t = math.radians(ang)
            dx += h0 / 2 * math.sin(t)
            dy += -h0 / 2 + h0 / 2 * math.cos(t)
    if op < 1:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: round(v * max(0.0, op))))
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    _paste(out, im, (round(size[0] / 2 - im.width / 2 + dx), round(size[1] / 2 - im.height / 2 + dy)))
    return out


def _word_ids(boxes):
    """Nomor kata tiap huruf, urutannya sama dengan _pieces (baris lalu kiri->kanan)."""
    rows = sorted({(round(b[2]), round(b[3])) for b in boxes})
    ids, wid = [], -1
    for t, b in rows:
        line = sorted((bx for bx in boxes if (round(bx[2]), round(bx[3])) == (t, b)), key=lambda bx: bx[0])
        prev = None
        for bx in line:
            if prev is None or bx[0] - prev[1] > (b - t) * 0.16:
                wid += 1
            ids.append(wid)
            prev = bx
    return ids


def _rainbow(frame, phase, a):
    """Pelangi berjalan: dikalikan ke warna teks (putih -> pelangi, hitam/garis tepi tetap)."""
    w, h = frame.size
    row = Image.new("HSV", (w, 1))
    for x in range(w):
        row.putpixel((x, 0), (int(((x / max(1, w)) + phase) % 1 * 255), 190, 255))
    rb = row.convert("RGB").resize((w, h)).convert("RGBA")
    mixed = ImageChops.multiply(frame, rb)
    mixed.putalpha(frame.getchannel("A"))
    return Image.blend(frame, mixed, min(1.0, 0.45 + 0.55 * a))


def _glow_self(frame, k, r):
    """Pendar dari warna teks sendiri, kekuatan k (0..1)."""
    if k <= 0.01:
        return frame
    halo = frame.filter(ImageFilter.GaussianBlur(max(1.0, r)))
    a = halo.getchannel("A")
    # warna pendar dicerahkan (garis tepi gelap tidak membuat pendar jadi bayangan hitam)
    halo = Image.blend(halo.convert("RGB"), ImageChops.lighter(halo.convert("RGB"), Image.new("RGB", halo.size, (255, 244, 214))), 0.55).convert("RGBA")
    halo.putalpha(_gain(a, 1.8 * k))
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    out.alpha_composite(halo)
    out.alpha_composite(halo)
    out.alpha_composite(frame)
    return out


def _bump(t, start, dur):
    return math.sin(math.pi * (t - start) / dur) if start <= t < start + dur else 0.0


def _loop_new(kind, i, n, c):
    import random
    phase = i / n
    a, th, size = c["a"], c["th"], c["size"]
    base = c["base_rest"]()
    if kind == "shake":  # gemetar: posisi acak, ganti tiap 2 frame
        rng = random.Random(1000 + i // 2)
        sa = max(2.0, a * 0.06 * th)
        return _place(size, base, dx=rng.uniform(-sa, sa), dy=rng.uniform(-sa, sa), ang=rng.uniform(-1.5, 1.5) * a)
    if kind == "jitter" and c["pieces"]:  # tiap huruf bergetar sendiri-sendiri
        ja = th * 0.035 * (0.4 + a)

        def f(j):
            rng = random.Random((i // 2) * 977 + j * 31 + 7)
            return (rng.uniform(-ja, ja), rng.uniform(-ja, ja), 1, rng.uniform(-5, 5) * a, 1)
        return _place(size, c["letters"](f))
    if kind == "heartbeat":
        A = 0.05 + 0.12 * a
        return _place(size, base, 1 + A * (_bump(phase, 0, 0.12) + 0.75 * _bump(phase, 0.2, 0.12)),
                      1 + A * (_bump(phase, 0, 0.12) + 0.75 * _bump(phase, 0.2, 0.12)))
    if kind == "swing":
        return _place(size, base, ang=(4 + 10 * a) * math.sin(2 * math.pi * phase), pivot_top=True)
    if kind == "jelly":
        A = 0.03 + 0.1 * a
        s = math.sin(2 * math.pi * phase)
        return _place(size, base, 1 + A * s, 1 - A * s)
    if kind == "tada":
        t = phase / 0.5
        if t >= 1:
            return _place(size, base)
        if t < 0.15:
            sc = 1 - 0.08 * math.sin(math.pi * t / 0.15)
            return _place(size, base, sc, sc)
        u = (t - 0.15) / 0.85
        sc = 1 + (0.05 + 0.08 * a) * math.sin(math.pi * u)
        return _place(size, base, sc, sc, ang=(2 + 4 * a) * math.sin(6 * math.pi * u) * math.sin(math.pi * u))
    if kind == "breathe":
        k = (0.5 - 0.5 * math.cos(2 * math.pi * phase)) * (0.4 + 0.6 * a)
        return _glow_self(_place(size, base), k, th * 0.07)
    if kind == "rainbow":
        return _rainbow(_place(size, base), phase, a)
    if kind == "beat":  # dua hentakan zoom per putaran
        f = (phase * 2) % 1
        sc = 1 + (0.04 + 0.1 * a) * math.exp(-f * 7)
        return _place(size, base, sc, sc)
    if kind == "flip3d":
        sx = max(0.03, abs(math.cos(math.pi * phase / 0.3))) if phase < 0.3 else 1.0
        return _place(size, base, sx, 1.0)
    return _place(size, base)


def _intro_new(kind, c):
    a, th, size, fps = c["a"], c["th"], c["size"], c["fps"]
    pieces = c["pieces"]
    if kind == "words" and not pieces:  # tanpa data huruf (teks diputar/melengkung) -> pop biasa
        kind = "zoomin"
    base = c["base_rest"]()
    res = []
    if kind == "words":
        boxes = c["boxes"] or []
        ids = _word_ids(boxes)
        if len(ids) != len(pieces):
            ids = list(range(len(pieces)))
        nw = max(ids) + 1 if ids else 1
        st = min(0.22, 1.4 / max(1, nw))
        ld = 0.28
        dur = st * (nw - 1) + ld
        for p in _steps(dur, fps):
            t = p * dur

            def f(j):
                q = min(1.0, max(0.0, (t - ids[j] * st) / ld))
                return (0, (1 - q) * th * 0.18, max(0.02, _ease_back(q)) if q > 0 else 0.02, 0, min(1.0, q * 3))
            res.append(_place(size, c["letters"](f)))
        return res
    if kind == "drop":
        dist = th * 1.1
        return [_place(size, base, dy=-dist * (1 - _ease_out_bounce(p)), op=min(1.0, p * 4)) for p in _steps(0.75, fps)]
    if kind == "zoomin":
        out = []
        for p in _steps(0.45, fps):
            sc = 1 + 0.6 * (1 - p) ** 3
            out.append(_place(size, base, sc, sc, op=min(1.0, p * 3)))
        return out
    if kind == "blurin":
        out = []
        for p in _steps(0.6, fps):
            fr = _place(size, base, op=min(1.0, p * 2))
            r = th * 0.12 * (1 - p) ** 2
            out.append(fr.filter(ImageFilter.GaussianBlur(r)) if r > 0.3 else fr)
        return out
    if kind in ("slideup", "slidedown", "slideright"):
        out = []
        for p in _steps(0.5, fps):
            e = (1 - p) ** 3
            dx = size[0] * 0.6 * e if kind == "slideright" else 0
            dy = size[1] * 0.9 * e * (1 if kind == "slideup" else -1) if kind != "slideright" else 0
            out.append(_place(size, base, dx=dx, dy=dy, op=min(1.0, p * 1.8)))
        return out
    if kind == "wipe":
        full = _place(size, base)
        w, h = size
        soft = max(4.0, w * 0.06)
        out = []
        for p in _steps(0.6, fps):
            e = 1 - (1 - p) ** 2
            edge = -soft + (w + 2 * soft) * e
            row = Image.new("L", (w, 1))
            for x in range(w):
                row.putpixel((x, 0), round(255 * max(0.0, min(1.0, (edge - x) / soft + 0.5))))
            fr = full.copy()
            fr.putalpha(ImageChops.multiply(fr.getchannel("A"), row.resize((w, h))))
            out.append(fr)
        return out
    if kind == "spinin":
        out = []
        for p in _steps(0.6, fps):
            e = 1 - (1 - p) ** 3
            out.append(_place(size, base, max(0.02, e), max(0.02, e), ang=-270 * (1 - e), op=min(1.0, p * 3)))
        return out
    if kind == "flip":
        return [_place(size, base, max(0.02, _ease_back(p)), 1.0, op=min(1.0, p * 3)) for p in _steps(0.5, fps)]
    if kind == "rubber":
        out = []
        for p in _steps(0.8, fps):
            s = max(0.02, 1 - math.cos(p * math.pi * 4.5) * math.exp(-p * 5))
            sq = 0.25 * math.sin(p * math.pi * 6) * math.exp(-p * 4)
            out.append(_place(size, base, s * (1 + sq), s * (1 - sq), op=min(1.0, p * 4)))
        return out
    if kind == "neonon":  # neon menyala tersendat
        pattern = ((0.0, 0.0), (0.12, 0.9), (0.18, 0.0), (0.3, 0.0), (0.36, 0.5), (0.42, 0.05), (0.55, 1.0),
                   (0.62, 0.35), (0.68, 1.0))
        out = []
        for p in _steps(0.8, fps):
            op = 0.0
            for t0, v in pattern:
                if p >= t0:
                    op = v
            out.append(_place(size, base, op=op))
        return out
    return []


def _steps(dur, fps):
    k = max(1, round(dur * fps))
    return [(i + 1) / k for i in range(k)]


def _pieces(img, boxes):
    """Potong gambar teks jadi potongan per huruf (batas = titik tengah antar huruf),
    sehingga semua potongan disusun ulang = gambar asli."""
    if not boxes:
        return None
    w, h = img.size
    rows = sorted({(round(b[2]), round(b[3])) for b in boxes})
    out = []
    for r, (t, b) in enumerate(rows):
        top = 0 if r == 0 else (rows[r - 1][1] + t) / 2
        bot = h if r == len(rows) - 1 else (b + rows[r + 1][0]) / 2
        line = sorted((bx for bx in boxes if (round(bx[2]), round(bx[3])) == (t, b)), key=lambda bx: bx[0])
        for k, bx in enumerate(line):
            left = 0 if k == 0 else (line[k - 1][1] + bx[0]) / 2
            right = w if k == len(line) - 1 else (bx[1] + line[k + 1][0]) / 2
            x0, y0, x1, y1 = round(left), round(top), round(right), round(bot)
            if x1 > x0 and y1 > y0:
                out.append((img.crop((x0, y0, x1, y1)), x0, y0))
    return out or None
