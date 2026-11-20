# Lisensi aset — tab "3D Isometrik"

Status: **menunggu persetujuan pemilik**. Daftar ini dibuat saat prototipe P2 (15 November 2026).
Teks lisensi asli dari tiap paket disalin apa adanya ke folder `licenses/`.

| Paket | Pembuat | Lisensi | Sumber | Diunduh | Berkas lisensi |
|---|---|---|---|---|---|
| Mini Characters (2.0) | Kenney (www.kenney.nl) | Creative Commons Zero (CC0 1.0) | https://kenney.nl/assets/mini-characters | 15 Nov 2026 | `licenses/kenney-mini-characters-License.txt` |
| Furniture Kit (2.0) | Kenney (www.kenney.nl) | Creative Commons Zero (CC0 1.0) | https://kenney.nl/assets/furniture-kit | 15 Nov 2026 | `licenses/kenney-furniture-kit-License.txt` |

CC0: boleh dipakai untuk keperluan pribadi, pendidikan, dan komersial. Mencantumkan nama "Kenney" tidak wajib.

## Berkas yang dipakai

Dari **Mini Characters** (tanpa diubah):
- `characters/character-male-a.glb` — model karakter ber-rig (7 sendi) + 32 klip animasi bawaan
- `characters/Textures/colormap.png` — palet warna bersama untuk semua karakter di paket

Dari **Furniture Kit** (tanpa diubah):
- `furniture/floorFull.glb`
- `furniture/wall.glb`
- `furniture/wallWindow.glb`
- `furniture/desk.glb`
- `furniture/chairDesk.glb`
- `furniture/computerScreen.glb`
- `furniture/computerKeyboard.glb`
- `furniture/pottedPlant.glb`
- `furniture/rugRectangle.glb`

## Yang dibuat sendiri (bukan dari paket)

- Unit model AI: disusun dari bentuk dasar di kode (`src/officeIso3d/scene/AiUnit.tsx`).
- Klip animasi `working` (mengetik sambil duduk) dan `seated-idle`: disusun di kode dari pose/klip bawaan paket
  (`src/officeIso3d/anim/clips.ts`). Paket tidak menyediakan klip mengetik sambil duduk.
- Material: model Furniture Kit memakai material tanpa pencahayaan; saat dimuat diganti material standar dengan
  warna yang sama supaya ikut cahaya dan bayangan. File model tidak diubah.
