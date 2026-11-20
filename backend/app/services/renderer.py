"""Render/export klip -> MP4/WebM/GIF.

Pipeline efek: cold-open teaser -> jump-cut jeda hening -> crop rasio -> zoom punch-in
-> burn subtitle/hook/watermark/endcard (ASS) -> progress bar -> watermark gambar
-> musik latar dengan auto-ducking.
"""
import shutil
import time
from pathlib import Path

from .. import config, storage
from . import border, bumper, hooks, media, subtitles, textfx

RATIOS = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


def _overlay_xy(pos: str, margin: int) -> tuple[str, str]:
    """Ekspresi posisi overlay watermark gambar untuk filter ffmpeg."""
    return {
        "top-left": (f"{margin}", f"{margin}"),
        "bottom-left": (f"{margin}", f"main_h-overlay_h-{margin}"),
        "bottom-right": (f"main_w-overlay_w-{margin}", f"main_h-overlay_h-{margin}"),
        "center": ("(main_w-overlay_w)/2", "(main_h-overlay_h)/2"),
    }.get(pos, (f"main_w-overlay_w-{margin}", f"{margin}"))  # default: top-right


def _keep_segments(words, start: float, end: float, gap: float, pad: float = 0.12):
    """Interval [start,end] yang dipertahankan setelah membuang jeda hening antar kata."""
    if not words:
        return [(start, end)]
    segs = []
    first_s = max(start, words[0]["s"] - pad)
    cur_start = start if first_s - start <= gap else first_s
    prev_e = words[0]["e"]
    for w in words[1:]:
        if w["s"] - prev_e > gap:
            segs.append((cur_start, min(end, prev_e + pad)))
            cur_start = max(start, w["s"] - pad)
        prev_e = max(prev_e, w["e"])
    tail_end = end if end - prev_e <= gap else min(end, prev_e + pad)
    segs.append((cur_start, tail_end))

    merged = []
    for s0, e0 in segs:
        if merged and s0 <= merged[-1][1] + 0.05:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e0))
        elif e0 - s0 > 0.05:
            merged.append((s0, e0))
    return merged or [(start, end)]


def _tighten_cuts(words, start: float, end: float, gap: float, keep: float):
    """Mode "Rapatkan jeda" (19 Nov): rentang yang DIBUANG, bukan seluruh jeda.

    Jeda > `gap` tidak dibuang habis; disisakan `keep` detik dari tengahnya dipotong:
    40% sesudah kata sebelumnya, 60% sebelum kata berikutnya (napas sebelum kalimat tetap utuh).
    Jeda sesudah akhir kalimat (. ! ? …) disisakan 1,5x supaya kalimat sempat "mendarat".
    Hening di awal/akhir klip dirapatkan dengan aturan yang sama.
    """
    if not words:
        return []
    cuts = []
    lead = words[0]["s"] - start
    if lead > gap:
        cuts.append((start, words[0]["s"] - 0.6 * keep))
    prev_e, prev_w = words[0]["e"], words[0]
    for w in words[1:]:
        g = w["s"] - prev_e
        if g > gap:
            k = min(g, keep * (1.5 if subtitles._ends_sentence(prev_w.get("w", "")) else 1.0))
            a, b = prev_e + 0.4 * k, w["s"] - 0.6 * k
            if b - a > 0.05:
                cuts.append((a, b))
        if w["e"] >= prev_e:
            prev_e, prev_w = w["e"], w
    if end - prev_e > gap:
        cuts.append((prev_e + 0.4 * keep, end))
    return cuts


def _tighten_segments(words, start: float, end: float, gap: float, keep: float):
    """Interval [start,end] yang dipertahankan pada mode Rapatkan jeda."""
    segs, cur = [], start
    for a, b in _tighten_cuts(words, start, end, gap, keep):
        a, b = max(start, a), min(end, b)
        if b <= a:
            continue
        if a - cur > 0.05:
            segs.append((cur, a))
        cur = max(cur, b)
    if end - cur > 0.05:
        segs.append((cur, end))
    return segs or [(start, end)]


def _build_segments(words, clip: dict, fx: dict):
    """Daftar potongan sumber yang dirender, urut sesuai timeline output.

    Cold-open teaser (momen paling dramatis) diprepend di depan kalau ada.
    """
    start, end = float(clip["start"]), float(clip["end"])
    if fx.get("cut_silence", True) and fx.get("jeda_mode") == "rapat":
        base = _tighten_segments(words, start, end, float(fx.get("silence_gap", 0.7)),
                                 float(fx.get("jeda_sisa", 0.4)))
    elif fx.get("cut_silence", True):
        base = _keep_segments(words, start, end, float(fx.get("silence_gap", 0.7)))
    else:
        base = [(start, end)]

    segs = list(base)
    teaser = clip.get("teaser") or {}
    if fx.get("teaser", True) and isinstance(teaser, dict):
        try:
            ts0, te0 = float(teaser.get("start")), float(teaser.get("end"))
        except (TypeError, ValueError):
            ts0 = te0 = None
        if (
            ts0 is not None
            and start + 1.5 <= ts0 < te0 <= end
            and 0.8 <= te0 - ts0 <= 5.0
        ):
            segs = [(ts0, min(te0, ts0 + 4.5))] + segs
    return segs


def _remap_words(words, segs):
    """Petakan kata ke timeline output per segmen (kata teaser ikut terduplikasi)."""
    out, off = [], 0.0
    for s0, e0 in segs:
        for w in words:
            mid = (w["s"] + w["e"]) / 2
            if s0 <= mid <= e0:
                out.append({
                    **w,
                    "s": round(off + max(0.0, w["s"] - s0), 3),
                    "e": round(off + max(0.05, min(e0 - s0, w["e"] - s0)), 3),
                })
        off += e0 - s0
    return out, round(off, 3)


def _zoom_z_expr(bound_times, strength: float, ramp: float = 0.18) -> str | None:
    """Faktor zoom Z(t): punch bergantian in/out di tiap batas kalimat (transisi cepat)."""
    if not bound_times:
        return None
    terms = []
    for k, tk in enumerate(bound_times):
        sign = "-" if k % 2 else "+"
        term = f"min(max((t-{tk:.2f})/{ramp},0)\\,1)"
        terms.append(f"{sign}{term}")
    s = "".join(terms).lstrip("+")
    return f"(1+{strength}*({s}))"


ANIM_FPS = 30
# Standar loudness Shorts/TikTok/Reels (~-14 LUFS); loudnorm bekerja di 192 kHz, jadi kembalikan ke 48 kHz
LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000"


def _anim_chain(anim_inputs, anim_idx, total, parts) -> str:
    """Tempel teks beranimasi di atas [vbd]; -> label hasil (mis. "[vbd]" atau "[van1]")."""
    cur = "[vbd]"
    for i, ((_pat, x, y, n_in, n_loop), idx) in enumerate(zip(anim_inputs, anim_idx)):
        parts.append(
            f"[{idx}:v]loop=loop=-1:size={n_loop}:start={n_in},setpts=N/{ANIM_FPS}/TB,"
            f"trim=duration={total + 0.5:.3f},format=rgba[ans{i}]"
        )
        parts.append(f"{cur}[ans{i}]overlay={x}:{y}:eof_action=pass[van{i}]")
        cur = f"[van{i}]"
    return cur


def render(job, pid: str, cid: str, ratio: str, fmt: str) -> dict:
    if not media.has_ffmpeg():
        raise RuntimeError(
            "ffmpeg tidak ditemukan di PATH. Install dulu: winget install Gyan.FFmpeg "
            "lalu buka ulang terminal."
        )

    p = storage.get(pid)
    if not p:
        raise RuntimeError("Project tidak ditemukan.")
    clip = next((c for c in p.get("clips", []) if c["id"] == cid), None)
    if not clip:
        raise RuntimeError("Klip tidak ditemukan.")
    transcript = storage.get_transcript(pid) or {"segments": []}

    W, H = RATIOS.get(ratio, RATIOS["9:16"])
    start, end = float(clip["start"]), float(clip["end"])
    dur0 = max(0.5, end - start)
    fx = {**storage.DEFAULT_FX, **(clip.get("fx") or {})}

    # Mode narasi: audio diganti suara narator; timeline harus utuh (tanpa cut/teaser)
    narration = clip.get("narration") or {}
    nar_path = None
    vo_policy = storage.voiceover_policy(p)
    if narration.get("file") and vo_policy != "dilarang":
        cand = (storage.project_dir(pid) / str(narration["file"])).resolve()
        if cand.exists():
            nar_path = str(cand)
    if vo_policy == "wajib" and not nar_path and fmt != "gif":
        raise RuntimeError("Video hasil generate wajib pakai voice over, tapi file narator tidak ditemukan. "
                           "Proses ulang project ini supaya suara narator dibuat lagi.")
    if nar_path:
        fx = {**fx, "cut_silence": False, "teaser": False}

    words = [
        dict(w)
        for seg in transcript["segments"]
        for w in seg.get("words", [])
        if start <= (w["s"] + w["e"]) / 2 <= end
    ]
    for w in words:
        if not fx.get("keywords", True):
            w.pop("hl", None)
        if not fx.get("emoji", True):
            w.pop("em", None)

    # --- Teaser + jump-cut -> daftar segmen & kata di timeline output ---
    segs_abs = _build_segments(words, clip, fx)
    words_m, total = _remap_words(words, segs_abs)
    total = max(0.5, total)

    # --- Watermark global ---
    settings = config.load_settings()
    wm = settings.get("watermark") or {}
    wm_block = None
    wm_image = None
    if wm.get("enabled"):
        if wm.get("type") == "image" and wm.get("image"):
            img = (config.DATA_DIR / wm["image"]).resolve()
            if img.exists():
                wm_image = str(img)
        elif (wm.get("text") or "").strip():
            wm_block = subtitles.build_watermark_text(wm, W, H, total)

    fmt = fmt if fmt in ("mp4", "webm", "gif") else "mp4"
    # --- Dimensi target ---
    if fmt == "gif":
        gw = 480 if W <= H else 640
        TW, TH = gw, int(round(gw * H / W / 2)) * 2
    else:
        TW, TH = W, H

    # --- Border brand: digambar dulu karena tema menentukan posisi subtitle & hook ---
    brand = settings.get("brand") or {}
    if isinstance(fx.get("brand_override"), dict) and fx["brand_override"]:
        # resep per klip (produksi variasi): menimpa brand hanya untuk render ini, pengaturan tidak berubah
        brand = {**brand, **fx["brand_override"]}
    use_border =(bool(brand.get("enabled")) or bool(fx.get("border_force"))) \
        and fx.get("border", True) is not False
    sub_style = dict(clip.get("style") or storage.DEFAULT_STYLE)
    border_img = None
    anims = []
    bd_meta = {"blur": False, "title": False}
    VX = VY = 0
    VW, VH = TW, TH
    if use_border:
        theme_brand = {**brand, "theme": border.theme_for(brand, fx)}
        border_img, (VX, VY, VW, VH), bd_meta = border.draw(
            theme_brand, border.border_title(clip, theme_brand["theme"]), TW, TH, part=border.clip_part(clip),
            anim=True,
        )
        anims = bd_meta.pop("anims", None) or []
        if bd_meta.get("sub_pos") is not None:
            sub_style["pos"] = bd_meta["sub_pos"]
    if bd_meta.get("title"):
        hook_block = None  # judul sudah tampil di border
    else:
        hs = dict(clip.get("hook_style") or storage.DEFAULT_HOOK_STYLE)
        if bd_meta.get("hook_min") and float(hs.get("pos", 14)) < bd_meta["hook_min"]:
            hs["pos"] = bd_meta["hook_min"]
        hook_block = hooks.build_hook(clip.get("hook", ""), hs, W, H, total)
    extra_blocks = []
    endcard = hooks.build_endcard(str(clip.get("endcard") or ""), W, H, total)
    if endcard:
        extra_blocks.append(endcard)

    ass_text = subtitles.build_ass(
        words_m, sub_style, W, H, 0.0,
        hook_block, wm_block, extra_blocks,
    )

    rdir = storage.project_dir(pid) / "exports"
    rdir.mkdir(parents=True, exist_ok=True)
    ass_name = f"subs_{cid}.ass"
    (rdir / ass_name).write_text(ass_text, encoding="utf-8")

    src = str(Path(p["source_file"]).resolve())
    outname = f"{cid}_{ratio.replace(':', 'x')}_{time.strftime('%H%M%S')}.{fmt}"

    # --- Border: PNG seukuran frame dengan jendela transparan untuk video ---
    border_name = None
    if border_img is not None:
        border_name = f"border_{cid}.png"
        border_img.save(rdir / border_name, "PNG")

    # --- Teks beranimasi: urutan PNG per layer (intro + 1 putaran), di-loop ffmpeg ---
    anim_inputs = []  # (nama pola file, x, y, intro, loop)
    adir = rdir / f"anim_{cid}"
    shutil.rmtree(adir, ignore_errors=True)
    if anims:
        adir.mkdir(parents=True, exist_ok=True)
        for i, a in enumerate(anims):
            if a.get("pattern"):  # urutan PNG siap pakai (animasi frame pack, di-cache)
                anim_inputs.append((a["pattern"], a["pos"][0], a["pos"][1], a.get("intro", 0), a["loop"]))
                continue
            seq, pad, n_in, n_loop = textfx.anim_frames(a["img"], a["spec"], ANIM_FPS, a.get("scale", 1.0), a.get("boxes"))
            for j, fr in enumerate(seq):
                fr.save(adir / f"a{i}_{j:04d}.png", "PNG", compress_level=1)
            anim_inputs.append((f"anim_{cid}/a{i}_%04d.png", a["pos"][0] - pad, a["pos"][1] - pad, n_in, n_loop))

    # --- Rantai filter video (berjalan di timeline output) ---
    # pre: crop + skala + zoom untuk isi video (ukuran jendela bila pakai border)
    chain = [
        f"crop='min(iw,ih*{VW}/{VH})':'min(ih,iw*{VH}/{VW})'",
        f"scale={VW}:{VH}",
        "setsar=1",
    ]
    if fmt == "gif":
        chain.append("fps=12")
    if fx.get("zoom", True):
        preset = (clip.get("style") or {}).get("preset", "beasty")
        params = {"max_words": 7, "max_dur": 5.0} if preset == "clean" else {}
        bounds = [ch[0]["s"] for ch in subtitles.chunk_words(words_m, **params)][1:]
        z = _zoom_z_expr(bounds, float(fx.get("zoom_strength", 0.08)))
        if z:
            chain.append(f"scale=w='trunc({VW}*{z}/2)*2':h='trunc({VH}*{z}/2)*2':eval=frame")
            chain.append(f"crop={VW}:{VH}:'(in_w-{VW})/2':'(in_h-{VH})/2'")
    pre_str = ",".join(chain)

    # post: subtitle/hook ASS + progress bar di atas frame penuh
    chain = [f"ass={ass_name}"]
    if fx.get("progress_bar", True):
        pb_h = max(4, int(TH * 0.012))
        color = str(fx.get("progress_color") or "#7C5CFF")
        if use_border and color.upper() == "#7C5CFF":  # warna default -> ikut aksen brand
            color = str(brand.get("accent") or color)
        color = color.lstrip("#")
        if len(color) != 6:
            color = "7C5CFF"
        chain.append(
            f"drawbox=x=0:y={TH - pb_h}:w='iw*min(t/{total:.3f}\\,1)':h={pb_h}"
            f":color=0x{color}@0.9:t=fill"
        )
    post_str = ",".join(chain)

    # --- Bumper intro/outro animasi (HyperFrames, dari cache). Gagal -> video tetap dirender tanpa bumper.
    bumps = []
    for kind in ("intro", "outro"):
        try:
            b = bumper.for_brand(brand, kind, fx.get(f"bumper_{kind}"))
        except Exception as e:  # noqa: BLE001
            b = None
            job.set(stage=f"Bumper {kind} dilewati: {str(e)[:80]}")
        if b and b["duration"] < total + 0.01:
            bumps.append(b)

    # --- Input & indeks ---
    use_audio = fmt != "gif" and media.has_audio(src)
    bgm_file = None
    if fmt != "gif" and fx.get("bgm"):
        cand = config.DATA_DIR / "assets" / "music" / Path(str(fx["bgm"])).name
        if cand.exists():
            bgm_file = str(cand.resolve())

    inputs = ["-ss", f"{start:.3f}", "-t", f"{dur0:.3f}", "-i", src]
    next_idx = 1
    wm_idx = bgm_idx = border_idx = None
    if border_name:
        inputs += ["-i", border_name]
        border_idx = next_idx
        next_idx += 1
    anim_idx = []
    for pat, *_ in anim_inputs:
        inputs += ["-framerate", str(ANIM_FPS), "-i", pat]
        anim_idx.append(next_idx)
        next_idx += 1
    if wm_image:
        inputs += ["-i", wm_image]
        wm_idx = next_idx
        next_idx += 1
    if bgm_file:
        inputs += ["-stream_loop", "-1", "-i", bgm_file]
        bgm_idx = next_idx
        next_idx += 1
    nar_idx = None
    if nar_path and fmt != "gif":
        inputs += ["-i", nar_path]
        nar_idx = next_idx
        next_idx += 1

    # --- Potongan trim/concat — waktu relatif ke titik seek input ---
    rel = [(a - start, b - start) for a, b in segs_abs]
    need_cut = len(rel) > 1 or rel[0][0] > 0.01 or rel[0][1] < dur0 - 0.01

    parts = []
    if need_cut:
        n = len(rel)
        for i, (a, b) in enumerate(rel):
            parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
            if use_audio:
                parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
        if use_audio:
            ins = "".join(f"[v{i}][a{i}]" for i in range(n))
            parts.append(f"{ins}concat=n={n}:v=1:a=1[vcut][acut]")
            voice = "[acut]"
        else:
            ins = "".join(f"[v{i}]" for i in range(n))
            parts.append(f"{ins}concat=n={n}:v=1:a=0[vcut]")
            voice = None
        vsrc = "[vcut]"
    else:
        vsrc = "[0:v]"
        voice = "[0:a]" if use_audio else None

    if border_idx is not None and bd_meta.get("blur"):
        # Kartu Blur: latar = video yang sama, diperkecil-blur-diperbesar & digelapkan
        bg_chain = (
            f"crop='min(iw,ih*{TW}/{TH})':'min(ih,iw*{TH}/{TW})',"
            f"scale={max(2, TW // 8 // 2 * 2)}:{max(2, TH // 8 // 2 * 2)},boxblur=6:2,"
            f"scale={TW}:{TH},setsar=1,eq=brightness=-0.16:saturation=1.2"
            + (",fps=12" if fmt == "gif" else "")
        )
        parts.append(f"{vsrc}split=2[vsa][vsb]")
        parts.append(f"[vsa]{pre_str}[vpre]")
        parts.append(f"[vsb]{bg_chain}[vbg]")
        parts.append(f"[vbg][vpre]overlay={VX}:{VY}[vpad]")
        parts.append(f"[vpad][{border_idx}:v]overlay=0:0[vbd]")
        parts.append(f"{_anim_chain(anim_inputs, anim_idx, total, parts)}{post_str}[vfx]")
    elif border_idx is not None:
        parts.append(f"{vsrc}{pre_str}[vpre]")
        parts.append(f"[vpre]pad={TW}:{TH}:{VX}:{VY}:color=black[vpad]")
        parts.append(f"[vpad][{border_idx}:v]overlay=0:0[vbd]")
        parts.append(f"{_anim_chain(anim_inputs, anim_idx, total, parts)}{post_str}[vfx]")
    else:  # tanpa border
        parts.append(f"{vsrc}{pre_str},{post_str}[vfx]")
    vlabel = "[vfx]"

    wm_opacity = min(1.0, max(0.05, float(wm.get("opacity", 0.7) or 0.7)))
    wm_size = float(wm.get("size", 1.0) or 1.0)
    if wm_image:
        ow = max(24, int(TW * 0.18 * wm_size))
        x, y = _overlay_xy(wm.get("position", "top-right"), max(4, int(min(TW, TH) * 0.03)))
        parts.append(f"[{wm_idx}:v]scale={ow}:-1,format=rgba,colorchannelmixer=aa={wm_opacity}[wmv]")
        parts.append(f"[vfx][wmv]overlay={x}:{y}[vout]")
        vlabel = "[vout]"

    # bumper: WebM VP9 alpha (decoder libvpx agar transparansi terbaca), di atas semua lapisan
    for i, b in enumerate(bumps):
        idx = next_idx + i
        inputs += ["-c:v", "libvpx-vp9", "-i", b["path"]]
        start_t = 0.0 if b["kind"] == "intro" else max(0.0, total - b["duration"])
        parts.append(f"[{idx}:v]scale={TW}:{TH}:force_original_aspect_ratio=decrease,format=rgba,"
                     f"setpts=PTS-STARTPTS+{start_t:.3f}/TB[bp{i}]")
        parts.append(f"{vlabel}[bp{i}]overlay=(W-w)/2:(H-h)/2:eof_action=pass[vbp{i}]")
        vlabel = f"[vbp{i}]"

    # --- Audio: suara asli / narator + musik latar dengan auto-ducking ---
    if nar_idx is not None:
        voice = f"[{nar_idx}:a]"
    amap = None
    if fmt != "gif":
        if bgm_file:
            vol = min(0.6, max(0.02, float(fx.get("bgm_volume", 0.12) or 0.12)))
            parts.append(
                f"[{bgm_idx}:a]volume={vol},atrim=0:{total:.3f},asetpts=PTS-STARTPTS[bgm]"
            )
            if voice:
                parts.append(f"{voice}asplit=2[vo][vsc]")
                parts.append(
                    "[bgm][vsc]sidechaincompress=threshold=0.05:ratio=8:attack=50:release=400[bgmd]"
                )
                parts.append("[vo][bgmd]amix=inputs=2:duration=first:normalize=0[amx]")
            else:
                parts.append("[bgm]anull[amx]")
            parts.append(f"[amx]{LOUDNORM}[aout]")
            amap = "[aout]"
        elif voice:
            if nar_idx is not None:
                parts.append(f"[{nar_idx}:a]{LOUDNORM}[aout]")
                amap = "[aout]"
            else:
                amap = voice if need_cut else "0:a?"

    n_thr = int(settings.get("ffmpeg_threads") or 0)
    thr = ["-filter_complex_threads", str(n_thr)] if n_thr > 0 else []  # opsi global, sebelum input

    job.set(stage=f"Render {fmt.upper()} {ratio}", progress=0.02)

    if fmt == "gif":
        graph = ";".join(parts) + (
            f";{vlabel}split[pa][pb];[pa]palettegen=stats_mode=diff[pal];"
            "[pb][pal]paletteuse=dither=bayer:bayer_scale=4[gif]"
        )
        cmd = ["ffmpeg", "-y"] + inputs + [
            "-filter_complex", graph, "-map", "[gif]", "-an", outname,
        ]
    else:
        graph = ";".join(parts)
        maps = ["-map", vlabel] + (["-map", amap] if amap else [])
        if fmt == "webm":
            codec = [
                "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
                "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
                "-c:a", "libopus", "-b:a", "96k",
            ]
        else:  # mp4
            codec = [
                *media.h264_args(settings, 19),
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
            ]
        cmd = ["ffmpeg", "-y"] + thr + inputs + ["-filter_complex", graph] + maps + codec + [outname]

    try:
        media.run_ffmpeg_progress(cmd, total, lambda pr: job.set(progress=0.02 + pr * 0.96), cwd=str(rdir))
    finally:
        shutil.rmtree(adir, ignore_errors=True)

    record = {
        "file": outname,
        "url": f"/media/projects/{pid}/exports/{outname}",
        "format": fmt,
        "ratio": ratio,
        "ts": time.time(),
    }

    # Simpan riwayat export ke project
    p = storage.get(pid)
    for c in p.get("clips", []):
        if c["id"] == cid:
            c.setdefault("exports", []).append(record)
            break
    storage.save(p)
    return record
