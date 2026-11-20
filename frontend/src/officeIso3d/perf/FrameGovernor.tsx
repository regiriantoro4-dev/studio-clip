// Pengatur laju render + pengukur. Kanvas memakai frameloop="demand": tidak ada frame yang digambar kecuali
// diminta di sini. Tab tersembunyi -> berhenti total.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

// Laju render. Karakter selalu beranimasi (napas saat duduk), jadi "sepi" bukan berarti gambar diam:
// laju sepi menentukan kehalusan animasi napas, laju aktif menentukan kehalusan berjalan/mengetik.
// Bisa ditimpa untuk pengukuran: ?oi3fps=<sepi>,<aktif>  (mis. ?oi3fps=8,30)
export const FPS_ACTIVE = 60
export const FPS_IDLE = 30

export function fpsCaps(): { idle: number; active: number } {
  try {
    const raw = new URLSearchParams(window.location.search).get('oi3fps')
    const [i, a] = (raw ?? '').split(',').map(Number)
    if (i > 0 && a > 0) return { idle: Math.min(240, i), active: Math.min(240, a) }
  } catch { /* abaikan */ }
  return { idle: FPS_IDLE, active: FPS_ACTIVE }
}

export interface Oi3Stats {
  fpsTarget: number    // batas yang diminta
  displayHz: number    // laju penyegaran layar terukur
  divisor: number      // menggambar tiap N penyegaran layar
  fps: number          // 1000 / rata-rata jarak antar-frame dalam 1 detik terakhir
  frameMs: number      // rata-rata jarak antar-frame (ms)
  frameMsMax: number   // jarak antar-frame terpanjang dalam 1 detik terakhir (ms)
  cpuMs: number        // rata-rata waktu CPU untuk satu frame (useFrame + render), ms
  calls: number        // draw call per frame
  triangles: number
  geometries: number
  textures: number
  frames: number       // total frame sejak kanvas dibuat
  hidden: boolean
}

/** Dari laju layar & batas fps -> gambar tiap N penyegaran layar (N bulat, supaya jarak antar-frame rata). */
export function frameDivisor(displayHz: number, cap: number): number {
  if (!(displayHz > 0) || !(cap > 0)) return 1
  return Math.max(1, Math.round(displayHz / cap))
}

const pace = { hz: 0, divisor: 1 }

/**
 * Meminta frame lewat requestAnimationFrame, selaras dengan penyegaran layar.
 * Laju layar diukur dulu (median 30 jarak rAF pertama), lalu frame digambar tiap N penyegaran: jarak antar-frame
 * selalu kelipatan bulat dari penyegaran layar, jadi gerak tidak tersendat. Versi awal memakai setInterval yang
 * tidak selaras dengan layar. Tab tersembunyi: rAF berhenti sendiri, dan loop ini juga dihentikan eksplisit.
 */
export function FrameGovernor({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let raf = 0
    let prev = 0
    let n = 0
    const deltas: number[] = []
    const tick = (t: number) => {
      if (prev && pace.hz === 0) {
        deltas.push(t - prev)
        if (deltas.length >= 30) {
          const sorted = [...deltas].sort((x, y) => x - y)
          pace.hz = 1000 / sorted[Math.floor(sorted.length / 2)]
        }
      }
      prev = t
      pace.divisor = pace.hz ? frameDivisor(pace.hz, fps) : 1
      if (n % pace.divisor === 0) invalidate()
      n += 1
      raf = requestAnimationFrame(tick)
    }
    const start = () => { if (!raf) { prev = 0; raf = requestAnimationFrame(tick) } }
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
    const sync = () => (document.hidden ? stop() : start())
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { stop(); document.removeEventListener('visibilitychange', sync) }
  }, [invalidate, fps])
  return null
}

/** Menulis angka ke window.__oi3stats (dibaca overlay "Statistik" dan skrip uji). Tanpa state React. */
export function StatsProbe({ fps }: { fps: number }) {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ last: 0, stamps: [] as number[], frames: 0, t0: 0, cpu: [] as number[] })
  // Catatan: useFrame berprioritas > 0 mengambil alih render R3F, jadi keduanya memakai prioritas <= 0.
  // gl.info dibaca di awal frame berikutnya = angka frame yang baru saja digambar.
  useEffect(() => {
    const prev = gl.info.autoReset
    gl.info.autoReset = true
    return () => { gl.info.autoReset = prev }
  }, [gl])
  useFrame(() => {
    const a = acc.current
    const now = performance.now()
    a.t0 = now
    a.frames++
    a.stamps.push(now)
    while (a.stamps.length && now - a.stamps[0] > 1000) a.stamps.shift()
    queueMicrotask(() => {
      a.cpu.push(performance.now() - a.t0)
      if (a.cpu.length > 60) a.cpu.shift()
    })
    const gaps = a.stamps.slice(1).map((t, i) => t - a.stamps[i])
    const stats: Oi3Stats = {
      fpsTarget: fps,
      displayHz: pace.hz,
      divisor: pace.divisor,
      fps: gaps.length ? 1000 / (gaps.reduce((s, v) => s + v, 0) / gaps.length) : 0,
      frameMs: gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0,
      frameMsMax: gaps.length ? Math.max(...gaps) : 0,
      cpuMs: a.cpu.length ? a.cpu.reduce((s, v) => s + v, 0) / a.cpu.length : 0,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      frames: a.frames,
      hidden: document.hidden,
    }
    ;(window as unknown as { __oi3stats?: Oi3Stats }).__oi3stats = stats
  }, -1000)
  return null
}
