# Kantor 3D Isometrik — P1: Audit Arsitektur Visual & Spesifikasi Teknis

_Revisi 2 · 15 November 2026 · status: **menunggu persetujuan pemilik** · belum ada kode yang diubah_

**Perubahan dari revisi 1** (mengikuti keputusan pemilik):
1. Visual tetap **3D penuh**, bukan pixel-art 2D. Phaser 4 dan Tiled dicoret; diganti evaluasi Three.js vs Babylon.js (§4).
2. **14 agent terdaftar** menjadi karakter karyawan. **4 model AI bukan karyawan**; ditampilkan sebagai unit AI dengan identitas aslinya (§3).
3. Aset memakai **pipeline hybrid modular** dengan verifikasi lisensi (§7).
4. Tab baru bernama **"3D Isometrik"**. Kantor (3D lama), Balok, dan Tabel tetap ada; tampilan lama tetap bawaan sampai versi baru divalidasi.
5. TypeScript hanya di modul baru, dan hanya karena build yang ada sudah mendukungnya (§12).
6. Polling 5 detik dipertahankan, backend tidak diubah, gerak dihaluskan dengan interpolasi di frontend. Tidak ada klaim "real-time" (§6.4).

Menunggu dari pemilik: **gambar referensi visual kantor** (akan dikirim ulang). Bagian yang bergantung padanya ditandai _[menunggu referensi]_.

---

## 1. Ringkasan

- Upgrade ini dikerjakan **murni tambahan**: satu modul baru `frontend/src/officeIso3d/`, satu folder aset baru, dan satu tab baru di Command Center. Backend tidak disentuh.
- **Rekomendasi engine: Three.js lewat React Three Fiber**, yaitu tumpukan yang sudah terpasang dan sudah dipakai tampilan "Kantor" sekarang. Tidak ada dependensi baru (§4).
- Bedanya dengan tampilan 3D lama: yang lama memakai bentuk primitif (kotak/kapsul yang digambar kode, tanpa file model). Yang baru memakai **model glTF modular**: furnitur, lingkungan kantor, dan karakter ber-rig dengan animasi sungguhan.
- Risiko terbesar tetap di **aset** (model karakter + 9 animasi + lisensi), bukan di kode.

---

## 2. Hasil audit: yang sudah ada

### 2.1 Data agent (backend) — tidak diubah

| Hal | Kenyataan di kode | Lokasi |
|---|---|---|
| Agent terdaftar | 14 (8 kelompok "kerja" + 6 kelompok "layanan") | `backend/app/services/telemetry.py` → `AGENTS` |
| Model AI | ID `llm:<provider>`, **tidak terdaftar di `AGENTS`**; muncul dinamis saat dipanggil. Nama dari backend: "Otak AI · Groq", dst. | `telemetry.agent_info()`, `_provider()` |
| Status agent | `health`: `running` · `ok` · `idle` · `warning` · `error`; `scene_health` (jendela tetap 1 jam) | `telemetry._health()`, `summarize()` |
| Status job | `running` · `done` · `error`, `stage` (teks), `progress` (0–1) | `backend/app/jobs.py` |
| Event tugas | Satu baris per tugas selesai/gagal: agent, task, status, start, end, dur, error, ref, job | `telemetry.record()` |
| Sedang berjalan | `running[]` (job aktif); `inflight[]` (panggilan layanan/LLM yang sedang dieksekusi + `job` dan `job_kind` asalnya) | `telemetry.wrap()` |
| Endpoint | Satu: `GET /api/command-center?hours=N` → `{summary, agents[], running[], inflight[], log[], alerts[]}` | `backend/app/routers/command.py` |
| Mekanisme | Polling 5 detik dari frontend; berhenti saat tab tersembunyi. Tidak ada WebSocket/SSE | `CommandCenter.jsx` |
| Kontrol agent | Tidak ada; Command Center hanya memantau | — |

### 2.2 Frontend yang ada

| Bagian | Isi | Peran di upgrade |
|---|---|---|
| `src/pages/CommandCenter.jsx` | Halaman, polling, tab (Kantor / Balok / Tabel), panel Detail agent, Alert, Task log | Dipertahankan; +1 tab |
| `src/office3d/layout.js` | 6 ruangan, `ROOM_OF` (agent → ruangan), `PERSONA` | Dibaca saja sebagai sumber departemen |
| `src/office3d/sceneModel.js` | `deriveScene()`: respons API → karakter, ruangan, perjalanan. Fungsi murni, 17 tes | Dipakai ulang lewat import, tidak diubah |
| `src/office3d/demoFeed.js` | Data tiruan `?demo=1`, selalu berlabel "MODE DEMO" | Dipakai ulang untuk pengembangan |
| `src/office3d/*.jsx` | Adegan 3D lama (primitif, tanpa file model) | **Tidak disentuh**, tetap jadi tampilan bawaan |

Versi terpasang: React 18.3.1 · Vite 5.4.21 · three 0.160.1 · @react-three/fiber 8.18.0 · @react-three/drei 9.122.0 · @react-three/postprocessing 2.19.1 · vitest 2.1.9 · Node 24.16. Tes frontend: 23 lulus (15 Nov).

---

## 3. Entitas di kantor (keputusan pemilik #2)

Dua jenis entitas, tidak dicampur:

### 3.1 Karyawan — 14 agent terdaftar

| Ruangan | Agent (ID asli) → nama persona yang sudah ada |
|---|---|
| Unduh & Data | `downloader` Udin · `transcriber` Wulan |
| Analis Klip | `job:process` Raka · `job:annotate` Lina · `job:fix-transcript` Tono · `job:autoproduce` Bima |
| Studio Horor | `job:horror` Studio Horor |
| Ruang Suara | `tts` Rina · `job:narrate` Dewi |
| Render + Affiliate | `renderer` Joko · `thumbnail` Ayu · `bumper` Kiki · `job:affiliate` Nadia · `job:readymade` Sari |

Satu agent = satu karakter. `job:horror` adalah satu agent, jadi satu karakter (tidak dipecah jadi "tim" fiktif).

### 3.2 Unit AI — model bahasa, bukan karyawan

- Ditempatkan di ruangan **Otak AI** sebagai perangkat (unit server/terminal bercahaya), **bukan sosok manusia**.
- Identitas memakai data asli: ID `llm:groq`, label "Otak AI · Groq" dari backend. Nama persona manusia (Gilang, Maya, Arif, Putri) **tidak dipakai** di tampilan baru. Tampilan lama tidak diubah.
- 4 unit selalu tampil (`groq`, `gemini`, `openai`, `moonshot`, sama dengan `ALWAYS_PRESENT`). Provider lain yang muncul di data (mis. `anthropic`, `openrouter`, `deepseek`) mendapat slot unit tambahan, bukan diabaikan.
- Relasi data dipertahankan: `inflight[]` mencatat job mana memanggil model mana. Karyawan pemilik job itu berjalan ke **unit model yang benar-benar dipanggil**, bukan ke titik acak di ruangan.
- Statistik, error, dan riwayat unit AI tetap bisa dibuka di panel Detail agent yang sudah ada (datanya memang ada di `agents[]`).

---

## 4. Perbandingan engine 3D (keputusan pemilik #1)

Tiga kandidat nyata: Three.js lewat React Three Fiber (sudah terpasang), Three.js murni tanpa R3F, dan Babylon.js.

| Kriteria | Three.js + React Three Fiber | Three.js murni (imperatif) | Babylon.js |
|---|---|---|---|
| **Integrasi dengan proyek** | Sudah terpasang dan dipakai tampilan Kantor. Pola yang sudah teruji bisa ditiru: pembatas FPS, penangkap gagal WebGL, lazy-load | Paket `three` sudah ada; perlu menulis sendiri siklus hidup, resize, dan pembersihan | Engine kedua di aplikasi. Tidak ada kode yang bisa dipakai ulang. Integrasi React lewat pustaka komunitas atau kode imperatif |
| **Dependensi baru** | **Tidak ada** | Tidak ada | `@babylonjs/core` + `@babylonjs/loaders` |
| **Ukuran muatan** | Chunk 3D sekarang 888 KB; modul baru berbagi pustaka yang sama, jadi tambahannya terutama kode adegan + aset | Sedikit lebih kecil (tanpa R3F/drei) | Menambah satu engine penuh di atas three yang tetap harus ada untuk tampilan lama. Angka pasti harus diukur; perkiraan saya di atas 1 MB |
| **Performa render** | Setara Three.js murni bila perubahan per-frame lewat `ref`/`useFrame` (bukan state React) | Dasar pembanding | Setara untuk adegan sekecil ini (±20 objek bergerak) |
| **Pemakaian GPU** | Ditentukan isi adegan, bukan engine. Kendali hemat daya sudah ada: `frameloop="demand"`, batas FPS, `powerPreference: low-power` | Sama, tapi ditulis sendiri | Sama; punya optimizer adegan bawaan. Engine tidak membuat GPU lebih ringan dengan sendirinya |
| **Kamera** | Ortografik isometrik + geser/zoom sudah berjalan di tampilan lama (`OrthographicCamera`, `OrbitControls`) | Sama, ditulis manual | `ArcRotateCamera` mode ortografik; setara |
| **Pencahayaan** | Hemisphere + directional + emissive; lightmap bisa dipanggang ke model | Sama | Setara; alat bantu bawaan lebih banyak |
| **Bayangan** | Shadow map tunggal; bisa dibekukan untuk benda statis | Sama | Setara; cascaded shadow bawaan (tidak diperlukan untuk kamera ortografik tetap) |
| **Animasi karakter** | `AnimationMixer` + `useAnimations` (drei): crossfade antar klip, satu rig dipakai banyak karakter | `AnimationMixer` langsung | `AnimationGroup` dengan blending; setara |
| **Pemuatan glTF** | `useGLTF` (drei) dengan cache; dekoder meshopt sudah ada di `node_modules` | `GLTFLoader` manual | Loader glTF bawaan yang matang |
| **Alat bantu pengembangan** | Ekosistem luas; komponen deklaratif | Paling banyak kode manual | Inspector bawaan yang sangat bagus |
| **TypeScript** | `@types/three` sudah ada di `node_modules` | Sama | TypeScript sejak awal |
| **Risiko terhadap tampilan lama** | Nol selama versi `three` tidak dinaikkan | Nol | Rendah, tapi dua engine berarti dua jalur perawatan |

### 4.1 Rekomendasi final

**Three.js lewat React Three Fiber, memakai versi yang sudah terpasang (three 0.160.1, R3F 8.18, drei 9.122). Tidak menaikkan versi apa pun.**

Alasan:
1. **Additive-only paling bersih**: nol dependensi baru, nol perubahan pada konfigurasi build.
2. **Risiko terendah**: tumpukan ini sudah terbukti jalan di laptop pemilik lewat tampilan Kantor, termasuk penanganan WebGL gagal dan penghematan daya.
3. **Kebutuhan terpenuhi**: adegan ini kecil (14 karakter ber-rig, ±4–7 unit AI, furnitur statis). Kelebihan Babylon (inspector, cascaded shadow, navmesh) tidak menjawab kebutuhan yang tidak bisa dipenuhi Three.js di skala ini.
4. **Beban GPU ditentukan anggaran adegan (§9)**, bukan pilihan engine.

Konsekuensi yang diterima:
- three 0.160.1 adalah rilis Januari 2024. Fitur baru (renderer WebGPU) tidak dipakai; cukup WebGL2. Menaikkan versi akan memengaruhi tampilan lama, jadi **tidak dilakukan** di proyek ini.
- Tanpa inspector bawaan; pengukuran memakai `renderer.info` dan panel statistik kecil saat pengembangan.

Kapan Babylon layak dipertimbangkan ulang: bila nanti dibutuhkan fisika, navmesh dinamis, atau adegan jauh lebih besar. Itu di luar lingkup.

---

## 5. Struktur modul baru

```
frontend/src/officeIso3d/                 ← semua kode baru di sini
  OfficeIso3d.tsx          pintu masuk; kontrak sama dengan Office3D + onSelectRoom
  adapter/
    viewState.ts           Office Visualization Adapter: data + scene → OfficeViewState (fungsi murni)
    viewState.test.ts
    interpolate.ts         penghalus antar-poll (§6.4), fungsi murni + tes
    types.ts               tipe data API & view state
  manifest/
    employees.ts           14 karyawan: agentId → model, variasi, meja (identitas tetap)
    aiUnits.ts             unit AI: llm:<provider> → slot, warna, label asli
    officeMap.ts           tata ruang: ruangan, modul dinding/lantai, furnitur, titik meja, pintu, jalur
    assets.ts              daftar file aset + anggaran (segitiga, tekstur)
  scene/
    Environment.tsx        lantai, dinding kaca, furnitur (instanced), lampu
    RoomLabels.tsx         label departemen: nama, penghuni, aktif, beban kerja
    Employee.tsx           satu karakter ber-rig + mesin keadaan animasi
    AiUnit.tsx             satu unit AI (animasi non-rig: denyut, cincin)
    CameraRig.tsx          kamera isometrik: zoom, geser, fokus ruangan, atur ulang
    Lighting.tsx
  anim/
    stateMachine.ts        prioritas, durasi minimum, transisi (fungsi murni + tes)
    locomotion.ts          gerak mengikuti jalur berbasis waktu
    clips.ts               nama klip ↔ keadaan
  perf/
    quality.ts             tingkat kualitas + penurunan otomatis
    FrameGovernor.tsx      batas FPS, jeda saat tab tersembunyi
frontend/public/office-iso3d/             ← semua aset baru di sini
  env/*.glb  furniture/*.glb  characters/*.glb  anims/*.glb
  LICENSES.md              sumber, pembuat, lisensi, tanggal unduh, tautan tiap aset
frontend/tools/office-iso3d/              ← skrip bantu (tidak ikut ke build)
  validate-assets.mjs      cek manifest vs file, klip animasi, anggaran
```

### 5.1 File lama yang disentuh (masing-masing dibackup dulu, §13)

| File | Perubahan |
|---|---|
| `frontend/src/pages/CommandCenter.jsx` | +1 `lazy import`, +1 tombol tab "3D Isometrik", +1 cabang render, +state ruangan terpilih, +panel kecil "Detail ruangan". Nilai bawaan `cc-view` **tetap `office`** |
| `frontend/src/styles.css` | +aturan berawalan `.oi3-` saja |
| `frontend/tsconfig.json` | file baru, cakupan hanya `src/officeIso3d` (untuk editor; tidak dipakai build) |

**`package.json` tidak berubah.** Tidak disentuh: seluruh `backend/`, `src/office3d/`, logika job, ID agent, definisi status, endpoint, `vite.config.js`.

### 5.2 Alur data

```
CommandCenter.jsx ──(satu-satunya poll, 5 dtk)──> data
     ├─ deriveScene(data)                       [ada, tidak diubah]
     └─ <OfficeIso3d data scene selected onSelect onSelectRoom onFail />
            ├─ viewState(data, scene, prev)     keadaan target per entitas (murni)
            └─ adegan R3F: tiap frame bergerak dari keadaan tampil → keadaan target lewat ref
```

React hanya me-render ulang saat `data` baru tiba (tiap 5 dtk). Gerak per-frame berjalan di `useFrame` lewat `ref`, tanpa `setState`.

---

## 6. Arsitektur animasi karakter

### 6.1 Lapisan

| Lapisan | Tugas | Sifat |
|---|---|---|
| 1. Adapter | Data asli → **keadaan target** tiap karyawan/unit AI | Fungsi murni, diuji |
| 2. Mesin keadaan | Prioritas, durasi minimum per keadaan (anti-kedip), transisi yang sah | Fungsi murni, diuji |
| 3. Lokomosi | Posisi & arah hadap di sepanjang jalur, berbasis waktu | Per-frame |
| 4. Klip animasi | `AnimationMixer`: crossfade antar klip (±0,25 dtk) | Per-frame |
| 5. Indikator | Ikon/gelembung di atas kepala, layar monitor menyala, label tahap + progres | Mengikuti keadaan |

### 6.2 Keadaan karyawan ← data asli

Setiap keadaan harus bisa ditunjuk sumber datanya. Tidak ada animasi kerja/selesai tanpa event asli.

| Animasi | Syarat | Sumber |
|---|---|---|
| **Typing** | Agent layanan dengan entri di `inflight[]` (panggilan sedang dieksekusi) | `inflight[].agent` |
| **Working** | Agent job dengan job aktif; label menampilkan `stage` + `progress` | `running[]` |
| **Waiting** | Agent job yang job-nya sedang menunggu layanan lain (`inflight[].job` = id job itu, bukan LLM) | `inflight[].job` |
| **Walking** | Perjalanan dari `deriveScene`: tanya AI atau serah terima antar-ruangan | `scene.trips[]` |
| **Meeting** | Sudah tiba di unit AI yang dipanggil, dan panggilan LLM untuk job-nya masih berjalan | `inflight[]` agent `llm:*` + `job` |
| **Completed** | Event baru `status: done` milik agent itu, umur ≤ 15 dtk, belum pernah ditampilkan. Diputar sekali | `log[]` |
| **Error** | `scene_health = error` (menetap) atau event baru `status: error` (sekali). `warning` → indikator kuning | `agents[]`, `log[]` |
| **Sitting** | Tidak sibuk, `health = ok` | `agents[].health` |
| **Idle** | Tidak sibuk, `health = idle` (belum ada tugas di rentang waktu) | `agents[].health` |

Prioritas: Error (sekali) → Walking → Meeting → Typing → Waiting → Working → Completed → Sitting → Idle.

### 6.3 Keadaan unit AI

| Keadaan | Syarat | Tampilan |
|---|---|---|
| Aktif | Ada `inflight[]` untuk `llm:<provider>` itu | Berdenyut terang, cincin berputar |
| Baru selesai | Event `done` ≤ 15 dtk | Kilat singkat, sekali |
| Bermasalah | `scene_health` = `error`/`warning` | Merah/kuning |
| Siaga | Selain itu | Cahaya redup tetap |

### 6.4 Interpolasi antar-poll (keputusan pemilik #6)

Data berubah tiap 5 detik; layar digambar hingga 30 kali per detik. Interpolasi mengisi celah itu dengan aturan:

- **Hanya menghaluskan menuju data terakhir yang diterima; tidak pernah menebak ke depan.** Contoh: progres 40% → 55% digeser halus selama ±1 dtk, lalu berhenti di 55% sampai poll berikutnya. Bilah progres tidak maju sendiri.
- Perjalanan: posisi dihitung dari waktu mulai perjalanan dengan percepatan/perlambatan halus dan putaran badan bertahap.
- Pergantian keadaan: crossfade klip + durasi minimum (mis. Typing minimal 1,5 dtk) supaya tidak berkedip saat panggilan sangat singkat.
- Tab kembali terlihat setelah lama tersembunyi: langsung lompat ke keadaan terbaru, tidak memutar ulang kejadian lama.
- Backend terputus: karakter kembali ke pose netral di tempat + lencana "Terputus, menampilkan data terakhir". Tidak terus beranimasi kerja.

**Label kejujuran di layar**: keterangan kecil "Data diperbarui tiap 5 detik". Kata "real-time" tidak dipakai di UI maupun dokumen. Keterlambatan sampai 5 detik adalah sifat sumber data, dan panggilan yang lebih singkat dari itu baru terlihat setelah selesai.

### 6.5 Rig & klip bersama

- **Satu kerangka (rig) untuk semua karyawan**, satu set klip animasi dipakai bersama. Menambah karakter tidak menambah animasi.
- Klip yang dibutuhkan: idle, walk, sit, typing, working, waiting, meeting (berdiri bicara), completed (selebrasi singkat), error (bingung).
- Variasi identitas lewat manifest: bentuk rambut, warna pakaian/kulit, aksesori. Tabel tetap berkunci `agentId`; tidak ada pengacakan saat muat ulang.

---

## 7. Asset pipeline hybrid (keputusan pemilik #3)

### 7.1 Komponen

| Jenis | Bentuk | Catatan |
|---|---|---|
| Lingkungan modular | Potongan lantai, dinding, partisi kaca, pintu, kusen dalam satuan grid tetap | Disusun dari `officeMap.ts`; mengubah denah = mengubah data |
| Furnitur modular | Meja, kursi, monitor, meja rapat, sofa, rak, tanaman, lampu | Tiap jenis dimuat sekali, digandakan dengan instancing |
| Karakter | Satu tubuh ber-rig + bagian tukar-pasang | Lihat §6.5 |
| Animasi | Satu file klip untuk rig bersama | Dimuat sekali |
| Unit AI | Model perangkat sederhana + material emissive | Tanpa rig |

### 7.2 Alur

1. **Pilih sumber.** Kandidat yang akan diperiksa lebih dulu: paket low-poly berlisensi CC0 (Kenney, Quaternius, KayKit). Pilihan gaya menunggu gambar referensi _[menunggu referensi]_.
2. **Verifikasi lisensi per paket, bukan per situs.** Baca berkas lisensi di dalam unduhan; catat di `LICENSES.md`: nama aset, pembuat, lisensi, tautan, tanggal unduh, salinan teks lisensi. Aset tanpa lisensi yang jelas **tidak dipakai**. Daftar ini saya serahkan ke pemilik untuk disetujui sebelum aset masuk proyek.
3. **Normalisasi**: skala (1 unit = 1 meter), titik tumpu di lantai, arah hadap seragam, penamaan konsisten.
4. **Optimasi**: gabung material ke satu atlas/palet warna, kompresi geometri, perkecil tekstur.
5. **Daftarkan** di `manifest/assets.ts`.
6. **Validasi otomatis** (`validate-assets.mjs`): semua file di manifest ada, semua klip animasi ada di rig, anggaran segitiga/tekstur tidak terlampaui.

Yang hybrid: lingkungan dan furnitur dari paket siap pakai; karakter dari satu rig bersama dengan variasi lewat data; denah, penempatan, dan unit AI disusun/dibuat sendiri di kode.

### 7.3 Konsistensi visual

- Satu gaya (low-poly, palet terbatas) untuk semua aset; aset yang gayanya menyimpang ditolak walau lisensinya bebas.
- Satu material/atlas bersama sebisa mungkin: konsisten sekaligus hemat draw call.
- Aset hilang/gagal dimuat → bentuk pengganti sederhana berwarna + peringatan di konsol; halaman tidak crash.

### 7.4 Menambah karakter baru

Satu entri di `employees.ts` (agentId, variasi, meja) + satu titik meja di `officeMap.ts`. Tanpa model atau animasi baru.

### 7.5 Risiko yang harus dibuktikan di P2/P4

- Belum tentu ada **satu** paket bebas lisensi yang memuat kesembilan klip (terutama typing sambil duduk dan "meeting"). Cadangan: klip dari paket lain yang kerangkanya cocok, atau klip sederhana yang dibuat sendiri. Bila sebuah klip belum ada, keadaan itu memakai klip terdekat + indikator ikon, dan hal itu dilaporkan, tidak disamarkan.
- Kesesuaian gaya dengan referensi baru bisa dinilai setelah gambar diterima.

---

## 8. Arsitektur adegan kantor

```
OfficeRoot
 ├─ Lighting          hemisphere + 1 directional (bayangan) + lampu hangat emissive
 ├─ Environment       lantai, dinding rendah, partisi kaca, lorong   [statis, instanced]
 ├─ Rooms[6]          anchor per ruangan: meja, pintu, titik label, titik rapat
 │    └─ Furniture    meja + monitor + kursi per penghuni; dekorasi  [statis, instanced]
 ├─ Employees[14]     karakter ber-rig                               [dinamis]
 ├─ AiUnits[4+]       di ruangan Otak AI                             [dinamis ringan]
 ├─ RoomLabels[6]     nama, penghuni, aktif, beban kerja
 └─ CameraRig         ortografik isometrik
```

- **"3D Isometrik"** = adegan 3D penuh yang dilihat dengan kamera ortografik pada sudut isometrik (bukan gambar 2D).
- **Denah**: 6 ruangan mengikuti `layout.js` (2 baris × 3, lorong di tengah) supaya departemen dan penghuni sama dengan data yang ada. Detail interior _[menunggu referensi]_.
- **Tata ruang sebagai data** (`officeMap.ts`): grid modul + daftar titik (meja, pintu, simpul jalur). Jalur berjalan = graf simpul sederhana (meja → pintu → lorong → tujuan), cukup untuk denah tetap.
- **Label departemen**: nama, jumlah penghuni, jumlah aktif (`scene.rooms[].activeCount`), beban kerja (job berjalan + jumlah tugas di rentang waktu dari `agents[].total`). Semua dari data asli.
- **Kamera**: zoom dengan batas, geser dengan batas, klik ruangan → kamera meluncur fokus ke ruangan, tombol "Atur ulang tampilan". Rotasi dikunci supaya sudut isometrik terjaga.
- **Interaksi**:
  - Klik karyawan/unit AI → sorot + panel **Detail agent yang sudah ada** (status, statistik, error terakhir, riwayat `log`).
  - Klik ruangan → sorot ruangan + panel "Detail ruangan" (daftar penghuni, beban kerja).
- **Pencahayaan**: suasana hangat di dalam, latar gelap di luar. Lampu hangat dibuat dari material emissive, bukan banyak lampu dinamis (§9).

---

## 9. Strategi performa GPU

Laptop pemilik (RTX 4060) pernah mati saat beban GPU tinggi, dan GPU yang sama dipakai ComfyUI/TTS saat produksi. Target: **tidak lebih berat daripada tampilan Kantor sekarang**, walau modelnya lebih detail.

### 9.1 Anggaran (diukur di P2, ditegakkan di P7)

| Ukuran | Batas awal |
|---|---|
| Draw call per frame | ≤ 150 |
| Segitiga terlihat | ≤ 200 ribu |
| Memori tekstur | ≤ 64 MB |
| Shadow map | 1 buah, 1024 px |
| Lampu dinamis | 1 directional + ambient/hemisphere |
| Rasio piksel (DPR) | maks 1,5 |
| FPS | 30 saat ada aktivitas · ±6–10 saat sepi · 0 saat tab tersembunyi |

Angka ini titik awal; nilai akhirnya ditetapkan dari hasil ukur P2 dibanding tampilan lama.

### 9.2 Teknik

| Masalah | Cara |
|---|---|
| Banyak benda sama | Instancing untuk furnitur dan modul dinding/lantai |
| Banyak material | Satu atlas/palet bersama |
| Bayangan mahal | Bayangan benda statis digambar sekali lalu dibekukan; karakter memakai bayangan bulat sederhana di lantai |
| Banyak lampu | Lampu hias = emissive; tanpa point light dinamis |
| Efek pasca-proses | Mati secara bawaan; bloom hanya di tingkat kualitas "Tinggi" |
| Karakter ber-rig | Mixer animasi karakter yang diam diperbarui jarang; karakter di luar layar dilewati |
| Render sia-sia | `frameloop="demand"` + pengatur FPS (pola yang sudah ada); berhenti total saat tab tersembunyi |
| Dua kanvas sekaligus | Hanya satu tampilan 3D yang hidup; pindah tab melepas kanvas dan membuang geometri/tekstur |
| Muatan awal | Modul + aset dimuat hanya saat tab "3D Isometrik" dibuka |
| GPU sedang dipakai produksi | Tingkat kualitas turun otomatis bila waktu per-frame memburuk; pilihan manual Hemat / Seimbang / Tinggi |

### 9.3 Pengukuran

`renderer.info` (draw call, segitiga, tekstur), waktu per-frame, dan pemakaian GPU dari `nvidia-smi` selama 5 menit: sepi, mode demo, dan satu job nyata. Dibandingkan dengan tampilan Kantor lama pada kondisi sama. Hasil dilaporkan dalam angka.

---

## 10. Penilaian kompatibilitas

| Hal | Hasil | Dasar |
|---|---|---|
| Tumpukan 3D | Kompatibel | Kombinasi three/R3F/drei yang sama sudah berjalan di tampilan Kantor |
| Pemuat glTF | Tersedia | `useGLTF` (drei) + `three-stdlib`; `meshoptimizer` ada di `node_modules` |
| TypeScript di build | **Didukung tanpa perubahan konfigurasi** | Diuji 15 Nov: esbuild 0.21.5 milik Vite mengompilasi sintaks `.tsx`. Vite dan vitest memproses `.ts/.tsx` secara bawaan |
| Pengecekan tipe | Tidak ada di build | Paket `typescript` tidak terpasang, jadi build tidak memeriksa tipe; hanya editor (VS Code) yang memeriksa. `@types/three` sudah ada. Menambah `typescript` sebagai dev-dependency = opsional, perlu izin pemilik |
| Bila `.tsx` ternyata bermasalah di build nyata | Cadangan: modul ditulis `.jsx` + JSDoc | Dibuktikan di langkah pertama P2 |
| Routing & halaman | Tidak berubah | Tab baru di dalam `/command-center` |
| `localStorage` `cc-view` | Nilai baru `iso3d`; bawaan tetap `office` | §13.3 mengatur pemulihan bila tampilan baru gagal |
| Backend / API | Tidak berubah | — |
| Browser | Perlu WebGL2 | Bila tidak ada: tab tetap tampil dengan pesan + tampilan lama tetap bisa dipakai |
| Tes yang ada | Tidak terpengaruh | Modul baru punya tes sendiri; 23 tes lama harus tetap lulus |
| Penyajian | `frontend/dist` disajikan backend di `127.0.0.1:8000` | Setiap build menimpa `dist`; karena itu `dist` ikut dibackup (§13) |
| Kontrol versi | Proyek bukan repo git | Rollback mengandalkan folder backup (§13) |

---

## 11. Fase & kriteria

Setiap fase berhenti untuk divalidasi pemilik. Saya tidak menyatakan PASS sendiri.

| Fase | Hasil |
|---|---|
| **P1** | Dokumen ini (revisi 2) |
| **P2** Prototipe | Lihat §12 |
| **P3** Lingkungan kantor | 6 ruangan modular lengkap, pencahayaan, kamera |
| **P4** Karakter & animasi | 14 karyawan + unit AI, 9 animasi, identitas tetap |
| **P5** Integrasi data | Adapter + interpolasi + tes; diuji dengan satu job nyata |
| **P6** Interaksi | Klik karakter/unit/ruangan → panel |
| **P7** Performa & stabilitas | Pengukuran §9.3, aset hilang, backend terputus, WebGL hilang |

---

## 12. Kriteria penerimaan prototipe P2

Tujuan P2: membuktikan **jalur teknis**, bukan keindahan. Lingkup: satu ruangan uji dengan satu meja modular, satu karakter ber-rig dengan dua klip (idle, walk), satu unit AI, kamera isometrik.

**Fungsi**
1. Tab "3D Isometrik" muncul di samping Kantor / Balok / Tabel.
2. Tampilan bawaan tetap "Kantor" pada browser yang belum pernah memilih tab.
3. Kantor, Balok, dan Tabel berfungsi persis seperti sebelumnya (dibandingkan tangkapan layar sebelum/sesudah).
4. Ruangan uji tampil dengan model glTF (bukan primitif), kamera isometrik bisa zoom, geser, dan diatur ulang.
5. Karakter memutar klip idle, lalu berjalan di satu jalur dengan crossfade halus saat dipicu **mode demo**.
6. Klik karakter membuka panel Detail agent yang sudah ada.

**Teknis**
7. `package.json` tidak berubah; tidak ada dependensi baru.
8. File `.tsx` di modul baru terkompilasi oleh `vite build` tanpa mengubah `vite.config.js`. Bila gagal: dilaporkan dan beralih ke `.jsx`.
9. Modul dan aset baru dimuat **hanya** saat tab dibuka (dibuktikan di tab Network).
10. Pindah tab/halaman melepas kanvas: tidak ada loop render tersisa, memori GPU kembali.
11. Tab browser tersembunyi → render berhenti.
12. Tidak ada permintaan jaringan tambahan ke `/api/command-center` (tetap satu poll per 5 dtk).
13. Aset sengaja dihapus → bentuk pengganti tampil, halaman tidak crash.
14. WebGL dimatikan → pesan jelas, tampilan lain tetap bisa dipakai.
15. 23 tes lama lulus + tes baru untuk adapter/mesin keadaan lulus.

**Performa (angka dilaporkan, dibanding tampilan Kantor lama)**
16. Draw call, segitiga, memori tekstur, waktu per-frame, dan pemakaian GPU untuk adegan uji.
17. Ukuran chunk baru dan total aset yang diunduh.

**Aset**
18. `LICENSES.md` terisi untuk setiap aset yang dipakai, dan daftarnya sudah disetujui pemilik sebelum aset dimasukkan.

**Yang divalidasi pemilik di P2**: tab terbuka, tidak ada yang rusak, gaya model uji searah dengan referensi, laptop tidak memanas.

---

## 13. Strategi rollback & pemulihan

### 13.1 Sebelum mengubah apa pun (awal P2 dan awal tiap fase)

Buat `backup-office-iso3d-<tanggal>/` berisi salinan:
- `frontend/src/pages/CommandCenter.jsx`
- `frontend/src/styles.css`
- `frontend/dist/` (hasil build yang sedang disajikan)

Semua kode dan aset baru berada di folder yang sebelumnya tidak ada, jadi tidak perlu dibackup.

### 13.2 Rollback penuh (kembali ke kondisi sebelum proyek ini)

1. Kembalikan `CommandCenter.jsx` dan `styles.css` dari backup.
2. Hapus `frontend/src/officeIso3d/`, `frontend/public/office-iso3d/`, `frontend/tools/office-iso3d/`, `frontend/tsconfig.json`.
3. Kembalikan `frontend/dist/` dari backup (atau `npm run build`).
4. Jalankan tes; buka `/command-center` dan periksa tiga tampilan lama.

Backend tidak pernah disentuh, jadi tidak ada langkah rollback di sana. Rollback per fase memakai backup fase itu dengan cara yang sama.

### 13.3 Pemulihan saat berjalan (tanpa campur tangan pemilik)

| Kegagalan | Perilaku |
|---|---|
| File modul gagal dimuat (mis. tab lama setelah build ulang) | Penangkap error menampilkan pesan dan mengembalikan ke tampilan "Kantor" |
| Tampilan baru crash saat render | Sama; `cc-view` di `localStorage` **dikembalikan ke `office`** supaya halaman tidak terjebak di tampilan rusak setiap dibuka |
| Konteks WebGL hilang (GPU direbut ComfyUI) | Kanvas dilepas, pesan ditampilkan, tombol "Coba lagi"; panel data tetap jalan |
| Aset gagal dimuat | Bentuk pengganti per aset; adegan tetap tampil |
| Backend terputus | Lencana "Terputus, menampilkan data terakhir"; karakter berhenti di pose netral |
| Performa memburuk | Kualitas turun otomatis; bila masih buruk, saran pindah ke tampilan Tabel |

Kegagalan di tampilan baru tidak boleh memengaruhi panel Detail agent, Alert, Task log, atau tampilan lama.

### 13.4 Menjadikan tampilan baru sebagai bawaan

Hanya setelah pemilik menyatakan P7 lulus, dan itu perubahan satu baris yang terpisah serta bisa dibatalkan.

---

## 14. Yang masih dibutuhkan dari pemilik

1. **Persetujuan revisi ini** sebelum P2 dimulai.
2. **Gambar referensi visual** (menentukan gaya aset di §7 dan interior di §8).
3. Opsional: izin menambah `typescript` sebagai dev-dependency untuk pengecekan tipe otomatis. Tanpa ini pun modul bisa dibangun; `package.json` tetap tidak berubah.

---

## 15. Adendum 15 Nov 2026 — keputusan pemilik: prioritas kualitas visual

Keputusan pemilik setelah P2 dibangun (tidak mengubah lingkup P2 dan **bukan** izin memulai P3):

1. Prioritas utama: kualitas visual 3D yang profesional dan immersive.
2. Karakter dengan rigging dan animasi berkualitas.
3. Detail lingkungan, furnitur, material, pencahayaan, dan bayangan ditingkatkan.
4. Optimasi mengikuti kebutuhan kualitas, bukan dengan membuang detail.
5. Profiling dan optimasi teknis tetap dilakukan agar aplikasi stabil.
6. Backend dan arsitektur agent tidak diubah.
7. Aktivitas agent tidak boleh dikarang.

Bagian spesifikasi yang **tidak lagi berlaku apa adanya** dan harus diusulkan ulang sebelum P3:

| Bagian | Isi lama | Status |
|---|---|---|
| §9 pembuka | Target "tidak lebih berat daripada tampilan Kantor sekarang" | Diganti: target kualitas dulu, performa diukur dan dijaga stabil |
| §9.1 | Anggaran: ≤150 draw call, ≤200 ribu segitiga, ≤64 MB tekstur, 1 shadow map 1024 px, 1 lampu, DPR 1,5 | Perlu angka baru berdasarkan target kualitas |
| §9.2 | Efek pasca-proses mati secara bawaan; bayangan karakter berupa lingkaran sederhana; tanpa lampu dinamis | Perlu ditinjau ulang |
| §7.1–7.3 | Gaya low-poly palet terbatas; satu rig sederhana | Perlu ditinjau ulang; paket karakter P2 (7 sendi) kemungkinan tidak memenuhi "rigging berkualitas" |

Yang tetap berlaku: additive-only, §3 (14 karyawan + unit AI), §6.2–6.4 (keadaan hanya dari data asli, polling 5 detik,
tanpa klaim real-time), §13 (rollback), render berhenti saat tab tersembunyi, pemulihan saat konteks WebGL hilang,
dan validasi pemilik di tiap fase.

---

## 16. Adendum 15 Nov 2026 — aturan gerak karakter (revisi validasi P2)

Menggantikan baris **Walking** dan **Meeting** di §6.2 serta butir "Perjalanan" di §6.4:

- Modul baru **tidak lagi memakai** `scene.trips[]` dari `deriveScene()` (perjalanan berdurasi tetap 9 detik).
- Karakter menuju unit AI **hanya selama** `inflight[]` berisi panggilan `llm:<provider>` milik job-nya, dan hanya ke unit
  model itu. Ia menetap di sana selama panggilan masih ada dan pulang begitu panggilan hilang; perubahan data di tengah
  jalan membuatnya berbalik dari posisinya saat itu.
- Panggilan yang sudah selesai (hanya ada di `log[]`) tidak diputar ulang sebagai gerak.
- Backend terputus: karakter berhenti di tempat.
- Tidak ada timer yang menentukan status; yang berbasis waktu hanyalah kecepatan berjalan.

Batas laju frame (§9.1) untuk prototipe: 30 saat sepi dan 60 saat aktif (nominal), digambar tiap N penyegaran layar.
