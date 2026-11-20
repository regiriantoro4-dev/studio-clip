# AI Office 3D — Rancangan
_14 November 2026 · status: menunggu persetujuan pemilik · sudah melalui builder check (5 pertanyaan, semua terjawab di §8, §9b, §9c)_

## 1. Maksud & alasan
Pemilik AutoClipper diminta bosnya membuat **"AI office yang proper"** setara video referensi
(kreator bexruz.khamidullaev, "Agent HQ": ruangan isometrik berwarna per divisi, karakter low-poly bekerja
dan berjalan, pusat "otak" bercahaya). Kantor ini punya **dua fungsi sekaligus**:
1. **Dipamerkan** ke bos (dan mungkin direkam jadi konten), jadi harus memukau dan terasa hidup.
2. **Dipakai sehari-hari** untuk memantau kerja AutoClipper, jadi gerakannya harus mencerminkan data asli, bukan animasi palsu.

## 2. Sasaran, bukan-sasaran, anti-sasaran
**Sasaran**
- Kantor 3D isometrik real-time di halaman Command Center, menggantikan kantor SVG 2D yang sekarang.
- Karakter bergerak sesuai telemetri nyata (job berjalan, panggilan AI, serah terima tahap, error).
- Mode Horor ikut tampil sebagai divisi sendiri (sekarang tidak terdaftar sebagai agent).
- Panel data yang sudah ada (ringkasan, peringatan, riwayat job, statistik per agent) tetap tersedia.

**Bukan sasaran (fase ini)**
- Bilah lengkap ala video: tab Tasks, Calendar, Brain. Pemilik memilih fokus ke kantor saja.
- Produksi terjadwal, chat dengan agent, atau mengendalikan job dari dalam kantor.
- Model buatan Blender. Fase ini memakai aset CC0; Blender menyusul dengan mengganti aset per bagian.

**Anti-sasaran (gagal walau secara teknis jalan)**
- Karakter bergerak acak/terus-menerus padahal tidak ada pekerjaan, karena itu menipu fungsi pemantauan.
- Laptop pemilik jadi berat atau panas karena halaman ini (laptop pernah mati saat beban GPU tinggi).
- Tampilan terasa murahan/kosong dibanding video referensi.
- Data panel lama hilang atau jadi sulit diakses.

## 3. Batasan
- Frontend: React + Vite (`frontend/`), hasil build disajikan backend di `127.0.0.1:8000`. Rute `/command-center`
  sudah di-lazy-load. UI berbahasa Indonesia; ikuti `DESIGN.md` untuk panel (grafit gelap, aksen `#FFD100`, Archivo).
  **Adegan 3D boleh berwarna-warni per divisi** seperti video; aturan aksen tunggal berlaku untuk UI panel, bukan untuk isi adegan.
- Data: `GET /api/command-center?hours=N` (`backend/app/services/telemetry.py: summarize`), dipoll tiap 5 dtk.
  Isinya `agents[]` (id, name, role, group, health, running, total, success_rate, avg_dur, last_error…),
  `running[]` (id, agent, stage, progress, elapsed), `log[]`, `alerts[]`, `summary`.
  Agent id: `job:<kind>`, layanan (`downloader`, `transcriber`, `renderer`, `thumbnail`, `tts`, `bumper`), `llm:<provider>`.
  Persona Indonesia ada di `CommandCenter.jsx: PERSONA` (Raka, Sari, Joko…).
- Perangkat: RTX 4060 laptop yang tidak stabil di beban berat. Halaman harus ringan: render berhenti saat tab
  tersembunyi, batasi FPS, bayangan sederhana.
- Aset wajib berlisensi bebas (CC0 atau setara). Catat sumber & lisensi tiap aset.
- Proyek bukan repo git: buat backup folder `backup-ai-office-3d-<tanggal>/` sebelum mengubah file yang sudah ada.

## 4. Pendekatan
| Pendekatan | Ringkas | Keputusan |
|---|---|---|
| **A. Three.js (React Three Fiber) di AutoClipper + aset low-poly CC0** | 3D real-time, terhubung telemetri asli, aset bisa diganti model Blender nanti | **Dipilih pemilik** (mengikuti rekomendasi) |
| B. A + model Blender khusus | Tampilan paling unik | Ditunda; jadi fase lanjutan di atas A |
| C. Pakai proyek open-source (mis. Claw3D) | Cepat terlihat | Ditolak: sulit disambungkan ke telemetri/persona/bahasa kita |
| D. Pixel-art 2D | Ringan | Ditolak: tidak setara video referensi |

## 5. Yang sudah diputuskan pemilik
1. **Tata letak: satu lantai kantor, grid** (pilihan C di mockup): 2 baris × 3 ruangan dengan lorong di tengah.
   - Baris atas: **Unduh & Data** (hijau) · **Analis Klip** (biru) · **Studio Horor** (oranye/kuning)
   - Baris bawah: **Ruang Suara** (magenta) · **Otak AI** (biru tua + cahaya cyan, di tengah) · **Render + Affiliate** (teal; area merah untuk Affiliate & Video Jadi)
2. **Pembagian agent per ruangan** (ditunjukkan di mockup, tidak dikoreksi):
   - Otak AI: `llm:groq` Gilang, `llm:gemini` Maya, `llm:openai` Arif, `llm:moonshot` Putri
   - Unduh & Data: `downloader` Udin, `transcriber` Wulan
   - Analis Klip: `job:process` Raka, `job:annotate` Lina, `job:fix-transcript` Tono, `job:autoproduce` Bima
   - Studio Horor: **agent baru** `job:horror`, ditampilkan sebagai tim (penulis cerita, pelukis ComfyUI, animator parallax)
   - Ruang Suara: `tts` Rina, `job:narrate` Dewi
   - Render + Affiliate: `renderer` Joko, `thumbnail` Ayu, `bumper` Kiki, `job:affiliate` Nadia, `job:readymade` Sari
3. **Fokus ke kantor saja** + panel data yang sudah ada, tanpa tab Tasks/Calendar/Brain.
4. Kantor 3D **menggantikan** kantor SVG di Command Center (usulan yang tidak dikoreksi).

## 6. Perilaku karakter (usulan yang tidak dikoreksi pemilik)
Semua gerak dipicu data asli dari poll 5 detik; animasi di antaranya hanya transisi.
| Keadaan data | Yang terlihat |
|---|---|
| Agent `running > 0` | Duduk mengetik di meja, monitor menyala warna divisi; label kecil menampilkan `stage` + progres |
| Panggilan LLM baru (event `llm:*` di `log` lebih baru dari poll sebelumnya) | Karakter divisi yang sedang bekerja berjalan lewat lorong ke Otak AI, berdiri sebentar, lalu kembali. Inti Otak AI berdenyut |
| Serah terima tahap (event selesai satu layanan disusul layanan berikutnya dalam job yang sama, mis. downloader → transcriber) | Karakter membawa "kotak" menyeberang lorong ke ruangan berikutnya |
| `health = idle/ok` | Santai di meja/berdiri, animasi napas halus (tidak berkeliaran tanpa alasan) |
| `health = warning/error` | Lampu ruangan berkedip kuning/merah, karakter animasi bingung/garuk kepala |
| Klik karakter/meja | Panel detail agent (statistik yang sudah ada: total, sukses, rata-rata waktu, error terakhir) |
| Studio Horor `running` | Tim di Studio Horor aktif sesuai `stage` (menulis cerita, "Melukis gambar", "Parallax", "Render") |

## 7. Panel & kamera
- Kamera **isometrik ortografik** seperti video; bisa geser/zoom terbatas; tombol reset. Minimap opsional (builder).
- Bilah ringkas di atas adegan: jumlah agent, yang berjalan, peringatan (dari `summary`).
- Panel data yang ada sekarang (pilihan rentang waktu, peringatan, riwayat job, kartu agent) tetap ada sebagai
  kolom samping/laci di bawah, dan tetap berfungsi seperti sekarang.

## 8. Backend yang perlu ditambah (sedang)
Diverifikasi di kode (14 Nov): `telemetry.wrap()` hanya mencatat event SETELAH panggilan selesai, dan hanya
`jobs.JOBS` yang dihitung `running`. Akibatnya agent layanan & `llm:*` tidak pernah tampil "sedang bekerja".
Event `llm:*`, `tts`, `bumper` juga tidak membawa `job`/`ref`, jadi asal panggilan tidak diketahui.
Tanpa perbaikan ini, karakter akan diam saat bekerja (melanggar anti-sasaran §2). Maka:
1. **Pelacakan sedang-berjalan** _(keputusan Claude)_: `wrap()` mendaftarkan panggilan di tabel in-flight
   (thread-safe) saat mulai dan menghapusnya saat selesai/gagal. `summarize` menambahkan field
   `inflight[]` = {agent, task, job, since} dan menaikkan `running` agent layanan/LLM yang sedang dipakai.
2. **Penanda job asal** _(keputusan Claude)_: `jobs.start` menyimpan id & kind job di `contextvars`/thread-local
   untuk thread job itu. `record()` dan in-flight mengisi `job` otomatis dari sana. Panggilan dari luar job
   (mis. tombol di UI) diberi `job=""` dan dianggap milik ruangan agent itu sendiri.
3. Daftarkan `job:horror` di `telemetry.AGENTS` (nama "Studio Horor", kelompok "kerja") + persona di frontend.
4. **Jendela waktu adegan** _(keputusan Claude)_: lampu peringatan di adegan memakai jendela tetap 1 jam
   (field `scene_health` per agent dihitung terpisah), tidak mengikuti pilihan rentang di panel. Kalau mengikuti
   panel, satu kegagalan lama membuat ruangan berkedip merah berhari-hari di rentang "7 hari/Semua".
Pemetaan perilaku §6 lalu memakai: `running`/`inflight` → mengetik; `inflight` LLM dengan `job` → karakter
divisi job itu berjalan ke Otak AI; event selesai berurutan dengan `job` sama → serah terima "kotak".

## 9. Diserahkan ke builder
- Pemilihan paket aset CC0 tertentu (karakter beranimasi: jalan, duduk/mengetik, idle; furnitur kantor), selama
  lisensinya bebas dan gayanya low-poly seperti video. Catat sumbernya.
- Struktur komponen R3F, state machine karakter, pathfinding sederhana di lorong (waypoint cukup).
- Detail pencahayaan, warna persis, efek pasca-proses (bloom untuk Otak AI dsb.) dalam batas performa.
- Cara fallback bila WebGL tidak tersedia (minimal: tampilkan panel data lama).
- Uji: tangkapan layar Playwright di beberapa keadaan (semua siaga, satu job horor berjalan, error).

## 9b. Rujukan visual
- Video referensi (tangkapan layar): `assets/referensi-agent-hq.png`. Patokan kualitas: ruangan berdinding rendah
  terbuka ke atas, lantai warna divisi, karakter low-poly bergaya mainan, kamera isometrik ±35°, bayangan lembut,
  label ruangan mengambang (nama + jumlah agent + yang berjalan), inti bercahaya dengan glow.
- Mockup tata letak yang dipilih (opsi C) + tabel pembagian agent: `assets/mockup-tata-letak.html`.

## 9c. Cara verifikasi _(keputusan Claude)_
- Selama pengembangan: **telemetri simulasi** (skrip penyuntik event/in-flight palsu) untuk semua keadaan,
  supaya GPU laptop tidak dibebani ComfyUI/TTS berulang kali.
- Penerimaan akhir: **satu** job Horor nyata, saat GPU sedang tidak dipakai job lain, sambil memantau kantor.

## 10. Definisi selesai
- Halaman `/command-center` menampilkan kantor 3D grid 6 ruangan dengan semua agent di ruangannya.
- Menjalankan satu job Horor nyata membuat Studio Horor aktif, karakter berjalan ke Otak AI saat LLM dipanggil,
  dan kembali siaga setelah selesai.
- Tab tersembunyi = render berhenti; GPU tetap ringan saat halaman terbuka.
- Panel data lama tetap berfungsi.
