import { Html, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { deskSlot, roomCenter } from './geometry.js'
import { pathBetween, pathLength, pointAlong } from './paths.js'
import { TRIP_MS } from './sceneModel.js'

const BODY = ['#7C5CFF', '#FF5C8A', '#22C3EE', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4',
  '#F97316', '#84CC16', '#EC4899', '#3B82F6', '#14B8A6', '#EAB308', '#A855F7', '#F43F5E']
const HAIR = ['#2b1d14', '#141414', '#6b3e22', '#c99350', '#3a2a4a']
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9b6a4a']
const DWELL = 1.4 // detik berdiri di tujuan

function hash(s) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// Rute pergi: kursi -> pintu asal -> lorong -> pintu tujuan -> titik tujuan (lalu kembali dengan rute terbalik)
function buildRoute(c, trip, seat) {
  const dest = trip.to === 'brain'
    ? (() => { const [x, z] = roomCenter('brain'); const a = (hash(c.agentId) % 8) / 8 * Math.PI * 2; return [x + Math.cos(a) * 1.25, z + Math.sin(a) * 1.25] })()
    : (() => { const [x, z] = roomCenter(trip.to); return [x + ((hash(c.agentId) % 5) - 2) * 0.35, z + 0.2] })()
  const go = [seat, ...pathBetween(trip.from, trip.to), dest]
  const len = pathLength(go)
  const speed = Math.max(3, (2 * len) / (TRIP_MS / 1000 - DWELL - 0.4)) // selesai sebelum TRIP_MS
  return { go, len, speed }
}

export default function Character({ c, trip, selected, onSelect }) {
  const group = useRef()
  const body = useRef()
  const head = useRef()
  const armL = useRef()
  const armR = useRef()
  const legL = useRef()
  const legR = useRef()
  const h = hash(c.agentId)
  const look = useMemo(() => ({ body: BODY[h % BODY.length], hair: HAIR[h % HAIR.length], skin: SKIN[(h >> 3) % SKIN.length] }), [h])
  const { seat, facing } = deskSlot(c.roomId, c.slot)
  const route = useMemo(() => (trip ? buildRoute(c, trip, seat) : null), [trip?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    let x = seat[0], z = seat[1], dir = facing, walking = false, sitting = true
    if (route) {
      const el = (Date.now() - trip.startedAt) / 1000
      const tGo = route.len / route.speed
      if (el < tGo * 2 + DWELL) {
        sitting = false
        let p
        if (el < tGo) { p = pointAlong(route.go, el * route.speed); walking = true }
        else if (el < tGo + DWELL) { p = pointAlong(route.go, route.len); p = [p[0], p[1], trip.to === 'brain' ? Math.atan2(roomCenter('brain')[0] - p[0], roomCenter('brain')[1] - p[1]) : p[2]] }
        else { p = pointAlong([...route.go].reverse(), (el - tGo - DWELL) * route.speed); walking = true }
        ;[x, z, dir] = p
      }
    }
    const g = group.current
    if (!g) return
    g.position.set(x, sitting ? -0.12 : 0, z) // duduk: pantat tepat di dudukan kursi (0.46)
    g.rotation.y = dir
    const swing = walking ? Math.sin(t * 10) * 0.7 : 0
    const typing = sitting && c.state === 'typing'
    legL.current.rotation.x = sitting ? -1.45 : swing
    legR.current.rotation.x = sitting ? -1.45 : -swing
    armL.current.rotation.x = typing ? -1.1 + Math.sin(t * 14) * 0.18 : walking ? -swing : trip?.kind === 'handoff' && !sitting ? -1.2 : 0
    armR.current.rotation.x = typing ? -1.1 + Math.sin(t * 14 + 1.7) * 0.18 : walking ? swing : trip?.kind === 'handoff' && !sitting ? -1.2 : 0
    body.current.position.y = 0.78 + (walking ? Math.abs(Math.sin(t * 10)) * 0.05 : Math.sin(t * 1.6 + h) * 0.008)
    head.current.rotation.y = c.state === 'alert' && sitting ? Math.sin(t * 3) * 0.6 : 0
    head.current.rotation.x = typing ? 0.18 : 0
  })

  return (
    <group ref={group} onClick={(e) => { e.stopPropagation(); onSelect?.(c.agentId) }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
      <group ref={body} position={[0, 0.78, 0]}>
        <RoundedBox args={[0.38, 0.42, 0.26]} radius={0.08} smoothness={3} castShadow>
          <meshStandardMaterial color={look.body} roughness={0.6} />
        </RoundedBox>
        <group ref={head} position={[0, 0.4, 0]}>
          <mesh castShadow><sphereGeometry args={[0.2, 20, 16]} /><meshStandardMaterial color={look.skin} roughness={0.7} /></mesh>
          <mesh position={[0, 0.07, 0.03]} castShadow><sphereGeometry args={[0.205, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={look.hair} roughness={0.8} /></mesh>
        </group>
        {[[armL, -0.25], [armR, 0.25]].map(([ref, x], i) => (
          <group key={i} ref={ref} position={[x, 0.15, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow><boxGeometry args={[0.1, 0.34, 0.1]} /><meshStandardMaterial color={look.body} /></mesh>
            <mesh position={[0, -0.36, 0]}><sphereGeometry args={[0.055, 10, 8]} /><meshStandardMaterial color={look.skin} /></mesh>
          </group>
        ))}
        {trip?.kind === 'handoff' && (
          <mesh position={[0, -0.05, 0.32]} castShadow><boxGeometry args={[0.3, 0.22, 0.22]} /><meshStandardMaterial color="#c8945a" /></mesh>
        )}
      </group>
      {[[legL, -0.1], [legR, 0.1]].map(([ref, x], i) => (
        <group key={i} ref={ref} position={[x, 0.56, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow><boxGeometry args={[0.13, 0.46, 0.14]} /><meshStandardMaterial color="#2c3140" /></mesh>
        </group>
      ))}
      {c.state === 'alert' && (
        <group position={[0, 1.75, 0]}>
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.07, 0.22, 0.07]} /><meshBasicMaterial color="#ff3b3b" /></mesh>
          <mesh position={[0, -0.06, 0]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#ff3b3b" /></mesh>
        </group>
      )}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.48, 32]} /><meshBasicMaterial color="#FFD100" />
        </mesh>
      )}
      {(c.state === 'typing' || selected) && (
        <Html position={[0, 1.95, 0]} center zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
          <div className="o3d-tag">
            <b>{c.name}</b>
            {c.stage && <span>{c.stage}</span>}
            {c.progress != null && <i style={{ '--p': `${Math.round(c.progress * 100)}%` }} />}
          </div>
        </Html>
      )}
    </group>
  )
}
