// Daftar aset prototipe P2. Sumber & lisensi tiap file: public/office-iso3d/LICENSES.md.
// Menambah aset = menambah entri di sini (+ baris di LICENSES.md); tools/office-iso3d/validate-assets.mjs
// memeriksa bahwa setiap file ada dan tidak melampaui anggaran.
const BASE = '/office-iso3d'

export const FURNITURE = {
  floor: `${BASE}/furniture/floorFull.glb`,
  wall: `${BASE}/furniture/wall.glb`,
  wallWindow: `${BASE}/furniture/wallWindow.glb`,
  desk: `${BASE}/furniture/desk.glb`,
  chair: `${BASE}/furniture/chairDesk.glb`,
  screen: `${BASE}/furniture/computerScreen.glb`,
  keyboard: `${BASE}/furniture/computerKeyboard.glb`,
  plant: `${BASE}/furniture/pottedPlant.glb`,
  rug: `${BASE}/furniture/rugRectangle.glb`,
} as const

// P2 hanya memakai SATU model karakter. Semua model di paket ini memakai kerangka & klip yang sama,
// jadi karakter berikutnya cukup menambah file model, bukan animasi.
export const CHARACTER_MODEL = `${BASE}/characters/character-male-a.glb`

// Klip dari paket yang dipakai (nama persis di dalam file .glb)
export const PACK_CLIPS = { idle: 'idle', walk: 'walk', sit: 'sit' } as const

// Anggaran P2 (dipakai validate-assets.mjs)
export const BUDGET = { maxTrianglesPerModel: 2000, maxFileKB: 400 }
