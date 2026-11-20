// Furnitur low-poly dari primitif three.js (bebas lisensi, ringan). Satuan: 1 = ±1 meter.

export function Desk({ position = [0, 0, 0], rotation = 0, top = '#e8dcc8', leg = '#3a3a44' }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.06, 0.7]} />
        <meshStandardMaterial color={top} roughness={0.7} />
      </mesh>
      {[[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.35, z]} castShadow>
          <boxGeometry args={[0.05, 0.7, 0.05]} />
          <meshStandardMaterial color={leg} />
        </mesh>
      ))}
    </group>
  )
}

export function Monitor({ position = [0, 0, 0], rotation = 0, glow = '#7fd3ff', on = false }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.12]} />
        <meshStandardMaterial color="#222228" />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.62, 0.38, 0.04]} />
        <meshStandardMaterial color="#15151b" />
      </mesh>
      <mesh position={[0, 0.32, 0.022]}>
        <planeGeometry args={[0.56, 0.32]} />
        <meshStandardMaterial color={on ? glow : '#1f2733'} emissive={on ? glow : '#000000'}
          emissiveIntensity={on ? 1.6 : 0} toneMapped={!on} />
      </mesh>
    </group>
  )
}

export function Chair({ position = [0, 0, 0], rotation = 0, color = '#2b2d38' }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.46, 0.08, 0.46]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.72, 0.21]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.06]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  )
}

export function Plant({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 12]} />
        <meshStandardMaterial color="#f2efe8" />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#3fae5c" flatShading />
      </mesh>
      <mesh position={[0.12, 0.82, 0.05]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#4cc46c" flatShading />
      </mesh>
    </group>
  )
}

const BOOKS = ['#e85d5d', '#f2c14e', '#4f8fe8', '#5cc98a', '#b07be8', '#ef8f4a']

export function Shelf({ position = [0, 0, 0], rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 1.2, 0.32]} />
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
      {BOOKS.map((c, i) => (
        <mesh key={i} position={[-0.42 + i * 0.17, 0.95, 0.04]} castShadow>
          <boxGeometry args={[0.12, 0.3 + (i % 3) * 0.04, 0.24]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  )
}

export function Rug({ position = [0, 0, 0], size = [2.4, 1.6], color = '#ffffff' }) {
  return (
    <mesh position={[position[0], 0.012, position[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.35} />
    </mesh>
  )
}
