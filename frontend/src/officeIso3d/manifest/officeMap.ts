// Tata ruang prototipe P2: SATU ruangan, satu meja kerja, satu unit AI. Semua posisi dalam satuan kit
// (1 petak lantai = 1 satuan). Sumbu: x ke kanan, z ke arah kamera; dinding ada di sisi x- dan z-.
import type { Vec2 } from '../anim/locomotion'

export const ROOM_TILES = 4                 // lantai 4×4 petak
export const ROOM_MIN = -ROOM_TILES / 2     // -2
export const ROOM_COLOR = '#5b7fd6'         // warna lantai ruangan uji
export const WALL_COLOR = '#3d5fb8'

// Meja kerja: karyawan duduk di sisi +z meja, menghadap -z (monitor di depannya) — sama dengan tampilan lama
export const DESK_POS: Vec2 = [-0.85, -0.55]
export const SEAT: Vec2 = [-0.85, 0.02]
export const SEAT_FACING = Math.PI          // menghadap -z
export const SEAT_Y = 0.17                  // tinggi dudukan kursi (pose "sit" paket dibuat untuk duduk di lantai)

// Unit AI di sudut belakang-kanan; karyawan berhenti di depannya menghadap -z
export const AI_UNIT_POS: Vec2 = [1.05, -1.2]

// Jalur menemui unit AI: kursi -> keluar ke samping -> lorong ruangan -> depan unit
export const ROUTE_TO_AI: Vec2[] = [SEAT, [-0.25, 0.3], [0.2, 0.7], [0.55, 0.35], [0.5, -0.5]]
// di depan unit, karyawan menghadap ke unit
export const AI_FACING = Math.atan2(AI_UNIT_POS[0] - 0.5, AI_UNIT_POS[1] - -0.5)

export const CAMERA_TARGET: [number, number, number] = [0, 0.35, 0]
export const PAN_LIMIT = 3                  // batas geser kamera dari pusat ruangan
