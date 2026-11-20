// Kamera isometrik: proyeksi ortografik dari arah (1,1,1) -> sudut isometrik sejati (elevasi 35,26°).
// Rotasi dikunci; zoom & geser dibatasi; reset lewat ref.
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { CAMERA_TARGET, PAN_LIMIT } from '../manifest/officeMap'

export const ZOOM_DEFAULT = 112
export const ZOOM_MIN = 60
export const ZOOM_MAX = 420
const CAM_OFFSET = 8

export interface CameraHandle { reset: () => void; get: () => { zoom: number; target: [number, number, number] } }

interface Controls {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  object: { position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }; zoom: number; updateProjectionMatrix: () => void }
  update: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const CameraRig = forwardRef<CameraHandle>(function CameraRig(_, ref) {
  const controls = useRef<Controls | null>(null)
  const place = (x: number, y: number, z: number) => {
    const c = controls.current
    if (!c) return
    c.target.set(x, y, z)
    c.object.position.set(x + CAM_OFFSET, y + CAM_OFFSET, z + CAM_OFFSET)
  }
  useImperativeHandle(ref, () => ({
    reset() {
      const c = controls.current
      if (!c) return
      place(...CAMERA_TARGET)
      c.object.zoom = ZOOM_DEFAULT
      c.object.updateProjectionMatrix()
      c.update()
    },
    get() {
      const c = controls.current
      return c ? { zoom: c.object.zoom, target: [c.target.x, c.target.y, c.target.z] } : { zoom: 0, target: [0, 0, 0] }
    },
  }), [])
  // batasi geser: sasaran kamera tidak boleh keluar dari sekitar ruangan
  const onChange = () => {
    const c = controls.current
    if (!c) return
    const x = clamp(c.target.x, CAMERA_TARGET[0] - PAN_LIMIT, CAMERA_TARGET[0] + PAN_LIMIT)
    const z = clamp(c.target.z, CAMERA_TARGET[2] - PAN_LIMIT, CAMERA_TARGET[2] + PAN_LIMIT)
    const y = clamp(c.target.y, CAMERA_TARGET[1] - PAN_LIMIT, CAMERA_TARGET[1] + PAN_LIMIT)
    if (x !== c.target.x || y !== c.target.y || z !== c.target.z) place(x, y, z)
  }
  return (
    <>
      <OrthographicCamera makeDefault zoom={ZOOM_DEFAULT} near={-50} far={100}
        position={[CAMERA_TARGET[0] + CAM_OFFSET, CAMERA_TARGET[1] + CAM_OFFSET, CAMERA_TARGET[2] + CAM_OFFSET]} />
      <OrbitControls ref={controls as never} enableRotate={false} enableDamping={false} screenSpacePanning
        minZoom={ZOOM_MIN} maxZoom={ZOOM_MAX} target={CAMERA_TARGET} onChange={onChange} />
    </>
  )
})
