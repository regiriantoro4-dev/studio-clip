// Lingkungan ruangan uji: lantai & dinding modular + satu meja kerja. Semua benda statis (instanced).
import { Suspense, useMemo } from 'react'
import { FURNITURE } from '../manifest/assets'
import { DESK_POS, ROOM_COLOR, ROOM_MIN, ROOM_TILES, SEAT, WALL_COLOR } from '../manifest/officeMap'
import { AssetBoundary, Kit, Placeholder } from './Kit'
import type { Placement } from './Kit'

function Piece({ name, url, at, anchor, tint, shadow }: {
  name: string; url: string; at: Placement[]; anchor?: 'corner' | 'center'; tint?: string; shadow?: boolean
}) {
  return (
    <AssetBoundary name={name} fallback={<>{at.map((p, i) => <Placeholder key={i} pos={p.pos} />)}</>}>
      <Suspense fallback={null}>
        <Kit url={url} at={at} anchor={anchor} tint={tint} shadow={shadow} />
      </Suspense>
    </AssetBoundary>
  )
}

export default function Environment({ working }: { working: boolean }) {
  const layout = useMemo(() => {
    const floor: Placement[] = []
    for (let i = 0; i < ROOM_TILES; i++) for (let j = 0; j < ROOM_TILES; j++) floor.push({ pos: [ROOM_MIN + i, -0.05, ROOM_MIN + j + 1] })
    // dinding belakang (z = ROOM_MIN) dan dinding kiri (x = ROOM_MIN); petak berjendela kaca diselang-seling
    const wall: Placement[] = []
    const glass: Placement[] = []
    for (let i = 0; i < ROOM_TILES; i++) {
      (i % 2 === 1 ? glass : wall).push({ pos: [ROOM_MIN + i, 0, ROOM_MIN] })
      ;(i % 2 === 0 ? glass : wall).push({ pos: [ROOM_MIN, 0, ROOM_MIN + i + 1], rotY: Math.PI / 2 })
    }
    return { floor, wall, glass }
  }, [])
  const [dx, dz] = DESK_POS
  return (
    <group>
      <Piece name="floor" url={FURNITURE.floor} at={layout.floor} anchor="corner" tint={ROOM_COLOR} shadow={false} />
      <Piece name="wall" url={FURNITURE.wall} at={layout.wall} anchor="corner" tint={WALL_COLOR} />
      <Piece name="wallWindow" url={FURNITURE.wallWindow} at={layout.glass} anchor="corner" />
      <Piece name="rug" url={FURNITURE.rug} at={[{ pos: [0.35, 0.001, 0.75] }]} shadow={false} />
      <Piece name="desk" url={FURNITURE.desk} at={[{ pos: [dx, 0, dz] }]} />
      <Piece name="chair" url={FURNITURE.chair} at={[{ pos: [SEAT[0], 0, SEAT[1] + 0.06] }]} />
      <Piece name="screen" url={FURNITURE.screen} at={[{ pos: [dx, 0.38, dz - 0.08] }]} />
      <Piece name="keyboard" url={FURNITURE.keyboard} at={[{ pos: [dx, 0.38, dz + 0.14] }]} />
      <Piece name="plant" url={FURNITURE.plant} at={[{ pos: [-1.65, 0, 1.6] }, { pos: [1.7, 0, 1.65], scale: 0.8 }]} />
      {/* layar monitor: menyala hanya saat karyawan benar-benar bekerja (data asli) */}
      <mesh position={[dx, 0.38 + 0.165, dz - 0.07]}>
        <planeGeometry args={[0.3, 0.17]} />
        <meshStandardMaterial color={working ? '#0b1020' : '#05070c'} emissive={working ? '#8fd0ff' : '#000000'}
          emissiveIntensity={working ? 1.4 : 0} />
      </mesh>
    </group>
  )
}
