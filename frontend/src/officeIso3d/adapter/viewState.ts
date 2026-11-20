// Office Visualization Adapter (P2): respons /api/command-center -> keadaan satu karyawan + satu unit AI.
// Fungsi murni. Aturan: setiap keadaan harus punya sumber data; tidak ada animasi kerja tanpa event asli.
import { PERSONA } from '../../office3d/layout.js'
import type { AiUnitView, CcData, EmployeeView, Health, ModelCall, OfficeView } from './types'

export const FRESH_MS = 15000 // event selesai lebih tua dari ini tidak lagi ditandai "baru selesai"

export interface ViewConfig { employeeId: string; aiUnitId: string; offline?: boolean }

const persona = PERSONA as Record<string, string>

function healthOf(v: string | undefined): Health {
  return v === 'error' ? 'error' : v === 'warning' ? 'warning' : 'ok'
}

// Label asli unit AI: pakai nama dari backend bila ada; kalau belum pernah dipanggil, bentuk yang sama
// dengan telemetry.agent_info() ("Otak AI · Groq").
export function aiLabel(id: string, backendName?: string): string {
  // nama persona manusia (dipakai tampilan lama & data demo) tidak boleh jadi label unit AI
  if (backendName && backendName !== persona[id]) return backendName
  const prov = id.startsWith('llm:') ? id.slice(4) : id
  return `Otak AI · ${prov.charAt(0).toUpperCase()}${prov.slice(1)}`
}

/** Job itu milik agent ini? (id job -> agent lewat running[]; kalau job tidak ada di running[], lewat job_kind) */
function ownsJob(data: CcData, employeeId: string, job: string, jobKind?: string): boolean {
  if (!job) return false
  const run = data.running.find((r) => r.id === job)
  if (run) return run.agent === employeeId
  return !!jobKind && `job:${jobKind}` === employeeId
}

/**
 * Panggilan model AI yang SEDANG berjalan milik job karyawan ini, urut dari yang paling awal.
 * Sumbernya hanya inflight[] (panggilan yang benar-benar sedang dieksekusi backend saat poll terakhir).
 */
export function findCalls(data: CcData | null, employeeId: string): ModelCall[] {
  if (!data) return []
  return data.inflight
    .filter((i) => i.agent.startsWith('llm:') && ownsJob(data, employeeId, i.job, i.job_kind))
    .sort((x, y) => x.since - y.since)
    .map((i) => ({ llm: i.agent, task: i.task, job: i.job, since: i.since }))
}

export function deriveView(data: CcData | null, cfg: ViewConfig, nowMs: number): OfficeView {
  const offline = !!cfg.offline || !data
  const agents = data?.agents ?? []
  const running = data?.running ?? []
  const inflight = data?.inflight ?? []
  const log = data?.log ?? []

  // ---- karyawan
  const a = agents.find((x) => x.id === cfg.employeeId)
  const run = running.find((r) => r.agent === cfg.employeeId)
  const inf = inflight.find((i) => i.agent === cfg.employeeId)
  const calls = findCalls(data, cfg.employeeId)
  // bila beberapa model dipanggil sekaligus, utamakan yang unitnya ditampilkan (itu pun benar-benar sedang dipanggil)
  const call = calls.find((c) => c.llm === cfg.aiUnitId) ?? calls[0] ?? null
  const goesToUnit = !!call && call.llm === cfg.aiUnitId
  const busy = !!a && ((a.running || 0) > 0 || !!run || !!inf || !!call)
  const done = data ? log.find((e) => e.agent.startsWith('llm:') && e.status === 'done' && nowMs - e.end * 1000 <= FRESH_MS
    && ownsJob(data, cfg.employeeId, e.job ?? '')) : undefined

  const employee: EmployeeView = {
    agentId: cfg.employeeId,
    name: persona[cfg.employeeId] || a?.name || cfg.employeeId,
    role: a?.name || '',
    known: !!a,
    state: 'idle',
    health: healthOf(a?.scene_health),
    stage: run?.stage || inf?.task || null,
    progress: run ? run.progress : null,
    call: null,
    goesToUnit: false,
    lastCall: done ? { llm: done.agent, agoSec: Math.max(0, Math.round((nowMs - done.end * 1000) / 1000)) } : null,
    reason: '',
  }
  if (offline) {
    employee.stage = null
    employee.progress = null
    employee.lastCall = null
    employee.reason = 'Backend terputus: berhenti di tempat, tidak beranimasi kerja'
  } else if (!a) {
    employee.lastCall = null
    employee.reason = `Agent ${cfg.employeeId} tidak ada di data`
  } else if (call && goesToUnit) {
    employee.state = 'consulting'
    employee.call = call
    employee.goesToUnit = true
    employee.reason = `inflight[]: job ${call.job} sedang memanggil ${call.llm} ("${call.task}")`
  } else if (busy) {
    employee.state = 'working'
    employee.call = call
    employee.reason = run
      ? `running[]: job ${run.id}, tahap "${run.stage || '-'}", ${Math.round((run.progress || 0) * 100)}%`
      : inf ? `inflight[]: "${inf.task}"${inf.job ? `, job ${inf.job}` : ''}` : `agents[].running = ${a.running}`
    if (call) employee.reason += ` · sedang memanggil ${call.llm}, tetapi unit itu tidak ditampilkan (tidak berjalan ke unit lain)`
  } else {
    employee.reason = `Tidak ada job/panggilan aktif (health: ${a.health})`
  }
  if (!offline && a && !call && employee.lastCall) {
    employee.reason += ` · panggilan ${employee.lastCall.llm} sudah selesai ${employee.lastCall.agoSec} dtk lalu (tidak diputar ulang sebagai gerak)`
  }

  // ---- unit AI
  const u = agents.find((x) => x.id === cfg.aiUnitId)
  const uInf = inflight.find((i) => i.agent === cfg.aiUnitId)
  const uDone = log.find((e) => e.agent === cfg.aiUnitId && e.status === 'done' && nowMs - e.end * 1000 <= FRESH_MS)
  const uHealth = healthOf(u?.scene_health)
  const aiUnit: AiUnitView = { agentId: cfg.aiUnitId, label: aiLabel(cfg.aiUnitId, u?.name), state: 'idle', task: null, reason: '' }
  if (offline) {
    aiUnit.reason = 'Backend terputus'
  } else if (uInf) {
    aiUnit.state = 'active'
    aiUnit.task = uInf.task
    aiUnit.reason = `inflight[]: "${uInf.task}"${uInf.job ? `, dipanggil job ${uInf.job}` : ', di luar job'}`
  } else if (uHealth !== 'ok') {
    aiUnit.state = uHealth
    aiUnit.reason = `agents[].scene_health = ${uHealth}`
  } else if (uDone) {
    aiUnit.state = 'done'
    aiUnit.task = uDone.task
    aiUnit.reason = `log[]: "${uDone.task}" selesai ${Math.max(0, Math.round((nowMs - uDone.end * 1000) / 1000))} dtk lalu`
  } else {
    aiUnit.reason = u ? 'Tidak ada panggilan aktif' : 'Belum pernah dipanggil di rentang waktu ini'
  }
  return { employee, aiUnit, offline }
}

// Laju render: tinggi hanya saat ada yang bergerak, rendah saat sepi (laptop pemilik mudah panas).
export function isActive(v: OfficeView): boolean {
  return v.employee.state !== 'idle' || v.aiUnit.state === 'active'
}
