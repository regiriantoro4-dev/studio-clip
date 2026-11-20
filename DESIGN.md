# DESIGN.md: AutoClipper

> Arah ini ditulis oleh Claude atas permintaan pemilik ("buatkan rancangan terbaik"), bukan oleh pemilik sendiri.
> Ubah bagian mana pun yang tidak terasa seperti milikmu; antislop akan mengikuti file ini.

## Identitas

AutoClipper adalah alat produksi lokal untuk satu kreator Shorts/TikTok: video panjang masuk, klip vertikal siap upload keluar.
Rasanya seperti meja editing, bukan halaman pemasaran. Tenang di sekitar video, tegas di tombol yang menjalankan produksi.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Tema

Gelap tetap, tanpa toggle. Alasan: video dinilai di atas latar gelap (konvensi semua software editing), dan warna subtitle/hook di preview harus terbaca seperti di layar HP.

## Palet

- Netral grafit, sedikit hangat (bukan navy): `#121212` latar, `#1a1a1a` panel, `#232323` permukaan naik, `#2e2e2e` garis.
- Aksen tunggal: **kuning subtitle `#FFD100`**. Ini warna sorot default subtitle yang dihasilkan aplikasi dan warna playhead, jadi UI memakai warna hasil kerjanya sendiri.
  Dipakai hanya di: tombol utama (satu per layar), playhead/rentang trim, dan tanda potong pada item terpilih.
- Fungsional, bukan identitas: merah `#ff6b6b` (hapus/gagal), hijau `#4ade80` (siap/berhasil).

## Tipografi

Archivo (Google Fonts). Alasan: keluarga grotesk dengan bobot sangat tebal yang mirip huruf subtitle burned-in di Shorts, tapi tetap netral di ukuran kecil untuk label form.
Judul memakai bobot 800, UI 400–600. Semua angka waktu memakai `tabular-nums` supaya timecode tidak bergoyang.
Label ditulis kalimat biasa, tidak huruf kapital berjarak lebar.

## Motif identitas

**Tanda potong (crop marks)**: empat sudut kuning tipis di elemen yang sedang dipilih (klip aktif, preset terpilih, area drop saat file ditarik).
Alasan: produk ini memotong video; tanda potong adalah bahasa visual memotong.
Timecode `00:12 → 00:41` dengan angka tabular adalah motif kedua yang muncul di daftar klip, trim bar, dan player.

## Gerak

Hanya hover, perubahan state, dan indikator proses yang memang sedang berjalan (spinner/progress). Tidak ada animasi masuk.

## Bentuk

Radius 6px untuk kontrol, 10px untuk panel. Tanpa bayangan kecuali modal (satu-satunya elemen yang benar-benar melayang di atas halaman).
Tanpa emoji di UI; ikon hanya bila menambah informasi.
