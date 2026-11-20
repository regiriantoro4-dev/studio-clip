"""Helper ffmpeg/ffprobe."""
import json
import shutil
import subprocess
import tempfile


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


_NVENC_OK: bool | None = None


def nvenc_available() -> bool:
    """Encoder GPU NVIDIA bisa dipakai? (uji encode 1 frame, hasil di-cache per proses)."""
    global _NVENC_OK
    if _NVENC_OK is None:
        try:
            p = subprocess.run(
                ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=black:s=256x256:d=0.1",
                 "-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-"],
                capture_output=True, timeout=30,
            )
            _NVENC_OK = p.returncode == 0
        except Exception:  # noqa: BLE001
            _NVENC_OK = False
    return _NVENC_OK


def h264_args(settings: dict, quality: int = 19) -> list[str]:
    """Argumen encoder H.264 sesuai Pengaturan.

    video_encoder: "auto" (NVENC kalau ada, lalu x264) | "nvenc" | "x264".
    NVENC memindahkan encoding ke chip RTX, jadi CPU tidak bekerja keras
    (laptop user sempat mati mendadak saat x264 memakai CPU penuh).
    """
    enc = str(settings.get("video_encoder") or "auto")
    if enc in ("auto", "nvenc") and nvenc_available():
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", str(quality + 2), "-b:v", "0",
                "-maxrate", "14M", "-bufsize", "28M"]  # grain membuat bitrate meledak tanpa batas
    args = ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(quality)]
    n_thr = int(settings.get("ffmpeg_threads") or 0)
    return args + (["-threads", str(n_thr)] if n_thr > 0 else [])


def run(cmd: list[str], cwd=None) -> str:
    p = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if p.returncode != 0:
        tail = (p.stderr or "")[-2000:]
        raise RuntimeError(f"Perintah {cmd[0]} gagal:\n{tail}")
    return p.stdout


def probe(path) -> tuple[float, int, int]:
    """Return (durasi_detik, lebar, tinggi)."""
    out = run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ])
    info = json.loads(out)
    duration = float(info.get("format", {}).get("duration") or 0)
    w = h = 0
    for s in info.get("streams", []):
        if s.get("codec_type") == "video":
            w = int(s.get("width") or 0)
            h = int(s.get("height") or 0)
            break
    return duration, w, h


BROWSER_VCODECS = {"h264", "vp8", "vp9", "av1"}


def video_codec(path) -> str:
    out = run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path),
    ])
    return out.strip().lower()


def ensure_browser_playable(path, cb=None) -> str:
    """Video HEVC/ProRes dll. tidak bisa diputar browser (suara jalan, gambar kosong).
    Konversi sekali ke H.264 MP4 lalu kembalikan path barunya; file asli tetap disimpan."""
    from pathlib import Path
    src = Path(path)
    if video_codec(src) in BROWSER_VCODECS:
        return str(src)
    dst = src.with_name(src.stem + "_h264.mp4")
    dur = probe(src)[0]
    cb = cb or (lambda _p: None)
    tail = ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    # 18 Nov: utamakan GPU NVIDIA (decode NVDEC + encode NVENC). Video 4K HEVC di CPU (x264)
    # makan belasan menit dan membuat CPU penuh. Kualitas dijaga tinggi (qp 17 ~ setara x264 crf 18)
    # karena file ini jadi bahan render berikutnya. Gagal -> jalur lama x264 persis seperti dulu.
    try:
        from .. import config
        enc = str(config.load_settings().get("video_encoder") or "auto")
    except Exception:  # noqa: BLE001
        enc = "auto"
    if enc in ("auto", "nvenc") and nvenc_available():
        part = dst.with_name(dst.stem + ".part.mp4")
        gpu = ["ffmpeg", "-y", "-hwaccel", "cuda", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?",
               "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "constqp", "-qp", "17",
               "-profile:v", "high", "-pix_fmt", "yuv420p",
               *tail, str(part)]
        try:
            run_ffmpeg_progress(gpu, dur, cb)
            part.replace(dst)
            return str(dst)
        except Exception:  # noqa: BLE001
            part.unlink(missing_ok=True)
    cmd = ["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
           *tail, str(dst)]
    run_ffmpeg_progress(cmd, dur, cb)
    return str(dst)


def has_audio(path) -> bool:
    out = run([
        "ffprobe", "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=codec_type", "-print_format", "json", str(path),
    ])
    return bool(json.loads(out).get("streams"))


def extract_audio(src, out, start: float | None = None, duration: float | None = None):
    """Ekstrak audio mono 16kHz mp3 (ukuran kecil, aman untuk limit upload API)."""
    cmd = ["ffmpeg", "-y"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += [
        "-i", str(src), "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "libmp3lame", "-b:a", "64k", str(out),
    ]
    run(cmd)


def run_ffmpeg_progress(cmd: list[str], total_duration: float, cb, cwd=None):
    """Jalankan ffmpeg sambil melaporkan progres (0..1) lewat cb."""
    full = cmd[:1] + ["-hide_banner", "-nostats", "-progress", "pipe:1"] + cmd[1:]
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as ef:
        proc = subprocess.Popen(
            full, cwd=cwd, stdout=subprocess.PIPE, stderr=ef,
            text=True, encoding="utf-8", errors="replace",
        )
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_ms=") and total_duration > 0:
                try:
                    sec = int(line.split("=", 1)[1]) / 1_000_000  # nilainya mikrodetik
                except ValueError:
                    continue
                cb(min(0.99, sec / total_duration))
        proc.wait()
        if proc.returncode != 0:
            ef.seek(0)
            raise RuntimeError("ffmpeg gagal:\n" + ef.read()[-2000:])
