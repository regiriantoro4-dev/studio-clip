# Kantor 3D Isometrik — Prosedur Uji P2 dengan Satu Job Asli

_Dijalankan oleh pemilik. Claude tidak memicu job produksi._

Tujuan: membuktikan bahwa keadaan karakter dan unit AI di tab **3D Isometrik** mengikuti job backend yang sungguh berjalan.
Hasilnya mengisi bagian "Job produksi asli" di `P2-PROTOTYPE-REPORT.md`, yang sekarang masih NOT VERIFIED.

Waktu yang dibutuhkan: selama job berjalan (job Horor terakhir ±6 menit) ditambah ±5 menit persiapan.

---

## 1. Persiapan

1. Pastikan backend hidup, lalu buka `http://127.0.0.1:8000/command-center` di **jendela browser tersendiri**.
   Jangan pakai `?demo=1`. Lencana kuning "MODE DEMO" **tidak boleh** terlihat.
2. Pilih tab **3D Isometrik**.
3. Di bilah atas adegan:
   - **Karyawan uji**: pilih agent yang sesuai job yang akan dijalankan (tabel di bawah).
   - **Unit AI**: biarkan **"Otomatis: model yang dipanggil"**.
4. Tekan **Log validasi**, lalu **Kosongkan**. Tekan **Statistik**.
5. Jalankan job dari **jendela browser kedua** (bukan tab lain di jendela yang sama).

> **Penting:** jendela Command Center harus tetap terlihat selama job berjalan. Saat tab tersembunyi, polling halaman ini
> berhenti (perilaku lama Command Center), sehingga log tidak mencatat apa pun.

| Job yang dijalankan | Pilih "Karyawan uji" |
|---|---|
| Video horor (Pabrik konten / Studio Horor) | Studio Horor · Studio Horor (`job:horror`) |
| Buat Klip dari link | Raka · Analis klip (`job:process`) |
| Auto-Produce | Bima · Auto-Produce (`job:autoproduce`) |
| Video jadi (frame/border) | Sari · Video jadi (`job:readymade`) |
| Affiliate | Nadia · Affiliate (`job:affiliate`) |
| Narasi film | Dewi · Narasi film (`job:narrate`) |

Job apa pun boleh, asalkan memanggil model AI minimal sekali (supaya keadaan "memanggil unit AI" ikut teruji).

---

## 2. Tangkapan layar yang dibutuhkan

Ambil tangkapan layar **seluruh halaman Command Center** (adegan + bilah progres di bawahnya), supaya adegan bisa dicocokkan dengan panel lama.

| Kode | Kapan | Yang seharusnya terlihat |
|---|---|---|
| **S1** | Sebelum job dimulai | Karakter duduk, label **Siaga**. Baris sumber: `→ idle · Tidak ada job/panggilan aktif`. Tidak ada lencana MODE DEMO |
| **S2** | Beberapa detik setelah job mulai | Label **Bekerja** + nama tahap; karakter mengetik; monitor menyala. Baris sumber: `→ working · running[]: job <id>, tahap "…", N%`. Tahap dan persen **sama** dengan bilah progres di bawah adegan |
| **S3** | Saat job memanggil model AI (biasanya di awal, tahap menulis cerita/naskah/analisis) | Label **Memanggil Otak AI · <provider>**; karakter berjalan ke unit atau berdiri di depannya; unit berlabel **Sedang dipanggil** dan menyala terang. Baris sumber: `→ consulting · inflight[]: job <id> sedang memanggil llm:<provider>` |
| **S4** | Di tengah job, tahap lain (mis. melukis gambar, render) | Karakter kembali di meja, **Bekerja**; unit **Siaga** atau **Baru selesai** |
| **S5** | Setelah job selesai | Karakter **Siaga**; bilah progres di bawah adegan hilang |
| **S6** | Setelah S5 | Panel **Log validasi** (gulir bila panjang). Tekan **Salin**, lalu tempel teksnya ke berkas `log.txt` |
| **S7** | Setelah S5 | Tabel **Task log** di bagian bawah halaman untuk job yang sama (waktu & status) |

**Tentang S3.** Data datang tiap 5 detik. Panggilan model yang lebih singkat dari itu bisa selesai di antara dua poll
dan tidak pernah terlihat sebagai "sedang dipanggil". Itu bukan kegagalan: karakter memang tidak boleh berjalan untuk
kejadian yang datanya sudah lewat. Tandanya: baris sumber menulis
`panggilan llm:<provider> sudah selesai N dtk lalu (tidak diputar ulang sebagai gerak)` dan unit berlabel **Baru selesai**.
Bila itu yang terjadi, ambil tangkapan layarnya sebagai S3 dan catat.

Simpan semuanya di `docs/office-isometric/p2/live/` (S1.png … S7.png, log.txt).

---

## 3. Yang dicatat pemilik

| Butir | Catatan |
|---|---|
| Job yang dijalankan & jam mulai | |
| Provider model AI yang dipakai job | |
| Unit AI berganti otomatis ke provider itu? (ya/tidak) | |
| S3 tertangkap sebagai "Sedang dipanggil" atau "sudah selesai N dtk lalu"? | |
| Ada saat karakter mengetik/berjalan padahal bilah progres bawah kosong? (seharusnya tidak) | |
| Ada saat karakter berjalan ke unit padahal unit tidak "Sedang dipanggil"? (seharusnya tidak) | |
| Persen di label karakter pernah melebihi persen di bilah bawah? (seharusnya tidak) | |
| Angka fps di panel Statistik saat sepi / saat bekerja | |
| Suhu atau kipas laptop selama job (terutama saat ComfyUI melukis) | |
| Tab 3D Isometrik sempat menampilkan pesan "berhenti karena kartu grafis…"? Tombol "Coba lagi" berfungsi? | |
| Kesan gerak: halus / tersendat | |

---

## 4. Tanda ketidaksesuaian (laporkan bila terlihat)

- Karakter mengetik atau berjalan saat tidak ada job di bilah progres.
- Karakter menuju unit yang labelnya bukan model yang dipanggil job.
- Karakter tetap di depan unit lama setelah baris sumber kembali ke `working`/`idle` (lebih dari ±3 detik waktu berjalan pulang).
- Label atau baris sumber tidak berubah lebih dari 10 detik padahal bilah progres di bawah berubah.
- Halaman Kantor / Balok / Tabel berubah perilaku.

---

## 5. Setelah bukti diserahkan

Claude membaca tangkapan layar dan `log.txt`, mencocokkannya dengan Task log, lalu mengisi bagian "Job produksi asli" di
laporan P2 dengan kategori LIVE VERIFIED / NOT VERIFIED per butir. Keputusan PASS atau FAIL tetap pada pemilik.
