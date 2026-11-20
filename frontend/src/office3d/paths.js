// Jalur berjalan antar-ruangan: pintu asal -> lorong -> pintu tujuan (tidak menembus dinding).
import { corridorPoint, doorOf } from './geometry.js'

export function pathBetween(fromRoom, toRoom) {
  if (fromRoom === toRoom) return []
  return [doorOf(fromRoom), corridorPoint(fromRoom), corridorPoint(toRoom), doorOf(toRoom)]
}

// Posisi di sepanjang polyline pada jarak `dist` (dipakai animasi berjalan). Mengembalikan [x, z, arah].
export function pointAlong(points, dist) {
  if (!points.length) return null
  let left = Math.max(0, dist)
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]
    const [bx, bz] = points[i]
    const seg = Math.hypot(bx - ax, bz - az)
    if (left <= seg && seg > 0) {
      const k = left / seg
      return [ax + (bx - ax) * k, az + (bz - az) * k, Math.atan2(bx - ax, bz - az)]
    }
    left -= seg
  }
  const [lx, lz] = points[points.length - 1]
  const [px, pz] = points[points.length - 2] || points[points.length - 1]
  return [lx, lz, Math.atan2(lx - px, lz - pz)]
}

export function pathLength(points) {
  return points.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - points[i][0], q[1] - points[i][1]), 0)
}
