// Uji validasi-revisi P2 (browser sungguhan lewat playwright-core + Microsoft Edge terpasang).
// Pakai: node tools/office-iso3d/probe2.mjs <baseUrl> <outDir> <skenario> [opsi]
// Skenario:
//   sync      gerak karakter mengikuti data: respons API ASLI ditambahi job + panggilan model TIRUAN (bukan job produksi)
//   perf      fps, jarak antar-frame, CPU utas utama, heap JS, draw call  [--fps=sepi,aktif] [--demo] [--view=office]
//   leak      buka-tutup tab 3D Isometrik berulang: heap, jumlah kanvas, peringatan WebGL
//   ctxlost   konteks WebGL dihilangkan paksa -> pesan -> "Coba lagi"
//   regress   tangkapan layar Kantor/Balok/Tabel + daftar id agent dari API
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const [base = 'http://127.0.0.1:8000', outDir = '.', scenario = 'perf', ...rest] = process.argv.slice(2)
const opt = (k, d) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: !rest.includes('--headed'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const view = opt('view', 'iso3d')
await page.addInitScript((v) => {
  try { localStorage.setItem('cc-view', v) } catch { /* abaikan */ }
  window.__draws = 0
  window.__ctxCreated = 0
  const gc = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = gc.call(this, type, ...a)
    if (c && /webgl/.test(type) && !this.__counted) { this.__counted = true; window.__ctxCreated++ }
    return c
  }
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = C.prototype[fn]
      if (o) C.prototype[fn] = function (...a) { window.__draws++; return o.apply(this, a) }
    }
  }
}, view)
const errors = []
const warnings = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text())
  if (m.type() === 'warning' && /webgl|context/i.test(m.text())) warnings.push(m.text())
})
let polls = 0
page.on('request', (r) => { if (r.url().includes('/api/command-center')) polls++ })
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const gcNow = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(300) }
const get = () => page.evaluate(() => ({ stats: window.__oi3stats, emp: window.__oi3emp, draws: window.__draws, ctx: window.__ctxCreated, log: window.__oi3log }))
const shot = async (name, sel = '.cc-stage') => { const el = await page.$(sel); await (el || page).screenshot({ path: `${outDir}/${name}.png` }) }
const srcLines = () => page.$$eval('.oi3-src div', (d) => d.map((x) => x.textContent)).catch(() => [])
const out = { scenario, base }

const query = [rest.includes('--demo') ? 'demo=1' : '', opt('fps', '') ? `oi3fps=${opt('fps', '')}` : '', 'oi3stats=1', opt('q', '')].filter(Boolean).join('&')

// ---------------------------------------------------------------------------------------------- sync
if (scenario === 'sync') {
  // Respons backend ASLI diambil apa adanya, lalu ditambahi SATU job horor tiruan dan (sesuai fase) satu panggilan
  // model tiruan. Tidak ada job produksi yang dijalankan; ini menguji logika dengan bentuk data backend yang asli.
  let phase = 'none'
  const llm = opt('llm', 'llm:gemini')
  await page.route('**/api/command-center**', async (route) => {
    const res = await route.fetch()
    const d = await res.json()
    const now = d.now
    if (phase !== 'none' && phase !== 'jobdone') {
      d.running.push({ id: 'uji-1', agent: 'job:horror', name: 'Studio Horor', stage: phase === 'call' ? 'AI menulis cerita' : 'Melukis gambar 2/17', progress: phase === 'call' ? 0.08 : 0.31, elapsed: 12 })
      const a = d.agents.find((x) => x.id === 'job:horror'); if (a) { a.running = 1; a.health = 'running'; a.scene_health = 'running' }
    }
    if (phase === 'call') d.inflight.push({ agent: llm, task: 'Chat model-uji', job: 'uji-1', job_kind: 'horror', since: now - 1 })
    await route.fulfill({ response: res, json: d })
  })
  await page.goto(`${base}/command-center?${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  const refresh = async () => { await page.click('.cc-top button:has-text("Segarkan")'); await page.waitForTimeout(250) }
  const snap = async (label) => {
    const g = await get(); const s = await srcLines()
    return { label, state: g.emp?.state, clip: g.emp?.clip, phase: g.emp?.phase, dist: g.emp?.dist, src: s[0]?.slice(0, 120), unit: s[1]?.slice(0, 90) }
  }
  out.steps = []
  out.steps.push(await snap('A. tanpa job (data asli)'))

  // B. job berjalan, belum memanggil model -> bekerja di meja
  phase = 'work'; await refresh(); await page.waitForTimeout(2200)
  out.steps.push(await snap('B. job berjalan, tanpa panggilan model')); await shot('sync-B-bekerja')

  // C. job memanggil model -> unit otomatis menampilkan model itu, karakter berjalan ke sana dan MENETAP selama panggilan ada
  phase = 'call'; await refresh(); await page.waitForTimeout(700)
  out.steps.push(await snap('C1. panggilan terlihat, 0,7 dtk kemudian (sedang berjalan)'))
  await page.waitForTimeout(3500)
  out.steps.push(await snap('C2. 4 dtk kemudian (sudah di depan unit)')); await shot('sync-C-di-unit')
  await page.waitForTimeout(12000) // lebih lama dari 9 detik: tidak boleh pulang sendiri selama panggilan masih ada
  out.steps.push(await snap('C3. 16 dtk kemudian, panggilan MASIH ada (harus tetap di unit)'))

  // D. panggilan selesai -> kembali ke meja, lanjut bekerja
  phase = 'work'; await refresh(); await page.waitForTimeout(600)
  out.steps.push(await snap('D1. panggilan hilang, 0,6 dtk kemudian (berjalan pulang)'))
  await page.waitForTimeout(4000)
  out.steps.push(await snap('D2. 4,6 dtk kemudian (di meja, bekerja)'))

  // E. interupsi: panggilan muncul, lalu hilang SEBELUM karakter sampai -> harus berbalik di tengah jalan
  phase = 'call'; await refresh(); await page.waitForTimeout(900)
  const e1 = await snap('E1. panggilan terlihat, 0,9 dtk (di tengah jalan menuju unit)')
  phase = 'work'; await refresh(); await page.waitForTimeout(350)
  const e2 = await snap('E2. panggilan hilang saat masih di jalan, 0,35 dtk kemudian')
  await shot('sync-E-berbalik')
  await page.waitForTimeout(3500)
  const e3 = await snap('E3. 3,5 dtk kemudian')
  out.steps.push(e1, e2, e3)
  out.interrupt = { reachedUnit: e1.phase === 'at' || e2.phase === 'at', turnedBack: e2.phase === 'back' && e2.dist < e1.dist + 0.6, endedAtSeat: e3.phase === 'seat' }

  // F. job selesai saat karakter di unit -> pulang, lalu siaga
  phase = 'call'; await refresh(); await page.waitForTimeout(4000)
  phase = 'jobdone'; await refresh(); await page.waitForTimeout(4500)
  out.steps.push(await snap('F. job selesai saat di unit, 4,5 dtk kemudian (harus siaga di meja)'))

  // G. backend terputus saat karakter di tengah jalan -> berhenti di tempat
  phase = 'call'; await refresh(); await page.waitForTimeout(900)
  await page.unroute('**/api/command-center**')
  await page.route('**/api/command-center**', (r) => r.fulfill({ status: 500, body: 'gagal' }))
  await refresh(); await page.waitForTimeout(600)
  const g1 = await snap('G1. backend terputus saat di jalan')
  await page.waitForTimeout(3000)
  const g2 = await snap('G2. 3 dtk kemudian (harus tetap di tempat yang sama)')
  await shot('sync-G-terputus')
  out.steps.push(g1, g2)
  out.offlineHold = { phase: g2.phase, moved: Math.abs((g2.dist ?? 0) - (g1.dist ?? 0)) > 0.01 }
  out.log = (await get()).log?.map((r) => `${r.at} | ${r.emp.slice(0, 110)} | ${r.unit.slice(0, 60)}`)
}

// ---------------------------------------------------------------------------------------------- perf
if (scenario === 'perf') {
  await page.goto(`${base}/command-center?${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)
  await gcNow()
  const m0 = await metrics(); const t0 = Date.now(); const d0 = (await get()).draws
  const samples = []
  const sec = Number(opt('sec', '12'))
  for (let i = 0; i < sec * 2; i++) { await page.waitForTimeout(500); samples.push((await get()).stats) }
  const m1 = await metrics(); const dt = (Date.now() - t0) / 1000
  const g = await get()
  const nums = (k) => samples.map((s) => s?.[k]).filter((v) => typeof v === 'number' && v > 0)
  const avg = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null)
  out.renderer = await page.evaluate(() => {
    const c = document.querySelector('.oi3 canvas, .o3d canvas'); const gl = c?.getContext('webgl2')
    const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null
  })
  out.perf = {
    fpsCap: samples.at(-1)?.fpsTarget ?? null, fpsAvg: avg(nums('fps')), fpsMin: nums('fps').length ? +Math.min(...nums('fps')).toFixed(1) : null,
    frameMsAvg: avg(nums('frameMs')), frameMsWorst: nums('frameMsMax').length ? +Math.max(...nums('frameMsMax')).toFixed(1) : null,
    cpuMsPerFrame: avg(nums('cpuMs')), calls: samples.at(-1)?.calls ?? null, triangles: samples.at(-1)?.triangles ?? null,
    geometries: samples.at(-1)?.geometries ?? null, textures: samples.at(-1)?.textures ?? null,
    glDrawsPerSec: +((g.draws - d0) / dt).toFixed(0),
    mainThreadBusyPct: +(((m1.TaskDuration - m0.TaskDuration) / dt) * 100).toFixed(1),
    scriptPct: +(((m1.ScriptDuration - m0.ScriptDuration) / dt) * 100).toFixed(1),
    jsHeapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1), domNodes: m1.Nodes, pollsPer10s: null,
  }
}

// ---------------------------------------------------------------------------------------------- leak
if (scenario === 'leak') {
  await page.goto(`${base}/command-center?${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const row = async (label) => { await gcNow(); const m = await metrics(); const g = await get()
    return { label, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, canvases: await page.$$eval('canvas', (c) => c.length), ctxCreated: g.ctx, geometries: g.stats?.geometries, textures: g.stats?.textures } }
  out.rows = [await row('awal (tab terbuka)')]
  const cycles = Number(opt('cycles', '12'))
  for (let i = 1; i <= cycles; i++) {
    await page.click('.cc-tabs button:has-text("Tabel")'); await page.waitForTimeout(700)
    if (i === 1) out.rows.push(await row('siklus 1: di Tabel (kanvas dilepas)'))
    await page.click(`.cc-tabs button:has-text("${opt('tab', '3D Isometrik')}")`); await page.waitForTimeout(1800)
    if (i === 1 || i === 4 || i === 8 || i === cycles) out.rows.push(await row(`siklus ${i}: kembali ke tab`))
  }
  const dA = (await get()).draws; await page.waitForTimeout(2000)
  out.stillRendering = (await get()).draws - dA > 0
  await page.click('.cc-tabs button:has-text("Tabel")'); await page.waitForTimeout(1500)
  const dB = (await get()).draws; await page.waitForTimeout(3000)
  out.drawsAfterFinalLeave = (await get()).draws - dB
  out.rows.push(await row('akhir: di Tabel'))
  out.webglWarnings = [...new Set(warnings)].slice(0, 5)
}

// ---------------------------------------------------------------------------------------------- ctxlost
if (scenario === 'ctxlost') {
  await page.goto(`${base}/command-center?${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  out.before = { canvas: !!(await page.$('.oi3 canvas')), ctx: (await get()).ctx }
  out.lostOk = await page.evaluate(() => {
    const c = document.querySelector('.oi3 canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl')
    const ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return false
    ext.loseContext(); return true
  })
  await page.waitForTimeout(1200)
  const body = await page.innerText('.cc-stage')
  out.afterLoss = { message: body.includes('berhenti karena kartu grafis'), retryButton: !!(await page.$('.oi3-msg button')), canvas: !!(await page.$('.oi3 canvas')), panels: (await page.innerText('body')).includes('Success rate') }
  await shot('ctxlost-pesan')
  await page.click('.oi3-msg button'); await page.waitForTimeout(3500)
  const d0 = (await get()).draws; await page.waitForTimeout(2000)
  out.afterRetry = { canvas: !!(await page.$('.oi3 canvas')), rendering: (await get()).draws - d0 > 0, ctx: (await get()).ctx, emp: (await get()).emp?.clip }
  await shot('ctxlost-pulih')
}

// ---------------------------------------------------------------------------------------------- regress
if (scenario === 'regress') {
  await page.goto(`${base}/command-center`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  out.tabs = await page.$$eval('.cc-tabs button', (b) => b.map((x) => `${x.textContent}${x.getAttribute('aria-selected') === 'true' ? '*' : ''}`))
  out.view = {}
  const tag = opt('tag', 'now')
  for (const [name, check] of [['Balok', 'svg'], ['Tabel', '.cc-table'], ['Kantor', '.o3d canvas, .o3d-fallback']]) {
    if (!(view === 'office' && name === 'Kantor')) { await page.click(`.cc-tabs button:has-text("${name}")`); await page.waitForTimeout(name === 'Kantor' ? 3500 : 900) }
    out.view[name] = { ok: !!(await page.$(`.cc-stage ${check.split(',')[0]}`)) || !!(await page.$(`.cc-stage ${check.split(',').pop()}`)), rows: name === 'Tabel' ? await page.$$eval('.cc-stage .cc-table tbody tr', (r) => r.length) : undefined,
      desks: name === 'Balok' ? await page.$$eval('.cc-stage svg .cc-desk', (d) => d.length) : undefined }
    await shot(`regress-${tag}-${name.toLowerCase()}`)
  }
  out.sideAgents = await page.$$eval('.cc-agents li', (l) => l.length)
  out.api = await page.evaluate(async () => {
    const d = await (await fetch('/api/command-center?hours=24')).json()
    return { keys: Object.keys(d).sort(), agentIds: d.agents.map((a) => a.id).sort(), agentKeys: Object.keys(d.agents[0]).sort() }
  })
  const p0 = polls; await page.waitForTimeout(30000); out.pollsPer30s = polls - p0
}

out.errors = [...new Set(errors)].slice(0, 6)
console.log(JSON.stringify(out, null, 1))
await browser.close()
