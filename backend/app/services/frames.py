"""Frame buatan user (PNG/JPG dari Canva dsb.) sebagai tema border.

Saat upload, area tempat video dideteksi otomatis:
  1. Kalau gambar punya area transparan di tengah -> itu jendelanya.
  2. Kalau tidak, warna di titik tengah (mis. hitam polos atau hijau) dianggap
     "layar" dan dibuat transparan, mengikuti bentuknya (hiasan yang menimpa
     layar seperti awan tetap tampil di atas video).
Jendela video = kotak pembatas area itu. Disimpan di data/assets/frames/.
"""
import json
import time
import uuid

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from .. import config

PREFIX = "frame:"
DETECT_MAX = 480  # deteksi di gambar kecil biar cepat, hasil di-skala balik
# papan teks bawah di cetakan generator frame ornamen (768x1344), dipakai sebagai patokan
PLAQUE_REF = (64 / 768, 1078 / 1344, 704 / 768, 1252 / 1344)
PLAQUE_MAX_Y = 1800 / 1920  # di bawah ini biasanya sudah ornamen dasar, bukan papan


def frames_dir():
    d = config.DATA_DIR / "assets" / "frames"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _index_file():
    return frames_dir() / "frames.json"


def list_frames() -> list[dict]:
    f = _index_file()
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def _save_index(items: list[dict]):
    _index_file().write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def get(fid: str) -> dict | None:
    return next((f for f in list_frames() if f["id"] == fid), None)


def themes() -> dict:
    return {PREFIX + f["id"]: f["name"] for f in list_frames()}


def _region_from_center(mask_small: Image.Image) -> Image.Image | None:
    """mask_small: L, 255 = kandidat jendela. Kembalikan wilayah tersambung dengan titik tengah."""
    w, h = mask_small.size
    cx, cy = w // 2, h // 2
    if mask_small.getpixel((cx, cy)) != 255:
        return None
    work = mask_small.copy()
    ImageDraw.floodfill(work, (cx, cy), 128, thresh=0)
    return work.point(lambda v: 255 if v == 128 else 0)


def detect_window(img: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Kembalikan (gambar RGBA dengan jendela transparan, jendela (x, y, w, h))."""
    img = img.convert("RGBA")
    W, H = img.size
    k = min(1.0, DETECT_MAX / max(W, H))
    sw, sh = max(1, round(W * k)), max(1, round(H * k))
    small = img.resize((sw, sh), Image.NEAREST)

    # 1. Sudah ada area transparan di tengah
    transparent = small.getchannel("A").point(lambda a: 255 if a < 40 else 0)
    region = _region_from_center(transparent)
    keyed = False
    if region is None:
        # 2. Warna layar di titik tengah -> dibuat transparan (toleransi kecil)
        key = small.getpixel((sw // 2, sh // 2))[:3]
        tol = 28
        rgb = small.convert("RGB")
        diff = ImageChops.difference(rgb, Image.new("RGB", (sw, sh), key))
        r, g, b = diff.split()
        dist = ImageChops.lighter(ImageChops.lighter(r, g), b)
        region = _region_from_center(dist.point(lambda v: 255 if v <= tol else 0))
        keyed = True
        if region is None:
            raise ValueError("Area video di tengah frame tidak ditemukan.")

    bbox = region.getbbox()
    if not bbox:
        raise ValueError("Area video di tengah frame tidak ditemukan.")
    x0, y0, x1, y1 = bbox
    if (x1 - x0) * (y1 - y0) < 0.08 * sw * sh:
        raise ValueError("Area video terlalu kecil. Pastikan bagian tengah frame transparan atau satu warna polos.")

    if keyed:
        # Ulangi pencocokan warna di resolusi penuh, dibatasi wilayah hasil deteksi
        big_region = region.resize((W, H), Image.NEAREST)
        rgb = img.convert("RGB")
        diff = ImageChops.difference(rgb, Image.new("RGB", (W, H), key))
        r, g, b = diff.split()
        dist = ImageChops.lighter(ImageChops.lighter(r, g), b)
        hole = ImageChops.multiply(dist.point(lambda v: 255 if v <= tol else 0), big_region)
        alpha = ImageChops.subtract(img.getchannel("A"), hole)
        img.putalpha(alpha)

    s = 1 / k
    win = (int(x0 * s), int(y0 * s), int(round((x1 - x0) * s)), int(round((y1 - y0) * s)))
    return img, win


def detect_board(img: Image.Image, win) -> list[int]:
    """Papan teks di bawah jendela video (x0, y0, x1, y1): wilayah datar (tanpa ornamen)
    yang tersambung dengan titik tengah papan cetakan, dibatasi rentang papan cetakan."""
    img = img.convert("RGBA")
    W, H = img.size
    x, y, w, h = win
    zx0, zy0, zx1 = x, y + h + int(H * 0.012), x + w
    zy1 = min(H - int(H * 0.01), int(H * PLAQUE_MAX_Y))
    fb = [int(PLAQUE_REF[0] * W), int(PLAQUE_REF[1] * H), int(PLAQUE_REF[2] * W), int(PLAQUE_REF[3] * H)]
    if zy1 - zy0 < H * 0.06:
        return fb
    k = 0.5
    small = img.resize((max(1, int(W * k)), max(1, int(H * k))), Image.BILINEAR)
    edges = small.convert("L").filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(5))
    flat = ImageChops.multiply(edges.point(lambda v: 255 if v < 22 else 0),
                               small.getchannel("A").point(lambda a: 255 if a > 200 else 0))
    zone = Image.new("L", flat.size, 0)
    ImageDraw.Draw(zone).rectangle([zx0 * k, zy0 * k, zx1 * k, zy1 * k], fill=255)
    flat = ImageChops.multiply(flat, zone)
    cx, cy = int(W / 2 * k), int((fb[1] + fb[3]) / 2 * k)
    seed = None
    for dy in range(int((zy1 - zy0) * k)):
        for yy in (cy + dy, cy - dy):
            if zy0 * k <= yy < zy1 * k and flat.getpixel((cx, yy)) == 255:
                seed = (cx, yy)
                break
        if seed:
            break
    if not seed:
        return fb
    work = flat.copy()
    ImageDraw.floodfill(work, seed, 128, thresh=0)
    bb = work.point(lambda v: 255 if v == 128 else 0).getbbox()
    if not bb:
        return fb
    bx0, by0, bx1, by1 = (int(v / k) for v in bb)
    if bx1 - bx0 < 0.4 * w or by1 - by0 < H * 0.04:
        return fb
    return [bx0, by0, bx1, by1]


def detect_accent(img: Image.Image, win) -> str:
    """Warna ornamen (piksel terang & berwarna di pita sekeliling jendela), dicerahkan -> '#RRGGBB'."""
    rgb = img.convert("RGB")
    x, y, w, h = win
    band = max(8, int(img.size[0] * 0.024))
    px = []
    for x0, y0, x1, y1 in [(x - band, y - band, x + w + band, y), (x - band, y + h, x + w + band, y + h + band),
                           (x - band, y, x, y + h), (x + w, y, x + w + band, y + h)]:
        box = (max(0, x0), max(0, y0), min(rgb.width, x1), min(rgb.height, y1))
        if box[2] - box[0] < 2 or box[3] - box[1] < 2:
            continue
        crop = rgb.crop(box).resize((40, 40))
        px += [crop.getpixel((i, j)) for j in range(40) for i in range(40)]
    if not px:
        return "#F2C66D"
    px.sort(key=lambda p: max(p) + (max(p) - min(p)) * 1.2, reverse=True)
    top = px[: max(1, len(px) // 10)]
    c = [sorted(v[i] for v in top)[len(top) // 2] for i in range(3)]
    f = max(1.0, 235 / (max(c) or 1))
    return "#" + "".join(f"{min(255, int(v * f)):02X}" for v in c)


def analyze(item: dict) -> dict:
    """Lengkapi item frame ornamen dengan 'board' & 'accent' (sekali, disimpan di frames.json).
    Frame dari Frame Studio sudah berisi teksnya sendiri -> tanpa papan otomatis."""
    if item.get("source") != "ornamen-ai" or ("board" in item and "accent" in item):
        return item
    img = Image.open(frames_dir() / item["file"])
    item["board"] = detect_board(img, item["win"])
    item["accent"] = detect_accent(img, item["win"])
    items = list_frames()
    for it in items:
        if it["id"] == item["id"]:
            it.update(board=item["board"], accent=item["accent"])
    _save_index(items)
    return item


def add(file_obj, name: str) -> dict:
    img = Image.open(file_obj)
    img.load()
    if max(img.size) > 4000:
        img.thumbnail((4000, 4000))
    out, win = detect_window(img)
    fid = time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4]
    out.save(frames_dir() / f"{fid}.png", "PNG")
    item = {
        "id": fid,
        "name": (name or "").strip()[:40] or "Frame saya",
        "file": f"{fid}.png",
        "size": list(out.size),
        "win": list(win),
    }
    items = list_frames()
    items.append(item)
    _save_index(items)
    return item


def upsert(fid: str | None, name: str, png_file, win: tuple[int, int, int, int],
           layers: list[dict] | None = None, has_brand: bool | None = None) -> dict:
    """Frame dari Frame Studio: jendela sudah diketahui pasti, tanpa deteksi.
    layers = layer teks dinamis (token {judul}) yang dirender per video, tidak ikut di PNG."""
    img = Image.open(png_file).convert("RGBA")
    W, H = img.size
    x, y, w, h = (int(v) for v in win)
    x, y = max(0, min(W - 2, x)), max(0, min(H - 2, y))
    w, h = max(2, min(W - x, w)), max(2, min(H - y, h))
    items = list_frames()
    item = next((f for f in items if f["id"] == fid), None) if fid else None
    if not item:
        fid = time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4]
        item = {"id": fid, "file": f"{fid}.png"}
        items.append(item)
    item.update(name=(name or "").strip()[:40] or "Frame studio", size=[W, H], win=[x, y, w, h],
                source="studio", v=int(time.time()), layers=layers or [])
    if has_brand is not None:
        item["has_brand"] = has_brand  # False -> teks brand global ikut dipasang
    img.save(frames_dir() / item["file"], "PNG")
    _save_index(items)
    return item


def remove(fid: str) -> bool:
    items = list_frames()
    item = next((f for f in items if f["id"] == fid), None)
    if not item:
        return False
    (frames_dir() / item["file"]).unlink(missing_ok=True)
    _save_index([f for f in items if f["id"] != fid])
    return True


def render(fid: str, W: int, H: int):
    """Frame diskalakan menutupi W x H (cover, potong tengah). -> (img, win)."""
    frame, win, _, _ = render_full(fid, W, H)
    return frame, win


def render_full(fid: str, W: int, H: int, title: str | None = None, skip_anim: bool = False):
    """Seperti render(), plus info papan: (img, win, papan|None, ada_judul).
    papan = {"box": (x0, y0, x1, y1) di koordinat W x H, "accent": '#RRGGBB'}
    Frame Studio dengan layer {judul}: layer itu digambar di sini memakai `title`."""
    item = get(fid)
    if not item:
        raise KeyError(fid)
    item = analyze(item)
    src = Image.open(frames_dir() / item["file"]).convert("RGBA")
    dyn = item.get("layers") or []
    from . import textfx
    draw = [l for l in dyn if not (skip_anim and textfx.has_anim(l))]
    if draw:
        src.alpha_composite(textfx.render_layers(draw, src.size, title or ""))
    # judul tampil di frame hanya bila ada layer {judul} (layer animasi biasa tidak dihitung)
    has_title = any(textfx.TOKEN in str(l.get("text") or "") and l.get("visible") is not False for l in dyn)
    fw, fh = src.size
    s = max(W / fw, H / fh)
    nw, nh = max(1, round(fw * s)), max(1, round(fh * s))
    ox, oy = (nw - W) // 2, (nh - H) // 2
    frame = src.resize((nw, nh), Image.LANCZOS).crop((ox, oy, ox + W, oy + H))

    wx, wy, ww, wh = item["win"]
    x0 = max(0, round(wx * s) - ox)
    y0 = max(0, round(wy * s) - oy)
    x1 = min(W, round((wx + ww) * s) - ox)
    y1 = min(H, round((wy + wh) * s) - oy)
    x0, y0 = x0 // 2 * 2, y0 // 2 * 2
    w, h = max(2, (x1 - x0) // 2 * 2), max(2, (y1 - y0) // 2 * 2)

    board = None
    if item.get("board"):
        bx0, by0, bx1, by1 = item["board"]
        box = (round(bx0 * s) - ox, round(by0 * s) - oy, round(bx1 * s) - ox, round(by1 * s) - oy)
        box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))
        if box[2] - box[0] > 20 and box[3] - box[1] > 10:
            board = {"box": box, "accent": item.get("accent") or "#F2C66D"}
    return frame, (x0, y0, w, h), board, has_title


def anim_layers(fid: str, W: int, H: int, title: str | None = None) -> list[dict]:
    """Layer teks beranimasi frame ini sebagai sprite di koordinat output W x H:
    [{"img": RGBA, "pos": (x, y), "spec": dict, "scale": s}]."""
    item = get(fid)
    if not item:
        return []
    from . import textfx
    layers = [l for l in (item.get("layers") or []) if l.get("visible") is not False and textfx.has_anim(l)]
    if not layers:
        return []
    with Image.open(frames_dir() / item["file"]) as im:
        fw, fh = im.size
    s = max(W / fw, H / fh)
    ox, oy = (round(fw * s) - W) // 2, (round(fh * s) - H) // 2
    out = []
    for spec in layers:
        bx = []
        r = textfx.render_layer(spec, textfx.resolve(spec, title or ""), bx)
        if not r:
            continue
        img, (x, y) = r
        if s != 1:
            img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
            bx = [tuple(v * s for v in b) for b in bx]
        out.append({"img": img, "pos": (round(x * s) - ox, round(y * s) - oy), "spec": spec, "scale": s, "boxes": bx})
    return out
