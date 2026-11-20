# Horror Motion Studio — P1 Stability Foundation
**Audit sumber + spesifikasi teknis · 14 November 2026 · status: DIBATALKAN PEMILIK (14 Nov 2026)**

> Spesifikasi ini dibatalkan oleh pemilik dan tidak akan diimplementasikan. Dokumen disimpan hanya sebagai catatan audit.

Audit ini hanya membaca kode. Tidak ada file sumber yang diubah. Satu-satunya file baru adalah dokumen ini.

Arti label bukti di dokumen ini:
- **VERIFIED (kode)**: saya baca langsung di file dan baris yang disebut.
- **NOT VERIFIED (runtime)**: disimpulkan dari kode, belum dibuktikan dengan menjalankan skenarionya.

---

## 1. Peta arsitektur aktual

```
Browser (React/Vite)
   │  POST /api/projects/...  → balasan {job_id}
   │  GET  /api/jobs/{id}     → polling progres
   ▼
FastAPI, SATU proses uvicorn (127.0.0.1:8000)
   routers/projects.py, routers/clips.py
        │ jobs.start(kind, fn, ...)
        ▼
   jobs.py ── JOBS: dict di memori ── 1 thread daemon per job, langsung jalan
        │
        ├─ horror.full_run ──┬─ llm (HTTP ke Groq/Gemini/…)
        │                    ├─ narrate → omnivoice_tts → subprocess tts_worker.py  [GPU]
        │                    ├─ comfy.txt2img → HTTP ke ComfyUI :8188 (proses terpisah) [GPU]
        │                    ├─ build_footage → subprocess parallax_worker.py       [GPU]
        │                    │                 └ cadangan: ffmpeg zoompan           [NVENC/CPU]
        │                    └─ autoproduce.produce → renderer.render → ffmpeg      [NVENC/CPU]
        ├─ affiliate.full_run, readymade.run_batch, pipeline.process, renderer.render
        └─ telemetry.record (events.jsonl) + registry in-flight (memori)

Penyimpanan: data/projects/<id>/project.json (tulis atomik), horror_state.json (tulis atomik),
             data/settings.json. Tidak ada penyimpanan job.
```

| Komponen | Kondisi sekarang | Bukti |
|---|---|---|
| Daftar job | `JOBS` dict di memori, tidak pernah ditulis ke disk, tidak pernah dibersihkan | VERIFIED `jobs.py:37` |
| Eksekusi job | Thread daemon langsung start, tanpa antrean dan tanpa batas jumlah | VERIFIED `jobs.py:58` |
| Kunci sumber daya | Hanya 2 lock, keduanya di telemetri. Tidak ada kunci GPU | VERIFIED `telemetry.py:20,69` |
| Hook saat backend start | Tidak ada (`startup`/`lifespan` tidak ditemukan di `main.py`) | VERIFIED |
| Simpan project | Atomik (tmp + `os.replace`) dengan retry baca | VERIFIED `storage.py:17-36` |
| State horor | Atomik; disimpan setelah cerita, tiap narasi, tiap gambar | VERIFIED `horror.py:531-535, 594, 610, 629` |
| Pantau GPU/suhu/RAM | Tidak ada. `nvidia-smi` tersedia di sistem tetapi tidak dipakai | VERIFIED |

## 2. Peta ketergantungan file (lingkup P1)

```
routers/projects.py ─┐
routers/clips.py ────┼─► jobs.py ─► jobctx.py ─► telemetry.py
                     │
services/horror.py ──┼─► comfy.py (HTTP)            ─► ComfyUI (D:\ComfyUI, proses lepas)
                     ├─► narrate.py ─► omnivoice_tts.py ─► D:\OmniVoice\tts_worker.py
                     ├─► media.py (ffmpeg/ffprobe)
                     ├─► D:\OmniVoice\parallax_worker.py (subprocess langsung)
                     └─► autoproduce.py ─► renderer.py ─► media.py
services/affiliate.py, readymade.py, pipeline.py, bumper.py ─► media.py / subprocess
storage.py ◄─ semua modul di atas
```

Pemakai GPU yang ditemukan: ComfyUI (SDXL), worker OmniVoice, worker parallax, dan encoder NVENC lewat `media.h264_args` (`renderer.py:464`, `horror.py:393,447`). Whisper lokal berjalan di CPU (`transcriber.py:123`).

## 3. Jalur kegagalan saat ini

| # | Jalur kegagalan | Bukti | Status di AUDIT-2026-11-13 |
|---|---|---|---|
| F1 | Backend mati → semua status job hilang. Project tetap berstatus `processing` tanpa proses. `/api/jobs/{id}` membalas 404 | VERIFIED `jobs.py:37`, `projects.py:398-400` | C2, masih terbuka |
| F2 | Dua job berat bisa jalan bersamaan (mis. horor + render manual) dan berebut GPU 8 GB | VERIFIED `jobs.py:58`, tidak ada kunci | C1, masih terbuka |
| F3 | `media.run` tanpa timeout; `run_ffmpeg_progress` memanggil `proc.wait()` tanpa batas. ffmpeg yang macet menahan job selamanya, dan tidak di-kill saat terjadi exception | VERIFIED `media.py:47-54, 127-139` | C10, masih terbuka |
| F4 | Proses anak (ffmpeg, worker parallax, worker TTS) tidak terikat ke backend. Kalau backend mati, mereka terus jalan sebagai yatim dan masih menulis file `.part`; job lanjutan bisa menulis file yang sama | VERIFIED tidak ada pencatatan PID; NOT VERIFIED (runtime) | Belum tercatat |
| F5 | Watchdog parallax memakai anggaran total (`120 + 20×jumlah shot`), bukan deteksi diam. Untuk 100 shot, worker macet baru dihentikan setelah ±35 menit | VERIFIED `horror.py:401-403` | B4 sudah diperbaiki (stderr tercatat, kill di `finally`); sisa ini baru |
| F6 | `txt2img` timeout 600 dtk hanya berhenti menunggu; prompt tetap berjalan di antrean ComfyUI. `comfy.free` hanya dipanggil di jalur sukses, jadi saat gagal model tetap memenuhi VRAM | VERIFIED `comfy.py:112-115`, `horror.py:630-631` | Belum tercatat |
| F7 | Resume horor hanya 3 kali (`MAX_RESUME`). Pada kegagalan ke-4, cerita dibuang dan folder `shots` serta `scenes` dihapus. Untuk video 8–10 menit, itu berarti kerja berjam-jam hilang | VERIFIED `horror.py:528, 555-564` | Belum tercatat |
| F8 | Tahap render akhir tidak punya checkpoint: `autoproduce.produce` selalu merender ulang semua klip saat dilanjutkan | VERIFIED `autoproduce.py:93-125` (tidak ada pengecekan hasil yang sudah ada) | Belum tercatat |
| F9 | Mode selain horor (affiliate, readymade, process) tidak punya state lanjutan; terputus berarti mulai dari awal | VERIFIED tidak ada file state di ketiganya | Belum tercatat |
| F10 | Peringatan "project tertahan" memakai umur `created_at` dan hanya memeriksa `job:process`, jadi tidak akurat untuk horor | VERIFIED `telemetry.py:364-369` | Belum tercatat |
| F11 | Tidak ada pemantauan suhu/VRAM. Satu-satunya jeda pendingin adalah `sleep(1.5)` di cadangan zoom | VERIFIED `horror.py:469` | Belum tercatat |
| F12 | Worker TTS punya timeout 900 dtk tetapi tanpa detak hidup: macet di detik ke-10 tetap menunggu 15 menit | VERIFIED `omnivoice_tts.py:47-48` | Belum tercatat |

Yang sudah benar dan dipertahankan: tulis atomik project dan state (B5 terverifikasi diperbaiki), resume horor per narasi dan per gambar, shot final hanya ada kalau utuh (`.part` lalu `os.replace`), dan worker parallax dipastikan mati sebelum cadangan zoom menulis (B4 terverifikasi diperbaiki).

Catatan jujur: P1 membuat sistem tahan terhadap mati mendadak dan mengurangi beban puncak. P1 **tidak** menghilangkan penyebab laptop mati (perangkat keras).

---

## 4. Spesifikasi teknis P1

Prinsip: semua modul baru; file lama hanya mendapat sambungan kecil yang kompatibel ke belakang. Tanpa dependensi baru (memakai `nvidia-smi`, `taskkill`, dan pustaka standar Python).

### 4.1 Modul baru

**`app/jobstore.py` — status job persisten**
- Satu file per job: `data/jobs/<job_id>.json`, ditulis atomik.
- Isi: `schema: 1`, `id`, `kind`, `pid` (project), `status`, `stage`, `progress`, `started`, `updated` (detak hidup), `ended`, `error`, `attempt`, `boot_id`.
- Status ditulis langsung saat berubah; progres ditulis paling sering sekali per 2 detik agar disk tidak sibuk.
- Status baru khusus catatan job: `queued`, `interrupted`. Status project **tidak** ditambah (lihat 4.3).
- Catatan lebih tua dari 14 hari dipindahkan ke `data/jobs/arsip/` satu per satu berdasarkan ID persis. Tidak ada penghapusan dengan pola glob.

**`app/resources.py` — antrean sumber daya hibrida**
- Sumber daya `gpu`: eksklusif, satu pemegang, antre FIFO.
- Sumber daya `cpu_berat`: maksimal 1 (encode x264, Whisper lokal).
- Pemakaian: `with resources.hold("gpu", label="Melukis gambar"):`. Selama antre, job menampilkan tahap "Menunggu giliran GPU (antrean ke-N)".
- Re-entrant per job (memakai `jobctx`), sehingga horor yang memanggil render di thread yang sama tidak mengunci dirinya sendiri.
- Kunci dipegang per tahap, bukan sepanjang job, supaya tahap non-GPU (menulis cerita) tidak menahan GPU.
- ~~Sebelum memberi giliran, cek pendinginan (80 °C / 120 detik).~~ **Dicabut 14 Nov 2026 atas instruksi pemilik ("gunakan perangkat semaksimal mungkin").** Tidak ada jeda pendingin; giliran langsung diberikan. Antrean tetap ada karena dua job SDXL/parallax/OmniVoice bersamaan bisa kehabisan VRAM 8 GB (alasan teknis, bukan suhu). Opsi `resources.gpu_slots` (default 1) disiapkan bila nanti ingin dua job ringan berbarengan.
- Batasan yang diketahui: kunci ini hanya mengatur job AutoClipper. Pemakaian GPU dari luar (Blender atau ComfyUI yang kamu buka manual) hanya terdeteksi lewat pemantau, tidak bisa dicegah.

**`app/procs.py` — siklus hidup worker**
- `run_managed(cmd, *, timeout, idle_timeout, on_line, cwd, env)` menggantikan pola `Popen`/`run` yang tersebar.
- Timeout total dan timeout diam (tidak ada keluaran selama N detik = macet).
- Penghentian: `terminate`, tunggu 5 detik, lalu `taskkill /T /F` untuk seluruh pohon proses.
- Setiap proses anak dicatat di `data/jobs/procs.json` (PID, waktu mulai, nama program, job). Dihapus dari catatan saat selesai.
- Kode keluar dan 2000 karakter terakhir stderr selalu disimpan untuk laporan error.

**`app/recovery.py` — pemulihan saat backend start**
- Dipanggil sekali lewat hook startup FastAPI.
- Langkah 1: baca `procs.json`; proses yatim yang PID, nama, dan waktu mulainya masih cocok dihentikan. Kalau salah satu tidak cocok, PID itu dilewati (mencegah salah bunuh proses lain).
- Langkah 2: catatan job berstatus `running`/`queued` dari sesi sebelumnya ditandai `interrupted`.
- Langkah 3: hanya project berstatus `processing` yang job-nya terputus diubah menjadi `status: "error"` dengan pesan "Proses terputus karena aplikasi berhenti. Klik Proses ulang untuk melanjutkan." dan field opsional `interrupted: true`. Project lain tidak disentuh, jadi ini bukan migrasi massal.
- Tidak ada lanjut otomatis secara default. Alasannya: kalau laptop mati karena beban, lanjut otomatis bisa membuat siklus mati berulang. Tersedia sebagai opsi `recovery.auto_resume` (default mati, maksimal 1 kali per job).

**`app/services/sysmon.py` — pemantau sumber daya**
- Membaca suhu, pemakaian, dan VRAM GPU lewat `nvidia-smi` (timeout 2 detik, hasil di-cache 5 detik), RAM lewat API Windows, dan sisa disk.
- Gagal membaca tidak pernah menggagalkan job; nilainya menjadi "tidak diketahui".

**`app/retry.py` — coba ulang**
- `retry(fn, tries, backoff, retry_on)` untuk gangguan sementara: start worker, HTTP ke ComfyUI. Tidak dipakai untuk error logika.

### 4.2 Checkpoint atomik
- Helper umum `checkpoint.write(path, data)` dan `checkpoint.read(path)` (tulis atomik, baca dengan cadangan `.bak` bila file utama rusak).
- State horor dan project sudah atomik dan **tidak diubah** di P1.
- Render akhir (F8) dan batas `MAX_RESUME` (F7) dicatat sebagai pekerjaan P2/P4, karena mengubahnya berarti mengubah perilaku pipeline horor.

### 4.3 Sambungan ke file lama (kecil, kompatibel ke belakang)

| File | Perubahan | Risiko regresi |
|---|---|---|
| `app/jobs.py` | `start` membuat catatan; `Job.set` menulis lewat jobstore; `get` membaca dari disk bila job tidak ada di memori; hasil `to_dict` mendapat field tambahan opsional | Rendah. Bentuk lama `to_dict` tetap utuh |
| `app/main.py` | Satu hook startup yang memanggil `recovery.run()` di dalam try/except | Rendah. Gagal pulih tidak boleh mencegah server hidup |
| `app/services/media.py` | `run` dan `run_ffmpeg_progress` mendapat parameter opsional `timeout`/`idle_timeout`, lalu memakai `procs.run_managed`. Tanda tangan lama tetap berlaku | Sedang. Dipakai semua mode render; perlu uji regresi render |
| `app/services/horror.py` | Tahap gambar, parallax, dan footage dibungkus `resources.hold("gpu")`; `_parallax` memakai `procs.run_managed` dengan timeout diam | Sedang. Logika cerita, waktu adegan, dan SFX tidak disentuh |
| `app/services/omnivoice_tts.py` | `_run_worker` memakai kunci GPU dan timeout diam | Rendah–sedang |
| `app/services/renderer.py`, `affiliate.py`, `readymade.py`, `bumper.py` | Bagian encode dibungkus kunci sumber daya | Rendah |
| `app/services/comfy.py` | Saat timeout, kirim `/interrupt` dan `/free` ke ComfyUI (F6) | Rendah |
| `app/services/telemetry.py` | `summarize` menambah blok opsional `resources` dan `system`; peringatan "tertahan" memakai catatan job (F10) | Rendah. Field lama tidak berubah |

Semua nilai ambang (suhu, timeout, jeda) dibaca dari `settings.json` dengan nilai default di kode, jadi `settings.json` lama tetap sah tanpa diubah.

### 4.4 Urutan pengerjaan (aditif)
1. **P1a — fondasi tanpa perubahan perilaku:** `jobstore`, `procs`, `sysmon`, `retry`, `checkpoint`, beserta tesnya. Belum ada file lama yang memakainya.
2. **P1b — job persisten + pemulihan:** sambungan `jobs.py`, `main.py`, `recovery.py`.
3. **P1c — worker terkelola:** `media.py`, `_parallax`, `omnivoice_tts`, `comfy` (timeout, detak hidup, penghentian).
4. **P1d — antrean GPU:** `resources.py` dan pembungkus di tiap tahap GPU.
5. **P1e — pemantauan:** blok `resources`/`system` di Command Center (hanya data API; tampilan menyusul di P8).

Setiap langkah: backup ke `backup-p1-<langkah>-<tanggal>/`, pyflakes, pytest, uji runtime, laporan, lalu berhenti menunggu validasi.

Cara membatalkan: salin kembali file dari folder backup langkah itu dan restart backend. Modul baru yang tidak lagi dipanggil tidak berpengaruh. Folder `data/jobs/` aman dibiarkan.

---

## 5. Kriteria penerimaan

| # | Kriteria | Cara membuktikan |
|---|---|---|
| A1 | Setelah backend dimatikan paksa di tengah job, `/api/jobs/{id}` membalas status `interrupted`, bukan 404 | Uji runtime: matikan proses, hidupkan, panggil API |
| A2 | Project yang job-nya terputus tidak lagi tertahan di `processing`; pesannya menyuruh Proses ulang | Uji runtime |
| A3 | Proses ulang project horor yang terputus melanjutkan dari state (tidak menulis cerita atau melukis ulang gambar yang sudah ada) | Uji runtime, bandingkan waktu file |
| A4 | Dua job GPU yang dimulai bersamaan berjalan bergantian; yang kedua menampilkan "Menunggu giliran GPU" | Uji runtime + tes unit |
| A5 | Worker yang diam melebihi batas dihentikan beserta proses turunannya, dan job melaporkan error yang jelas atau jatuh ke cadangan | Tes unit dengan proses tiruan yang sengaja macet |
| A6 | Setelah backend mati, tidak ada ffmpeg/worker yatim yang tersisa sesudah backend hidup lagi | Uji runtime, cek daftar proses |
| A7 | Suhu, VRAM, dan antrean GPU muncul di `/api/command-center` | Panggil API |
| A8 | Semua mode lama tetap menghasilkan video: horor, affiliate, video jadi, proses klip, render manual | Uji regresi di bawah |
| A9 | Project dan `settings.json` lama terbaca tanpa diubah | Bandingkan hash file sebelum dan sesudah start |

Kriteria ini menjadi **VERIFIED** hanya dengan bukti keluaran nyata. Keputusan lulus tetap di tangan pemilik.

## 6. Rencana uji regresi

- **Statis:** pyflakes untuk semua file yang disentuh; `python -m compileall app`.
- **Tes unit baru (pytest, memakai folder sementara):** jobstore (tulis/baca/throttle/rusak sebagian), resources (FIFO, re-entrant, dua thread bergantian), procs (timeout total, timeout diam, bunuh pohon proses), recovery (PID tidak cocok dilewati), sysmon (nvidia-smi gagal tidak melempar error).
- **Tes yang sudah ada:** 9 tes backend dan 23 tes frontend harus tetap lulus.
- **Runtime, ringan dulu:** render manual satu klip; video jadi satu file; lalu satu video horor pendek (n=1).
- **Runtime, uji gangguan:** hentikan backend saat tahap gambar, hidupkan, proses ulang (A1–A3, A6).
- **Kompatibilitas data:** buka 3 project lama di UI; hash `project.json` dan `settings.json` tidak berubah oleh start backend.
- Uji GPU dijalankan dengan beban penuh (instruksi pemilik 14 Nov 2026: tanpa jeda demi stabilitas laptop).

## 7. File yang TIDAK boleh disentuh di P1

- Seluruh `frontend/` (tampilan baru menyusul di P8).
- `app/storage.py` dan skema `project.json`.
- `app/routers/*` (kontrak API tetap; tidak ada endpoint yang diubah atau dihapus).
- `app/services/llm.py`, `narrate.py`, `gemini_tts.py`, `transcriber.py`, `subtitles.py`, `textfx.py`, `border.py`, `frames.py`, `framepack.py`, `hooks.py`, `thumbnail.py`, `horror_sfx.py`, `pipeline.py`, `autoproduce.py`, `studio.py`, `downloader.py`.
- Di `horror.py`: pembuatan cerita, validasi cerita, `_scene_times`, prompt gambar, SFX, susunan klip, dan logika resume (`MAX_RESUME`, penulisan state).
- `D:\OmniVoice\parallax_worker.py`, `D:\OmniVoice\tts_worker.py`, dan instalasi ComfyUI.
- `tools/blender/*`, proyek Remotion, `data/projects/*`, isi `data/settings.json` yang sudah ada.
- `run.bat`, `run_detached.bat`, `requirements.txt` (tidak ada dependensi baru).

## 8. Hal yang perlu diputuskan pemilik

1. **Lanjut otomatis setelah mati:** default saya mati (harus klik Proses ulang). Setuju, atau mau otomatis satu kali?
2. ~~Ambang suhu GPU~~ **Diputuskan 14 Nov 2026:** tanpa jeda pendingin, perangkat dipakai maksimal. Suhu tetap dipantau dan ditampilkan (P1e), tetapi tidak menahan job. Jeda `sleep(1.5)` antar shot di `horror.py` diusulkan dihapus di P2 (mengubah perilaku pipeline horor, jadi perlu persetujuan fase).
3. **Urutan:** setuju P1a sampai P1e dikerjakan dan divalidasi satu per satu, atau P1a+P1b digabung karena keduanya berisiko rendah?
