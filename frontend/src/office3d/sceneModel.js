// Model adegan: respons /api/command-center -> siapa duduk di mana, siapa mengetik, siapa berjalan ke mana.
// Fungsi murni (tanpa three.js) supaya bisa diuji. Semua gerak berasal dari data asli (spec §2 anti-sasaran).
import { ALWAYS_PRESENT, PERSONA, ROOMS, roomFor } from './layout.js'

export const MAX_TRIPS = 4        // paling banyak 4 karakter berjalan sekaligus
export const STALE_MS = 15000     // event lebih tua dari ini tidak memicu perjalanan (mis. tab lama tersembunyi)
export const TRIP_MS = 9000       // perjalanan dianggap selesai setelah ini (pergi + kembali)

const SEVERITY = { error: 2, warning: 1 }

export function deriveScene(data, prev, nowMs) {
  const d = data || {}
  const agents = d.agents || []
  const running = d.running || []
  const inflight = d.inflight || []
  const log = d.log || []

  const runOf = Object.fromEntries(running.map((r) => [r.agent, r]))
  const jobAgent = Object.fromEntries(running.map((r) => [r.id, r.agent]))
  const infOf = {}
  for (const i of inflight) if (!infOf[i.agent]) infOf[i.agent] = i

  // ---- karakter
  const byId = new Map(agents.map((a) => [a.id, a]))
  for (const id of ALWAYS_PRESENT) if (!byId.has(id)) byId.set(id, { id, name: PERSONA[id], health: 'idle', scene_health: 'idle', running: 0 })
  const perRoom = {}
  const characters = [...byId.values()]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((a) => {
      const roomId = roomFor(a.id)
      const slot = (perRoom[roomId] = (perRoom[roomId] ?? -1) + 1)
      const run = runOf[a.id]
      const inf = infOf[a.id]
      const busy = (a.running || 0) > 0 || !!run || !!inf
      const bad = SEVERITY[a.scene_health] > 0
      return {
        agentId: a.id, name: PERSONA[a.id] || a.name || a.id, roomId, slot,
        state: busy ? 'typing' : bad ? 'alert' : 'idle',
        stage: run?.stage || inf?.task || null,
        progress: run ? run.progress : null,
      }
    })

  // ---- ruangan
  const rooms = ROOMS.map((r) => {
    const mine = characters.filter((c) => c.roomId === r.id)
    let alert = null
    for (const c of mine) {
      const sev = SEVERITY[byId.get(c.agentId)?.scene_health] || 0
      if (sev > (SEVERITY[alert] || 0)) alert = sev === 2 ? 'error' : 'warning'
    }
    return { id: r.id, alert, activeCount: mine.filter((c) => c.state === 'typing').length }
  })

  // ---- perjalanan: lanjutkan yang masih berlangsung, tambah yang baru (maks MAX_TRIPS, satu per karakter)
  const trips = (prev?.trips || []).filter((t) => nowMs - t.startedAt < TRIP_MS)
  const seen = new Set(prev?.seen || [])
  const fresh = (tSec) => nowMs - tSec * 1000 <= STALE_MS
  const add = (t) => {
    if (seen.has(t.key)) return
    seen.add(t.key)
    if (trips.length >= MAX_TRIPS || trips.some((x) => x.agentId === t.agentId)) return
    trips.push({ ...t, startedAt: nowMs })
  }
  for (const i of inflight) {
    if (!i.agent.startsWith('llm:') || !i.job || !fresh(i.since)) continue
    const walker = jobAgent[i.job] || `job:${i.job_kind}`
    add({ key: `ask|${i.agent}|${i.job}|${i.since}`, agentId: walker, from: roomFor(walker), to: 'brain', kind: 'ask-ai' })
  }
  // Panggilan LLM singkat (1-2 dtk) sering selesai di antara dua poll: ambil juga dari log.
  // Kunci sama dengan versi in-flight (start log == since in-flight) supaya tidak dobel.
  const freshLlmDone = log.filter((e) => e.agent.startsWith('llm:') && e.status === 'done' && fresh(e.end))
  for (const e of freshLlmDone) {
    const walker = e.job && jobAgent[e.job]
    if (!walker) continue
    add({ key: `ask|${e.agent}|${e.job}|${e.start}`, agentId: walker, from: roomFor(walker), to: 'brain', kind: 'ask-ai' })
  }
  for (const e of log) {
    const owner = e.job && jobAgent[e.job]
    if (!owner || e.status !== 'done' || e.agent.startsWith('job:') || e.agent.startsWith('llm:') || !fresh(e.end)) continue
    const from = roomFor(e.agent)
    const to = roomFor(owner)
    if (from === to) continue
    add({ key: `hand|${e.agent}|${e.job}|${e.end}`, agentId: e.agent, from, to, kind: 'handoff' })
  }

  const llmBusy = inflight.filter((i) => i.agent.startsWith('llm:')).length
  return {
    characters, rooms, trips,
    brainPulse: Math.min(1, llmBusy * 0.35 + freshLlmDone.length * 0.2),
    stale: !data,
    seen: [...seen].slice(-200),
  }
}

// Kecepatan render: 30 fps hanya saat ada yang bergerak (mengetik, berjalan, inti berdenyut, lampu peringatan).
// Saat kantor sepi cukup 6 fps — laptop pemilik mudah panas (spec §2 anti-sasaran).
export const FPS_ACTIVE = 30
export const FPS_IDLE = 6

export function targetFps(scene) {
  if (!scene) return FPS_IDLE
  const busy = scene.trips.length > 0 || scene.brainPulse > 0
    || scene.characters.some((c) => c.state !== 'idle') || scene.rooms.some((r) => r.alert)
  return busy ? FPS_ACTIVE : FPS_IDLE
}
