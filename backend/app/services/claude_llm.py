"""Otak AI Claude (Anthropic) lewat SDK resmi.

Dipanggil dari llm.chat() untuk provider yang cfg-nya ber-"api": "anthropic". Bentuk masukan dan
keluaran sama dengan provider lain (daftar pesan gaya OpenAI masuk, teks keluar), dan semua
kegagalan dilempar sebagai RuntimeError supaya cadangan antar-provider di llm.chat_fb tetap jalan.
"""

# Model Claude terbaru menolak temperature selain bawaan, jadi nilai dari pemanggil tidak dikirim.
# Thinking selalu aktif dan ikut memakan max_tokens, karena itu batasnya dinaikkan.
MIN_MAX_TOKENS = 16000
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _split(messages: list) -> tuple[str, list]:
    system = "\n".join(str(m.get("content") or "") for m in messages if m.get("role") == "system")
    rest = [{"role": m["role"], "content": m["content"]}
            for m in messages if m.get("role") in ("user", "assistant")]
    return system.strip(), rest


def chat(cfg: dict, messages: list, max_tokens: int = 4096) -> str:
    try:
        import anthropic
    except ImportError as e:  # paket belum terpasang
        raise RuntimeError("Paket 'anthropic' belum terpasang. Jalankan ulang backend\\run.bat.") from e

    model = cfg.get("llm_model") or "claude-opus-5-5"
    system, msgs = _split(messages)
    kwargs = {
        "model": model,
        "max_tokens": max(int(max_tokens or 0), MIN_MAX_TOKENS),
        "messages": msgs,
        "output_config": {"effort": cfg.get("effort") or "medium"},
    }
    if system:
        kwargs["system"] = system

    client = anthropic.Anthropic(api_key=cfg["api_key"], max_retries=3, timeout=300.0)
    try:
        try:
            # Kalau model utama menolak karena aturan keamanan, server Anthropic mencoba model
            # cadangannya dalam panggilan yang sama.
            resp = client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
        except anthropic.BadRequestError as e:
            if "fallback" not in str(e).lower():
                raise
            resp = client.messages.create(**kwargs)  # model ini tidak mendukung cadangan server
    except anthropic.AuthenticationError as e:
        raise RuntimeError("API key Claude tidak valid. Periksa di Pengaturan.") from e
    except anthropic.PermissionDeniedError as e:
        raise RuntimeError(f"API key Claude tidak punya izin untuk model {model}.") from e
    except anthropic.NotFoundError as e:
        raise RuntimeError(f"Model Claude '{model}' tidak ditemukan. Periksa nama model di Pengaturan.") from e
    except anthropic.RateLimitError as e:
        wait = e.response.headers.get("retry-after", "?")
        raise RuntimeError(f"limit sementara model {model} tercapai, reset dalam ±{wait} detik") from e
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"LLM gagal ({e.status_code}): {str(e.message)[:300]}") from e
    except anthropic.APIConnectionError as e:
        raise RuntimeError("Tidak bisa terhubung ke server Claude. Periksa koneksi internet.") from e

    if resp.stop_reason == "refusal":
        raise RuntimeError(f"Claude menolak permintaan ini (model {resp.model}).")
    text = "".join(b.text for b in resp.content if b.type == "text")
    if resp.stop_reason == "max_tokens":
        raise RuntimeError("Jawaban Claude terpotong karena batas panjang keluaran.")
    if not text.strip():
        raise RuntimeError("Claude mengembalikan jawaban kosong.")
    return text
