import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Component, useEffect, useRef, useState } from 'react'
import { ROOMS } from './layout.js'
import { CORRIDOR, GAP, ROOM } from './geometry.js'
import { targetFps } from './sceneModel.js'
import Room, { Corridor } from './Room.jsx'
import Character from './Character.jsx'
import BrainCore from './BrainCore.jsx'
import { Bloom, EffectComposer } from '@react-three/postprocessing'

const WIDTH = 3 * ROOM + 2 * GAP

// Render hanya saat perlu: `fps` dari targetFps() (30 saat ada aktivitas, 6 saat sepi), berhenti total saat
// tab tersembunyi (laptop mudah panas)
function FrameLimiter({ fps }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let id = null
    const start = () => { if (!id) id = setInterval(() => invalidate(), 1000 / fps) }
    const stop = () => { clearInterval(id); id = null }
    const sync = () => (document.hidden ? stop() : start())
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { stop(); document.removeEventListener('visibilitychange', sync) }
  }, [invalidate, fps])
  return null
}

function Scene({ scene, selected, onSelect, controlsRef }) {
  const chars = scene?.characters || []
  return (
    <>
      <OrthographicCamera makeDefault position={[22, 20, 22]} zoom={25} near={-100} far={200} />
      <OrbitControls ref={controlsRef} enableRotate={false} enableDamping={false} minZoom={16} maxZoom={80}
        target={[0, 0, 0]} screenSpacePanning />
      <color attach="background" args={['#0d0f18']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cfe3ff', '#2a2235', 0.55]} />
      <directionalLight position={[14, 22, 10]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={14} shadow-camera-bottom={-14}
        shadow-bias={-0.0006} />

      {/* alas kantor */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[WIDTH + 2, 0.2, 2 * ROOM + CORRIDOR + 2]} />
        <meshStandardMaterial color="#171a26" />
      </mesh>
      <Corridor width={WIDTH} />
      {ROOMS.map((r) => (
        <Room key={r.id} room={r} state={scene?.rooms?.find((x) => x.id === r.id)}
          characters={chars.filter((c) => c.roomId === r.id)} />
      ))}
      <BrainCore pulse={scene?.brainPulse || 0} />
      {chars.map((c) => (
        <Character key={c.agentId} c={c} trip={(scene?.trips || []).find((t) => t.agentId === c.agentId)}
          selected={selected === c.agentId} onSelect={onSelect} />
      ))}
      {/* pendar hanya untuk yang sangat terang: inti Otak AI & layar monitor yang menyala */}
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.95} intensity={0.9} />
      </EffectComposer>
    </>
  )
}

// Kanvas gagal dibuat (WebGL dimatikan/driver bermasalah) -> laporkan ke halaman, jangan crash
class GLBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail?.() }
  render() { return this.state.failed ? null : this.props.children }
}

/** Kantor 3D isometrik: ruangan, karakter, inti Otak AI. `scene` = keluaran deriveScene(). */
export default function Office3D({ scene, selected = null, onSelect = () => {}, onFail }) {
  const controlsRef = useRef()
  const [ready, setReady] = useState(false)
  // R3F sengaja memutus konteks WebGL (forceContextLoss) ~500 ms setelah kanvas dilepas, mis. saat pindah tab.
  // Itu bukan kegagalan: hanya laporkan konteks hilang selama komponen masih terpasang.
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const created = ({ gl }) => {
    setReady(true)
    gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (mounted.current) onFail?.() })
  }
  return (
    <div className="o3d">
      <GLBoundary onFail={onFail}>
      <Canvas shadows frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'low-power' }}
        onCreated={created}>
        <FrameLimiter fps={targetFps(scene)} />
        <Scene scene={scene} selected={selected} onSelect={onSelect}
          controlsRef={controlsRef} />
      </Canvas>
      </GLBoundary>
      {ready && (
        <button type="button" className="btn btn-sm btn-ghost o3d-reset" onClick={() => controlsRef.current?.reset()}>
          Atur ulang tampilan
        </button>
      )}
    </div>
  )
}
