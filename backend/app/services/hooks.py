"""Overlay teks hook viral — 4 template: classic, elegant, boxies, box.

Menghasilkan (styles, events) yang digabung ke file ASS oleh subtitles.build_ass.
"""
import textwrap

from .subtitles import sanitize, style_color, ts


def _wrap(text: str, width=22) -> list[str]:
    lines = []
    for raw in (text or "").split("\n"):
        lines.extend(textwrap.wrap(raw.strip(), width=width) or [])
    return lines


def build_endcard(text: str, res_w: int, res_h: int, clip_dur: float):
    """Overlay ajakan di akhir klip (mis. "Part 2 👉 Cek profil!") — 3 detik terakhir."""
    text = sanitize(text)
    if not text or clip_dur < 4:
        return None
    fs = max(16, int(res_h * 0.05))
    x, y = res_w // 2, int(res_h * 0.86)
    t1 = ts(max(0.0, clip_dur - 3.0))
    t2 = ts(clip_dur)
    pad = max(6, int(fs * 0.3))
    style = (
        f"Style: End,Arial Black,{fs},{style_color('#FFFFFF')},{style_color('#FFFFFF')},"
        f"&H30000000,&H30000000,-1,0,0,0,100,100,0,0,3,{pad},0,5,40,40,40,1"
    )
    anim = "{\\pos(%d,%d)\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)}" % (x, y)
    event = f"Dialogue: 2,{t1},{t2},End,,0,0,0,,{anim}{text}"
    return style, event


def build_hook(text: str, hstyle: dict, res_w: int, res_h: int, clip_dur: float):
    text = sanitize(text)
    hstyle = hstyle or {}
    if not text or hstyle.get("enabled", True) is False:
        return None

    template = hstyle.get("template", "classic")
    fs = max(14, int(res_h * 0.042 * float(hstyle.get("size", 1.0) or 1.0)))
    posy = int(res_h * float(hstyle.get("pos", 14)) / 100)
    x = res_w // 2
    # duration > 0: hook hanya tampil di awal lalu memudar (default: sepanjang klip)
    show = float(hstyle.get("duration") or 0)
    show = show if 0 < show < clip_dur else clip_dur
    t2 = ts(max(0.5, show))
    fade = "{\\fad(200,500)}" if show < clip_dur else ""
    lines = _wrap(text)

    styles: list[str] = []
    events: list[str] = []
    white = style_color("#FFFFFF")
    black = style_color("#111111")

    if template == "elegant":
        styles.append(
            f"Style: Hook,Georgia,{fs},{white},{white},&H00000000,&H90000000,"
            f"0,-1,0,0,100,100,1,0,1,0,3,5,40,40,40,1"
        )
        events.append(
            f"Dialogue: 1,0:00:00.00,{t2},Hook,,0,0,0,,{fade}"
            "{\\pos(%d,%d)}%s" % (x, posy, "\\N".join(lines))
        )

    elif template == "box":
        pad = max(6, int(fs * 0.3))
        styles.append(
            f"Style: Hook,Arial,{fs},{white},{white},&H30000000,&H30000000,"
            f"-1,0,0,0,100,100,0,0,3,{pad},0,5,40,40,40,1"
        )
        events.append(
            f"Dialogue: 1,0:00:00.00,{t2},Hook,,0,0,0,,{fade}"
            "{\\pos(%d,%d)}%s" % (x, posy, "\\N".join(lines))
        )

    elif template == "boxies":
        pad = max(6, int(fs * 0.28))
        styles.append(
            f"Style: Hook,Arial Black,{fs},{black},{black},{white},{white},"
            f"-1,0,0,0,100,100,0,0,3,{pad},0,5,40,40,40,1"
        )
        line_h = int(fs * 1.7)
        parts = []
        for i, line in enumerate(lines):
            y = posy + i * line_h
            parts.append(
                f"Dialogue: 1,0:00:00.00,{t2},Hook,,0,0,0,,{fade}"
                "{\\pos(%d,%d)}%s" % (x, y, line)
            )
        events.append("\n".join(parts))

    else:  # classic
        styles.append(
            f"Style: Hook,Arial Black,{fs},{white},{white},&H00000000,&H80000000,"
            f"-1,0,0,0,100,100,0,0,1,{max(3, fs // 9)},2,5,40,40,40,1"
        )
        events.append(
            f"Dialogue: 1,0:00:00.00,{t2},Hook,,0,0,0,,{fade}"
            "{\\pos(%d,%d)}%s" % (x, posy, "\\N".join(lines))
        )

    return "\n".join(styles), "\n".join(events)
