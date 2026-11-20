// Bentuk respons GET /api/command-center yang dipakai modul ini (hanya dibaca; backend tidak diubah).
export interface CcAgent {
  id: string
  name: string
  role?: string
  group?: string
  running: number
  health: 'running' | 'ok' | 'idle' | 'warning' | 'error'
  scene_health?: 'running' | 'ok' | 'idle' | 'warning' | 'error'
}
export interface CcRunning { id: string; agent: string; name: string; stage: string; progress: number; elapsed: number }
export interface CcInflight { agent: string; task: string; job: string; job_kind: string; since: number }
export interface CcLog { agent: string; task: string; status: string; start: number; end: number; job?: string }
export interface CcData {
  demo?: boolean
  now: number
  agents: CcAgent[]
  running: CcRunning[]
  inflight: CcInflight[]
  log: CcLog[]
}

export type EmployeeState = 'idle' | 'working' | 'consulting'
export type Health = 'ok' | 'warning' | 'error'

/** Panggilan model AI yang SEDANG berjalan (satu entri inflight[]) milik job seorang karyawan. */
export interface ModelCall { llm: string; task: string; job: string; since: number }

export interface EmployeeView {
  agentId: string
  name: string            // nama persona yang sudah ada (Raka, Sari, ...)
  role: string            // nama agent dari backend ("Analis klip", ...)
  known: boolean          // false = agent tidak ada di data
  state: EmployeeState    // consulting = job-nya sedang memanggil model AI yang unitnya ditampilkan
  health: Health
  stage: string | null
  progress: number | null // 0..1 dari job aktif; null bila tidak ada
  call: ModelCall | null  // panggilan model AI yang sedang berjalan (dari inflight[]); null bila tidak ada
  goesToUnit: boolean     // true bila model yang dipanggil = unit AI yang ditampilkan (tujuan berjalan)
  lastCall: { llm: string; agoSec: number } | null // panggilan terakhir yang SUDAH selesai (log[]); hanya keterangan
  reason: string          // sumber data keadaan ini (ditampilkan di layar, untuk diperiksa pemilik)
}

export type AiUnitState = 'idle' | 'active' | 'done' | 'warning' | 'error'
export interface AiUnitView {
  agentId: string         // id asli, mis. "llm:groq"
  label: string           // label asli dari backend, mis. "Otak AI · Groq"
  state: AiUnitState
  task: string | null
  reason: string
}

export interface OfficeView { employee: EmployeeView; aiUnit: AiUnitView; offline: boolean }
