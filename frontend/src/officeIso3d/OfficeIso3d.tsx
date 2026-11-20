// Tab "3D Isometrik" — PROTOTIPE P2: satu ruangan, satu karyawan, satu meja kerja, satu unit model AI.
// Data: respons /api/command-center yang SUDAH dipoll CommandCenter (tidak ada permintaan jaringan tambahan).
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type React from 'react'
import { ALWAYS_PRESENT, PERSONA } from '../office3d/layout.js'
import type { CcData } from './adapter/types'
import { aiLabel, deriveView, findCalls, isActive } from './adapter/viewState'
import { FrameGovernor, StatsProbe, fpsCaps } from './perf/FrameGovernor'
import type { Oi3Stats } from './perf/FrameGovernor'
import AiUnit from './scene/AiUnit'
import { CameraRig } from './scene/CameraRig'
import type { CameraHandle } from './scene/CameraRig'
import Employee from './scene/Employee'
import Environment from './scene/Environment'
import { AssetBoundary, Placeholder } from './scene/Kit'
import { AI_UNIT_POS, SEAT, SEAT_Y } from './manifest/officeMap'
import { Vector3 } from 'three'

const DEFAULT_EMPLOYEE = 'job:horror'
const DEFAULT_UNIT = 'llm:groq'
const AUTO = 'auto' // unit AI mengikuti model yang benar-benar dipanggil job karyawan uji
const LOG_MAX = 120

interface LogRow { at: string; emp: string; unit: string; demo: boolean }
const persona = PERSONA as Record<string, string>

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* abaikan */ }
}

// Kanvas gagal dibuat / crash saat render -> laporkan ke halaman, jangan kosongkan Command Center
class GLBoundary extends Component<{ onFail?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail?.() }
  render() { return this.state.failed ? null : this.props.children }
}

// Bayangan benda statis digambar saat benda ditempatkan (Kit menandai needsUpdate), lalu dibekukan
function StaticShadows() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => { gl.shadowMap.autoUpdate = true }
  }, [gl])
  return null
}

// Kait uji (dipakai tools/office-iso3d/probe.mjs): posisi layar karyawan & unit AI, dan keadaan kamera
function TestHooks({ camera }: { camera: React.RefObject<CameraHandle> }) {
  const three = useThree()
  useEffect(() => {
    const w = window as unknown as { __oi3pick?: () => unknown; __oi3cam?: () => unknown }
    const toScreen = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(three.camera)
      return [(v.x + 1) / 2 * three.size.width, (1 - v.y) / 2 * three.size.height]
    }
    w.__oi3pick = () => ({ emp: toScreen(SEAT[0], SEAT_Y + 0.35, SEAT[1]), unit: toScreen(AI_UNIT_POS[0], 0.5, AI_UNIT_POS[1]) })
    w.__oi3cam = () => camera.current?.get()
    ;(w as { __oi3dbg?: () => unknown }).__oi3dbg = () => {
      const lights: unknown[] = []
      let casters = 0
      let receivers = 0
      three.scene.traverse((o) => {
        const l = o as unknown as { isDirectionalLight?: boolean; castShadow: boolean; shadow?: { map: unknown; mapSize: { x: number } } }
        if (l.isDirectionalLight) lights.push({ cast: l.castShadow, map: !!l.shadow?.map, size: l.shadow?.mapSize.x })
        const m = o as unknown as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean }
        if (m.isMesh && m.castShadow) casters += 1
        if (m.isMesh && m.receiveShadow) receivers += 1
      })
      return { enabled: three.gl.shadowMap.enabled, auto: three.gl.shadowMap.autoUpdate, type: three.gl.shadowMap.type, lights, casters, receivers }
    }
    return () => { delete w.__oi3pick; delete w.__oi3cam }
  }, [three, camera])
  return null
}

export interface OfficeIso3dProps {
  data: CcData | null
  /** Tidak dipakai lagi: perjalanan berdurasi tetap dari deriveScene() sudah diganti keadaan dari inflight[]. */
  scene?: unknown
  selected?: string | null
  onSelect?: (agentId: string) => void
  onFail?: () => void
  offline?: boolean
}

export default function OfficeIso3d({ data, selected = null, onSelect = () => {}, onFail, offline = false }: OfficeIso3dProps) {
  const [employeeId, setEmployeeId] = useState(() => stored('oi3-agent', DEFAULT_EMPLOYEE))
  const [unitChoice, setUnitChoice] = useState(() => stored('oi3-unit', AUTO))
  const lastAutoUnit = useRef(stored('oi3-unit-last', DEFAULT_UNIT))
  const [moving, setMoving] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [log, setLog] = useState<LogRow[]>([])
  const lastSig = useRef('')
  const caps = useMemo(() => fpsCaps(), [])
  const [showStats, setShowStats] = useState(() => new URLSearchParams(window.location.search).get('oi3stats') === '1')
  const [lost, setLost] = useState(false)
  const camera = useRef<CameraHandle>(null)
  const statsEl = useRef<HTMLPreElement>(null)

  // 14 agent terdaftar = karyawan; llm:* = unit AI (bukan karyawan)
  const employees = useMemo(() => (data?.agents ?? []).filter((a) => !a.id.startsWith('llm:'))
    .map((a) => ({ id: a.id, text: `${persona[a.id] || a.name} · ${a.name}` }))
    .sort((a, b) => a.text.localeCompare(b.text)), [data])
  const units = useMemo(() => {
    const ids = new Set<string>(ALWAYS_PRESENT as string[])
    for (const a of data?.agents ?? []) if (a.id.startsWith('llm:')) ids.add(a.id)
    return [...ids].sort().map((id) => ({ id, text: `${aiLabel(id, data?.agents.find((a) => a.id === id)?.name)} (${id})` }))
  }, [data])

  // Unit AI yang ditampilkan. Mode otomatis: model yang SEDANG dipanggil job karyawan uji (inflight[]); bila tidak
  // ada panggilan, tetap menampilkan model yang terakhir dipanggil. Data terputus -> tidak berganti.
  const unitId = useMemo(() => {
    if (unitChoice !== AUTO) return unitChoice
    const called = offline ? undefined : findCalls(data, employeeId)[0]?.llm
    if (called && called !== lastAutoUnit.current) { lastAutoUnit.current = called; store('oi3-unit-last', called) }
    return lastAutoUnit.current
  }, [unitChoice, data, employeeId, offline])

  const view = useMemo(() => deriveView(data, { employeeId, aiUnitId: unitId, offline }, Date.now()),
    [data, employeeId, unitId, offline])
  const fps = isActive(view) || moving ? caps.active : caps.idle

  // Log validasi: satu baris tiap kali keadaan dari data berubah (dipakai pemilik sebagai bukti uji job asli)
  useEffect(() => {
    if (!data) return
    const e = view.employee
    const u = view.aiUnit
    const sig = `${offline}|${e.agentId}|${e.state}|${e.stage}|${e.call?.llm ?? ''}|${u.agentId}|${u.state}`
    if (sig === lastSig.current) return
    lastSig.current = sig
    const row: LogRow = {
      at: new Date().toLocaleTimeString('id-ID', { hour12: false }),
      emp: `${e.agentId} → ${offline ? 'terputus' : e.state}${e.progress != null ? ` ${Math.round(e.progress * 100)}%` : ''} · ${e.reason}`,
      unit: `${u.agentId} → ${u.state} · ${u.reason}`,
      demo: !!data.demo,
    }
    setLog((rows) => [...rows.slice(-(LOG_MAX - 1)), row])
  }, [data, view, offline])
  useEffect(() => { (window as unknown as { __oi3log?: LogRow[] }).__oi3log = log }, [log])
  const logText = () => log.map((r) => `${r.at}${r.demo ? ' [DEMO]' : ''}\n  karyawan: ${r.emp}\n  unit AI : ${r.unit}`).join('\n')

  useEffect(() => {
    if (!showStats) return
    const t = setInterval(() => {
      const s = (window as unknown as { __oi3stats?: Oi3Stats }).__oi3stats
      if (s && statsEl.current) {
        statsEl.current.textContent = `fps ${s.fps.toFixed(1)} (batas ${s.fpsTarget} · layar ${s.displayHz.toFixed(0)} Hz ÷ ${s.divisor})\nframe ${s.frameMs.toFixed(1)} ms (maks ${s.frameMsMax.toFixed(0)}) · cpu ${s.cpuMs.toFixed(2)} ms\n`
          + `draw call ${s.calls} · segitiga ${s.triangles}\ngeometri ${s.geometries} · tekstur ${s.textures}`
      }
    }, 500)
    return () => clearInterval(t)
  }, [showStats])

  if (lost) {
    return (
      <div className="oi3 oi3-msg">
        <p>Tampilan 3D Isometrik berhenti karena kartu grafis sedang dipakai proses lain. Panel data tetap berjalan.</p>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setLost(false)}>Coba lagi</button>
      </div>
    )
  }

  return (
    <div className="oi3">
      <GLBoundary onFail={onFail}>
        <Canvas shadows frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'low-power' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true) })
          }}>
          <color attach="background" args={['#0d0f18']} />
          <FrameGovernor fps={fps} />
          <StatsProbe fps={fps} />
          <StaticShadows />
          <CameraRig ref={camera} />
          <TestHooks camera={camera} />
          <ambientLight intensity={0.6} />
          <hemisphereLight args={['#dfe9ff', '#2a2235', 0.5]} />
          <directionalLight position={[-3.5, 8, 4.5]} intensity={1.7} color="#ffe9c9" castShadow shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4}
            shadow-camera-near={1} shadow-camera-far={24} shadow-bias={-0.0008} />
          <Environment working={!offline && view.employee.state !== 'idle'} />
          <AssetBoundary name="character" fallback={<Placeholder pos={[SEAT[0], 0, SEAT[1]]} size={[0.3, 0.7, 0.3]} />}>
            <Suspense fallback={null}>
              <Employee view={view.employee} offline={view.offline} unitLabel={view.aiUnit.label}
                selected={selected === employeeId} onSelect={onSelect} onMoving={setMoving} />
            </Suspense>
          </AssetBoundary>
          <AiUnit view={view.aiUnit} selected={selected === unitId} onSelect={onSelect} />
        </Canvas>
      </GLBoundary>

      <div className="oi3-top">
        <span className="oi3-badge">PROTOTIPE P2 · 1 ruangan · 1 karyawan · 1 unit AI</span>
        <label>Karyawan uji
          <select className="select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); store('oi3-agent', e.target.value) }}>
            {!employees.some((x) => x.id === employeeId) && <option value={employeeId}>{employeeId}</option>}
            {employees.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
          </select>
        </label>
        <label>Unit AI
          <select className="select" value={unitChoice} onChange={(e) => { setUnitChoice(e.target.value); store('oi3-unit', e.target.value) }}>
            <option value={AUTO}>Otomatis: model yang dipanggil</option>
            {units.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
          </select>
        </label>
      </div>

      <div className="oi3-src" aria-live="polite">
        <div><b>Karyawan</b> <code>{view.employee.agentId}</code> → <b>{view.employee.state}</b> · {view.employee.reason}</div>
        <div><b>Unit AI</b> <code>{view.aiUnit.agentId}</code> → <b>{view.aiUnit.state}</b> · {view.aiUnit.reason}</div>
        <small>Data diperbarui tiap 5 detik (polling). Gerak di antaranya adalah penghalusan, bukan data baru.</small>
      </div>

      {showLog && (
        <div className="oi3-log">
          <div className="oi3-log-head">
            <b>Log validasi</b> <span>{log.length} perubahan keadaan sejak tab dibuka</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { navigator.clipboard?.writeText(logText()).catch(() => {}) }}>Salin</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setLog([]); lastSig.current = '' }}>Kosongkan</button>
          </div>
          <ol>
            {log.length === 0 && <li className="hint">Belum ada perubahan keadaan.</li>}
            {log.map((r, i) => (
              <li key={i}><time>{r.at}</time>{r.demo && <em>DEMO</em>}<span>{r.emp}</span><span>{r.unit}</span></li>
            ))}
          </ol>
        </div>
      )}

      {showStats && <pre ref={statsEl} className="oi3-stats">mengukur…</pre>}
      <div className="oi3-btns">
        <button type="button" className="btn btn-sm btn-ghost" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>Log validasi</button>
        <button type="button" className="btn btn-sm btn-ghost" aria-pressed={showStats} onClick={() => setShowStats((v) => !v)}>Statistik</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => camera.current?.reset()}>Atur ulang tampilan</button>
      </div>
    </div>
  )
}
