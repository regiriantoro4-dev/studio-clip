// Mesin keadaan tampilan di meja: menahan keadaan sebentar supaya tidak berkedip saat panggilan sangat singkat.
// Keadaan yang ditampilkan selalu berasal dari keadaan target adapter (data asli); mesin ini hanya menunda
// pergantian idle <-> working. Masuk/keluar "consulting" tidak pernah ditunda: perubahan data langsung berlaku.
import type { EmployeeState } from '../adapter/types'

/** Durasi minimum (detik) sebuah keadaan ditampilkan sebelum boleh berganti. */
export const MIN_DWELL: Record<EmployeeState, number> = { idle: 0.4, working: 1.5, consulting: 0 }

export function nextState(shown: EmployeeState, target: EmployeeState, secInShown: number): EmployeeState {
  if (target === shown) return shown
  if (target === 'consulting' || shown === 'consulting') return target
  return secInShown >= MIN_DWELL[shown] ? target : shown
}
