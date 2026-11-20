import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { deriveScene } from '../office3d/sceneModel.js'
import { demoFeed } from '../office3d/demoFeed.js'

const Office3D = lazy(() => import('../office3d/Office3D.jsx'))
// Tab "3D Isometrik" (modul baru, dimuat hanya saat tab dibuka). Tampilan lama tetap bawaan.
const OfficeIso3d = lazy(() => import('../officeIso3d/OfficeIso3d.tsx'))
// ?demo=1: data tiruan untuk pameran saat tidak ada job berjalan (selalu berlabel MODE DEMO)
const DEMO = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'

// File kantor 3D gagal dimuat (mis. tab lama setelah build ulang) -> pakai kantor 2D, jangan kosongkan halaman
class Load3DBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail?.() }
  render() { return this.state.failed ? null : this.props.children }
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

// Command Center: kantor virtual agent AutoClipper. Tiap agent (job & layanan) punya meja,
// avatar, dan status dari telemetri backend (/api/command-center).

const PERSONA = {
  'job:process': 'Raka', 'job:readymade': 'Sari', 'job:autoproduce': 'Bima', 'job:affiliate': 'Nadia',
  'job:narrate': 'Dewi', 'job:fix-transcript': 'Tono', 'job:annotate': 'Lina', downloader: 'Udin',
  transcriber: 'Wulan', renderer: 'Joko', thumbnail: 'Ayu', tts: 'Rina', bumper: 'Kiki',
  'llm:groq': 'Gilang', 'llm:gemini': 'Maya', 'llm:openai': 'Arif', 'llm:moonshot': 'Putri',
  'job:horror': 'Studio Horor',
}
const COLORS = ['#7C5CFF', '#FF5C8A', '#22C3EE', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4',
  '#F97316', '#84CC16', '#EC4899', '#3B82F6', '#14B8A6', '#EAB308', '#A855F7', '#F43F5E']
const HEALTH = {
  running: ['Bekerja', 'var(--accent)'], ok: ['Siap', 'var(--ok)'], idle: ['Siaga', 'var(--muted)'],
  warning: ['Perlu dicek', '#F59E0B'], error: ['Bermasalah', 'var(--danger)'],
}
const RANGES = [[1, '1 jam'], [24, '24 jam'], [168, '7 hari'], [0, 'Semua']]

const persona = (a) => PERSONA[a.id] || a.name.split(' ')[0]
const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`)
function dur(s) {
  if (s == null) return '–'
  if (s < 1) return `${Math.round(s * 1000)} md`
  if (s < 60) return `${s.toFixed(1)} dtk`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}d`
}
function ago(ts, now) {
  if (!ts) return 'belum pernah'
  const d = Math.max(0, now - ts)
  if (d < 60) return 'baru saja'
  if (d < 3600) return `${Math.floor(d / 60)} mnt lalu`
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`
  return `${Math.floor(d / 86400)} hari lalu`
}
const clock = (ts) => new Date(ts * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// ---------------------------------------------------------------- kantor isometrik (SVG)

const TW = 92, TH = 46
const iso = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z]
const pts = (arr) => arr.map((p) => p.join(',')).join(' ')

function Box({ x, y, w, d, h, z = 0, top, left, right, stroke = 'rgba(0,0,0,.18)' }) {
  const T = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const L = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
  const R = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
  return (
    <g>
      <polygon points={pts(L)} fill={left} stroke={stroke} />
      <polygon points={pts(R)} fill={right} stroke={stroke} />
      <polygon points={pts(T)} fill={top} stroke={stroke} />
    </g>
  )
}

function Plant({ x, y }) {
  const [px, py] = iso(x, y)
  return (
    <g>
      <Box x={x - 0.18} y={y - 0.18} w={0.36} d={0.36} h={18} top="#E8B4A0" left="#C98B74" right="#B57A64" />
      <ellipse cx={px} cy={py - 34} rx={18} ry={14} fill="#4CAF7A" />
      <ellipse cx={px - 9} cy={py - 44} rx={11} ry={10} fill="#5FC48C" />
      <ellipse cx={px + 9} cy={py - 46} rx={10} ry={9} fill="#3E9E68" />
    </g>
  )
}

function Desk({ a, i, x, y, sel, onSelect, run, part }) {
  const col = COLORS[i % COLORS.length]
  const h = a.health
  const [ax, ay] = iso(x + 0.55, y + 1.05)
  const [lx, ly] = iso(x + 0.65, y + 0.35, 96)
  const name = persona(a)
  const label = `${name} · ${a.name.length > 16 ? a.name.slice(0, 15) + '…' : a.name}`
  const lw = Math.max(label.length * 6 + 26, 70)
  const screen = h === 'running' ? '#FFE680' : h === 'error' ? '#FF8A8A' : h === 'warning' ? '#FFD08A' : '#9FD8FF'
  const dot = HEALTH[h][1]
  if (part === 'tag') {
    return (
      <g className="cc-desk" onClick={() => onSelect(a.id)} aria-hidden="true">
        <g transform={`translate(${lx - lw / 2}, ${ly})`}>
          <rect width={lw} height={20} rx={10} fill="rgba(18,18,24,.88)" stroke={sel ? 'var(--accent)' : 'rgba(255,255,255,.14)'} />
          <circle cx={11} cy={10} r={4} fill={dot} className={h === 'running' ? 'cc-pulse' : ''} />
          <text x={21} y={14} className="cc-label">{label}</text>
        </g>
        {h === 'running' && run && (
          <g transform={`translate(${ax + 16}, ${ay - 74})`}>
            <rect width={44} height={18} rx={9} fill="var(--accent)" />
            <text x={22} y={13} textAnchor="middle" className="cc-bubble">{Math.round((run.progress || 0) * 100)}%</text>
          </g>
        )}
        {(h === 'error' || h === 'warning') && (
          <g transform={`translate(${ax + 16}, ${ay - 66})`}>
            <circle r={10} fill={h === 'error' ? 'var(--danger)' : '#F59E0B'} />
            <text y={4} textAnchor="middle" className="cc-bubble">!</text>
          </g>
        )}
        {h === 'idle' && <text x={ax + 15} y={ay - 56} className="cc-zzz">z z</text>}
      </g>
    )
  }
  return (
    <g className={`cc-desk ${sel ? 'is-sel' : ''}`} onClick={() => onSelect(a.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(a.id) }} aria-label={`${name}, ${a.name}: ${HEALTH[h][0]}`}>
      {sel && <polygon points={pts([iso(x - 0.2, y - 0.2), iso(x + 1.5, y - 0.2), iso(x + 1.5, y + 1.6), iso(x - 0.2, y + 1.6)])} fill="rgba(255,209,0,.16)" stroke="var(--accent)" strokeDasharray="6 5" />}
      {/* meja + monitor */}
      <Box x={x} y={y} w={1.3} d={0.7} h={30} top="#F3E2C7" left="#D9BE96" right="#C9AA80" />
      <Box x={x + 0.35} y={y + 0.12} w={0.6} d={0.08} h={30} z={30} top="#2B2D3A" left="#1E2030" right="#2B2D3A" />
      <polygon className={h === 'running' ? 'cc-screen-on' : ''} points={pts([iso(x + 0.38, y + 0.2, 36), iso(x + 0.92, y + 0.2, 36), iso(x + 0.92, y + 0.2, 56), iso(x + 0.38, y + 0.2, 56)])} fill={screen} opacity=".9" />
      {/* kursi + avatar */}
      <g className={h === 'running' ? 'cc-bob' : h === 'error' ? 'cc-shake' : ''}>
        <ellipse cx={ax} cy={ay + 6} rx={20} ry={9} fill="rgba(0,0,0,.22)" />
        <rect x={ax - 15} y={ay - 30} width={30} height={30} rx={11} fill={col} />
        <circle cx={ax} cy={ay - 42} r={13} fill="#F6CFA8" />
        <path d={`M ${ax - 13} ${ay - 44} a 13 13 0 0 1 26 0 q -13 -6 -26 0 z`} fill="#2A1F1A" />
        <text x={ax} y={ay - 9} textAnchor="middle" className="cc-ava-txt">{name[0]}</text>
      </g>
    </g>
  )
}

function Office({ agents, running, sel, onSelect }) {
  const perRow = 4
  const SX = 2.7, SY = 2.5
  const rows = Math.max(2, Math.ceil(agents.length / perRow))
  const N = perRow * SX + 0.8, M = rows * SY + 0.9
  const corners = [iso(0, 0), iso(N, 0), iso(N, M), iso(0, M)]
  const minX = iso(0, M)[0] - 30, maxX = iso(N, 0)[0] + 30
  const minY = iso(0, 0)[1] - 190, maxY = iso(N, M)[1] + 40
  const runBy = Object.fromEntries(running.map((r) => [r.agent, r]))
  const wallH = 150
  // urutan gambar: belakang dulu (gx+gy kecil)
  const placed = agents.map((a, i) => ({ a, i, x: 0.9 + (i % perRow) * SX, y: 0.8 + Math.floor(i / perRow) * SY }))
    .sort((p, q) => (p.x + p.y) - (q.x + q.y))
  return (
    <svg className="cc-office" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Kantor agent Studio Clip">
      {/* dinding */}
      <polygon points={pts([iso(0, 0), iso(0, M), iso(0, M, wallH), iso(0, 0, wallH)])} fill="#E9E4F5" />
      <polygon points={pts([iso(0, 0), iso(N, 0), iso(N, 0, wallH), iso(0, 0, wallH)])} fill="#F4F1FB" />
      {/* jendela kota di dinding kanan */}
      <polygon points={pts([iso(N * 0.45, 0, 40), iso(N * 0.92, 0, 40), iso(N * 0.92, 0, 128), iso(N * 0.45, 0, 128)])} fill="#3B3570" />
      {Array.from({ length: 9 }).map((_, k) => {
        const x0 = N * 0.47 + k * N * 0.05
        const hh = 50 + ((k * 37) % 40)
        return <polygon key={k} points={pts([iso(x0, 0, 40), iso(x0 + N * 0.04, 0, 40), iso(x0 + N * 0.04, 0, 40 + hh), iso(x0, 0, 40 + hh)])} fill="#24204D" />
      })}
      {/* papan di dinding kiri */}
      <polygon points={pts([iso(0, M * 0.2, 60), iso(0, M * 0.55, 60), iso(0, M * 0.55, 126), iso(0, M * 0.2, 126)])} fill="#1F2230" />
      <text transform={`translate(${iso(0, M * 0.375, 93)[0]}, ${iso(0, M * 0.375, 93)[1]}) skewY(-26.565)`} textAnchor="middle" className="cc-wall-txt">AUTOCLIPPER</text>
      {/* lantai */}
      <polygon points={pts([corners[3], corners[2], [corners[2][0], corners[2][1] + 16], [corners[3][0], corners[3][1] + 16]])} fill="#C9A77D" />
      <polygon points={pts([corners[1], corners[2], [corners[2][0], corners[2][1] + 16], [corners[1][0], corners[1][1] + 16]])} fill="#B8966C" />
      <polygon points={pts(corners)} fill="#EED9B8" />
      {Array.from({ length: N + 1 }).map((_, k) => <line key={`a${k}`} x1={iso(k, 0)[0]} y1={iso(k, 0)[1]} x2={iso(k, M)[0]} y2={iso(k, M)[1]} stroke="rgba(150,110,60,.12)" />)}
      {Array.from({ length: Math.ceil(M) + 1 }).map((_, k) => <line key={`b${k}`} x1={iso(0, Math.min(k, M))[0]} y1={iso(0, Math.min(k, M))[1]} x2={iso(N, Math.min(k, M))[0]} y2={iso(N, Math.min(k, M))[1]} stroke="rgba(150,110,60,.12)" />)}
      <Plant x={0.4} y={0.4} />
      <Plant x={N - 0.4} y={0.4} />
      <Plant x={0.4} y={M - 0.4} />
      <Plant x={N - 0.4} y={M - 0.4} />
      {placed.map(({ a, i, x, y }) => (
        <Desk key={a.id} a={a} i={i} x={x} y={y} sel={sel === a.id} onSelect={onSelect} run={runBy[a.id]} part="body" />
      ))}
      {placed.map(({ a, i, x, y }) => (
        <Desk key={`t-${a.id}`} a={a} i={i} x={x} y={y} sel={sel === a.id} onSelect={onSelect} run={runBy[a.id]} part="tag" />
      ))}
    </svg>
  )
}


// ---------------------------------------------------------------- gaya balok mainan

const BRICK = ['#D01012', '#0055BF', '#F2CD37', '#237841', '#FE8A18', '#A0BCAC', '#923978', '#00A3DA',
  '#E4ADC8', '#58AB41', '#7D4A2C', '#36AEBF', '#C91A09', '#FFF03A', '#4B9F4A', '#5A93DB']

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

// pentol bulat di atas balok
function Stud({ x, y, z, color, r = 6.5 }) {
  const [cx, cy] = iso(x, y, z)
  const h = 4
  return (
    <g>
      <rect x={cx - r} y={cy - h} width={r * 2} height={h} fill={shade(color, 0.78)} />
      <ellipse cx={cx} cy={cy} rx={r} ry={r / 2} fill={shade(color, 0.78)} />
      <ellipse cx={cx} cy={cy - h} rx={r} ry={r / 2} fill={shade(color, 1.12)} stroke={shade(color, 0.7)} strokeWidth=".6" />
    </g>
  )
}

function Brick({ x, y, w, d, h, z = 0, color, studs = 0.33 }) {
  const list = []
  if (studs) {
    const nx = Math.max(1, Math.round(w / studs)), ny = Math.max(1, Math.round(d / studs))
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) list.push([x + (i + 0.5) * w / nx, y + (j + 0.5) * d / ny])
  }
  return (
    <g>
      <Box x={x} y={y} w={w} d={d} h={h} z={z} top={shade(color, 1.05)} left={shade(color, 0.82)} right={shade(color, 0.66)} stroke={shade(color, 0.55)} />
      {list.map(([sx, sy], k) => <Stud key={k} x={sx} y={sy} z={z + h} color={color} r={5.5} />)}
    </g>
  )
}

function BrickPlant({ x, y }) {
  const [px, py] = iso(x, y)
  return (
    <g>
      <Brick x={x - 0.17} y={y - 0.17} w={0.34} d={0.34} h={16} color="#7D4A2C" studs={0} />
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <ellipse cx={px} cy={py - 22 - k * 13} rx={22 - k * 5} ry={10 - k * 2} fill={shade('#4B9F4A', 0.8)} />
          <ellipse cx={px} cy={py - 25 - k * 13} rx={22 - k * 5} ry={10 - k * 2} fill="#58AB41" />
        </g>
      ))}
      <ellipse cx={px} cy={py - 66} rx={6} ry={3} fill="#7BC96F" />
    </g>
  )
}

// minifigure duduk: kepala silinder kuning + stud, badan trapesium, tangan C
function Minifig({ ax, ay, col, hair, h }) {
  const skin = '#F2CD37'
  return (
    <g className={h === 'running' ? 'cc-bob' : h === 'error' ? 'cc-shake' : ''}>
      <ellipse cx={ax} cy={ay + 7} rx={21} ry={9} fill="rgba(0,0,0,.25)" />
      {/* kaki duduk */}
      <rect x={ax - 13} y={ay - 6} width={26} height={12} rx={2} fill="#1B2A4A" />
      {/* badan */}
      <path d={`M ${ax - 15} ${ay - 6} L ${ax - 11} ${ay - 32} L ${ax + 11} ${ay - 32} L ${ax + 15} ${ay - 6} Z`} fill={col} stroke={shade(col, 0.6)} strokeWidth=".8" />
      <path d={`M ${ax - 6} ${ay - 32} L ${ax} ${ay - 24} L ${ax + 6} ${ay - 32}`} fill="none" stroke={shade(col, 0.6)} strokeWidth="1" />
      {/* lengan + tangan C */}
      <rect x={ax - 20} y={ay - 30} width={7} height={17} rx={3} fill={shade(col, 0.88)} transform={`rotate(12 ${ax - 16} ${ay - 30})`} />
      <rect x={ax + 13} y={ay - 30} width={7} height={17} rx={3} fill={shade(col, 0.88)} transform={`rotate(-12 ${ax + 16} ${ay - 30})`} />
      <circle cx={ax - 19} cy={ay - 11} r={4} fill="none" stroke={skin} strokeWidth="3" strokeDasharray="18 7" />
      <circle cx={ax + 19} cy={ay - 11} r={4} fill="none" stroke={skin} strokeWidth="3" strokeDasharray="18 7" />
      {/* leher + kepala silinder */}
      <rect x={ax - 4} y={ay - 36} width={8} height={5} fill={skin} />
      <rect x={ax - 11} y={ay - 54} width={22} height={19} rx={5} fill={skin} stroke="#C9A62A" strokeWidth=".8" />
      <ellipse cx={ax} cy={ay - 54} rx={11} ry={3.5} fill="#F7DB5E" />
      {/* rambut / topi */}
      <path d={`M ${ax - 12} ${ay - 46} Q ${ax - 13} ${ay - 60} ${ax} ${ay - 60} Q ${ax + 13} ${ay - 60} ${ax + 12} ${ay - 46} L ${ax + 9} ${ay - 50} L ${ax - 9} ${ay - 50} Z`} fill={hair} />
      {/* stud kepala */}
      <rect x={ax - 5} y={ay - 64} width={10} height={4} fill={shade(hair, 0.8)} />
      <ellipse cx={ax} cy={ay - 64} rx={5} ry={2} fill={shade(hair, 1.15)} />
      {/* wajah */}
      <circle cx={ax - 4} cy={ay - 44} r={1.6} fill="#1A1A1A" />
      <circle cx={ax + 4} cy={ay - 44} r={1.6} fill="#1A1A1A" />
      {h === 'error'
        ? <path d={`M ${ax - 4} ${ay - 37} Q ${ax} ${ay - 41} ${ax + 4} ${ay - 37}`} fill="none" stroke="#1A1A1A" strokeWidth="1.4" />
        : <path d={`M ${ax - 4} ${ay - 40} Q ${ax} ${ay - 36} ${ax + 4} ${ay - 40}`} fill="none" stroke="#1A1A1A" strokeWidth="1.4" />}
    </g>
  )
}

const HAIR = ['#3B2314', '#1A1A1A', '#7D4A2C', '#D9A066', '#923978', '#0055BF', '#D01012', '#4B4B4B']

function BrickDesk({ a, i, x, y, sel, onSelect }) {
  const col = BRICK[i % BRICK.length]
  const h = a.health
  const [ax, ay] = iso(x + 0.55, y + 1.08)
  const name = persona(a)
  const screen = h === 'running' ? '#FFF03A' : h === 'error' ? '#FF6B6B' : h === 'warning' ? '#FFB347' : '#7FD3F7'
  const deskCol = [ '#D01012', '#0055BF', '#F2CD37', '#237841' ][i % 4]
  return (
    <g className={`cc-desk ${sel ? 'is-sel' : ''}`} onClick={() => onSelect(a.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(a.id) }} aria-label={`${name}, ${a.name}: ${HEALTH[h][0]}`}>
      {sel && <polygon points={pts([iso(x - 0.2, y - 0.2), iso(x + 1.5, y - 0.2), iso(x + 1.5, y + 1.6), iso(x - 0.2, y + 1.6)])} fill="rgba(255,240,58,.22)" stroke="#FFF03A" strokeDasharray="6 5" />}
      {/* kaki meja (2 balok) + daun meja */}
      <Brick x={x + 0.05} y={y + 0.1} w={0.25} d={0.5} h={22} color="#4B4B4B" studs={0} />
      <Brick x={x + 1.0} y={y + 0.1} w={0.25} d={0.5} h={22} color="#4B4B4B" studs={0} />
      <Brick x={x} y={y} w={1.3} d={0.7} h={10} z={22} color={deskCol} studs={0.33} />
      {/* monitor */}
      <Brick x={x + 0.38} y={y + 0.1} w={0.55} d={0.1} h={30} z={32} color="#1A1A1A" studs={0} />
      <polygon className={h === 'running' ? 'cc-screen-on' : ''} points={pts([iso(x + 0.42, y + 0.2, 36), iso(x + 0.9, y + 0.2, 36), iso(x + 0.9, y + 0.2, 58), iso(x + 0.42, y + 0.2, 58)])} fill={screen} />
      {/* kursi balok */}
      <Brick x={x + 0.35} y={y + 0.95} w={0.45} d={0.45} h={12} color="#4B4B4B" studs={0} />
      <Minifig ax={ax} ay={ay - 6} col={col} hair={HAIR[i % HAIR.length]} h={h} />
    </g>
  )
}

function BrickOffice({ agents, running, sel, onSelect }) {
  const perRow = 4
  const SX = 2.7, SY = 2.5
  const rows = Math.max(2, Math.ceil(agents.length / perRow))
  const N = perRow * SX + 0.8, M = rows * SY + 0.9
  const minX = iso(0, M)[0] - 30, maxX = iso(N, 0)[0] + 30
  const minY = iso(0, 0)[1] - 200, maxY = iso(N, M)[1] + 50
  const runBy = Object.fromEntries(running.map((r) => [r.agent, r]))
  const wallH = 150, rowH = 25
  const placed = agents.map((a, i) => ({ a, i, x: 0.9 + (i % perRow) * SX, y: 0.8 + Math.floor(i / perRow) * SY }))
    .sort((p, q) => (p.x + p.y) - (q.x + q.y))
  // dinding dari tumpukan balok berwarna (sambungan selang-seling)
  const wallColors = ['#E4E4E4', '#D9D9D9']
  const wallRows = Math.floor(wallH / rowH)
  const bricksL = [], bricksR = []
  for (let r = 0; r < wallRows; r++) {
    const off = r % 2 ? 0.5 : 0
    for (let t = -off; t < M; t += 1.0) {
      const y0 = Math.max(0, t), y1 = Math.min(M, t + 1.0)
      if (y1 > y0) bricksL.push([y0, y1, r])
    }
    for (let t = -off; t < N; t += 1.0) {
      const x0 = Math.max(0, t), x1 = Math.min(N, t + 1.0)
      if (x1 > x0) bricksR.push([x0, x1, r])
    }
  }
  const studs = []
  for (let gy = 0.25; gy < M; gy += 0.5) for (let gx = 0.25; gx < N; gx += 0.5) studs.push([gx, gy])
  return (
    <svg className="cc-office cc-brick" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Kantor agent Studio Clip gaya balok">
      {bricksL.map(([y0, y1, r], k) => (
        <polygon key={`l${k}`} points={pts([iso(0, y0, r * rowH), iso(0, y1, r * rowH), iso(0, y1, (r + 1) * rowH), iso(0, y0, (r + 1) * rowH)])}
          fill={shade(wallColors[(r + k) % 2], 0.92)} stroke="#B5B5B5" strokeWidth="1" />
      ))}
      {bricksR.map(([x0, x1, r], k) => (
        <polygon key={`r${k}`} points={pts([iso(x0, 0, r * rowH), iso(x1, 0, r * rowH), iso(x1, 0, (r + 1) * rowH), iso(x0, 0, (r + 1) * rowH)])}
          fill={wallColors[(r + k) % 2]} stroke="#B5B5B5" strokeWidth="1" />
      ))}
      {/* jendela berbingkai balok + papan nama */}
      <polygon points={pts([iso(N * 0.5, 0, 45), iso(N * 0.9, 0, 45), iso(N * 0.9, 0, 125), iso(N * 0.5, 0, 125)])} fill="#7FD3F7" stroke="#0055BF" strokeWidth="6" />
      <line x1={iso(N * 0.7, 0, 45)[0]} y1={iso(N * 0.7, 0, 45)[1]} x2={iso(N * 0.7, 0, 125)[0]} y2={iso(N * 0.7, 0, 125)[1]} stroke="#0055BF" strokeWidth="5" />
      <polygon points={pts([iso(0, M * 0.2, 60), iso(0, M * 0.58, 60), iso(0, M * 0.58, 120), iso(0, M * 0.2, 120)])} fill="#D01012" stroke="#8E0B0C" strokeWidth="3" />
      <text transform={`translate(${iso(0, M * 0.39, 85)[0]}, ${iso(0, M * 0.39, 85)[1]}) skewY(-26.565)`} textAnchor="middle" className="cc-wall-txt cc-wall-brick">AUTOCLIPPER</text>
      {/* baseplate hijau berpentol */}
      <polygon points={pts([iso(0, M), iso(N, M), iso(N, M, -14), iso(0, M, -14)])} fill="#2F7A33" />
      <polygon points={pts([iso(N, 0), iso(N, M), iso(N, M, -14), iso(N, 0, -14)])} fill="#25632A" />
      <polygon points={pts([iso(0, 0), iso(N, 0), iso(N, M), iso(0, M)])} fill="#4B9F4A" />
      {studs.map(([gx, gy], k) => <Stud key={k} x={gx} y={gy} z={0} color="#4B9F4A" r={5} />)}
      <BrickPlant x={0.4} y={0.4} />
      <BrickPlant x={N - 0.4} y={0.4} />
      <BrickPlant x={0.4} y={M - 0.4} />
      <BrickPlant x={N - 0.4} y={M - 0.4} />
      {placed.map(({ a, i, x, y }) => (
        <BrickDesk key={a.id} a={a} i={i} x={x} y={y} sel={sel === a.id} onSelect={onSelect} />
      ))}
      {placed.map(({ a, i, x, y }) => (
        <Desk key={`t-${a.id}`} a={a} i={i} x={x} y={y + 0.02} sel={sel === a.id} onSelect={onSelect} run={runBy[a.id]} part="tag" />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------- panel

function Meter({ rate }) {
  if (rate == null) return <div className="cc-meter is-empty" aria-hidden="true" />
  return (
    <div className="cc-meter" role="img" aria-label={`Sukses ${pct(rate)}`}>
      <span style={{ width: `${rate * 100}%` }} className="ok" />
      <span style={{ width: `${(1 - rate) * 100}%` }} className="bad" />
    </div>
  )
}

function Bars({ series, hours }) {
  const max = Math.max(1, ...series)
  return (
    <div className="cc-bars" role="img" aria-label={`Sebaran ${series.reduce((s, v) => s + v, 0)} tugas`}>
      {series.map((v, k) => <span key={k} style={{ height: `${(v / max) * 100}%` }} title={`${v} tugas`} />)}
      <small>{hours ? `${hours >= 24 ? hours / 24 + ' hari' : hours + ' jam'} terakhir` : ''}</small>
    </div>
  )
}

function AgentDetail({ a, i, log, now, hours }) {
  if (!a) return <p className="hint">Klik meja atau nama agent untuk melihat detailnya.</p>
  const mine = log.filter((e) => e.agent === a.id).slice(0, 8)
  return (
    <div className="cc-detail">
      <div className="cc-detail-head">
        <span className="cc-ava" style={{ background: COLORS[i % COLORS.length] }}>{persona(a)[0]}</span>
        <div>
          <b>{persona(a)} · {a.name}</b>
          <span className="hint">{a.role}</span>
        </div>
        <span className="cc-pill" style={{ '--c': HEALTH[a.health][1] }}>{HEALTH[a.health][0]}</span>
      </div>
      <div className="cc-kv">
        <div><span>Total tugas</span><b className="tnum">{a.total}</b></div>
        <div><span>Sukses</span><b className="tnum">{a.done}</b></div>
        <div><span>Gagal</span><b className="tnum">{a.error}</b></div>
        <div><span>Success rate</span><b className="tnum">{pct(a.success_rate)}</b></div>
        <div><span>Rata-rata</span><b className="tnum">{dur(a.avg_dur)}</b></div>
        <div><span>Terlama</span><b className="tnum">{a.total ? dur(a.max_dur) : '–'}</b></div>
      </div>
      <Meter rate={a.success_rate} />
      {hours > 0 && <Bars series={a.series} hours={hours} />}
      <p className="hint">Terakhir jalan: {ago(a.last_at, now)}{a.streak_fail ? ` · gagal ${a.streak_fail}x beruntun` : ''}</p>
      {a.last_error && (
        <div className="cc-err"><b>Error terakhir</b> ({ago(a.last_error_at, now)})<br />{a.last_error}</div>
      )}
      {mine.length > 0 && (
        <ul className="cc-mini-log">
          {mine.map((e, k) => (
            <li key={k}><span className={`cc-st ${e.status}`}>{e.status === 'done' ? 'OK' : 'Gagal'}</span> {e.task} <small>{ago(e.end, now)} · {e.job === 'riwayat' ? 'riwayat' : dur(e.dur)}</small></li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CommandCenter() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [hours, setHours] = useState(24)
  const [auto, setAuto] = useState(true)
  const [view, setViewRaw] = useState(() => { try { return localStorage.getItem('cc-view') || 'office' } catch { return 'office' } })
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem('cc-view', v) } catch { /* abaikan */ } }
  const [sel, setSel] = useState(null)
  const [fAgent, setFAgent] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    if (DEMO) { setData(demoFeed(Date.now())); setErr(''); return }
    api(`/api/command-center?hours=${hours}`).then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message))
  }, [hours])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => { if (!document.hidden) load() }, DEMO ? 1000 : 5000)
    return () => clearInterval(t)
  }, [auto, load])

  // Model adegan 3D: dirantai dari poll ke poll (perjalanan yang sedang berlangsung tetap berjalan)
  const [scene, setScene] = useState(null)
  useEffect(() => { if (data) setScene((prev) => deriveScene(data, prev, Date.now())) }, [data])
  const [gl3d, setGl3d] = useState(() => hasWebGL())
  // 3D Isometrik gagal dimuat/crash -> kembali ke tampilan Kantor supaya halaman tidak terjebak di tampilan rusak
  const [isoFail, setIsoFail] = useState(false)
  const failIso = () => { setIsoFail(true); setView('office') }
  // Status WebGL untuk tab baru dipisah dari gl3d: tampilan Kantor lama mematikan gl3d saat kanvasnya dilepas
  const [isoGl] = useState(() => hasWebGL())

  const agents = data?.agents || []
  const idx = useMemo(() => Object.fromEntries(agents.map((a, i) => [a.id, i])), [agents])
  const now = data?.now || Date.now() / 1000
  const selA = agents.find((a) => a.id === sel)
  const log = useMemo(() => (data?.log || []).filter((e) =>
    (!fAgent || e.agent === fAgent) && (!fStatus || e.status === fStatus)
    && (!q || `${e.task} ${e.ref} ${e.error} ${e.agent_name}`.toLowerCase().includes(q.toLowerCase()))), [data, fAgent, fStatus, q])

  if (!data) return <div className="page"><p className="hint">{err || 'Memuat Command Center…'}</p></div>
  const s = data.summary
  return (
    <div className="cc">
      <aside className="cc-side">
        <div className="cc-side-head">
          <b>Command Center</b>
          <span className="hint">Kantor agent Studio Clip</span>
        </div>
        <div className="cc-side-title">Agent ({agents.length})</div>
        <ul className="cc-agents">
          {agents.map((a) => (
            <li key={a.id}>
              <button type="button" className={sel === a.id ? 'is-sel' : ''} onClick={() => setSel(sel === a.id ? null : a.id)}>
                <span className="cc-ava" style={{ background: COLORS[idx[a.id] % COLORS.length] }}>{persona(a)[0]}</span>
                <span className="cc-agent-txt"><b>{persona(a)}</b><small>{a.name}</small></span>
                <span className="cc-pill" style={{ '--c': HEALTH[a.health][1] }}>{HEALTH[a.health][0]}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="cc-main">
        <div className="cc-top">
          <div className="cc-ranges" role="group" aria-label="Rentang waktu">
            {RANGES.map(([h, n]) => (
              <button key={h} type="button" className={`btn btn-sm ${hours === h ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={hours === h} onClick={() => setHours(h)}>{n}</button>
            ))}
          </div>
          <label className="check-row cc-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Segarkan otomatis (5 dtk)</label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>Segarkan</button>
          <span className="hint cc-upd">Update {clock(now)}{err ? ` · ${err}` : ''}</span>
        </div>

        <div className="cc-cards">
          <div className="cc-card"><span>Tugas</span><b className="tnum">{s.tasks}</b></div>
          <div className="cc-card"><span>Success rate</span><b className="tnum">{pct(s.success_rate)}</b><Meter rate={s.success_rate} /></div>
          <div className="cc-card"><span>Gagal</span><b className={`tnum ${s.error ? 'is-bad' : ''}`}>{s.error}</b></div>
          <div className="cc-card"><span>Sedang bekerja</span><b className="tnum">{s.running}</b></div>
          <div className="cc-card"><span>Rata-rata durasi</span><b className="tnum">{dur(s.avg_dur)}</b></div>
          <div className="cc-card"><span>Alert</span><b className={`tnum ${s.critical ? 'is-bad' : s.alerts ? 'is-warn' : ''}`}>{s.alerts}</b></div>
        </div>

        <div className="cc-grid">
          <section className="cc-panel cc-stage">
            <div className="cc-panel-head">
              <h2>{view === 'table' ? 'Metrics per agent' : 'Kantor agent'}</h2>
              <div className="cc-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={view === 'office'} className={view === 'office' ? 'is-on' : ''} onClick={() => setView('office')}>Kantor</button>
                <button type="button" role="tab" aria-selected={view === 'iso3d'} className={view === 'iso3d' ? 'is-on' : ''} onClick={() => { setIsoFail(false); setView('iso3d') }}>3D Isometrik</button>
                <button type="button" role="tab" aria-selected={view === 'brick'} className={view === 'brick' ? 'is-on' : ''} onClick={() => setView('brick')}>Balok</button>
                <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}>Tabel</button>
              </div>
            </div>
            {(DEMO || err) && (
              <div className="o3d-badges">
                {DEMO && <span className="o3d-badge demo">MODE DEMO, bukan data asli</span>}
                {err && <span className="o3d-badge off">Terputus, menampilkan data terakhir</span>}
              </div>
            )}
            {isoFail && view !== 'iso3d' && (
              <p className="hint oi3-failnote">Tampilan 3D Isometrik gagal dimuat, jadi dikembalikan ke tampilan Kantor.</p>
            )}
            {view === 'iso3d' && isoGl ? (
              <Load3DBoundary onFail={failIso}>
                <Suspense fallback={<p className="hint">Memuat 3D Isometrik…</p>}>
                  <OfficeIso3d data={data} scene={scene} selected={sel} offline={!!err}
                    onSelect={(id) => setSel(sel === id ? null : id)} onFail={failIso} />
                </Suspense>
              </Load3DBoundary>
            ) : view === 'iso3d' ? (
              <p className="hint">Tampilan 3D Isometrik butuh WebGL, yang tidak tersedia di browser ini. Tampilan Kantor, Balok, dan Tabel tetap bisa dipakai.</p>
            ) : view === 'office' && gl3d ? (
              <Load3DBoundary onFail={() => setGl3d(false)}>
                <Suspense fallback={<p className="hint">Memuat kantor 3D…</p>}>
                  <Office3D scene={scene} selected={sel} onSelect={(id) => setSel(sel === id ? null : id)} onFail={() => setGl3d(false)} />
                </Suspense>
              </Load3DBoundary>
            ) : view === 'office' ? (
              <div className="o3d-fallback">
                <p className="hint">Tampilan 3D tidak didukung di browser ini. Menampilkan kantor 2D.</p>
                <Office agents={agents} running={data.running} sel={sel} onSelect={(id) => setSel(sel === id ? null : id)} />
              </div>
            ) : view === 'brick' ? (
              <BrickOffice agents={agents} running={data.running} sel={sel} onSelect={(id) => setSel(sel === id ? null : id)} />
            ) : (
              <div className="cc-table-wrap">
                <table className="cc-table">
                  <thead><tr><th>Agent</th><th>Status</th><th>Tugas</th><th>Sukses</th><th>Gagal</th><th>Success rate</th><th>Rata-rata</th><th>Terakhir</th></tr></thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id} className={sel === a.id ? 'is-sel' : ''} onClick={() => setSel(a.id)}>
                        <td><b>{persona(a)}</b> <small className="hint">{a.name}</small></td>
                        <td><span className="cc-pill" style={{ '--c': HEALTH[a.health][1] }}>{HEALTH[a.health][0]}</span></td>
                        <td className="tnum">{a.total}</td><td className="tnum">{a.done}</td><td className="tnum">{a.error}</td>
                        <td><div className="cc-rate"><Meter rate={a.success_rate} /><span className="tnum">{pct(a.success_rate)}</span></div></td>
                        <td className="tnum">{dur(a.avg_dur)}</td><td>{ago(a.last_at, now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.running.length > 0 && (
              <div className="cc-running">
                {data.running.map((r) => (
                  <div key={r.id} className="cc-run">
                    <b>{PERSONA[r.agent] || r.name}</b> <span className="hint">{r.stage || r.name}</span>
                    <div className="cc-prog"><span style={{ width: `${(r.progress || 0) * 100}%` }} /></div>
                    <small className="tnum">{Math.round((r.progress || 0) * 100)}% · {dur(r.elapsed)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="cc-panel">
            <div className="cc-panel-head"><h2>Detail agent</h2></div>
            <AgentDetail a={selA} i={idx[sel] || 0} log={data.log} now={now} hours={hours} />
            <div className="cc-panel-head" style={{ marginTop: 18 }}><h2>Alert ({data.alerts.length})</h2></div>
            {data.alerts.length === 0 ? <p className="hint">Semua aman, tidak ada alert.</p> : (
              <ul className="cc-alerts">
                {data.alerts.map((al, k) => (
                  <li key={k} className={`lvl-${al.level}`}>
                    <b>{al.title}</b>
                    <span>{al.detail}</span>
                    {al.agent && <button type="button" className="cc-link" onClick={() => setSel(al.agent)}>Lihat agent</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="cc-panel">
          <div className="cc-panel-head">
            <h2>Task log</h2>
            <div className="cc-filters">
              <select className="select" value={fAgent} onChange={(e) => setFAgent(e.target.value)} aria-label="Filter agent">
                <option value="">Semua agent</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{persona(a)} · {a.name}</option>)}
              </select>
              <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter status">
                <option value="">Semua status</option><option value="done">Sukses</option><option value="error">Gagal</option>
              </select>
              <input className="input" placeholder="Cari tugas, project, error…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari di task log" />
            </div>
          </div>
          {log.length === 0 ? <p className="hint">Belum ada tugas di rentang waktu ini.</p> : (
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead><tr><th>Waktu</th><th>Agent</th><th>Tugas</th><th>Project / ref</th><th>Status</th><th>Durasi</th><th>Error</th></tr></thead>
                <tbody>
                  {log.map((e, k) => (
                    <tr key={k}>
                      <td className="tnum nowrap">{clock(e.end)}</td>
                      <td className="nowrap"><b>{PERSONA[e.agent] || e.agent_name}</b> <small className="hint">{e.agent_name}</small></td>
                      <td>{e.task}</td>
                      <td><small className="hint">{e.ref || '–'}</small></td>
                      <td><span className={`cc-st ${e.status}`}>{e.status === 'done' ? 'Sukses' : 'Gagal'}</span></td>
                      <td className="tnum nowrap">{e.job === 'riwayat' ? 'riwayat' : dur(e.dur)}</td>
                      <td className="cc-err-cell">{e.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
