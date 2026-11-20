// Gerak karyawan di jalur kursi <-> unit AI.
// TIDAK ADA jadwal/timer perjalanan: yang disimpan hanya "sudah sejauh apa di jalur" (dist). Tiap frame dist
// bergerak menuju TUJUAN yang ditentukan data terakhir (0 = kursi, panjang jalur = depan unit AI).
// Kalau data berubah di tengah jalan, tujuan berubah dan karakter berbalik dari posisinya saat itu.
import { pathLength, pointAlong } from '../../office3d/paths.js'

export type Vec2 = [number, number] // [x, z]
export interface RoutePose { x: number; z: number; heading: number }

export const WALK_SPEED = 1.5   // satuan per detik
const SLOW_ZONE = 0.35          // melambat menjelang tujuan
const MIN_FACTOR = 0.3

export function routeLength(route: Vec2[]): number {
  return pathLength(route) as number
}

/** Maju/mundur di jalur menuju `target`; berhenti tepat di target. Tidak bergantung pada waktu mutlak. */
export function stepAlong(dist: number, target: number, dtSec: number, speed: number = WALK_SPEED): number {
  const left = Math.abs(target - dist)
  if (left === 0) return target
  const v = speed * Math.max(MIN_FACTOR, Math.min(1, left / SLOW_ZONE))
  const step = v * Math.max(0, dtSec)
  return left <= step ? target : dist + Math.sign(target - dist) * step
}

/** Posisi & arah hadap di jarak `dist` sepanjang jalur. `forward` = sedang menuju ujung jalur. */
export function routePose(route: Vec2[], dist: number, forward: boolean): RoutePose {
  const p = pointAlong(route, dist) as [number, number, number]
  return { x: p[0], z: p[1], heading: forward ? p[2] : p[2] + Math.PI }
}
