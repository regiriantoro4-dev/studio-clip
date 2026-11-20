# Kantor 3D Isometrik — Laporan P2: Prototipe Terbatas

_Revisi 2 · 15 November 2026 · status: **menunggu validasi pemilik** · laporan ini tidak menyatakan PASS atau FAIL_

Revisi ini menjawab tujuh butir "P2 Validation Revision" dari pemilik. P3 tidak dimulai. Modul lama dan backend tidak diubah.

| Kategori | Arti di laporan ini |
|---|---|
| **LIVE VERIFIED** | Diamati di browser sungguhan, pada build produksi yang disajikan backend asli (`127.0.0.1:8000`) |
| **LOGIC VERIFIED** | Dibuktikan dengan tes otomatis atau **data tiruan** (mode demo, atau job tiruan yang disisipkan ke respons backend asli) |
| **NOT VERIFIED** | Belum dibuktikan; alasannya ditulis |
| **N/A** | Di luar lingkup P2 |

Lingkungan uji: Microsoft Edge headless yang dikendalikan skrip, di laptop pemilik; GPU terbaca `NVIDIA GeForce RTX 4060 Laptop GPU`
lewat Direct3D11; jendela 1600×1000; laju layar uji terukur **75 Hz**. Ini **bukan** browser pemilik dengan layar sungguhan.

---

## 0. Ringkasan revisi

| # | Butir pemilik | Hasil |
|---|---|---|
| 1 | Sinkronisasi gerak karakter | **Diperbaiki.** Timer 9 detik dibuang. Karakter menuju unit AI hanya selama `inflight[]` berisi panggilan model milik job-nya, dan pulang begitu panggilan itu hilang. Terbukti dengan data tiruan; belum dengan job asli |
| 2 | FPS 8–10 saat sepi | **Penyebabnya batas yang sengaja dipasang**, bukan keterbatasan performa. Diganti pengatur frame yang selaras layar. Investigasi ini juga menemukan **kebocoran memori** saat tab dibuka-tutup; sudah diperbaiki |
| 3 | Audit lisensi aset | 2 paket Kenney, CC0; 11 file dipakai, semuanya identik byte-per-byte dengan unduhan resmi. Tidak ada yang dihapus atau diganti |
| 4 | Audit dependensi | `dependencies` tidak berubah. 4 paket ditambah, semuanya dev-dependency. **Lockfile ikut berubah pada 6 paket transitif**; tidak satu pun masuk kode produksi (§4) |
| 5 | Cek regresi | Kantor, Balok, Tabel tampil sama (perbandingan piksel). Backend, id agent, polling tidak berubah. Satu kekeliruan saya pada `styles.css` ditemukan dan dipulihkan (§5.4) |
| 6 | Prosedur uji job asli | `docs/office-isometric/P2-LIVE-VALIDATION.md` + panel "Log validasi" di tab |
| 7 | Laporan | Dokumen ini; hasil demo dan hasil job produksi dipisah (§6) |

---

## 1. Sinkronisasi gerak karakter

### 1.1 Masalah di versi pertama

Gerak ke unit AI memakai "perjalanan" dari `deriveScene()` milik tampilan lama: begitu sebuah panggilan terlihat, karakter
berjalan pergi-pulang selama 9 detik tetap, berapa pun lama panggilannya. Panggilan yang sudah selesai pun masih diputar
sebagai perjalanan.

### 1.2 Aturan baru

| Persyaratan pemilik | Cara dipenuhi |
|---|---|
| Animasi mengikuti data job backend | Keadaan ditentukan ulang **setiap poll** dari `running[]` dan `inflight[]`. Tidak ada keadaan yang disimpan antar-poll selain posisi karakter |
| Tanpa timer tetap sebagai penentu status | Tidak ada durasi perjalanan. Tiap frame karakter hanya bergerak menuju tempat yang ditunjuk data terakhir: kursi, atau depan unit AI |
| Tujuan = model AI yang benar-benar dipanggil | Karakter berjalan hanya bila job-nya punya entri `inflight[]` ber-agent `llm:<provider>`, dan hanya ke unit model itu. Mode "Otomatis" membuat unit yang tampil mengikuti model yang dipanggil |
| Perubahan status menghentikan/mengubah animasi | Panggilan hilang dari `inflight[]` → karakter berbalik dari posisinya saat itu. Job selesai → pulang lalu siaga. Masuk/keluar keadaan ini tidak pernah ditunda |
| Tidak mengarang aktivitas saat data belum ada | Panggilan yang hanya ada di `log[]` (sudah selesai) **tidak** diputar sebagai gerak; hanya ditulis di baris sumber. Backend terputus → karakter berhenti di tempat. Data belum ada → duduk siaga |
| Polling tetap 5 detik | Tidak berubah: 6 permintaan per 30 detik, sama dengan tampilan lama |

Tiga keadaan karyawan sekarang: `idle`, `working`, `consulting` (job-nya sedang memanggil model yang unitnya tampil).
Modul baru tidak lagi memakai `deriveScene()`; `office3d/` tidak diubah.

### 1.3 Hasil uji — LOGIC VERIFIED

Diuji di browser dengan **respons backend asli yang disisipi satu job tiruan** (`uji-1`) dan satu panggilan model tiruan.
Tidak ada job produksi yang dijalankan.

| Langkah | Data yang diberikan | Yang teramati |
|---|---|---|
| A | Tanpa job (data asli) | Duduk siaga |
| B | Job berjalan, tanpa panggilan model | Mengetik di meja; baris sumber `running[]: job uji-1, tahap "Melukis gambar 2/17", 31%` |
| C1 | Job memanggil `llm:gemini` | Unit berganti otomatis dari Groq ke Gemini dan menyala; karakter berjalan ke sana |
| C2 | 4 detik kemudian | Berdiri di depan unit |
| C3 | **16 detik kemudian, panggilan masih ada** | **Masih di depan unit** (versi lama sudah pulang sendiri pada detik ke-9) |
| D | Panggilan hilang | Langsung berjalan pulang; 4,6 detik kemudian mengetik di meja |
| E | Panggilan muncul lalu hilang **sebelum karakter sampai** | Berbalik di tengah jalan (jarak 1,72 → 0,92), tidak pernah mencapai unit, berakhir di meja |
| F | Job selesai saat karakter di unit | Pulang, lalu siaga |
| G | Backend terputus saat karakter di jalan | Berhenti di tempat; 3 detik kemudian posisinya tidak bergeser |

Ditambah 31 tes unit untuk modul baru (total 54 tes lulus, termasuk 23 tes lama).

### 1.4 Batasan yang tetap ada

1. Data datang tiap 5 detik. Karakter mulai berjalan paling lambat 5 detik setelah panggilan dimulai, dan pulang paling lambat 5 detik setelah panggilan selesai.
2. Panggilan yang mulai dan selesai di antara dua poll **tidak pernah tampil sebagai gerak**. Yang terlihat: unit berlabel "Baru selesai" dan baris sumber menulis `panggilan … sudah selesai N dtk lalu`.
3. Saat data sudah berubah, karakter masih butuh ±2 detik berjalan pulang. Selama itu labelnya sudah menampilkan keadaan baru.
4. Semua bukti di atas memakai data tiruan. Job asli: §6.3.

---

## 2. Performa render

### 2.1 Temuan atas "FPS 8–10 saat sepi"

| Yang diperiksa | Temuan |
|---|---|
| Animation loop | Kanvas memakai mode render-on-demand: frame hanya digambar bila diminta. Versi pertama meminta frame lewat `setInterval` dengan konstanta **8 fps saat sepi / 30 fps saat aktif**. Angka itu saya pasang sendiri mengikuti pola hemat daya tampilan lama (6/30). **Jadi 8 fps adalah batas yang disengaja** |
| Angka "8–10" | Laju sebenarnya 8,0 fps (jarak antar-frame 122–126 ms). Angka 9–10 adalah **salah hitung alat ukur saya** (menghitung cap waktu dalam jendela 1 detik, bukan jarak antar-frame). Sudah dibetulkan |
| Keterbatasan performa? | Tidak. Satu frame memakan 0,5–0,6 ms CPU. Tanpa batas, adegan berjalan 75 fps (laju layar uji) dengan utas utama 5,5% sibuk |
| requestAnimationFrame | `setInterval` tidak selaras dengan penyegaran layar, jadi jarak antar-frame tidak rata. Diganti: frame diminta lewat rAF, laju layar diukur, lalu digambar tiap N penyegaran (N bulat) |
| Idle rendering | Karakter selalu beranimasi (napas saat duduk), jadi "sepi" bukan gambar diam. Pada 8 fps animasi itu tersendat. Batas baru: **30 saat sepi, 60 saat ada aktivitas** (nominal) |
| Tab visibility | Render berhenti total saat tab tersembunyi: 2.775 draw call per 3 detik → 0. Sinyal "tersembunyi" disimulasikan |
| WebGL lifecycle | Lihat §2.3 |
| Kantor lama | Konfigurasinya tidak disentuh |

Karena N harus bulat, laju nyata bergantung pada layar:

| Layar | Sepi (batas 30) | Aktif (batas 60) |
|---|---|---|
| 60 Hz | 30 fps | 60 fps |
| 75 Hz (uji) | 25 fps | 75 fps |
| 144 Hz | 28,8 fps | 72 fps |
| 165 Hz | 27,5 fps | 55 fps |

Baris 75 Hz terukur; baris lain dihitung dari rumus pembagi yang diuji unit, belum diamati.

### 2.2 Pengukuran — LIVE VERIFIED

Tiap baris: 12 detik (40 detik untuk demo). GPU: `nvidia-smi` tiap detik, dengan pembacaan dasar 9 detik tepat sebelum tiap pengukuran.

| Kondisi | FPS | Jarak frame rata-rata (terburuk) | Utas utama sibuk | Heap JS | Draw call/dtk | GPU: dasar → saat uji |
|---|---|---|---|---|---|---|
| **Baru**, sepi, batas bawaan | 25,1 | 39,9 ms (53) | 3,0% | 8,7 MB | 929 | 1,9% → 7,7% |
| **Baru**, mode demo (campuran sepi/aktif) | 53 rata-rata, 75 saat aktif | 21,1 ms (40) | 5,7% | 9,9 MB | 1.985 | 3,8% → 11,8% |
| Baru, dipaksa batas 8 (setelan lama) | 8,5 | 117,8 ms (122) | 1,9% | 8,1 MB | 319 | 3,4% → 5,5% |
| Baru, tanpa batas | 75,0 | 13,3 ms (14,6) | 5,5% | 9,6 MB | 2.778 | 3,6% → 18,6% |
| Kantor lama, sepi | — | — | 3,0% | 17,5 MB | 5.034 | 4,0% → 8,0% |
| Kantor lama, mode demo | — | — | 13,5% | 22,8 MB | 21.431 | 3,9% → 13,8% |

Adegan prototipe: 37 draw call, 3.047 segitiga, 37 geometri, 4 tekstur per frame. Memori GPU seluruh browser: ±1.475 → ±1.555 MiB
(tampilan lama ±1.570 MiB). Suhu GPU 40–42 °C selama uji.

Perbandingan dengan tampilan lama **tidak setara**: lama menggambar 6 ruangan dan 18 karakter, prototipe 1 ruangan dan 1 karakter.

### 2.3 Siklus hidup WebGL & memori

| Uji | Hasil | Kategori |
|---|---|---|
| Pindah tab → kanvas dilepas | 0 draw call, 0 kanvas tersisa | LIVE |
| 12× buka-tutup tab | Tidak ada peringatan WebGL; tetap merender setelah siklus ke-12 | LIVE |
| Konteks WebGL dihilangkan paksa | Pesan muncul, panel data tetap jalan; "Coba lagi" membuat kanvas baru dan merender lagi | LIVE (kehilangan konteks dipicu lewat ekstensi uji, bukan oleh ComfyUI) |
| **Kebocoran memori** | **Ditemukan dan diperbaiki**, lihat di bawah | LIVE |

**Kebocoran yang ditemukan.** Setiap kali tab dibuka lalu ditutup, memori bertambah dan tidak kembali:

| | Elemen halaman | Listener | Heap JS |
|---|---|---|---|
| Sebelum perbaikan, per siklus | +177 | +9 | +0,5 MB |
| Sesudah perbaikan, siklus 1 → 12 | 835 → 835 | 485 → 485 | 8,9 → 10,6 MB |
| Pembanding: tab Balok ↔ Tabel, 12 siklus | 4.138 → 4.138 | 225 → 225 | 5,0 → 5,4 MB |

Penyebab: model yang di-cache (lantai, furnitur, karakter) tetap terikat ke renderer lama, sehingga setiap kanvas lama beserta
elemen halamannya tertahan. Perbaikan: saat tab ditutup, ikatan sumber daya bersama itu dilepas (`releaseShared`).
Heap masih naik 1,7 MB dalam 12 siklus dan melandai (10,5 → 10,6 MB antara siklus 8 dan 12); uji lebih panjang belum dilakukan.

---

## 3. Audit lisensi aset

| | Mini Characters | Furniture Kit |
|---|---|---|
| Versi (dari `License.txt` di dalam unduhan) | 2.0 | 2.0 |
| Pembuat | Kenney (www.kenney.nl) | Kenney (www.kenney.nl) |
| Sumber resmi | https://kenney.nl/assets/mini-characters | https://kenney.nl/assets/furniture-kit |
| Lisensi | Creative Commons Zero (CC0 1.0) | Creative Commons Zero (CC0 1.0) |
| Bukti lisensi | `License.txt` di dalam zip + halaman sumber menulis "CC0 licensed" | sama |
| Diunduh | 15 Nov 2026, lewat tautan unduh di halaman resminya | sama |
| Isi zip | 233 entri | 1.557 entri |
| sha256 zip (awal) | `add348e98ab9e23d…` | `e67652d0932cee41…` |
| File yang dipakai | 2 | 9 |

**File yang dipakai** (di `frontend/public/office-iso3d/`), semuanya **identik byte-per-byte** dengan isi zip resmi:

- Mini Characters: `characters/character-male-a.glb` (245.232 B), `characters/Textures/colormap.png` (10.852 B)
- Furniture Kit: `furniture/floorFull.glb`, `wall.glb`, `wallWindow.glb`, `desk.glb`, `chairDesk.glb`, `computerScreen.glb`,
  `computerKeyboard.glb`, `pottedPlant.glb`, `rugRectangle.glb`

Tidak ada file lain di folder aset selain daftar di atas, `LICENSES.md`, dan dua salinan lisensi.

**Isi `LICENSES.md`**: tabel paket (pembuat, lisensi, sumber, tanggal unduh, berkas lisensi), daftar file per paket, dan daftar
yang dibuat sendiri (unit AI, klip `working` dan `seated-idle`, penggantian material saat muat). Statusnya tertulis
"menunggu persetujuan pemilik". Setiap file aset tercantum (diperiksa otomatis).

**Kepatuhan**

| Persyaratan | Status |
|---|---|
| Izin pakai komersial | Diizinkan CC0 |
| Atribusi | Tidak wajib; nama Kenney tetap dicantumkan di `LICENSES.md` |
| Larangan mengubah / kewajiban berbagi-serupa | Tidak ada di CC0. File tidak diubah |
| Teks lisensi ikut didistribusikan | Tidak wajib; dua `License.txt` asli tetap disalin ke `licenses/` (identik dengan aslinya) dan ikut ke build |

Yang **tidak** bisa saya verifikasi: bahwa Kenney pemegang hak atas seluruh isi paket. Dasarnya adalah pernyataan lisensi di
situs dan di dalam paket resmi. Zip aslinya hanya ada di folder sementara sesi ini; bila pemilik ingin arsipnya disimpan di
proyek, mohon keputusannya. Tidak ada aset yang dihapus atau diganti.

---

## 4. Audit dependensi

### 4.1 `package.json`

| Bagian | Perubahan |
|---|---|
| `dependencies` (produksi) | **Tidak berubah** |
| `devDependencies` | +4: `typescript ~5.6` (terpasang 5.6.3), `@types/react ^18.3.31`, `@types/react-dom ^18.3.7`, `@types/three ^0.160.0`. Yang lama tidak berubah |
| `scripts` | +1: `typecheck`. Yang lama tidak berubah |
| Lainnya | Tidak berubah |

### 4.2 `package-lock.json` — ada perubahan di luar empat paket itu

| Paket | Sebelum | Sesudah | Kenapa |
|---|---|---|---|
| `typescript` | — | 5.6.3 | ditambah (dev) |
| `@types/react-dom` | — | 18.3.7 | ditambah (dev) |
| `@types/prop-types` | — | 15.7.15 | dibawa `@types/react` 18 |
| `@types/react` | 19.3.0 | 18.3.31 | sebelumnya sudah ada sebagai bawaan pustaka lain; kini disematkan ke versi yang cocok dengan React 18 |
| `@types/three` | 0.187.0 | 0.160.0 | sama; kini cocok dengan three 0.160.1 |
| `fflate` | 0.8.3 (+ salinan 0.6.11 di bawah `three-stdlib`) | 0.6.11 (satu salinan) | 0.8.3 hanya diminta `@types/three` 0.187 |
| `meshoptimizer` | 1.1.1 | 0.18.1 | hanya diminta `@types/three` |
| `@dimforge/rapier3d-compat`, `@tweenjs/tween.js` | terpasang | dihapus | hanya diminta `@types/three` 0.187 |

Enam paket terakhir **tidak bertanda "dev" di lockfile**, karena `@types/three` dan `@types/react` juga diminta pustaka
produksi (`stats-gl`, `maath`, `zustand`, `@types/react-reconciler`) sebagai paket tipe. Jadi secara tulisan, himpunan paket
non-dev di lockfile berubah (92 → 90).

### 4.3 Apakah kode produksi berubah?

Diperiksa dari peta sumber build: bundel produksi berisi **22 paket**, dan **semuanya berversi sama dengan lockfile lama**.
Tidak satu pun paket di §4.2 masuk bundel (paket tipe tidak punya kode yang dijalankan). `three-stdlib` memakai `fflate` 0.6.11
sebelum dan sesudah.

Kesimpulan: dependensi produksi di `package.json` tidak berubah dan kode yang dikirim ke browser tidak memakai paket yang
berubah; tetapi lockfile berubah lebih luas daripada "4 dev-dependency", dan itu perlu diketahui pemilik.

---

## 5. Cek regresi

### 5.1 Tampilan lama — LIVE VERIFIED

Tangkapan layar build cadangan (sebelum perubahan) dibandingkan piksel demi piksel dengan build sekarang, pada data backend yang sama:

| Tampilan | Piksel berbeda di bawah baris tab | Catatan |
|---|---|---|
| Balok | 0,000% | 30 meja di kedua build |
| Tabel | 0,000% | 15 baris di kedua build |
| Kantor (3D lama) | 0,000% (dibulatkan) | Satu area 23×150 piksel berbeda: karakter yang sedang beranimasi |

Satu-satunya beda adalah baris tab, yang kini memuat tombol "3D Isometrik".

### 5.2 Isolasi, backend, id agent, polling

| Butir | Hasil | Kategori |
|---|---|---|
| Tab baru terisolasi | Di tampilan Kantor: 0 permintaan ke kode/aset baru. Baru dimuat saat tab dibuka (1 file kode + 11 aset) | LIVE |
| Gagal muat modul baru | Kembali ke Kantor; halaman lain tidak terdampak | LIVE |
| Backend | Tidak ada file di `backend/app` yang berubah sejak sebelum cadangan dibuat (dari waktu ubah file; proyek bukan repo git) | LIVE |
| Id agent | 14 id di `telemetry.py`, file tidak berubah. API mengembalikan daftar id dan susunan kunci yang sama di kedua build | LIVE |
| Polling | 6 permintaan per 30 detik di build lama dan build baru | LIVE |
| `frontend/src/office3d/`, `vite.config.js` | Tidak ada file yang berubah | LIVE |
| Tes lama | 23 dari 23 lulus | LIVE |

### 5.3 File lama yang disentuh

| File | Perubahan |
|---|---|
| `src/pages/CommandCenter.jsx` | +21 baris, 1 baris disambung ke cabang baru (`{view === 'office' && gl3d ? (` menjadi lanjutan `: view === 'office' && gl3d ? (`). **Tidak disentuh di revisi ini** |
| `src/styles.css` | +46 baris di akhir file; 0 baris lama berubah |

### 5.4 Kekeliruan saya yang ditemukan audit ini

Saat menambah aturan gaya, saya **mengubah akhir baris seluruh `styles.css`** dari CRLF ke LF tanpa sengaja. Isi tidak berubah,
tetapi setiap baris berbeda secara byte. Sudah dipulihkan: bagian lama file kini identik byte-per-byte dengan cadangan,
dan hanya blok tambahan di akhir yang baru.

### 5.5 Masalah lama (dicatat, tidak diperbaiki)

**Kantor → Tabel → Kantor**: tampilan 3D lama berganti ke kantor 2D dengan pesan "Tampilan 3D tidak didukung".
Terjadi juga pada build cadangan sebelum perubahan saya. Tidak diperbaiki sesuai instruksi. Tab baru memakai status WebGL
sendiri sehingga tidak ikut terdampak.

---

## 6. Hasil pengujian menurut sumber data

### 6.1 Data backend asli, tanpa job berjalan — LIVE VERIFIED

- Tab muncul; modul dan aset dimuat hanya saat tab dibuka.
- 10 model glTF + tekstur termuat; karakter ber-rig tampil dengan animasi duduk.
- Keadaan dari data asli: `job:horror → idle · Tidak ada job/panggilan aktif (health: ok)`; unit `llm:groq → idle`; label "Otak AI · Groq" dari respons backend.
- Kamera: zoom berhenti di batas 60–420, geser berhenti di batas, "Atur ulang tampilan" kembali ke awal.
- Klik karakter dan klik unit AI membuka panel Detail agent yang sudah ada, berisi data asli.
- Backend diputus saat idle → lencana "Terputus" dan baris sumber berubah.
- Aset hilang → bentuk pengganti. WebGL mati → pesan jelas. Modul gagal dimuat → kembali ke Kantor.
- Performa, siklus hidup WebGL, dan memori: §2.

### 6.2 Data tiruan — LOGIC VERIFIED

Dua sumber tiruan, keduanya berbentuk sama dengan respons backend:

| Sumber | Yang dibuktikan |
|---|---|
| **Job tiruan disisipkan ke respons backend asli** | Seluruh tabel §1.3 (bekerja, memanggil, menetap, pulang, berbalik, job selesai, backend terputus) |
| **Mode demo** (`?demo=1`, berlabel MODE DEMO) | Satu siklus 40 detik: siaga → memanggil Groq (berjalan, berdiri di unit) → pulang → bekerja → siaga. Karakter berada di unit **hanya** pada detik ketika data demo berisi panggilan Groq |
| Tes unit (31) | Aturan adapter, mesin keadaan, lokomosi, interpolasi, pembagi frame |

### 6.3 Job produksi asli — NOT VERIFIED

Belum ada satu pun keadaan `working` atau `consulting` yang dipicu job sungguhan. Saya tidak memicu job produksi.
Prosedurnya: `docs/office-isometric/P2-LIVE-VALIDATION.md`. Butir yang menunggu bukti pemilik:

| Butir | Status |
|---|---|
| Karakter bekerja saat job asli berjalan; tahap dan persen sama dengan bilah progres lama | NOT VERIFIED |
| Karakter menuju unit saat job asli memanggil model; unit menyala | NOT VERIFIED |
| Unit otomatis menampilkan provider yang benar-benar dipakai | NOT VERIFIED |
| Kembali siaga setelah job selesai | NOT VERIFIED |
| Tidak ada gerak tanpa job | NOT VERIFIED dengan job asli (LIVE untuk kondisi tanpa job) |
| Kestabilan tab saat GPU dipakai ComfyUI | NOT VERIFIED |

---

## 7. NOT VERIFIED lainnya

| Hal | Kenapa belum |
|---|---|
| Panas laptop dan kestabilan jangka panjang | Pengukuran 12–40 detik per kondisi |
| Performa kantor penuh (6 ruangan, 14 karakter) | Belum dibangun |
| Browser pemilik dengan layar sungguhan | Uji memakai Edge headless. Kanvas meminta mode hemat daya, jadi browser bisa memilih GPU terintegrasi |
| Laju frame pada layar 60/144/165 Hz | Dihitung dari rumus, belum diamati |
| Kehilangan konteks WebGL karena GPU direbut ComfyUI | Yang diuji: kehilangan konteks yang dipicu paksa |
| Kebocoran memori pada pemakaian berjam-jam | Diuji 12 siklus |
| Kemiripan dengan gambar referensi | Penilaian pemilik. Karakter paket ini lebih kotak daripada referensi, dan dindingnya lebih tinggi |
| Menambah karakter kedua | Sengaja belum dicoba |

## 8. N/A di P2

Perubahan backend; WebSocket; 13 karakter dan 3 unit AI lain; 5 ruangan lain; enam keadaan animasi lain; klik ruangan;
tingkat kualitas; konversi file lama ke TypeScript; peningkatan kualitas visual (keputusan prioritas kualitas berlaku untuk fase berikutnya).

---

## 9. Hal yang perlu keputusan pemilik

1. **Daftar lisensi aset** (§3): disetujui atau tidak. Aset sudah ada di proyek sebelum disetujui.
2. **Perubahan lockfile** (§4.2): diterima, atau paket tipe dilepas lagi (konsekuensinya pengecekan tipe otomatis tidak akurat).
3. **Batas laju frame** (§2.1): 30 sepi / 60 aktif. Bisa dinaikkan sampai laju layar bila diinginkan.
4. **Gambar referensi**: saya memakai `docs/superpowers/specs/assets/referensi-agent-hq.png`. Bila yang dimaksud gambar lain, mohon dikirim.
5. **Masalah lama Kantor → Tabel → Kantor** (§5.5): dibiarkan, atau diizinkan diperbaiki terpisah.
6. Panel Detail agent lama masih menampilkan nama "Gilang" untuk `llm:groq` (UI lama, tidak diubah).

---

## 10. Yang berubah di revisi ini

Semua di dalam modul baru, kecuali satu blok tambahan di akhir `styles.css`:

- `adapter/viewState.ts`, `adapter/types.ts` — keadaan `consulting` dari `inflight[]`; `findCalls()`; tidak lagi memakai `deriveScene()`.
- `anim/locomotion.ts`, `anim/stateMachine.ts`, `scene/Employee.tsx` — gerak menuju tujuan dari data, tanpa jadwal.
- `perf/FrameGovernor.tsx` — pengatur frame selaras layar; batas 30/60; `?oi3fps=<sepi>,<aktif>` untuk pengukuran.
- `scene/Kit.tsx`, `scene/Employee.tsx` — perbaikan kebocoran memori (`releaseShared`).
- `OfficeIso3d.tsx` — unit AI mode "Otomatis", panel "Log validasi".
- `tools/office-iso3d/probe2.mjs` — skenario uji `sync`, `perf`, `leak`, `ctxlost`, `regress`.
- `docs/office-isometric/P2-LIVE-VALIDATION.md` — prosedur uji job asli.

Tidak disentuh: `backend/`, `frontend/src/office3d/`, `CommandCenter.jsx`, `vite.config.js`, `package.json`, `package-lock.json`.

### Rollback

Cadangan: `backup-office-iso3d-2026-11-15/` (`CommandCenter.jsx`, `styles.css`, `package.json`, `package-lock.json`, `dist/`).

1. Salin kembali keempat file dan folder `dist/` dari cadangan.
2. Hapus `frontend/src/officeIso3d/`, `frontend/public/`, `frontend/tools/office-iso3d/`, `frontend/tsconfig.json`.
3. `npm install` di `frontend/`.

---

## 11. Bukti

Tangkapan layar di `docs/office-isometric/p2/`: `01-data-asli-siaga.png`, `sync-B-bekerja.png`, `sync-C-di-unit.png`,
`sync-E-berbalik.png`, `sync-G-terputus.png`, `demo-*.png`, `demo-timeline.json`, `log-validasi-demo.png`, `ctxlost-pesan.png`,
`ctxlost-pulih.png`, `click-*.png`, `missing*.png`, `nowebgl.png`, `chunkfail.png`, `backend-terputus.png`.

Uji ulang:
- `node tools/office-iso3d/probe.mjs http://127.0.0.1:8000 <folder> <skenario>` — `shot`, `demo`, `camera`, `click`, `lifecycle`, `lazy`, `hidden`, `missing`, `missing-char`, `nowebgl`, `chunkfail`
- `node tools/office-iso3d/probe2.mjs http://127.0.0.1:8000 <folder> <skenario>` — `sync`, `perf`, `leak`, `ctxlost`, `regress`
- `npm test`, `npm run typecheck`, `node tools/office-iso3d/validate-assets.mjs`
