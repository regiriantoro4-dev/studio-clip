// Penghalus antar-poll. Aturan: hanya bergerak MENUJU nilai terakhir dari backend, tidak pernah melewatinya
// (tidak menebak ke depan). Data datang tiap 5 detik; ini bukan real-time.

/** Geser `shown` menuju `target` dengan kecepatan tetap; berhenti tepat di target. */
export function approach(shown: number, target: number, dtSec: number, perSec: number): number {
  const step = Math.max(0, dtSec) * perSec
  if (Math.abs(target - shown) <= step) return target
  return shown + Math.sign(target - shown) * step
}

/** Percepatan/perlambatan halus untuk 0..1 */
export function smooth(k: number): number {
  const t = Math.min(1, Math.max(0, k))
  return t * t * (3 - 2 * t)
}

/** Sudut terpendek dari `a` ke `b`, digeser paling banyak `maxStep` radian. */
export function turnToward(a: number, b: number, maxStep: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  if (Math.abs(d) <= maxStep) return b
  return a + Math.sign(d) * maxStep
}
