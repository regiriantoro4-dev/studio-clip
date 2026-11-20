// Mode Demo (?demo=1): data tiruan berbentuk persis respons /api/command-center, untuk dipamerkan saat
// tidak ada job berjalan. Halaman WAJIB menampilkan lencana "MODE DEMO" — ini bukan data asli.
import { ALWAYS_PRESENT, PERSONA, ROOM_OF } from './layout.js'

export const CYCLE_MS = 40000

// Jadwal satu siklus (detik): [mulai, selesai, apa]
const HORROR_STAGES = [[8, 11, 'AI menulis cerita'], [11, 15, 'Narator membaca cerita'], [15, 20, 'Melukis gambar 9/17'], [20, 24, 'Parallax 2.5D adegan 12/17']]

const base = (id) => ({
  id, name: PERSONA[id] || id, role: '', group: id.startsWith('job:') ? 'kerja' : 'layanan',
  total: 12, done: 12, error: 0, success_rate: 1, avg_dur: 14.2, max_dur: 40, last_at: null, last_status: 'done',
  last_error: null, last_error_at: null, streak_fail: 0, running: 0, health: 'ok', scene_health: 'ok', series: Array(24).fill(1),
})

export function demoFeed(tMs) {
  const cycleStart = Math.floor(tMs / CYCLE_MS) * CYCLE_MS
  const s = (tMs - cycleStart) / 1000 // detik dalam siklus
  const at = (sec) => (cycleStart + sec * 1000) / 1000 // waktu unix (detik) dari detik-siklus
  const ids = [...new Set([...Object.keys(ROOM_OF), ...ALWAYS_PRESENT])]
  const agents = Object.fromEntries(ids.map((id) => [id, base(id)]))
  const running = []
  const inflight = []
  const log = []

  // Studio Horor bekerja 8–24 dtk; tanya AI di awal, suara di tengah
  const hs = HORROR_STAGES.find(([a, b]) => s >= a && s < b)
  if (hs) {
    running.push({ id: 'demo-h', agent: 'job:horror', name: 'Studio Horor', stage: hs[2], progress: (s - 8) / 16, elapsed: s - 8 })
    agents['job:horror'].running = 1
    if (s < 11) inflight.push({ agent: 'llm:groq', task: 'Chat gpt-oss-120b', job: 'demo-h', job_kind: 'horror', since: at(8.5) })
    if (s >= 11 && s < 15) inflight.push({ agent: 'tts', task: 'Suara narator_d', job: 'demo-h', job_kind: 'horror', since: at(11) })
  }
  // Analis Klip memproses video 14–30 dtk: unduh -> transkrip (serah terima ke Analis) -> tanya AI
  if (s >= 14 && s < 30) {
    running.push({ id: 'demo-p', agent: 'job:process', name: 'Analis klip', stage: s < 22 ? 'Transkripsi' : 'AI memilih momen', progress: (s - 14) / 16, elapsed: s - 14 })
    agents['job:process'].running = 1
    if (s < 17) inflight.push({ agent: 'downloader', task: 'Unduh video', job: 'demo-p', job_kind: 'process', since: at(14) })
    else if (s < 21) inflight.push({ agent: 'transcriber', task: 'Transkrip (groq)', job: 'demo-p', job_kind: 'process', since: at(17) })
    if (s >= 21) log.push({ agent: 'transcriber', task: 'Transkrip (groq)', status: 'done', start: at(17), end: at(21), dur: 4, job: 'demo-p', ref: '', error: '' })
    if (s >= 23 && s < 26) inflight.push({ agent: 'llm:gemini', task: 'Chat gemini', job: 'demo-p', job_kind: 'process', since: at(23) })
  }
  // Render gagal beruntun 26–33 dtk (ruangan berkedip merah), lalu pulih dan bekerja lagi 33–40 dtk
  if (s >= 26 && s < 33) Object.assign(agents.renderer, { health: 'error', scene_health: 'error', streak_fail: 3, error: 3, last_error: 'ffmpeg: encoder sibuk' })
  if (s >= 33) inflight.push({ agent: 'renderer', task: 'Render MP4 9:16', job: '', job_kind: '', since: at(33) })

  for (const i of inflight) agents[i.agent].running += 1
  for (const a of Object.values(agents)) if (a.running) { a.health = 'running'; a.scene_health = 'running' }
  const list = Object.values(agents)
  return {
    demo: true,
    now: tMs / 1000, hours: 24,
    summary: { tasks: 180, done: 176, error: 4, success_rate: 176 / 180, running: running.length,
      agents_active: list.length, alerts: s >= 26 && s < 33 ? 1 : 0, critical: s >= 26 && s < 33 ? 1 : 0, avg_dur: 14.2 },
    agents: list, running, inflight, log,
    alerts: s >= 26 && s < 33 ? [{ level: 'critical', title: 'Render gagal 3x berturut-turut', detail: 'ffmpeg: encoder sibuk', agent: 'renderer' }] : [],
  }
}
