ISI DULU TIGA BARIS INI:
- Folder aset mentah: <contoh: E:\ASSET MENTAH>
- Jumlah variasi per aset: <contoh: 5>
- Catatan khusus batch ini (boleh kosong): <contoh: jangan pakai gaya "Batu pahat">

---

# Produksi konten "Video jadi" dengan variasi preset

Balas saya dalam bahasa Indonesia.

## Tujuan

Dari setiap video di folder aset di atas, buat sejumlah video siap upload. Setiap video adalah aset yang utuh (tidak dipotong, tidak diberi subtitle, durasi sama dengan aslinya) yang dibungkus bingkai, persis seperti hasil panel "Video jadi" di auto-clipper. Yang membedakan satu video dengan yang lain adalah preset tampilannya. Tujuannya supaya satu aset bisa diunggah berkali-kali tanpa terlihat sebagai video yang sama.

## Aturan yang tidak boleh dilanggar

1. **Jangan mencari tahu isi atau asal aset mentah.** Jangan menonton, mengambil frame, mentranskrip, atau menganalisis isinya. Yang boleh dibaca hanya data teknis (durasi, resolusi, codec, ada audio atau tidak). Ini juga berlaku untuk video hasil render: periksa secara teknis saja, jangan dilihat gambarnya. Tata letak diperiksa lewat pratinjau placeholder, bukan footage.
2. **Jangan mengubah kode app maupun pengaturannya** (`backend/app`, `frontend/src`, `backend/data/settings.json`). Semua pekerjaan bersifat tambahan dan hanya di `tools/variasi-frame/`.
3. **Jangan memicu job produksi lewat app atau API-nya.** Render dijalankan lewat skrip yang berdiri sendiri.
4. **Jangan menimpa aset asli atau hasil batch sebelumnya.** Setiap batch punya folder keluaran sendiri.
5. Jangan menyentuh pekerjaan lain di project ini (kantor 3D, telemetry, dan lain-lain).

## Titik awal

Baca `tools/variasi-frame/frame_variasi2.py`. Skrip itu sudah menghasilkan 10 video dengan cara yang benar dan menjadi dasar pekerjaan ini:

- Ia memakai mesin bingkai dan renderer milik app (`border`, `readymade`, `renderer`), jadi hasilnya identik dengan panel Video jadi.
- Pengaturan brand ditimpa di memori proses saja (`config.load_settings` dan `config.PROJECTS_DIR` diganti sementara), sehingga `settings.json` dan daftar project app tidak tersentuh.
- Setiap baris `PLAN` adalah satu resep video. `text_styles.json` di folder yang sama berisi gaya teks yang diambil dari app.
- Perintahnya: `preview <folder>` untuk pratinjau placeholder, `render <folder_hasil> <folder_kerja>` untuk render, dan `--only=N` untuk satu video.

Resep di skrip itu masih ditulis tangan. Untuk batch besar, buat versi yang menyusun resep secara otomatis (lihat "Yang divariasikan"), sebagai file baru di folder yang sama. Jangan mengubah `frame_variasi2.py`.

## Yang divariasikan di setiap video

Brand tetap diambil dari pengaturan app (saat ini KOPLO77). Setiap video harus punya kombinasi berbeda dari:

- **Tema border**: dari daftar frame app (`frames.list_frames()`).
- **Teks papan**: tagline pendek yang berbeda-beda dan netral terhadap isi video (karena isinya tidak boleh diketahui), dengan font papan yang berbeda.
- **Teks brand di frame**: font, posisi, ukuran, dan lebar maksimum.
- **Gaya teks brand**: bergantian antara kelompok "3D realistis" (`gold_real`, `chrome_real`, `glitter`, `ruby`, `jelly`, `stone`) dan "Gaya baru" (`glitch`, `neon_tube`, `puffy`, `y2k`, `holo`, `ombre`, `tri`).
- **Animasi teks brand**: animasi jalan (`float`, `wobble`, `pulse`, `shine`, `wave`, `bounce`, `flicker`, `glitch`) dan animasi masuk (`pop`, `slide`, `glitchin`, `type`, `letters`, `assemble`), termasuk kecepatan.
- **Intro dan outro**: usahakan ada di setiap video dengan template, font, posisi, dan lonceng yang berbeda, tapi ini tidak wajib. Butir-butir lain di atas wajib bervariasi.

Dalam satu batch tidak boleh ada dua video dengan kombinasi yang sama, dan video dari aset yang sama harus terlihat paling berbeda satu sama lain. Pilih font dan gaya yang cocok dengan temanya (misalnya font serif mewah untuk tema emas), bukan acak buta.

## Jebakan yang sudah diketahui

- Posisi teks brand `top` (header) menabrak ornamen atas di banyak frame. Pakai `top_in` atau `board`, kecuali pratinjau menunjukkan `top` aman untuk frame itu.
- Tema bawaan `bold` memotong video vertikal menjadi hampir persegi dan menggandakan tagline. Jangan dipakai.
- Teks brand global tidak muncul di frame "studio" yang sudah punya lapisan brand sendiri. Lewati frame seperti itu atau terima bahwa teks brand-nya bawaan frame.
- Render intro/outro pertama kali untuk tiap kombinasi cukup lama, lalu tersimpan di `backend/data/bumpers/cache`. Penambahan file di sana wajar.
- Di Windows, jalankan Python dengan `PYTHONIOENCODING=utf-8` dan tulis skrip ke file, jangan lewat `python -c` yang panjang.

## Langkah kerja

1. Daftar semua video di folder aset dan baca data teknisnya saja.
2. Susun resep sebanyak (jumlah aset × jumlah variasi per aset).
3. Buat pratinjau placeholder semua resep dan periksa: teks tidak terpotong, tidak menabrak ornamen, tidak keluar bingkai. Perbaiki resep yang bermasalah.
4. Render semuanya ke `Siap Upload/<tanggal hari ini> Produksi Variasi <nomor batch>/`. Proses harus bisa dilanjutkan: kalau terhenti, video yang sudah jadi tidak dirender ulang.
5. Periksa setiap hasil secara teknis: resolusi 1080×1920, durasi sama dengan aset aslinya, ada audio jika aslinya beraudio, tidak ada frame hitam, ukuran file wajar. Render ulang yang gagal, maksimal dua kali.
6. Tulis `daftar_variasi.json` di folder hasil: nama file, aset, dan resep lengkap tiap video.

Jalankan sampai selesai tanpa bertanya, kecuali folder aset kosong atau tidak ditemukan.

## Laporan akhir

Satu pesan singkat berisi:

- Lokasi folder hasil dan jumlah video yang benar-benar jadi dibanding target. Sebutkan angka sebenarnya, termasuk yang gagal dan alasannya.
- Tabel ringkas resep tiap video.
- Apa yang sudah diperiksa dan apa yang belum. Gerak animasi dan tampilan intro/outro tidak bisa diperiksa tanpa menonton video, jadi katakan terang-terangan bahwa bagian itu perlu saya tonton sendiri.
- Kombinasi yang dibuang karena bermasalah, supaya bisa dihindari di batch berikutnya.
