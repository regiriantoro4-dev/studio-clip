// Klip animasi karyawan.
//   idle (berdiri)  : klip "idle" dari paket, apa adanya
//   walk            : klip "walk" dari paket, apa adanya
//   seated-idle     : GABUNGAN klip paket — kaki & pinggul dari "sit", badan/lengan/kepala dari "idle"
//   working         : DIBUAT DI KODE — kaki & pinggul dari "sit", lengan mengetik + kepala mengangguk
// Paket tidak punya klip mengetik sambil duduk; itu sebabnya "working" dibuat sendiri (dicatat di laporan P2).
import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three'
import type { KeyframeTrack } from 'three'
import { PACK_CLIPS } from '../manifest/assets'

export type ClipName = 'idle' | 'walk' | 'seated-idle' | 'working'

const LOWER = ['root.', 'leg-left.', 'leg-right.']
const isLower = (t: KeyframeTrack) => LOWER.some((p) => t.name.startsWith(p))
const X = new Vector3(1, 0, 0)

function firstQuat(clip: AnimationClip, node: string, fallback: [number, number, number, number]): Quaternion {
  const t = clip.tracks.find((x) => x.name === `${node}.quaternion`)
  const v = t ? Array.from(t.values.slice(0, 4)) : fallback
  return new Quaternion(v[0], v[1], v[2], v[3])
}

// Lengan: pose istirahat diputar ke depan (sumbu X induk), naik-turun kecil bergantian = mengetik
function typingArm(node: string, rest: Quaternion, phase: number, dur: number, cycles: number): QuaternionKeyframeTrack {
  const steps = 8 * cycles
  const times: number[] = []
  const values: number[] = []
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const angle = -1.15 + 0.16 * Math.sin((k * cycles + phase) * Math.PI * 2)
    const q = new Quaternion().setFromAxisAngle(X, angle).multiply(rest)
    times.push(k * dur)
    values.push(q.x, q.y, q.z, q.w)
  }
  return new QuaternionKeyframeTrack(`${node}.quaternion`, times, values)
}

function nod(node: string, base: number, amp: number, dur: number): QuaternionKeyframeTrack {
  const steps = 4
  const times: number[] = []
  const values: number[] = []
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const q = new Quaternion().setFromAxisAngle(X, base + amp * Math.sin(k * Math.PI * 2))
    times.push(k * dur)
    values.push(q.x, q.y, q.z, q.w)
  }
  return new QuaternionKeyframeTrack(`${node}.quaternion`, times, values)
}

/** Menyusun keempat klip dari animasi bawaan model. Melempar error bila klip paket tidak ada. */
export function buildClips(packClips: AnimationClip[]): Record<ClipName, AnimationClip> {
  const get = (name: string) => {
    const c = packClips.find((x) => x.name === name)
    if (!c) throw new Error(`Klip "${name}" tidak ada di model karakter`)
    return c
  }
  const idle = get(PACK_CLIPS.idle)
  const walk = get(PACK_CLIPS.walk)
  const sit = get(PACK_CLIPS.sit)
  const lower = sit.tracks.filter(isLower).map((t) => t.clone())

  const seatedIdle = new AnimationClip('seated-idle', idle.duration,
    [...lower.map((t) => t.clone()), ...idle.tracks.filter((t) => !isLower(t)).map((t) => t.clone())])

  const dur = 1.4
  const working = new AnimationClip('working', dur, [
    ...lower.map((t) => t.clone()),
    typingArm('arm-left', firstQuat(idle, 'arm-left', [0, 0, 0.383, -0.924]), 0, dur, 3),
    typingArm('arm-right', firstQuat(idle, 'arm-right', [0, 0, -0.383, -0.924]), 0.5, dur, 3),
    nod('torso', -0.1, 0.02, dur),
    nod('head', -0.12, 0.05, dur),
  ])
  return { idle, walk, 'seated-idle': seatedIdle, working }
}
