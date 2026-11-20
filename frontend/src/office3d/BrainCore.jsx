import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { roomCenter } from './geometry.js'

// Inti Otak AI: alas, bola bercahaya, dua cincin berputar, berkas cahaya. Makin sibuk LLM (pulse) makin terang.
export default function BrainCore({ pulse = 0 }) {
  const [x, z] = roomCenter('brain')
  const core = useRef()
  const ringA = useRef()
  const ringB = useRef()
  const light = useRef()
  const beam = useRef()
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const beat = 0.5 + 0.5 * Math.sin(t * (2 + pulse * 6))
    if (core.current) core.current.material.emissiveIntensity = 1.4 + pulse * 2.2 * beat + Math.sin(t * 1.3) * 0.15
    if (ringA.current) ringA.current.rotation.z += dt * (0.4 + pulse * 2)
    if (ringB.current) ringB.current.rotation.z -= dt * (0.25 + pulse * 1.4)
    if (light.current) light.current.intensity = 8 + pulse * 18 * beat
    if (beam.current) beam.current.material.opacity = 0.12 + pulse * 0.25 * beat
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.25, 1.4, 0.24, 48]} />
        <meshStandardMaterial color="#121a2e" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.12, 48]} />
        <meshBasicMaterial color="#7fd3ff" toneMapped={false} />
      </mesh>
      <mesh ref={core} position={[0, 1.15, 0]}>
        <icosahedronGeometry args={[0.42, 2]} />
        <meshStandardMaterial color="#bff0ff" emissive="#7fd3ff" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <group position={[0, 1.15, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <mesh ref={ringA}><torusGeometry args={[0.75, 0.025, 8, 64]} /><meshBasicMaterial color="#7fd3ff" toneMapped={false} /></mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[Math.PI / 1.8, 0.6, 0]}>
        <mesh ref={ringB}><torusGeometry args={[0.95, 0.02, 8, 64]} /><meshBasicMaterial color="#b28cff" toneMapped={false} /></mesh>
      </group>
      <mesh ref={beam} position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.12, 0.35, 3.2, 24, 1, true]} />
        <meshBasicMaterial color="#7fd3ff" transparent opacity={0.15} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 1.3, 0]} color="#7fd3ff" intensity={8} distance={8} decay={1.4} />
    </group>
  )
}
