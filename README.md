# ✂️ AutoClipper

Tool auto-clipper untuk memangkas video panjang menjadi klip pendek yang **berpotensi FYP/viral** — lengkap dengan subtitle per kata, hook overlay, dan export multi-format. Semuanya berjalan **lokal di laptopmu**.

## ✨ Fitur

- 🎤 **Auto Subtitle** — subtitle otomatis per kata (word-level timestamps) dengan 5 gaya animasi: *Beasty, Karaoke, Boxy, Duo, Clean*. Font, warna, ukuran, posisi, dan kapitalisasi bisa diatur.
- 🔥 **Viral Hook Overlays** — 4 template hook (*classic, elegant, boxies, box*) dengan posisi & ukuran yang bisa digeser.
- 📱 **Multi-Format & Aspect Ratio** — export ke 9:16, 1:1, atau 16:9 sebagai MP4, WebM, atau GIF.
- 🎬 **Editor Studio & Real-time Preview** — revisi teks caption per kata, trim klip, dan lihat hasilnya langsung di preview.
- 🔗 **Input Fleksibel** — upload video lokal atau tempel link YouTube.
- 📁 **Project History** — semua project tersimpan di `backend/data/projects/`, bisa dilanjutkan kapan saja.
- 🤖 **Multi-Provider AI** — Transkripsi: Groq Whisper / OpenAI Whisper / Local Whisper (faster-whisper, offline). LLM pencari momen viral: Groq / Gemini / OpenAI / Moonshot (Kimi).
- 💧 **Watermark Otomatis** — teks (mis. `@usernamekamu`) atau logo PNG di semua video export. Atur sekali di ⚙️ Pengaturan: posisi (4 sudut / tengah), kepekatan, dan ukuran. Tampil juga di preview studio.
- ⚡ **Paket Efek Viral** (tab FX di Studio, bisa on/off per klip):
  - 🔍 *Zoom punch-in* — kamera "nge-punch" tiap ganti kalimat, kekuatan bisa diatur.
  - ✂️ *Jump cut otomatis* — jeda hening dibuang (ambang bisa diatur), pacing jadi rapat.
  - 🎯 *Sorot kata kunci AI* — LLM memilih kata paling penting untuk diwarnai di caption.
  - 😱 *Emoji otomatis AI* — emoji relevan disisipkan di kata yang pas (maks 1 per kalimat).
  - 📊 *Progress bar* — bar retensi di bawah video, warna bebas.
  - 🎬 *Cold-open teaser* — momen paling dramatis (dipilih AI) ditaruh 2-4 detik di awal klip sebagai umpan.
  - 🎵 *Musik latar* — pilih file musik per klip, volume otomatis mengecil saat ada suara (auto-ducking).
- 📖 **Paket Storytelling & Posting**:
  - 🎲 *3 variasi hook AI* — formula curiosity gap / pertanyaan / shock, tinggal klik pilih di tab Hook.
  - 📋 *Metadata posting AI* — judul curiosity-gap, deskripsi, dan 10-12 hashtag siap copy di tab Export.
  - ✂️ *Cliffhanger split* — AI memecah klip panjang jadi Part 1 (berakhir di titik penasaran + overlay "Part 2 👉") dan Part 2.
- 🖼️ **Thumbnail Generator** — thumbnail bermerek dari frame video: teks hook besar 2 warna ala kreator viral, panah merah, gradasi gelap, dan maskot/logo channel (upload sekali di Pengaturan). Hasil JPG siap upload.

## 🧰 Prasyarat

| Kebutuhan | Cek | Install |
|---|---|---|
| Python 3.10+ | `python --version` | python.org |
| Node.js 18+ | `node --version` | nodejs.org |
| ffmpeg | `ffmpeg -version` | `winget install Gyan.FFmpeg` (lalu buka ulang terminal) |

Minimal **satu API key** (gratis di Groq) — atau pakai Local Whisper tanpa key untuk transkripsi.

- Groq (gratis & cepat): https://console.groq.com/keys
- Google Gemini: https://aistudio.google.com/apikey
- OpenAI: https://platform.openai.com/api-keys
- Moonshot: https://platform.moonshot.ai

## 🚀 Cara Menjalankan

**Paling gampang:** klik dua kali `start-all.bat`. Ini membuka 2 jendela terminal (backend + frontend), lalu buka **http://127.0.0.1:5173** di browser.

**Manual:**

```bat
:: Terminal 1 — backend (API + ffmpeg + AI)
cd backend
run.bat

:: Terminal 2 — frontend (UI studio)
cd frontend
run.bat
```

Pertama kali dijalankan akan otomatis membuat virtualenv + `npm install`, jadi agak lama. Selanjutnya cepat.

> Alternatif tanpa dev server: `cd frontend && npm run build`, lalu cukup jalankan backend saja dan buka http://127.0.0.1:8000 (backend otomatis menyajikan hasil build).

## 📖 Alur Pakai

1. Buka **⚙️ Pengaturan** → isi API key provider yang mau dipakai → Simpan (sekali saja).
2. Di halaman **Buat Klip**: upload video / tempel link YouTube, pilih bahasa, jumlah klip, durasi, dan provider AI → **Proses Sekarang**.
3. Tunggu pipeline: unduh (jika YouTube) → transkripsi → AI memilih momen paling berpotensi viral (dengan skor 1–100 + hook).
4. Di **Studio**: pilih klip di panel kiri, lalu:
   - **🎨 Gaya** — pilih preset animasi subtitle, font, warna, posisi.
   - **🔥 Hook** — edit teks hook, pilih template, geser posisi.
   - **📝 Teks** — klik kata untuk lompat, klik dua kali untuk edit teks caption.
   - Trim klip lewat bar di bawah player atau tombol "⌖ di posisi player".
5. **📤 Export** — pilih rasio + format → Export → unduh hasilnya. Riwayat export tersimpan per klip.

## 🖥️ Transkripsi Lokal (opsional, tanpa API key)

```bat
cd backend
.venv\Scripts\pip install faster-whisper
```

Lalu pilih "Local Whisper" saat membuat project. Model diunduh otomatis saat pertama dipakai (pilih ukuran model di Pengaturan; `small` = seimbang, `large-v3` = paling akurat tapi berat).

## 🏗️ Arsitektur

```
auto-clipper/
├── backend/            FastAPI (Python)
│   ├── app/
│   │   ├── main.py            entry point API
│   │   ├── config.py          pengaturan & API key (data/settings.json)
│   │   ├── storage.py         project history (JSON per project)
│   │   ├── jobs.py            background job + progres
│   │   ├── routers/           endpoint: projects, clips, settings
│   │   └── services/
│   │       ├── downloader.py  yt-dlp (link YouTube)
│   │       ├── transcriber.py Whisper cloud/lokal, word-level, auto-chunk 14 mnt
│   │       ├── llm.py         deteksi momen viral (JSON: start, end, hook, score)
│   │       ├── subtitles.py   generator ASS 5 preset animasi per kata
│   │       ├── hooks.py       4 template hook overlay
│   │       └── renderer.py    ffmpeg: trim + crop rasio + burn subtitle → MP4/WebM/GIF
│   └── data/           settings + semua project & hasil export
└── frontend/           React + Vite (UI studio, preview real-time)
```

Preview di browser meniru gaya subtitle dengan CSS (cepat & real-time); hasil export dirender presisi oleh ffmpeg + libass dari file `.ass` yang dibuat backend — logika pemenggalan kata keduanya dibuat identik agar preview ≈ hasil akhir.

## 🩹 Troubleshooting

- **"ffmpeg tidak ditemukan"** — install (`winget install Gyan.FFmpeg`), lalu **tutup & buka ulang terminal** dan jalankan ulang backend (PATH baru terbaca di terminal baru).
- **Video .mkv tidak tampil di preview** — browser tidak mendukung MKV; export tetap jalan normal. Kalau mau preview, konversi dulu ke MP4.
- **Transkripsi gagal 401/403** — API key salah/kosong. Cek menu Pengaturan.
- **Video panjang** — audio otomatis dipotong per 14 menit sebelum dikirim ke API, jadi podcast berjam-jam pun aman.
- **Unduhan YouTube gagal** — update yt-dlp: `backend\.venv\Scripts\pip install -U yt-dlp`.
