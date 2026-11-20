// Unit AI: model bahasa ditampilkan sebagai PERANGKAT (bukan karyawan), dengan id & label asli dari backend.
// Dibuat dari bentuk dasar di kode; menyala mengikuti data inflight[] / log[] / scene_health.
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { MeshStandardMaterial } from 'three'
import type { Mesh } from 'three'
import { approach } from '../adapter/interpolate'
import type { AiUnitState, AiUnitView } from '../adapter/types'
import { AI_UNIT_POS } from '../manifest/officeMap'

const LOOK: Record<AiUnitState, { color: string; glow: number; text: string }> = {
  idle: { color: '#3aa0c8', glow: 0.35, text: 'Siaga' },
  active: { color: '#7fd3ff', glow: 2.2, text: 'Sedang dipanggil' },
  done: { color: '#6ee7a8', glow: 1.3, text: 'Baru selesai' },
  warning: { color: '#ffb020', glow: 1.2, text: 'Perlu dicek' },
  error: { color: '#ff6b6b', glow: 1.4, text: 'Bermasalah' },
}

export default function AiUnit({ view, selected, onSelect }: {
  view: AiUnitView; selected: boolean; onSelect: (id: string) => void
}) {
  const ring = useRef<Mesh>(null)
  // satu material bersama untuk semua bagian yang menyala
  const glowMat = useMemo(() => new MeshStandardMaterial({ color: '#0b1020', emissive: LOOK.idle.color, emissiveIntensity: LOOK.idle.glow }), [])
  useEffect(() => () => glowMat.dispose(), [glowMat])
  const viewRef = useRef(view)
  viewRef.current = view
  const glow = useRef(LOOK.idle.glow)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const look = LOOK[viewRef.current.state]
    const active = viewRef.current.state === 'active'
    // denyut hanya saat benar-benar dipanggil
    const target = active ? look.glow * (0.7 + 0.3 * Math.sin(state.clock.elapsedTime * 5)) : look.glow
    glow.current = approach(glow.current, target, dt, 4)
    glowMat.emissive.set(look.color)
    glowMat.emissiveIntensity = glow.current
    if (ring.current && active) ring.current.rotation.y += dt * 2.4
  })

  const look = LOOK[view.state]
  return (
    <group position={[AI_UNIT_POS[0], 0, AI_UNIT_POS[1]]}
      onClick={(e) => { e.stopPropagation(); onSelect(view.agentId) }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}>
      <mesh position-y={0.05} castShadow receiveShadow>
        <boxGeometry args={[0.74, 0.1, 0.74]} />
        <meshStandardMaterial color="#1a2238" roughness={0.6} />
      </mesh>
      <mesh position-y={0.52} castShadow>
        <boxGeometry args={[0.46, 0.84, 0.46]} />
        <meshStandardMaterial color="#232c46" roughness={0.45} metalness={0.2} />
      </mesh>
      {/* bilah lampu di dua sisi yang menghadap kamera */}
      {[0.28, 0.5, 0.72].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.235]} material={glowMat}>
            <boxGeometry args={[0.34, 0.06, 0.01]} />
          </mesh>
          <mesh position={[0.235, y, 0]} material={glowMat}>
            <boxGeometry args={[0.01, 0.06, 0.34]} />
          </mesh>
        </group>
      ))}
      <mesh ref={ring} position-y={1.08} rotation-x={Math.PI / 2} material={glowMat}>
        <torusGeometry args={[0.2, 0.025, 8, 28, Math.PI * 1.5]} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.11}>
          <ringGeometry args={[0.56, 0.62, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color="#ffd100" />
        </mesh>
      )}
      <Html position={[0, 1.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="oi3-tag unit" style={{ '--c': look.color } as CSSProperties}>
          <b>{view.label}</b>
          <small>{view.agentId} · unit model AI</small>
          <span className={`oi3-st ${view.state}`}>{look.text}</span>
          {view.task && <span className="oi3-stage">{view.task}</span>}
        </div>
      </Html>
    </group>
  )
}
