# MASTER SPECIFICATION PROMPT — AutoClipper
_Versi 13 November 2026. Salin seluruh isi di bawah garis ke AI/developer yang akan bekerja di proyek ini._

---

Kamu akan bekerja di **AutoClipper**, aplikasi produksi video lokal milik satu kreator konten Shorts/TikTok/Reels Indonesia. Pahami spesifikasi berikut sebelum mengubah apa pun.

## 1. Tujuan produk
AutoClipper mengubah bahan mentah (video panjang, link YouTube, foto produk, video jadi, atau tanpa bahan sama sekali) menjadi **video vertikal 9:16 siap upload**. Hasilnya lengkap dengan subtitle per kata, hook, musik, thumbnail, dan caption posting.
Semua berjalan **lokal di laptop** (Windows 11, MSI Katana: Ryzen 7 8845HS, RTX 4060 8GB). Layanan cloud hanya dipakai untuk LLM dan transkripsi.
Output akhir masuk ke folder `Siap Upload/<tanggal>/`: `NN_Judul.mp4` + `_thumbnail.jpg` + `_caption.txt` (judul, deskripsi, hashtag, catatan upload).

## 2. Stack & struktur
- **Backend:** FastAPI (Python 3.14, `backend/.venv`), port 8000. Data project disimpan sebagai JSON di `backend/data/projects/<id>/`. Background job dengan progres (`jobs.py`), pengaturan di `backend/data/settings.json`.
- **Frontend:** React + Vite (`frontend/`). Hasil build (`frontend/dist`) disajikan backend di http://127.0.0.1:8000. Halaman: `/` Buat (tab mode), `/projects` Riwayat, `/studio/:id` Editor, `/frame-studio`, `/command-center`.
- **Render:** ffmpeg 8 (subtitle ASS burn-in). Encoder **h264_nvenc** (otomatis, fallback libx264), loudness **−14 LUFS**.
- **AI cloud:**
  - LLM via endpoint kompatibel OpenAI: Groq (default `openai/gpt-oss-120b`, model reasoning, jadi butuh `max_tokens` besar), Gemini, OpenAI, Moonshot, dengan fallback otomatis antar-provider.
  - Transkripsi: Groq Whisper / OpenAI Whisper / faster-whisper lokal.
- **AI lokal (D:\):**
  - `D:\ComfyUI` (port 8188): SDXL Juggernaut XL v9, dinyalakan otomatis bila perlu.
  - `D:\OmniVoice` (venv PyTorch CUDA terpisah): TTS OmniVoice (`tts_worker.py`, suara di `voices/`) dan parallax 2.5D (`parallax_worker.py`, Depth Anything V2). Dipanggil lewat subprocess.
- **Tools tambahan:** `tools/remotion` (Remotion 4, motion graphic React) dan `tools/hyperframes` (bumper intro/outro animasi HTML yang dirender ke WebM alpha).

## 3. Mode produksi (tab di halaman Buat)
| Mode | Input | Proses | Voice-over |
|---|---|---|---|
| **Upload / YouTube** (klip dari video panjang) | file atau link (yt-dlp) | transkripsi per kata → LLM pilih momen viral (skor 1–100 + hook) → klip → Studio / Auto-Produce | dilarang (kecuali mode narasi film) |
| **Narasi film** | video film | LLM menulis naskah alur cerita → TTS → klip bernarasi | wajib |
| **Affiliate** | foto produk + deskripsi | naskah review AI → TTS → slideshow Ken Burns + caption | wajib |
| **Horor AI** | topik (opsional) | lihat bagian 4 | wajib |
| **Video jadi (readymade)** | video siap upload | hanya dipasangi border brand, tanpa AI/subtitle | dilarang |

**Aturan voice-over dikunci** di `storage.voiceover_policy()`: video hasil generate **wajib** narator, klip jadi **tanpa** narator. Renderer menolak render yang melanggar.

## 4. Mode Horor AI (`services/horror.py`), fokus pengembangan saat ini
Menghasilkan 1–3 video faceless per proses. Alurnya:
1. **Cerita (LLM):** 7–10 adegan, 95–120 kata naskah lisan (kalimat pendek, "…" untuk jeda, bahasa ngobrol).
   - Sudut pandang **kamu / aku / acak**. Tepat satu adegan twist. Hook ≤12 kata, CTA komentar.
   - Metadata: judul, hook, cta, thumbnail_text, deskripsi, hashtag.
   - `protagonist`: deskripsi fisik tokoh yang disalin ke semua prompt.
   - Per adegan: `narration`, `prompt` (EN, objek utama di depan), `prompt2` (sudut kedua, bukan close-up wajah), `sfx`, `twist`.
   - Judul lama diingat (`data/horror_history.json`) supaya ide tidak berulang. 7 kategori. Gaya visual: sinematik / komik / found footage.
   - Aturan konten: tanpa gore, bunuh diri, anak dicelakai, atau menghina agama. Hantu khas Indonesia, semua tokoh orang Indonesia.
2. **Narator:** default `omnivoice:narator_d` (pria muda, suara rendah, speed 0,8). Tiap take dicek ulang dengan Whisper (`omnivoice_tts._match`): kemiripan ≥0,82, dan pengulangan frasa ≥2 kata atau kata hilang ≥3 kata membuat take ditolak. Maksimal 4 percobaan dengan seed baru. Timing kata dari Whisper, diselaraskan ke naskah (`gemini_tts.align`, tanpa tumpang tindih). Alternatif suara: Edge TTS dan Gemini TTS.
3. **Gambar:** ComfyUI SDXL 768×1344 → 1080×1920, 30 step, cfg 4.5, dengan negative prompt anti-gore/teks/bule. Adegan ≥4 dtk mendapat 2 gambar dan dipotong di jeda kata (±3 dtk per shot).
4. **Gerak:** **parallax 2.5D**: kedalaman dirapikan supaya tokoh bergerak utuh. Gerakan push/right/rise/pull/left, ditambah twist (dorong cepat + guncangan + kilat merah). Fallback ke zoompan Ken Burns. Grade horor: kontras, saturasi rendah, biru dingin, kedip lampu, vignette, grain.
5. **Audio:** ambience drone procedural (`horor_drone_*.m4a`) + **11 SFX procedural** (`horror_sfx.py`: static, knock, footsteps, heartbeat, wind, drip, breath, phone, creak, riser, hit) yang dicampur ke trek narator. Musik latar otomatis mengecil (ducking) di bawah suara.
6. **Render:** subtitle preset beasty dengan sorot merah `#FF2B2B`, hook elegant 3,5 dtk lalu memudar, progress bar merah, outro subscribe (`follow_cta`), thumbnail dari momen twist, caption + catatan upload (label konten AI, bukan untuk anak).
7. **Resume:** `horror_state.json` + shot `.part`. Proses yang terputus (misalnya laptop mati) bisa dilanjutkan tanpa mengulang cerita, suara, atau gambar.

## 5. Editor Studio & efek (berlaku umum)
- **Subtitle per kata:** 5 preset (Beasty, Karaoke, Boxy, Duo, Clean). Font, warna, sorot, ukuran, posisi, dan kapital bisa diatur. Editor caption bisa mengedit kata dan memperbaiki typo transkrip dengan AI.
- **Hook overlay:** 4 template (classic, elegant, boxies, box), 3 variasi hook AI, durasi tampil opsional.
- **Paket FX:** zoom punch-in, jump cut jeda hening, sorot kata kunci AI, emoji AI, progress bar, cold-open teaser, musik latar + ducking.
- **Storytelling:** metadata posting AI, cliffhanger split (Part 1/Part 2), trim, preview real-time.
- **Export:** 9:16 / 1:1 / 16:9 sebagai MP4 / WebM / GIF. **Auto-Produce:** N klip terbaik langsung jadi ke Siap Upload.
- **Branding:**
  - Watermark teks/logo.
  - **Border brand** dengan 6 tema (podcast, minimal, berita, neon, blur, bold).
  - **Frame upload sendiri** (area video dideteksi otomatis).
  - **Frame pack** 8 gaya buatan kode (champion, impetus, diagonal, redglitch, chroma, glass, vhs, minimal).
  - **Frame Studio**: editor desain layer + brand preset + teks dinamis `{judul}` dirender server (`textfx.py`).
  - **Bumper** intro/outro 4 template: follow_cta (tombol subscribe @buuubaa6740), gold_burst, neon_glitch, slam_impact.
  - **Thumbnail generator**: teks 2 warna, panah, maskot.
- **Command Center = AI Office 3D** (`frontend/src/office3d/`, React Three Fiber; rancangan `docs/superpowers/specs/2026-11-14-ai-office-3d-design.md`):
  kantor isometrik grid 2×3 (Unduh & Data, Analis Klip, Studio Horor, Ruang Suara, Otak AI, Render + Affiliate), karakter chibi prosedural yang
  mengetik / berjalan ke Otak AI / membawa kotak serah terima / bingung saat error, HANYA dari telemetri asli. `sceneModel.deriveScene()` = logika murni (vitest).
  Telemetri: `inflight[]` (panggilan yang sedang berjalan, dari `telemetry.wrap`), `job`/`job_kind` asal (contextvar `app/jobctx.py`), `scene_health` (jendela 1 jam), agent `job:horror`.
  `?demo=1` = Mode Demo berlabel "MODE DEMO, bukan data asli" untuk pameran. Render berhenti saat tab tersembunyi; GPU ±17% saat terbuka. Fallback 2D bila WebGL tak ada.
  Tes: `backend` → `python -m pytest tests` (conftest mengisolasi telemetri); `frontend` → `npm test`.

## 6. API (ringkas)
- **Project:** `POST /api/projects/{upload|youtube|affiliate|horror|readymade}` · `POST /api/projects/{id}/{process|autoproduce|narrate|annotate|fix-transcript}` · `GET/DELETE /api/projects/{id}` · `GET/PUT /api/projects/{id}/transcript` · `GET /api/jobs/{job_id}` · `GET /api/horror/status`.
- **Klip:** `POST/PUT/DELETE /api/projects/{pid}/clips/{cid}` + `/render` `/hooks` `/metadata` `/thumbnail` `/split`.
- **Pengaturan & aset:** `/api/settings` (+ watermark-image, mascot-image, brand-logo, music) · `/api/frames` · `/api/brand/*` · `/api/designs` · `/api/presets` · `/api/assets` · `/api/textfx`.

## 7. Batasan & aturan kerja (WAJIB)
1. **Laptop tidak stabil:** sering mati sendiri saat beban berat. Pakai NVENC, `ffmpeg_threads` 4, jeda pendingin, dan semua proses panjang harus bisa di-resume. Backend dijalankan terlepas dari terminal: `backend/run_detached.bat` lewat WMI `Win32_Process.Create`.
2. **Jangan pernah menghapus project dengan glob** di `data/projects`. Hapus hanya per ID yang sudah diverifikasi isinya (pernah terjadi insiden).
3. **API key hanya diisi lewat menu Pengaturan**, jangan ditempel di chat atau kode.
4. **Jangan meng-clone suara orang nyata** tanpa izin. Suara narator adalah hasil voice design OmniVoice.
5. Bahasa UI, naskah, dan pesan error: **Bahasa Indonesia** santai. Desain UI mengikuti `DESIGN.md`: gelap grafit, aksen kuning `#FFD100`, font Archivo, motif tanda potong.
6. Sebelum menambah fitur besar, buat backup folder `backup-<fitur>-<tanggal>/`. Setelah mengubah backend, restart backend. Setelah mengubah frontend, `npm run build`.
7. Untuk patch kode, pakai editor atau file skrip, jangan heredoc dengan backslash. Cek dengan `python -m pyflakes` (sudah terpasang di `.venv`).
8. Setiap perubahan video diverifikasi dengan bukti: contact sheet frame, `ebur128` untuk loudness, transkripsi Whisper untuk cek suara/pengulangan. Jangan klaim "sudah benar" tanpa mengecek.

## 8. Backlog / ide (belum dikerjakan)
- Produksi terjadwal otomatis (1–3 video horor per malam).
- **Mode Horor Panjang** 8–10 menit 16:9 (naskah per babak, TTS per adegan, mid-roll ≥8 menit).
- Klip AI bergerak Wan 2.2 untuk momen twist.
- Blender + Blender MCP untuk adegan 3D (user sedang mengunduh Blender).
- Konsistensi tokoh tingkat lanjut (IP-Adapter / LoRA).
- Integrasi Remotion untuk title card dan teks kinetik.
- AI Office fase 2: model ruangan/karakter buatan Blender (GLB) menggantikan primitif; tab Tasks/Calendar/Brain ala video referensi.
- Ide terpisah, **jangan dikerjakan tanpa diminta**: channel animasi anak (riset di `riset-animasi-anak-2026-11-13.md`) dan format komedi POV ala bob.figures.it.out.
- README.md sudah usang (hanya mencakup fitur awal) dan perlu diperbarui dari dokumen ini.
