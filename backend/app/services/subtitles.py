"""Generator subtitle ASS dengan word-level timestamps + berbagai gaya animasi.

Preset yang tersedia (harus sinkron dengan frontend/src/presets.js):
  beasty  — satu kata besar, animasi pop, kata terpanjang disorot warna
  karaoke — kalimat penuh, terisi warna per kata (efek karaoke)
  boxy    — kata aktif tampil dalam kotak warna
  duo     — frasa pendek, kata aktif berubah warna
  clean   — potongan kalimat polos tanpa animasi
"""
import re

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
"""

EVENTS_HEADER = """
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def style_color(hexcolor: str, alpha: str = "00") -> str:
    """#RRGGBB -> &HAABBGGRR (format warna di baris Style)."""
    hexcolor = (hexcolor or "#FFFFFF").lstrip("#")
    if len(hexcolor) < 6:
        hexcolor = "FFFFFF"
    r, g, b = hexcolor[0:2], hexcolor[2:4], hexcolor[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()


def inline_color(hexcolor: str) -> str:
    """#RRGGBB -> &HBBGGRR& (untuk override \\c inline)."""
    hexcolor = (hexcolor or "#FFFFFF").lstrip("#")
    if len(hexcolor) < 6:
        hexcolor = "FFFFFF"
    r, g, b = hexcolor[0:2], hexcolor[2:4], hexcolor[4:6]
    return f"&H{b}{g}{r}&".upper()


def ts(t: float) -> str:
    cs_total = max(0, int(round(t * 100)))
    h, rem = divmod(cs_total, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def sanitize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("{", "(").replace("}", ")")).strip()


def _ends_sentence(word: str) -> bool:
    return bool(re.search(r"[.!?…]$", word or ""))


def chunk_words(words, max_words=4, max_dur=3.5, max_gap=0.8):
    """Kelompokkan kata jadi frasa pendek (logika sama dengan frontend)."""
    chunks, cur = [], []
    for w in words:
        if cur and (
            len(cur) >= max_words
            or w["s"] - cur[-1]["e"] > max_gap
            or w["e"] - cur[0]["s"] > max_dur
            or _ends_sentence(cur[-1]["w"])
        ):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    return chunks


def _display_ranges(chunk, tail=0.15, max_hold=0.8):
    """Rentang tampil per kata: kata bertahan sampai kata berikutnya muncul."""
    out = []
    for i, w in enumerate(chunk):
        s = w["s"]
        if i + 1 < len(chunk):
            e = min(chunk[i + 1]["s"], w["e"] + max_hold)
        else:
            e = w["e"] + tail
        if e - s < 0.06:
            e = s + 0.06
        out.append((s, e))
    return out


def build_ass(words, style: dict, res_w: int, res_h: int, t0: float,
              hook_block: tuple[str, str] | None = None,
              wm_block: tuple[str, str] | None = None,
              extra_blocks: list | None = None) -> str:
    preset = (style or {}).get("preset", "beasty")
    base_hex = style.get("color", "#FFFFFF")
    hi_hex = style.get("highlight", "#FFD100")
    base_s, hi_s = style_color(base_hex), style_color(hi_hex)
    base_i, hi_i = inline_color(base_hex), inline_color(hi_hex)
    font = style.get("font") or "Arial Black"
    scale = float(style.get("size", 1.0) or 1.0)
    fs = max(16, int(res_h * 0.048 * scale))
    posy = int(res_h * float(style.get("pos", 74)) / 100)
    upper = style.get("uppercase", True) is not False
    x = res_w // 2
    outline = max(2, fs // 14)

    def txt(w):
        t = sanitize(w["w"])
        t = t.upper() if upper else t
        if w.get("em"):
            t = f"{t} {sanitize(w['em'])}"
        return t

    styles: list[str] = []
    events: list[str] = []

    def ev(t1, t2, text, style_name="Cap"):
        events.append(
            f"Dialogue: 0,{ts(max(0.0, t1))},{ts(max(0.0, t2))},{style_name},,0,0,0,,{text}"
        )

    plain_style = (
        f"Style: Cap,{font},{fs},{{p}},{{sec}},&H00000000,&H80000000,"
        f"-1,0,0,0,100,100,0,0,1,{outline},1,5,20,20,20,1"
    )

    if preset == "karaoke":
        # Primary = warna isi (highlight), Secondary = warna sebelum terisi
        styles.append(plain_style.format(p=hi_s, sec=base_s))
        for ch in chunk_words(words):
            t1, t2 = ch[0]["s"] - t0, ch[-1]["e"] - t0 + 0.15
            parts, prev_end = [], ch[0]["s"]
            for w in ch:
                gap = w["s"] - prev_end
                if gap > 0.05:
                    parts.append("{\\k%d} " % int(round(gap * 100)))
                dur_cs = max(1, int(round((w["e"] - w["s"]) * 100)))
                parts.append("{\\k%d}%s " % (dur_cs, txt(w)))
                prev_end = w["e"]
            ev(t1, t2, "{\\pos(%d,%d)}%s" % (x, posy, "".join(parts).strip()))

    elif preset == "boxy":
        pad = max(4, int(fs * 0.22))
        styles.append(
            f"Style: Cap,{font},{fs},{base_s},{base_s},{hi_s},{hi_s},"
            f"-1,0,0,0,100,100,0,0,3,{pad},0,5,20,20,20,1"
        )
        for ch in chunk_words(words):
            for w, (s, e) in zip(ch, _display_ranges(ch)):
                anim = (
                    "{\\pos(%d,%d)\\fscx88\\fscy88\\t(0,80,\\fscx100\\fscy100)}" % (x, posy)
                )
                ev(s - t0, e - t0, anim + txt(w))

    elif preset == "duo":
        styles.append(plain_style.format(p=base_s, sec=base_s))
        for ch in chunk_words(words):
            ranges = _display_ranges(ch)
            for i, (w, (s, e)) in enumerate(zip(ch, ranges)):
                parts = []
                for j, other in enumerate(ch):
                    if j == i or other.get("hl"):
                        parts.append("{\\c%s}%s{\\c%s}" % (hi_i, txt(other), base_i))
                    else:
                        parts.append(txt(other))
                ev(s - t0, e - t0, "{\\pos(%d,%d)}%s" % (x, posy, " ".join(parts)))

    elif preset == "clean":
        styles.append(plain_style.format(p=base_s, sec=base_s))
        for ch in chunk_words(words, max_words=7, max_dur=5.0):
            t1, t2 = ch[0]["s"] - t0, ch[-1]["e"] - t0 + 0.2
            parts = [
                "{\\c%s}%s{\\c%s}" % (hi_i, txt(w), base_i) if w.get("hl") else txt(w)
                for w in ch
            ]
            ev(t1, t2, "{\\pos(%d,%d)}%s" % (x, posy, " ".join(parts)))

    else:  # beasty (default)
        fs_b = int(fs * 1.25)
        styles.append(
            f"Style: Cap,{font},{fs_b},{base_s},{base_s},&H00000000,&H80000000,"
            f"-1,0,0,0,100,100,0,0,1,{max(3, fs_b // 12)},2,5,20,20,20,1"
        )
        for ch in chunk_words(words):
            # kata kunci hasil anotasi AI disorot; kalau tak ada, fallback kata terpanjang
            hl_words = [w for w in ch if w.get("hl")]
            targets = hl_words or [max(ch, key=lambda w: len(w["w"]))]
            for w, (s, e) in zip(ch, _display_ranges(ch)):
                color = hi_i if w in targets else base_i
                anim = (
                    "{\\pos(%d,%d)\\c%s\\fscx70\\fscy70"
                    "\\t(0,90,\\fscx114\\fscy114)\\t(90,160,\\fscx100\\fscy100)}"
                    % (x, posy, color)
                )
                ev(s - t0, e - t0, anim + txt(w))

    header = ASS_HEADER.format(w=res_w, h=res_h)
    for block in (hook_block, wm_block, *(extra_blocks or [])):
        if not block:
            continue
        block_styles, block_events = block
        if block_styles:
            styles.append(block_styles)
        if block_events:
            events.append(block_events)
    return header + "\n".join(styles) + EVENTS_HEADER + "\n".join(events) + "\n"


WM_ALIGN = {"top-left": 7, "top-right": 9, "bottom-left": 1, "bottom-right": 3, "center": 5}


def build_watermark_text(wm: dict, res_w: int, res_h: int, dur: float) -> tuple[str, str]:
    """Watermark teks semi-transparan (layer paling atas, tampil sepanjang klip)."""
    text = sanitize(wm.get("text") or "")
    if not text:
        return ("", "")
    fs = max(12, int(res_h * 0.03 * float(wm.get("size", 1.0) or 1.0)))
    opacity = min(1.0, max(0.05, float(wm.get("opacity", 0.7) or 0.7)))
    alpha = f"{int(round((1 - opacity) * 255)):02X}"
    an = WM_ALIGN.get(wm.get("position", "top-right"), 9)
    m = int(min(res_w, res_h) * 0.03)
    style = (
        f"Style: Wm,Arial,{fs},&H{alpha}FFFFFF,&H{alpha}FFFFFF,&H{alpha}000000,&H{alpha}000000,"
        f"-1,0,0,0,100,100,0,0,1,{max(1, fs // 18)},0,{an},{m},{m},{m},1"
    )
    event = f"Dialogue: 2,{ts(0)},{ts(dur)},Wm,,0,0,0,,{text}"
    return style, event
