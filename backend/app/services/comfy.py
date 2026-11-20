"""Klien ComfyUI lokal: text-to-image SDXL lewat API HTTP (default http://127.0.0.1:8188).

Kalau ComfyUI belum jalan, dinyalakan otomatis lewat file .bat (terlepas dari proses backend)
lalu ditunggu sampai siap.
"""
import io
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

PREFERRED = ("juggernaut", "realvis", "dreamshaper")


def _cfg(settings: dict) -> dict:
    return settings.get("comfy") or {}


def _base(settings: dict) -> str:
    return str(_cfg(settings).get("url") or "http://127.0.0.1:8188").rstrip("/")


def _get(url: str, timeout: float = 10):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read())


def is_up(settings: dict) -> bool:
    try:
        _get(_base(settings) + "/system_stats", timeout=3)
        return True
    except Exception:  # noqa: BLE001
        return False


def ensure_running(settings: dict, job=None, wait: int = 240):
    if is_up(settings):
        return
    bat = str(_cfg(settings).get("start_bat") or r"D:\ComfyUI\start_comfy_log.bat")
    if not Path(bat).exists():
        raise RuntimeError(f"ComfyUI tidak jalan dan file start tidak ditemukan: {bat}")
    if job:
        job.set(stage="Menyalakan ComfyUI (pertama kali bisa 1-2 menit)")
    flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(["cmd", "/c", bat], creationflags=flags, close_fds=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(3)
        if is_up(settings):
            return
    raise RuntimeError("ComfyUI tidak merespons setelah dinyalakan. Cek D:\\ComfyUI\\comfy_run.log")


def free(settings: dict):
    """Lepas model dari VRAM setelah batch (laptop 8 GB: render ffmpeg & app lain jadi lega)."""
    try:
        req = urllib.request.Request(
            _base(settings) + "/free", data=json.dumps({"unload_models": True, "free_memory": True}).encode(),
            headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=15).read()
    except Exception:  # noqa: BLE001
        pass


def checkpoint(settings: dict) -> str:
    """Checkpoint yang dipakai: dari Pengaturan kalau ada, kalau tidak pilih yang sinematik."""
    info = _get(_base(settings) + "/object_info/CheckpointLoaderSimple")
    names = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    want = str(_cfg(settings).get("checkpoint") or "")
    if want and want in names:
        return want
    for key in PREFERRED:
        for n in names:
            if key in n.lower():
                return n
    if not names:
        raise RuntimeError("ComfyUI belum punya checkpoint di models/checkpoints.")
    return names[0]


def txt2img(settings: dict, prompt: str, negative: str, seed: int, width: int = 768,
            height: int = 1344, ckpt: str | None = None, steps: int | None = None,
            cfg_scale: float | None = None, timeout: int = 600) -> Image.Image:
    c = _cfg(settings)
    ckpt = ckpt or checkpoint(settings)
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": negative}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": int(seed) % (2 ** 32), "steps": int(steps or c.get("steps") or 30),
            "cfg": float(cfg_scale or c.get("cfg") or 4.5),
            "sampler_name": "dpmpp_2m_sde", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "autoclipper_horor"}},
    }
    base = _base(settings)
    req = urllib.request.Request(base + "/prompt", data=json.dumps({"prompt": wf}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        pid = json.loads(urllib.request.urlopen(req, timeout=60).read())["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ComfyUI menolak workflow: {e.read().decode('utf-8', 'replace')[:600]}") from e

    t0 = time.time()
    while True:
        if time.time() - t0 > timeout:
            raise RuntimeError("ComfyUI terlalu lama membuat gambar.")
        h = _get(f"{base}/history/{pid}", timeout=30)
        if pid in h:
            st = h[pid].get("status") or {}
            if st.get("status_str") == "error":
                raise RuntimeError("ComfyUI gagal: " + json.dumps(st)[:600])
            imgs = [i for o in h[pid].get("outputs", {}).values() for i in o.get("images", [])]
            if imgs:
                break
        time.sleep(1.5)
    i = imgs[0]
    q = urllib.parse.urlencode({"filename": i["filename"], "subfolder": i["subfolder"], "type": i["type"]})
    raw = urllib.request.urlopen(f"{base}/view?{q}", timeout=60).read()
    return Image.open(io.BytesIO(raw)).convert("RGB")
