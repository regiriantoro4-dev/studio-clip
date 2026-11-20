---
name: cek-regresi-frame
description: Cek regresi Frame Studio auto-clipper — membuktikan gaya teks, efek, animasi teks, font, dan tema bingkai lama tidak berubah setelah kode diubah, dengan membandingkan hash piksel terhadap pembanding tersimpan. Pakai SEBELUM dan SESUDAH mengubah backend/app/services/textfx.py, border.py, frames.py, font_catalog.py, atau frontend/src/studio/model.js (TEXT_STYLES, TEXT_FX_NONE, ANIMS); juga saat pemilik bertanya "fitur lama aman?" atau mengetik /cek-regresi-frame.
---

# Cek regresi Frame Studio

Pemilik proyek berpesan tegas: **"fitur lama jangan sampe diubah"**. Skill ini adalah cara membuktikannya,
bukan sekadar mengklaimnya.

Skrip: `tools/regresi/regresi_frame.py` · pembanding: `tools/regresi/baseline.json`
Python: `backend/.venv/Scripts/python.exe` (Windows) atau `backend/.venv/bin/python` (Mac). Butuh `node`.
Jalankan dari folder root `auto-clipper`. Durasi penuh ±45 detik (bagian `gaya` paling lama).

## Yang dicek

| Bagian | Isi | Sumber daftar |
|---|---|---|
| `gaya` | semua gaya teks × 6 varian layout (biasa, 2 baris, kotak, miring+spasi, diputar, `{judul}`) | `TEXT_STYLES` di `model.js` |
| `anim` | semua gerakan & animasi muncul, sendiri-sendiri dan dikombinasi | `textfx.ANIM_LOOPS` / `ANIM_INS` |
| `font` | setiap font terdaftar dirender teks contoh | `border.FONTS` (+ `font_catalog`) |
| `tema` | 6 tema bingkai bawaan | `border.THEMES` |

Tidak dicek otomatis: kanvas Konva di browser (template, bingkai jendela video, `StudioCanvas.jsx`),
render ffmpeg akhir, variasi otomatis (`variasi.py`). Untuk kanvas, potret lewat browser Edge (butuh dev
server 5173 jalan) lalu periksa gambarnya:
```
node tools/regresi/browser/potret_template.cjs <file.png>      # semua kartu "Mulai dari template"
node tools/regresi/browser/potret_bingkai.cjs <folder>         # tiap "Gaya bingkai" jendela video
node tools/regresi/browser/uji_acak_gaya.cjs <folder> [url]    # tombol Acak gaya: acak, kunci, kode, urungkan, aturan
```
(`favicon.ico` 404 di dev server itu wajar, bukan error fitur.)

**Acak gaya (Tahap 4)** membaca salinan daftar gaya di `backend/app/services/acak_gaya_data.json`. Setiap kali
`TEXT_STYLES`, `ANIMS`, `ANIM_INS`, atau `BORDER_STYLES` di `model.js` diubah, jalankan juga:
```
backend/.venv/Scripts/python.exe tools/acak-gaya/sinkron_gaya.py
```
Bingkai polos lama (`video.borderStyle` kosong) digambar kode aslinya; gaya baru hanya lewat `VideoBorder`.

## Alur kerja wajib saat mengubah kode Frame Studio

1. **Sebelum mengubah apa pun**, pastikan kondisi sekarang cocok dengan pembanding:
   ```
   backend/.venv/Scripts/python.exe tools/regresi/regresi_frame.py cek
   ```
   - `IDENTIK` -> lanjut.
   - Ada `BERUBAH` sebelum kamu menyentuh kode -> ada perubahan dari sesi lain. Berhenti dan laporkan
     ke pemilik; jangan merekam ulang pembanding.
   - Belum ada `baseline.json` -> jalankan `simpan` dulu (kode saat ini dianggap acuan).
2. Kerjakan perubahan. Fitur baru sebaiknya aktif hanya lewat field/nama baru, supaya jalur lama tidak
   tersentuh.
3. **Sesudah mengubah**, jalankan `cek` lagi (boleh `--bagian gaya,anim` untuk iterasi cepat, tapi
   jalankan versi penuh sebelum melapor selesai).
4. Tafsirkan hasil:
   - `IDENTIK` + daftar `baru` -> fitur lama aman. Rekam item baru saja:
     ```
     backend/.venv/Scripts/python.exe tools/regresi/regresi_frame.py simpan --tambah
     ```
   - `BERUBAH` / `HILANG` -> **regresi**. Cari penyebabnya dan perbaiki sampai identik. Jangan
     menutupinya dengan merekam ulang pembanding.
5. Laporkan ke pemilik dengan angka nyata, mis. "445 item lama identik, 22 item baru direkam".

## Kapan boleh merekam ulang pembanding (tanpa `--tambah`)

Hanya bila **pemilik sendiri meminta** tampilan lama diubah (mis. "perbaiki warna gaya Emas 3D"). Rekam
ulang bagian yang relevan saja (`simpan --bagian gaya`), sebutkan item yang berubah dan alasannya di
laporan. Mengganti/menambah font file yang sudah ada juga mengubah hash `font|...` dan `gaya|...` — itu
termasuk perubahan tampilan lama, jadi butuh izin.

## Catatan

- Hasil render deterministik (noise ber-seed), jadi beda 1 piksel pun = perubahan nyata.
- Cadangan file lama tetap dibuat sebelum mengedit (kebiasaan proyek: `tools/variasi-frame/cadangan-<tanggal>-<topik>/`).
- Fitur baru yang menambah ketergantungan Windows/NVIDIA dicatat juga di `PINDAH-KE-MAC.md` bagian 7.
