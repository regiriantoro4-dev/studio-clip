import { Html } from '@react-three/drei'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CORRIDOR, MAX_DESKS, ROOM, WALL_H, deskSlot, roomCenter } from './geometry.js'
import { Chair, Desk, Monitor, Plant, Rug, Shelf } from './props.jsx'

const ALERT = { warning: '#ffb020', error: '#ff3b3b' }

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)))
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`
}

function AlertLight({ level, y }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = level ? 6 + 6 * Math.sin(clock.elapsedTime * 7) : 0
  })
  return <pointLight ref={ref} position={[0, y, 0]} color={ALERT[level] || '#000'} distance={7} decay={1.5} />
}

export default function Room({ room, state, characters = [], children }) {
  const [cx, cz] = roomCenter(room.id)
  const top = cz < 0 // baris atas: pintu di sisi depan (terbuka). Baris bawah: dinding belakang berpintu.
  const isBrain = room.id === 'brain'
  const desks = isBrain ? 0 : Math.min(MAX_DESKS, Math.max(2, characters.length))
  const wall = shade(room.color, 1.25)
  const glowOn = new Set(characters.filter((c) => c.state === 'typing').map((c) => c.slot))

  return (
    <group>
      {/* lantai berwarna divisi + lis */}
      <mesh position={[cx, -0.05, cz]} receiveShadow>
        <boxGeometry args={[ROOM, 0.1, ROOM]} />
        <meshStandardMaterial color={room.color} roughness={0.85} />
      </mesh>
      <mesh position={[cx, -0.16, cz]}>
        <boxGeometry args={[ROOM + 0.2, 0.12, ROOM + 0.2]} />
        <meshStandardMaterial color={shade(room.color, 0.55)} />
      </mesh>

      {/* dinding kiri (−x) penuh */}
      <mesh position={[cx - ROOM / 2 + 0.06, WALL_H / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[0.12, WALL_H, ROOM]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      {/* dinding belakang (−z): baris atas penuh; baris bawah berpintu di tengah (menghadap lorong) */}
      {top ? (
        <mesh position={[cx, WALL_H * 1.6 / 2, cz - ROOM / 2 + 0.06]} castShadow receiveShadow>
          <boxGeometry args={[ROOM, WALL_H * 1.6, 0.12]} />
          <meshStandardMaterial color={wall} />
        </mesh>
      ) : (
        [-1, 1].map((s) => (
          <mesh key={s} position={[cx + s * (ROOM / 4 + 0.35), WALL_H / 2, cz - ROOM / 2 + 0.06]} castShadow>
            <boxGeometry args={[ROOM / 2 - 0.7, WALL_H, 0.12]} />
            <meshStandardMaterial color={wall} />
          </mesh>
        ))
      )}

      {/* meja + monitor + kursi per slot */}
      {Array.from({ length: desks }, (_, i) => {
        const { desk, seat } = deskSlot(room.id, i)
        return (
          <group key={i}>
            <Desk position={[desk[0], 0, desk[1]]} />
            <Monitor position={[desk[0], 0.75, desk[1] - 0.12]} glow={room.accent} on={glowOn.has(i)} />
            <Chair position={[seat[0], 0, seat[1] + 0.1]} />
          </group>
        )
      })}

      {/* dekorasi */}
      {!isBrain && <Shelf position={[cx - ROOM / 2 + 0.35, 0, cz + 1.6]} rotation={Math.PI / 2} />}
      <Plant position={[cx + ROOM / 2 - 0.5, 0, cz - ROOM / 2 + 0.5]} />
      {!isBrain && <Plant position={[cx - ROOM / 2 + 0.5, 0, cz - ROOM / 2 + 0.5]} scale={0.8} />}
      {!isBrain && <Rug position={[cx, 0, cz + 0.2]} size={[4.6, 3.6]} />}

      <group position={[cx, 0, cz]}>
        <AlertLight level={state?.alert} y={2.2} />
      </group>
      {children}

      {/* label mengambang: nama ruangan · jumlah agent · yang aktif */}
      <Html position={[cx - 0.6, 2.4, cz - ROOM / 2 + 0.3]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="o3d-label" style={{ '--c': room.accent }}>
          <b>{room.name}</b>
          <span><i className={state?.activeCount ? 'on' : ''} />{characters.length} agent · {state?.activeCount || 0} bekerja</span>
          {state?.alert && <em className={state.alert}>{state.alert === 'error' ? 'Bermasalah' : 'Perlu dicek'}</em>}
        </div>
      </Html>
    </group>
  )
}

export function Corridor({ width }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[width, 0.08, CORRIDOR]} />
        <meshStandardMaterial color="#2a2d3d" roughness={0.9} />
      </mesh>
      {Array.from({ length: Math.floor(width / 1.2) }, (_, i) => (
        <mesh key={i} position={[-width / 2 + 0.6 + i * 1.2, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 0.06]} />
          <meshStandardMaterial color="#5b6078" />
        </mesh>
      ))}
    </group>
  )
}
