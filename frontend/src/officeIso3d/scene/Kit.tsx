// Potongan kit modular (lantai, dinding, furnitur) digambar dengan instancing: satu file model dimuat sekali,
// lalu digandakan di banyak posisi dengan satu draw call per bagian.
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Box3, Color, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { BufferGeometry, InstancedMesh, Material, Mesh, Object3D } from 'three'

export interface Placement { pos: [number, number, number]; rotY?: number; scale?: number }

// Material bersama: model kit memakai material "unlit" (tidak kena cahaya). Diganti material standar supaya
// ikut pencahayaan & bayangan; di-cache per warna agar seluruh adegan hanya punya segelintir material.
const MATERIALS = new Map<string, MeshStandardMaterial>()
function sharedMaterial(src: Material, tint?: string): MeshStandardMaterial {
  const s = src as Material & { color?: Color; opacity: number; transparent: boolean }
  const color = tint ?? `#${(s.color ?? new Color('#cccccc')).getHexString()}`
  const key = `${color}|${s.transparent ? s.opacity.toFixed(2) : '1'}`
  let m = MATERIALS.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, transparent: s.transparent, opacity: s.opacity })
    MATERIALS.set(key, m)
  }
  return m
}

interface Part { geometry: BufferGeometry; material: Material; matrix: Matrix4 }

/**
 * Melepas ikatan sumber daya BERSAMA (geometri/material/tekstur dari cache) dengan renderer yang akan ditutup.
 * Model di-cache lintas buka-tutup tab, sedangkan three.js memasang pendengar "dispose" milik tiap renderer
 * pada objek-objek itu. Tanpa ini, setiap kanvas lama (beserta elemen halamannya) tertahan di memori.
 * dispose() hanya membuang data di GPU & pendengar tadi; objeknya tetap ada dan diunggah ulang saat dipakai lagi.
 */
export function releaseShared(items: { geometry?: BufferGeometry; material?: Material | Material[] }[]) {
  for (const it of items) {
    it.geometry?.dispose()
    const mats = Array.isArray(it.material) ? it.material : it.material ? [it.material] : []
    for (const m of mats) {
      const map = (m as Material & { map?: { dispose: () => void } | null }).map
      map?.dispose()
      m.dispose()
    }
  }
}

function useKitParts(url: string) {
  const gltf = useGLTF(url) as unknown as { scene: Object3D }
  return useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const parts: Part[] = []
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      parts.push({ geometry: mesh.geometry, material: mesh.material as Material, matrix: mesh.matrixWorld.clone() })
    })
    const box = new Box3().setFromObject(gltf.scene)
    return { parts, box }
  }, [gltf])
}

const _m = new Matrix4()
const _anchor = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const Y = new Vector3(0, 1, 0)

/**
 * @param anchor  'corner' = titik tumpu asli model (dipakai lantai/dinding yang berukuran 1 petak);
 *                'center' = tengah alas model (lebih mudah untuk furnitur)
 * @param tint    ganti warna SEMUA bagian (mis. lantai mengikuti warna ruangan)
 */
export function Kit({ url, at, anchor = 'center', tint, shadow = true }: {
  url: string; at: Placement[]; anchor?: 'corner' | 'center'; tint?: string; shadow?: boolean
}) {
  const { parts, box } = useKitParts(url)
  const refs = useRef<(InstancedMesh | null)[]>([])
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useLayoutEffect(() => {
    if (anchor === 'center') _anchor.makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    else _anchor.identity()
    parts.forEach((part, pi) => {
      const im = refs.current[pi]
      if (!im) return
      at.forEach((pl, i) => {
        _p.set(pl.pos[0], pl.pos[1], pl.pos[2])
        _q.setFromAxisAngle(Y, pl.rotY ?? 0)
        _s.setScalar(pl.scale ?? 1)
        _m.compose(_p, _q, _s).multiply(_anchor).multiply(part.matrix)
        im.setMatrixAt(i, _m)
      })
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    })
    gl.shadowMap.needsUpdate = true // bayangan statis: gambar ulang sekali setelah benda ditempatkan
    invalidate()
  }, [parts, box, at, anchor, gl, invalidate])

  useEffect(() => () => {
    releaseShared(parts.map((part) => ({ geometry: part.geometry, material: sharedMaterial(part.material, tint) })))
  }, [parts, tint])

  return (
    <>
      {parts.map((part, pi) => (
        <instancedMesh key={pi} ref={(el) => { refs.current[pi] = el }}
          args={[part.geometry, sharedMaterial(part.material, tint), at.length]}
          castShadow={shadow} receiveShadow />
      ))}
    </>
  )
}

/** Aset gagal dimuat -> tampilkan bentuk pengganti, jangan jatuhkan seluruh adegan. */
export class AssetBoundary extends Component<{ name: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) {
    console.warn(`[office-iso3d] aset "${this.props.name}" gagal dimuat, memakai bentuk pengganti`, err)
    const w = window as unknown as { __oi3missing?: string[] }
    w.__oi3missing = [...(w.__oi3missing ?? []), this.props.name]
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function Placeholder({ pos, size = [0.4, 0.4, 0.4] }: { pos: [number, number, number]; size?: [number, number, number] }) {
  return (
    <mesh position={[pos[0], pos[1] + size[1] / 2, pos[2]]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#ff5c8a" wireframe />
    </mesh>
  )
}
