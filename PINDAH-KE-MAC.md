# Pindah AutoClipper ke Mac mini

Catatan hidup: diperbarui setiap kali app bertambah fitur yang terikat ke Windows atau GPU NVIDIA.
Dibuat 17 Nov 2026. Centang `[x]` kalau sudah beres.

---

## 1. Ringkasan

- **Gampang pindah:** backend (Python/FastAPI), frontend (React/Vite), semua otak AI lewat internet
  (Gemini, Groq, OpenRouter, OpenAI, Claude), Edge TTS, Gemini TTS, yt-dlp, ffmpeg.
- **Perlu kerja ekstra:** semua yang memakai GPU NVIDIA (CUDA) dan alamat folder Windows (`C:\`, `D:\`, `.bat`).
- **Paling berisiko:** OmniVoice (narator lokal) dan parallax 2.5D. Harus dicoba apakah jalan di chip Apple.
  Cadangannya: narator Gemini atau Edge, dan efek zoom biasa (sudah otomatis dipakai kalau parallax gagal).

---

## 2. Yang dibutuhkan di Mac

### Hardware
- [ ] RAM **minimal 32 GB, idealnya 64 GB.** Di Mac, RAM dipakai bersama CPU dan GPU, dan SDXL + OmniVoice + Whisper sama-sama makan memori.
- [ ] SSD **1 TB**, atau SSD eksternal untuk model AI dan video hasil.

### Software
- [ ] Homebrew
- [ ] Python 3.12: `brew install python@3.12`
- [ ] Node.js: `brew install node`
- [ ] ffmpeg: `brew install ffmpeg`
- [ ] git: `brew install git`
- [ ] ComfyUI versi Mac (Apple Silicon / MPS)
- [ ] Claude Code

---

## 3. Bagian kode yang terikat ke Windows/NVIDIA

| Bagian | Lokasi | Masalah di Mac | Solusi | Status |
|---|---|---|---|---|
| Launcher | `start-all.bat`, `backend/run.bat`, `frontend/run.bat` | `.bat` tidak jalan | Buat `start-all.sh` dan `run.sh` | [ ] |
| Menyalakan ComfyUI | `backend/app/services/comfy.py` (`cmd /c`, flag proses Windows) | `cmd` tidak ada | Jalankan script `.sh` dengan `subprocess` biasa kalau bukan Windows | [ ] |
| Alamat ComfyUI | default `D:\ComfyUI\start_comfy_log.bat` | Folder tidak ada | Isi `comfy.start_bat` di `settings.json` (lihat bagian 6) | [ ] |
| Font | `border.py` dan `thumbnail.py` (`C:/Windows/Fonts`) | Folder tidak ada | Font dibawa ke folder project, atau dicari di `/Library/Fonts` dan `~/Library/Fonts` | [ ] |
| Encoder video | `media.py` (NVENC) | NVENC tidak ada. `auto` jatuh ke x264 (CPU): tetap jalan, tapi lebih lambat | Tambah `h264_videotoolbox` (chip Apple) | [ ] |
| OmniVoice | `omnivoice_tts.py`: `D:\OmniVoice\venv\...`, `D:\OmniVoice\voices` | venv PyTorch CUDA | Pasang ulang dengan PyTorch Mac (MPS), lalu isi `omnivoice` di `settings.json` | [ ] |
| Parallax 2.5D | `horror.py`: `D:\OmniVoice\parallax_worker.py` | venv PyTorch CUDA | Pasang ulang (MPS), lalu isi `parallax` di `settings.json` | [ ] |
| Transkripsi lokal (opsional) | `faster-whisper` | Tidak memakai GPU di Mac (hanya CPU) | Tetap pakai Whisper via Groq (internet), atau ganti ke `mlx-whisper` | [ ] |
| Batas GPU 8 GB | `factory.py`, `comfy.free()` | Aturan dibuat untuk laptop RTX 4060 | Bisa dilonggarkan kalau RAM Mac besar | [ ] |
| `.venv` dan `node_modules` | `backend/.venv`, `frontend/node_modules` | Isinya khusus Windows | **Jangan disalin.** Buat ulang di Mac | — |

---

## 4. Persiapan sekarang (di laptop Windows, tidak mengganggu yang jalan)

- [x] **git:** `git init` sudah (20 Nov; `.gitignore`, `setup.bat`/`setup.sh`, `backend/settings.example.json` dibuat). Tinggal push ke repo **privat**. `.gitignore` wajib berisi `backend/data/`, `Siap Upload/`, `.venv/`, `node_modules/`, `*.mp4`, `.env`.
- [ ] **Kode bisa jalan di dua sistem:** perbaikan di tabel bagian 3 dikerjakan dengan cara "kalau Windows pakai yang lama, kalau Mac pakai yang baru".
- [ ] **Daftar model ComfyUI** yang dipakai (checkpoint SDXL: juggernaut / realvis / dreamshaper, dll.) beserta ukurannya.
- [ ] **Daftar suara OmniVoice** (file `.wav` + `.txt` di `D:\OmniVoice\voices`).
- [ ] **Daftar font** yang benar-benar dipakai tema bingkai dan thumbnail.
- [ ] Siapkan SSD/flashdisk untuk memindahkan data (lihat bagian 5).

---

## 5. Yang harus dibawa

| Apa | Dari (Windows) | Catatan |
|---|---|---|
| Kode project | `C:\Users\andyp\auto-clipper` | Tanpa `.venv` dan `node_modules` |
| Data app | `backend\data\` | Pengaturan, frame, naskah horor, paket Flow, riwayat, batch variasi |
| **API key** | `backend\data\settings.json` | Pindahkan lewat flashdisk/SSD. **Jangan lewat chat atau email** |
| Video siap upload | `Siap Upload\` | Opsional; bisa diarsipkan saja |
| Model ComfyUI | `D:\ComfyUI\...\models\` | File besar; salin lewat SSD |
| Suara OmniVoice | `D:\OmniVoice\voices\` | Wajib kalau mau suara narator sama |
| Script OmniVoice/parallax | `D:\OmniVoice\tts_worker.py`, `parallax_worker.py` | venv-nya dibuat ulang |
| Font | sesuai daftar di bagian 4 | |
| Catatan Claude | `C:\Users\andyp\.claude\projects\c--Users-andyp-auto-clipper\memory\` | Salin ke `~/.claude/projects/<folder-project-di-Mac>/memory/` agar Claude tetap ingat konteks |

---

## 6. Urutan di hari pindahan

1. [ ] Pasang semua software (bagian 2).
2. [ ] Salin kode dan data (bagian 5).
3. [ ] Backend:
   ```bash
   cd auto-clipper/backend
   python3.12 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. [ ] Frontend: `cd auto-clipper/frontend && npm install`
5. [ ] Sesuaikan alamat di `backend/data/settings.json`. Kunci-kunci ini sengaja tidak bisa diubah dari halaman Pengaturan, jadi edit file-nya langsung:
   ```json
   "comfy":     { "start_bat": "/Users/<nama>/ComfyUI/start.sh" },
   "omnivoice": { "python": "/Users/<nama>/OmniVoice/venv/bin/python", "voices_dir": "/Users/<nama>/OmniVoice/voices" },
   "parallax":  { "python": "/Users/<nama>/OmniVoice/venv/bin/python", "worker": "/Users/<nama>/OmniVoice/parallax_worker.py" }
   ```
   Lokasi data dan output juga bisa dipindah lewat variabel `AUTOCLIPPER_DATA` dan `AUTOCLIPPER_OUTPUT`.
6. [ ] Jalankan app (`start-all.sh`), buka `http://127.0.0.1:5173`.
7. [ ] Uji satu per satu:
   - [ ] Pengaturan: semua API key terbaca, uji otak AI combo
   - [ ] Buat Klip dari link YouTube (yt-dlp, transkripsi, render)
   - [ ] Frame Studio dan bingkai (font tampil benar)
   - [ ] Galeri variasi
   - [ ] Naskah horor → produksi 1 video (ComfyUI + narator + render)
   - [ ] Prompt Flow
   - [ ] Command Center
8. [ ] Kalau OmniVoice gagal: sementara pakai narator Gemini atau Edge; kalau parallax gagal: zoom biasa.

---

## 7. Log selama pengembangan

Setiap fitur baru yang menambah ketergantungan ke Windows, GPU NVIDIA, folder `C:\`/`D:\`, atau program
luar dicatat di sini, supaya tidak ada yang terlupa saat pindah.

| Tanggal | Fitur | Ketergantungan baru | Catatan untuk Mac |
|---|---|---|---|
| 16 Nov 2026 | Otak AI Claude (`claude_llm.py`) | Paket `anthropic` | Aman, lewat internet |
| 16 Nov 2026 | Prompt Flow (`flow_prompt.py`) | Tidak ada | Aman, hanya teks |
| 17 Nov 2026 | 47 font baru + pemilih font + unggah font (`font_catalog.py`) | Tidak ada (file font di `backend/data/assets/fonts/`, unggahan di `fonts/user/`) | Aman; ikut tersalin bersama `backend/data/` |
| 17 Nov 2026 | Efek teks tahap 2: kotak caption, sorot kata, stabilo, bayangan panjang, lengkung + galeri gaya (`textfx.py`, `text_styles.py`) | Tidak ada (Pillow murni) | Aman |
| 17 Nov 2026 | Animasi teks gelombang 1: 12 animasi muncul + 10 gerakan (`textfx.py`) | Tidak ada (Pillow murni) | Aman |
| 17 Nov 2026 | Tahap 3 bingkai: 10 gaya bingkai video + 8 template (`StudioCanvas.jsx`, `model.js`) | Tidak ada (kanvas browser) | Aman. Skrip potret browser `tools/regresi/browser/` memakai Edge; di Mac ganti `channel` ke Chrome |
| 18 Nov 2026 | Tahap 4 Acak gaya: tombol acak Frame Studio, aturan acak, mode acak di produksi variasi (`acak_gaya.py`, `AcakGaya.jsx`) | Tidak ada (Python murni; riwayat di `backend/data/acak_gaya*.json`) | Aman; ikut tersalin bersama `backend/data/`. `sinkron_gaya.py` butuh `node` |
| 18 Nov 2026 | Konversi HEVC/ProRes ke H.264 pakai GPU (`media.ensure_browser_playable`: `-hwaccel cuda` + `h264_nvenc -rc constqp -qp 17`) | NVIDIA NVENC/NVDEC (CUDA) | Otomatis jatuh ke jalur lama libx264 bila NVENC tidak ada, jadi di Mac tetap jalan (lebih lambat). Opsional di Mac: ganti ke `h264_videotoolbox` |
| 19 Nov 2026 | Uji coba animasi 3D (`tools/animasi-3d/`: Three.js di Edge headless, render frame -> ffmpeg) | Edge (`channel: 'msedge'`, ANGLE D3D11) + NVENC | Encoder otomatis jatuh ke libx264. Di Mac: Edge versi Mac ada, atau hapus `channel`/arg `--use-angle=d3d11` agar pakai Chromium bawaan playwright (WebGL lewat Metal) |
