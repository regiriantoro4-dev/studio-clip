"""Konfigurasi global + pengaturan provider AI (tersimpan di data/settings.json)."""
import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # folder backend/
DATA_DIR = Path(os.environ.get("AUTOCLIPPER_DATA", str(BASE_DIR / "data")))
PROJECTS_DIR = DATA_DIR / "projects"
SETTINGS_FILE = DATA_DIR / "settings.json"
# Folder hasil Mode Auto-Produce (video siap upload, per tanggal)
OUTPUT_DIR = Path(os.environ.get("AUTOCLIPPER_OUTPUT", str(BASE_DIR.parent / "Siap Upload")))

# API key juga bisa diisi lewat environment variable
ENV_KEYS = {
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "moonshot": "MOONSHOT_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

DEFAULT_SETTINGS = {
    "transcribe_provider": "groq",   # groq | openai | local
    "llm_provider": "auto",          # auto = combo Groq>Gemini>OpenRouter>OpenAI>Claude | groq | openai | gemini | moonshot | anthropic
    "language": "id",
    "whisper_local_model": "small",  # model CPU: tiny | base | small | medium | large-v3
    "whisper_gpu_model": "large-v3-turbo",  # model saat GPU NVIDIA tersedia (float16)
    "whisper_device": "auto",        # auto (GPU bila ada, lalu CPU) | cuda | cpu
    "transcribe_fallback_local": True,  # provider API gagal -> transkrip ulang dengan Whisper lokal (gratis)
    "watermark": {
        "enabled": False,
        "type": "text",           # text | image
        "text": "",
        "image": "",              # path relatif dari folder data/, mis. assets/watermark.png
        "position": "top-right",  # top-left | top-right | bottom-left | bottom-right | center
        "opacity": 0.7,
        "size": 1.0,
    },
    "brand": {
        "enabled": False,         # border brand di semua video export (bisa dimatikan per klip)
        "theme": "podcast",
        "name": "TechRingan",
        "handle": "@techringan",
        "label": "Klip podcast",  # teks di pill kecil di atas judul
        "color": "#111418",       # warna utama (latar border)
        "accent": "#3BE8B0",
        "font": "Space Grotesk",  # lihat services/border.py FONTS
        "logo": "",               # path relatif dari data/, mis. assets/brand-logo.png
    },
    "arsip_dirs": [],             # folder tempat isi "Siap Upload" lama dipindah (dicari galeri variasi bila folder asli kosong)
    "video_encoder": "auto",      # auto (NVENC GPU bila ada) | nvenc | x264
    "ffmpeg_threads": 4,          # batas thread ffmpeg (0 = semua core). Laptop sempat mati kepanasan saat render.
    "comfy": {                    # ComfyUI lokal untuk gambar AI (Mode Horor)
        "url": "http://127.0.0.1:8188",
        "start_bat": r"D:\ComfyUI\start_comfy_log.bat",
        "checkpoint": "",         # kosong = otomatis (Juggernaut/RealVis kalau ada)
        "steps": 30,
        "cfg": 4.5,
    },
    "providers": {
        "groq": {
            "api_key": "",
            "base_url": "https://api.groq.com/openai/v1",
            "llm_model": "openai/gpt-oss-120b",
            "stt_model": "whisper-large-v3",
        },
        "openai": {
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "llm_model": "gpt-4o-mini",
            "stt_model": "whisper-1",
        },
        "gemini": {
            "api_key": "",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
            "llm_model": "gemini-flash-latest",
            "tts_model": "gemini-3.1-flash-tts-preview",
        },
        "moonshot": {
            "api_key": "",
            "base_url": "https://api.moonshot.ai/v1",
            "llm_model": "kimi-k2-0711-preview",
        },
        "anthropic": {            # Claude; dipanggil lewat SDK resmi (services/claude_llm.py)
            "api_key": "",
            "api": "anthropic",
            "llm_model": "claude-opus-5-5",
        },
        "openrouter": {           # gratis: openrouter/free memilih model :free yang sedang tersedia
            "api_key": "",
            "base_url": "https://openrouter.ai/api/v1",
            "llm_model": "openrouter/free",
        },
    },
}


def ensure_dirs():
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def _deep_merge(base, override):
    out = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_settings() -> dict:
    ensure_dirs()
    data = {}
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    s = _deep_merge(DEFAULT_SETTINGS, data)
    for name, env in ENV_KEYS.items():
        if not s["providers"].get(name, {}).get("api_key") and os.environ.get(env):
            s["providers"][name]["api_key"] = os.environ[env]
    return s


def save_settings(new_data: dict) -> dict:
    ensure_dirs()
    current = {}
    if SETTINGS_FILE.exists():
        try:
            current = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            current = {}
    merged = _deep_merge(_deep_merge(DEFAULT_SETTINGS, current), new_data)
    SETTINGS_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    return load_settings()
