// Satu karyawan: model ber-rig + animasi. Keadaan target datang dari adapter (data backend terakhir).
// Komponen ini TIDAK memutuskan status pekerjaan dan tidak memakai timer perjalanan: tiap frame ia hanya
// bergerak menuju tempat yang ditunjuk data terakhir (kursi, atau depan unit AI yang sedang dipanggil).
// Perubahan per-frame lewat ref, tanpa state React.
import { Html, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { AnimationMixer, LoopRepeat } from 'three'
import type { AnimationAction, AnimationClip, Group, Mesh, Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { approach, turnToward } from '../adapter/interpolate'
import type { EmployeeState, EmployeeView } from '../adapter/types'
import { buildClips } from '../anim/clips'
import type { ClipName } from '../anim/clips'
import { routeLength, routePose, stepAlong } from '../anim/locomotion'
import { nextState } from '../anim/stateMachine'
import { CHARACTER_MODEL } from '../manifest/assets'
import { AI_FACING, ROUTE_TO_AI, SEAT, SEAT_FACING, SEAT_Y } from '../manifest/officeMap'
import { releaseShared } from './Kit'

const FADE = 0.25 // detik crossfade antar klip
const ROUTE_LEN = routeLength(ROUTE_TO_AI)

/** go = menuju unit AI · at = di depan unit · back = kembali ke meja · hold = berhenti di tempat (backend terputus) */
export type MovePhase = 'seat' | 'go' | 'at' | 'back' | 'hold'
export interface EmployeeDebug { state: EmployeeState; shown: EmployeeState; clip: ClipName; phase: MovePhase; dist: number; x: number; z: number }

export default function Employee({ view, offline, unitLabel, selected, onSelect, onMoving }: {
  view: EmployeeView; offline: boolean; unitLabel: string; selected: boolean
  onSelect: (id: string) => void; onMoving?: (moving: boolean) => void
}) {
  const gltf = useGLTF(CHARACTER_MODEL) as unknown as { scene: Object3D; animations: AnimationClip[] }
  const model = useMemo(() => {
    const m = cloneSkinned(gltf.scene)
    m.traverse((o) => { if ((o as Mesh).isMesh) { o.frustumCulled = false; o.castShadow = false } })
    return m
  }, [gltf])
  const rig = useMemo(() => {
    const mixer = new AnimationMixer(model)
    const clips = buildClips(gltf.animations)
    const actions = {} as Record<ClipName, AnimationAction>
    for (const name of Object.keys(clips) as ClipName[]) {
      actions[name] = mixer.clipAction(clips[name])
      actions[name].setLoop(LoopRepeat, Infinity)
    }
    return { mixer, actions }
  }, [model, gltf])
  useEffect(() => () => {
    rig.mixer.stopAllAction()
    rig.mixer.uncacheRoot(model)
    // geometri/material/tekstur model berasal dari cache bersama: lepaskan ikatannya dengan renderer ini
    const shared: Parameters<typeof releaseShared>[0] = []
    model.traverse((o) => {
      const m = o as Mesh & { skeleton?: { dispose: () => void } }
      if (m.isMesh) { shared.push({ geometry: m.geometry, material: m.material }); m.skeleton?.dispose() }
    })
    releaseShared(shared)
  }, [rig, model])

  const group = useRef<Group>(null)
  const bar = useRef<HTMLElement>(null)
  const live = useRef({ view, offline, onMoving })
  live.current = { view, offline, onMoving }
  const st = useRef({
    shown: 'idle' as EmployeeState, since: 0, clip: null as ClipName | null, heading: SEAT_FACING, progress: 0,
    dist: 0,          // posisi di jalur: 0 = kursi, ROUTE_LEN = depan unit AI
    moving: false,
  })
  useEffect(() => () => { live.current.onMoving?.(false) }, [])

  useFrame((_, rawDt) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(rawDt, 0.25)
    const { view: v, offline: off } = live.current
    const s = st.current

    // keadaan di meja (idle <-> working) ditahan sebentar supaya tidak berkedip; consulting tidak pernah ditunda
    s.since += dt
    const next = nextState(s.shown, v.state, s.since)
    if (next !== s.shown) { s.shown = next; s.since = 0 }

    // TUJUAN dari data terakhir: depan unit AI hanya selama job-nya SEDANG memanggil model yang unitnya tampil.
    // Backend terputus -> tidak ada data untuk dijadikan tujuan -> berhenti di tempat.
    const goal = off ? s.dist : v.state === 'consulting' && v.goesToUnit ? ROUTE_LEN : 0
    const before = s.dist
    s.dist = stepAlong(s.dist, goal, dt)
    const moving = s.dist !== goal
    const forward = goal > before || (goal === before && before === ROUTE_LEN)

    let clip: ClipName
    let phase: MovePhase
    let x = SEAT[0], z = SEAT[1], y = SEAT_Y, heading = SEAT_FACING
    if (s.dist === 0) {
      phase = 'seat'
      clip = !off && s.shown === 'working' ? 'working' : 'seated-idle'
    } else {
      const pose = routePose(ROUTE_TO_AI, s.dist, forward)
      x = pose.x; z = pose.z; y = 0
      if (moving) { phase = forward ? 'go' : 'back'; clip = 'walk'; heading = pose.heading }
      else if (s.dist === ROUTE_LEN) { phase = off ? 'hold' : 'at'; clip = 'idle'; heading = AI_FACING }
      else { phase = 'hold'; clip = 'idle'; heading = s.heading }
    }

    if (clip !== s.clip) {
      const from = s.clip ? rig.actions[s.clip] : null
      const to = rig.actions[clip]
      to.reset().setEffectiveWeight(1).fadeIn(from ? FADE : 0).play()
      if (from) from.fadeOut(FADE)
      s.clip = clip
    }
    rig.mixer.update(dt)

    s.heading = turnToward(s.heading, heading, dt * 8)
    g.position.x = phase === 'seat' ? approach(g.position.x, x, dt, 3) : x
    g.position.z = phase === 'seat' ? approach(g.position.z, z, dt, 3) : z
    g.position.y = approach(g.position.y, y, dt, 1.2)
    g.rotation.y = s.heading

    // progres: bergerak menuju nilai terakhir dari backend, tidak pernah melewatinya
    s.progress = v.progress == null ? 0 : approach(s.progress, v.progress, dt, 0.25)
    if (bar.current) bar.current.style.setProperty('--p', `${Math.round(s.progress * 100)}%`)

    // selama karakter masih berpindah (termasuk kembali ke meja setelah data berubah), minta laju render aktif
    const busy = moving || Math.abs(g.position.y - y) > 0.001
    if (busy !== s.moving) { s.moving = busy; live.current.onMoving?.(busy) }

    const dbg: EmployeeDebug = { state: v.state, shown: s.shown, clip, phase, dist: +s.dist.toFixed(3), x: g.position.x, z: g.position.z }
    ;(window as unknown as { __oi3emp?: EmployeeDebug }).__oi3emp = dbg
  })

  const color = view.health === 'error' ? '#ff6b6b' : view.health === 'warning' ? '#ffb020' : '#ffffff'
  const text = !view.known ? 'Tidak ada di data'
    : offline ? 'Data terputus'
      : view.state === 'consulting' ? `Memanggil ${unitLabel}`
        : view.state === 'working' ? 'Bekerja' : 'Siaga'
  return (
    <group ref={group} position={[SEAT[0], SEAT_Y, SEAT[1]]} rotation-y={SEAT_FACING}
      onClick={(e) => { e.stopPropagation(); onSelect(view.agentId) }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}>
      <primitive object={model} />
      {/* bayangan bulat sederhana (karakter tidak ikut shadow map supaya bayangan statis bisa dibekukan) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <circleGeometry args={[0.2, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.27, 0.33, 32]} />
          <meshBasicMaterial color="#ffd100" />
        </mesh>
      )}
      <Html position={[0, 1.02, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="oi3-tag" style={{ '--c': color } as CSSProperties}>
          <b>{view.name}</b>
          <small>{view.role || view.agentId}</small>
          <span className={`oi3-st ${offline ? 'offline' : view.state}`}>{text}
            {view.health !== 'ok' && <em className={view.health}>{view.health === 'error' ? ' · bermasalah' : ' · perlu dicek'}</em>}
          </span>
          {view.stage && <span className="oi3-stage">{view.stage}</span>}
          {view.progress != null && <i ref={bar} />}
        </div>
      </Html>
    </group>
  )
}
