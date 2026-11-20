// Geometri kantor: posisi ruangan, meja, kursi, pintu. Dipakai Room (statis), Character & paths (gerak).
import { ROOMS } from './layout.js'

export const ROOM = 6          // ruangan 6×6
export const GAP = 1           // jarak antar-ruangan dalam satu baris
export const CORRIDOR = 2.4    // lebar lorong di antara dua baris
export const WALL_H = 0.7      // dinding rendah, terbuka ke kamera seperti referensi
export const MAX_DESKS = 6

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]))

export function roomCenter(roomId) {
  const r = byId[roomId]
  const x = (r.col - 1) * (ROOM + GAP)
  const z = (r.row === 0 ? -1 : 1) * (ROOM / 2 + CORRIDOR / 2)
  return [x, z]
}

// Pintu: sisi ruangan yang menghadap lorong (z = 0)
export function doorOf(roomId) {
  const [x, z] = roomCenter(roomId)
  return [x, z + (z < 0 ? ROOM / 2 : -ROOM / 2)]
}

// Titik di lorong tepat di depan pintu
export function corridorPoint(roomId) {
  const [x] = roomCenter(roomId)
  return [x, 0]
}

// Meja ke-slot dalam ruangan (grid 3×2). Karakter duduk di sisi +z meja, menghadap -z (monitor di depannya).
const DESK_X = [-1.9, 0, 1.9]
const DESK_Z = [-1.35, 1.15]

export function deskSlot(roomId, slot) {
  const [cx, cz] = roomCenter(roomId)
  if (roomId === 'brain') {
    // Otak AI: kursi melingkar menghadap inti di tengah
    const a = (slot / 4) * Math.PI * 2 + Math.PI / 4
    const sx = cx + Math.cos(a) * 1.9
    const sz = cz + Math.sin(a) * 1.9
    return { desk: null, seat: [sx, sz], facing: Math.atan2(cx - sx, cz - sz) }
  }
  const s = slot % MAX_DESKS
  const dx = cx + DESK_X[s % 3]
  const dz = cz + DESK_Z[Math.floor(s / 3)]
  return { desk: [dx, dz], seat: [dx, dz + 0.62], facing: Math.PI }
}
