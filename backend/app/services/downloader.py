"""Unduh video YouTube via yt-dlp."""
from pathlib import Path

import yt_dlp

VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".mov", ".m4v")


def download(url: str, outdir, progress_cb=None) -> tuple[str, str]:
    outdir = Path(outdir)

    def hook(d):
        if progress_cb and d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                progress_cb(d.get("downloaded_bytes", 0) / total)

    opts = {
        "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": str(outdir / "source.%(ext)s"),
        "noplaylist": True,
        "progress_hooks": [hook],
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    title = (info or {}).get("title") or "Video YouTube"
    path = outdir / "source.mp4"
    if not path.exists():
        candidates = [c for c in outdir.glob("source.*") if c.suffix.lower() in VIDEO_EXTS]
        if not candidates:
            raise RuntimeError("Unduhan selesai tetapi file video tidak ditemukan.")
        path = candidates[0]
    return str(path), title
