"""Generator thumbnail bermerek: frame video + teks hook besar 2 warna
+ panah merah + maskot/logo (opsional). Gaya ala channel Shorts viral.
"""
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .. import config, storage
from . import media
from .renderer import RATIOS

FONT_CANDIDATES = ["ariblk.ttf", "impact.ttf", "arialbd.ttf", "arial.ttf"]
LINE_COLORS = ["#FFFFFF", "#FFD400"]  # baris bergantian putih / kuning


def _load_font(size: int):
    fonts_dir = Path("C:/Windows/Fonts")
    for name in FONT_CANDIDATES:
        f = fonts_dir / name
        if f.exists():
            return ImageFont.truetype(str(f), size)
    return ImageFont.load_default()


def _wrap(text: str, max_chars: int = 14, max_lines: int = 4) -> list[str]:
    words = str(text or "").upper().split()
    lines, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > max_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines[:max_lines]


def _mascot_file() -> Path | None:
    assets = config.DATA_DIR / "assets"
    for ext in (".png", ".webp", ".jpg", ".jpeg"):
        f = assets / f"mascot{ext}"
        if f.exists():
            return f
    return None


def _draw_arrow(layer: Image.Image, W: int, H: int):
    """Panah merah tebal (outline putih) menunjuk diagonal ke tengah frame."""
    d = ImageDraw.Draw(layer)
    s = W * 0.16  # panjang panah
    x0, y0 = W * 0.78, H * 0.16          # pangkal (kanan atas)
    x1, y1 = x0 - s * 0.75, y0 + s       # ujung (menunjuk kiri-bawah)
    th = max(6, int(W * 0.02))

    d.line([(x0, y0), (x1 + s * 0.12, y1 - s * 0.16)], fill="#FFFFFF", width=th + 8)
    d.line([(x0, y0), (x1 + s * 0.12, y1 - s * 0.16)], fill="#E62117", width=th)
    # kepala panah (segitiga)
    head = s * 0.34
    d.polygon(
        [
            (x1, y1),
            (x1 + head * 0.9, y1 - head * 0.15),
            (x1 + head * 0.25, y1 - head * 0.95),
        ],
        fill="#E62117", outline="#FFFFFF", width=6,
    )


def generate(pid: str, cid: str, frame_time: float, text: str,
             ratio: str = "9:16", arrow: bool = True, mascot: bool = True) -> dict:
    if not media.has_ffmpeg():
        raise RuntimeError("ffmpeg tidak ditemukan di PATH.")
    p = storage.get(pid)
    if not p:
        raise RuntimeError("Project tidak ditemukan.")
    clip = next((c for c in p.get("clips", []) if c["id"] == cid), None)
    if not clip:
        raise RuntimeError("Klip tidak ditemukan.")

    W, H = RATIOS.get(ratio, RATIOS["9:16"])
    src = str(Path(p["source_file"]).resolve())
    t = max(0.0, float(frame_time))

    # 1. Ambil frame + crop rasio via ffmpeg
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "frame.png"
        media.run([
            "ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", src,
            "-vf", f"crop='min(iw,ih*{W}/{H})':'min(ih,iw*{H}/{W})',scale={W}:{H}",
            "-frames:v", "1", str(raw),
        ])
        img = Image.open(raw).convert("RGBA")

    # 2. Gradasi gelap di bawah biar teks kebaca
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for i in range(int(H * 0.45)):
        alpha = int(200 * (i / (H * 0.45)))
        gd.line([(0, int(H * 0.55) + i), (W, int(H * 0.55) + i)], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img, grad)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # 3. Panah merah
    if arrow:
        _draw_arrow(overlay, W, H)

    # 4. Maskot / logo (upload lewat Pengaturan)
    mf = _mascot_file() if mascot else None
    if mf:
        m = Image.open(mf).convert("RGBA")
        mw = int(W * 0.30)
        m = m.resize((mw, int(m.height * mw / m.width)))
        overlay.alpha_composite(m, (W - mw - int(W * 0.02), H - m.height - int(H * 0.015)))

    img = Image.alpha_composite(img, overlay)

    # 5. Teks hook besar, baris bergantian warna, sedikit miring
    lines = _wrap(text)
    if lines:
        fs = int(H * 0.062)
        font = _load_font(fs)
        # Baris terpanjang harus muat (stroke & rotasi ikut dihitung): kecilkan font bila perlu
        probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        widest = max(probe.textlength(ln, font=font) for ln in lines)
        limit = W * 0.86 - 2 * max(4, int(fs * 0.14))
        if widest > limit:
            fs = max(int(H * 0.03), int(fs * limit / widest))
            font = _load_font(fs)
        stroke = max(4, int(fs * 0.14))
        line_h = int(fs * 1.22)
        pad = stroke + 12

        block = Image.new("RGBA", (W, line_h * len(lines) + pad * 2), (0, 0, 0, 0))
        bd = ImageDraw.Draw(block)
        for i, line in enumerate(lines):
            lw = bd.textlength(line, font=font)
            bd.text(
                ((W - lw) / 2, pad + i * line_h),
                line, font=font,
                fill=LINE_COLORS[i % 2],
                stroke_width=stroke, stroke_fill="#000000",
            )
        block = block.rotate(-3, expand=True, resample=Image.BICUBIC)
        by = int(H * 0.60)
        img.alpha_composite(block, ((W - block.width) // 2, by))

    # 6. Simpan JPG
    rdir = storage.project_dir(pid) / "exports"
    rdir.mkdir(parents=True, exist_ok=True)
    outname = f"thumb_{cid}.jpg"
    img.convert("RGB").save(rdir / outname, "JPEG", quality=92)

    record = {
        "file": outname,
        "url": f"/media/projects/{pid}/exports/{outname}",
        "text": str(text or "")[:120],
        "ts": time.time(),
    }
    clip["thumbnail"] = record
    storage.save(p)
    return record
