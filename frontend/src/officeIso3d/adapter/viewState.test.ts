import { describe, expect, it } from 'vitest'
import { demoFeed } from '../../office3d/demoFeed.js'
import { approach, smooth, turnToward } from './interpolate'
import { aiLabel, deriveView, findCalls, isActive } from './viewState'
import type { CcData } from './types'
import { nextState } from '../anim/stateMachine'
import { routeLength, routePose, stepAlong, WALK_SPEED } from '../anim/locomotion'
import type { Vec2 } from '../anim/locomotion'
import { frameDivisor } from '../perf/FrameGovernor'

const NOW = 1_800_000_000_000
const agent = (id: string, over: object = {}) => ({ id, name: id, running: 0, health: 'ok' as const, scene_health: 'ok' as const, ...over })
const base = (over: Partial<CcData> = {}): CcData => ({
  now: NOW / 1000, agents: [agent('job:horror', { name: 'Studio Horor' }), agent('llm:groq', { name: 'Otak AI · Groq' })],
  running: [], inflight: [], log: [], ...over,
})
const cfg = { employeeId: 'job:horror', aiUnitId: 'llm:groq' }
const horrorJob = { id: 'j1', agent: 'job:horror', name: 'Studio Horor', stage: 'AI menulis cerita', progress: 0.1, elapsed: 3 }
const call = (llm: string, job = 'j1', kind = 'horror') => ({ agent: llm, task: 'Chat model-x', job, job_kind: kind, since: NOW / 1000 - 1 })

describe('adapter: karyawan', () => {
  it('tanpa job/panggilan aktif -> idle (tidak mengarang aktivitas)', () => {
    const v = deriveView(base(), cfg, NOW)
    expect(v.employee.state).toBe('idle')
    expect(v.employee.progress).toBeNull()
    expect(v.employee.call).toBeNull()
    expect(isActive(v)).toBe(false)
  })

  it('job aktif di running[] -> working, tahap & progres dari data', () => {
    const d = base({ running: [{ ...horrorJob, stage: 'Melukis gambar 3/17', progress: 0.42 }] })
    d.agents[0].running = 1
    const v = deriveView(d, cfg, NOW)
    expect(v.employee.state).toBe('working')
    expect(v.employee.stage).toBe('Melukis gambar 3/17')
    expect(v.employee.progress).toBe(0.42)
    expect(v.employee.reason).toContain('running[]')
  })

  it('agent layanan dengan panggilan in-flight -> working', () => {
    const d = base({ agents: [agent('tts')], inflight: [{ agent: 'tts', task: 'Suara narator_d', job: 'j1', job_kind: 'horror', since: NOW / 1000 - 2 }] })
    const v = deriveView(d, { employeeId: 'tts', aiUnitId: 'llm:groq' }, NOW)
    expect(v.employee.state).toBe('working')
    expect(v.employee.stage).toBe('Suara narator_d')
  })

  it('job agent lain yang berjalan TIDAK membuat karyawan ini bekerja', () => {
    const d = base({ running: [{ id: 'j2', agent: 'job:process', name: 'Analis klip', stage: 'x', progress: 0.5, elapsed: 3 }] })
    expect(deriveView(d, cfg, NOW).employee.state).toBe('idle')
  })

  it('backend terputus -> tidak beranimasi kerja walau data terakhir bilang bekerja/memanggil', () => {
    const d = base({ running: [horrorJob], inflight: [call('llm:groq')] })
    const v = deriveView(d, { ...cfg, offline: true }, NOW)
    expect(v.employee.state).toBe('idle')
    expect(v.employee.call).toBeNull()
    expect(v.employee.progress).toBeNull()
    expect(v.aiUnit.state).toBe('idle')
    expect(v.offline).toBe(true)
  })

  it('data belum ada / agent tidak dikenal -> idle, ditandai tidak dikenal', () => {
    expect(deriveView(null, cfg, NOW).employee.state).toBe('idle')
    const v = deriveView(base(), { employeeId: 'job:tidak-ada', aiUnitId: 'llm:groq' }, NOW)
    expect(v.employee.known).toBe(false)
    expect(v.employee.state).toBe('idle')
  })

  it('scene_health error/warning diteruskan sebagai indikator', () => {
    const d = base()
    d.agents[0].scene_health = 'error'
    expect(deriveView(d, cfg, NOW).employee.health).toBe('error')
  })
})

describe('adapter: menemui unit AI mengikuti inflight[] (bukan timer)', () => {
  it('job milik karyawan SEDANG memanggil model yang unitnya tampil -> consulting', () => {
    const v = deriveView(base({ running: [horrorJob], inflight: [call('llm:groq')] }), cfg, NOW)
    expect(v.employee.state).toBe('consulting')
    expect(v.employee.goesToUnit).toBe(true)
    expect(v.employee.call).toMatchObject({ llm: 'llm:groq', job: 'j1' })
    expect(v.aiUnit.state).toBe('active')
  })

  it('poll berikutnya: panggilan sudah tidak ada -> langsung kembali ke working (status menghentikan perjalanan)', () => {
    const during = deriveView(base({ running: [horrorJob], inflight: [call('llm:groq')] }), cfg, NOW)
    const after = deriveView(base({ running: [horrorJob], inflight: [] }), cfg, NOW + 5000)
    expect(during.employee.state).toBe('consulting')
    expect(after.employee.state).toBe('working')
    expect(after.employee.goesToUnit).toBe(false)
  })

  it('job selesai saat masih memanggil -> idle di poll berikutnya', () => {
    expect(deriveView(base(), cfg, NOW + 5000).employee.state).toBe('idle')
  })

  it('panggilan yang SUDAH selesai (hanya ada di log[]) tidak diputar ulang sebagai perjalanan', () => {
    const d = base({ running: [horrorJob], log: [{ agent: 'llm:groq', task: 'Chat', status: 'done', start: NOW / 1000 - 3, end: NOW / 1000 - 2, job: 'j1' }] })
    const v = deriveView(d, cfg, NOW)
    expect(v.employee.state).toBe('working')
    expect(v.employee.goesToUnit).toBe(false)
    expect(v.employee.lastCall).toEqual({ llm: 'llm:groq', agoSec: 2 })
    expect(v.employee.reason).toContain('tidak diputar ulang')
  })

  it('tujuan = model yang benar-benar dipanggil: memanggil model LAIN -> tidak berjalan ke unit yang tampil', () => {
    const v = deriveView(base({ running: [horrorJob], inflight: [call('llm:gemini')] }), cfg, NOW)
    expect(v.employee.state).toBe('working')
    expect(v.employee.goesToUnit).toBe(false)
    expect(v.employee.call?.llm).toBe('llm:gemini')
    expect(v.aiUnit.state).toBe('idle')
  })

  it('panggilan model oleh job agent LAIN tidak menggerakkan karyawan ini', () => {
    const d = base({ running: [{ ...horrorJob, id: 'j9', agent: 'job:process' }], inflight: [call('llm:groq', 'j9', 'process')] })
    const v = deriveView(d, cfg, NOW)
    expect(v.employee.state).toBe('idle')
    expect(v.aiUnit.state).toBe('active') // unitnya memang sedang dipanggil, oleh job lain
  })

  it('panggilan model di luar job (job kosong) tidak menggerakkan siapa pun', () => {
    const v = deriveView(base({ inflight: [call('llm:groq', '', '')] }), cfg, NOW)
    expect(v.employee.state).toBe('idle')
  })

  it('findCalls: urut dari yang paling awal; job dikenali lewat running[] atau job_kind', () => {
    const d = base({ inflight: [{ ...call('llm:gemini'), since: 20 }, { ...call('llm:groq'), since: 10 }, call('llm:openai', 'jx', 'process')] })
    expect(findCalls(d, 'job:horror').map((c) => c.llm)).toEqual(['llm:groq', 'llm:gemini'])
    expect(findCalls(null, 'job:horror')).toEqual([])
  })

  it('dua model dipanggil sekaligus -> yang unitnya tampil diutamakan', () => {
    const d = base({ running: [horrorJob], inflight: [{ ...call('llm:gemini'), since: 1 }, { ...call('llm:groq'), since: 2 }] })
    expect(deriveView(d, cfg, NOW).employee.call?.llm).toBe('llm:groq')
  })
})

describe('adapter: unit AI', () => {
  it('identitas asli: id llm:* dan label dari backend, bukan nama persona manusia', () => {
    const v = deriveView(base(), cfg, NOW)
    expect(v.aiUnit.agentId).toBe('llm:groq')
    expect(v.aiUnit.label).toBe('Otak AI · Groq')
    expect(aiLabel('llm:moonshot')).toBe('Otak AI · Moonshot')
    expect(aiLabel('llm:groq', 'Gilang')).toBe('Otak AI · Groq')
  })

  it('event selesai ≤ 15 dtk -> done; lebih lama -> idle', () => {
    const ev = (ago: number) => base({ log: [{ agent: 'llm:groq', task: 'Chat', status: 'done', start: NOW / 1000 - ago - 1, end: NOW / 1000 - ago }] })
    expect(deriveView(ev(5), cfg, NOW).aiUnit.state).toBe('done')
    expect(deriveView(ev(20), cfg, NOW).aiUnit.state).toBe('idle')
  })

  it('event selesai model LAIN tidak menyalakan unit ini', () => {
    const d = base({ log: [{ agent: 'llm:gemini', task: 'Chat', status: 'done', start: NOW / 1000 - 2, end: NOW / 1000 - 1 }] })
    expect(deriveView(d, cfg, NOW).aiUnit.state).toBe('idle')
  })

  it('scene_health error -> error', () => {
    const d = base()
    d.agents[1].scene_health = 'error'
    expect(deriveView(d, cfg, NOW).aiUnit.state).toBe('error')
  })
})

describe('adapter + demoFeed (bentuk data sama dengan backend)', () => {
  it('satu siklus demo: consulting HANYA pada detik ketika inflight[] berisi panggilan groq milik job horor', () => {
    const cycle = 40000
    const t0 = Math.ceil(NOW / cycle) * cycle
    const states = new Set<string>()
    for (let s = 0; s < 40; s += 0.5) {
      const now = t0 + s * 1000
      const data = demoFeed(now) as unknown as CcData
      const v = deriveView(data, cfg, now)
      const calling = data.inflight.some((i) => i.agent === 'llm:groq' && i.job === 'demo-h')
      const runningHorror = data.running.some((r) => r.agent === 'job:horror')
      expect(v.employee.state === 'consulting').toBe(calling)
      if (!calling) expect(v.employee.state).toBe(runningHorror ? 'working' : 'idle')
      states.add(v.employee.state)
    }
    expect([...states].sort()).toEqual(['consulting', 'idle', 'working'])
  })
})

describe('interpolasi: hanya menuju nilai terakhir, tidak melewatinya', () => {
  it('approach berhenti tepat di target', () => {
    expect(approach(0.4, 0.55, 0.1, 0.25)).toBeCloseTo(0.425)
    expect(approach(0.54, 0.55, 1, 0.25)).toBe(0.55)
    expect(approach(0.55, 0.55, 5, 0.25)).toBe(0.55)
    expect(approach(0.8, 0.2, 10, 0.25)).toBe(0.2)
  })
  it('smooth terikat 0..1; turnToward mengambil jalur terpendek', () => {
    expect(smooth(-1)).toBe(0)
    expect(smooth(2)).toBe(1)
    expect(smooth(0.5)).toBeCloseTo(0.5)
    expect(turnToward(3.0, -3.0, 0.1)).toBeCloseTo(3.1)
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05)
  })
})

describe('mesin keadaan', () => {
  it('menahan working minimal 1,5 dtk (anti-kedip)', () => {
    expect(nextState('working', 'idle', 0.5)).toBe('working')
    expect(nextState('working', 'idle', 1.6)).toBe('idle')
    expect(nextState('idle', 'working', 0.5)).toBe('working')
    expect(nextState('idle', 'idle', 99)).toBe('idle')
  })
  it('masuk dan keluar consulting tidak pernah ditunda', () => {
    expect(nextState('working', 'consulting', 0)).toBe('consulting')
    expect(nextState('consulting', 'working', 0)).toBe('working')
    expect(nextState('consulting', 'idle', 0)).toBe('idle')
  })
})

describe('lokomosi: menuju tujuan dari data, tanpa jadwal perjalanan', () => {
  const route: Vec2[] = [[0, 0], [1, 0], [1, 1]]
  const len = routeLength(route)
  const walk = (dist: number, target: number, sec: number) => {
    let d = dist
    for (let t = 0; t < sec; t += 1 / 60) d = stepAlong(d, target, 1 / 60)
    return d
  }

  it('mencapai tujuan lalu berhenti tepat di sana (tidak melewati)', () => {
    expect(len).toBe(2)
    expect(walk(0, len, 10)).toBe(len)
    expect(walk(len, 0, 10)).toBe(0)
    expect(stepAlong(0, 0, 1)).toBe(0)
  })

  it('tujuan berubah di tengah jalan -> berbalik dari posisi saat itu, bukan melanjutkan', () => {
    const mid = walk(0, len, 0.6) // baru sebagian jalan
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(len)
    const next = stepAlong(mid, 0, 1 / 60) // data berubah: panggilan selesai
    expect(next).toBeLessThan(mid)
    expect(walk(mid, 0, 10)).toBe(0)
  })

  it('tanpa tujuan baru karakter diam: dt berapa pun tidak menggeser posisi', () => {
    expect(stepAlong(0.7, 0.7, 5)).toBe(0.7)
  })

  it('kecepatan tidak melebihi batas dan posisi selalu di jalur', () => {
    let d = 0
    for (let i = 0; i < 400; i++) {
      const n = stepAlong(d, len, 1 / 60)
      expect(n - d).toBeLessThanOrEqual(WALK_SPEED / 60 + 1e-9)
      d = n
      const p = routePose(route, d, true)
      expect(p.x).toBeGreaterThanOrEqual(-1e-9)
      expect(p.x).toBeLessThanOrEqual(1 + 1e-9)
      expect(p.z).toBeGreaterThanOrEqual(-1e-9)
      expect(p.z).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('arah hadap berbalik saat kembali', () => {
    const go = routePose(route, 0.5, true).heading
    const back = routePose(route, 0.5, false).heading
    expect(Math.abs(back - go)).toBeCloseTo(Math.PI)
  })
})

describe('pengatur frame', () => {
  it('menggambar tiap N penyegaran layar (N bulat) sedekat mungkin dengan batas', () => {
    expect(frameDivisor(60, 60)).toBe(1)
    expect(frameDivisor(60, 30)).toBe(2)
    expect(frameDivisor(75, 60)).toBe(1)
    expect(frameDivisor(144, 60)).toBe(2)
    expect(frameDivisor(165, 30)).toBe(6)
    expect(frameDivisor(60, 240)).toBe(1)
    expect(frameDivisor(0, 60)).toBe(1)
  })
})
