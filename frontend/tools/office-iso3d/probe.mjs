// Uji prototipe "3D Isometrik" di browser sungguhan (Microsoft Edge terpasang, lewat playwright-core).
// Pakai: node tools/office-iso3d/probe.mjs <baseUrl> <outDir> <skenario>
// Skenario: shot | demo | camera | lifecycle | hidden | missing | nowebgl | chunkfail | click
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const [base = 'http://127.0.0.1:8000', outDir = '.', scenario = 'shot', ...rest] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const noWebgl = scenario === 'nowebgl'
const args = noWebgl ? ['--disable-webgl', '--disable-3d-apis'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
const browser = await chromium.launch({ channel: 'msedge', headless: !rest.includes('--headed'), args })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const view = rest.find((a) => a.startsWith('--view='))?.split('=')[1] ?? 'iso3d'
await page.addInitScript((v) => {
  try { localStorage.setItem('cc-view', v) } catch { /* abaikan */ }
  window.__draws = 0
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = C.prototype[fn]
      if (o) C.prototype[fn] = function (...a) { window.__draws++; return o.apply(this, a) }
    }
  }
}, view)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()) })
const requests = []
page.on('request', (r) => requests.push(r.url()))
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`) })

const out = { scenario, base }
const q = (scenario === 'demo' || rest.includes('--demo') ? '?demo=1&oi3stats=1' : '?oi3stats=1') + (rest.find((a) => a.startsWith('--q='))?.slice(4) ?? '')
const stats = () => page.evaluate(() => ({ stats: window.__oi3stats, emp: window.__oi3emp, draws: window.__draws, missing: window.__oi3missing }))
const shot = async (name) => { const el = await page.$('.cc-stage'); await (el || page).screenshot({ path: `${outDir}/${name}.png` }) }
const gpu = () => page.evaluate(() => {
  const c = document.querySelector('.oi3 canvas') || document.createElement('canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  if (!gl) return null
  const e = gl.getExtension('WEBGL_debug_renderer_info')
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'tidak diketahui'
})

if (scenario === 'missing') await page.route('**/office-iso3d/furniture/desk.glb', (r) => r.abort())
if (scenario === 'missing-char') await page.route('**/office-iso3d/characters/*.glb', (r) => r.abort())
if (scenario === 'chunkfail') await page.route(/OfficeIso3d[^/]*\.(js|tsx)/, (r) => r.abort())

await page.goto(`${base}/command-center${q}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(Number(rest.find((a) => /^\d+$/.test(a)) ?? 5000))
out.hasCanvas = !!(await page.$('.oi3 canvas'))
out.tabs = await page.$$eval('.cc-tabs button', (b) => b.map((x) => `${x.textContent}${x.getAttribute('aria-selected') === 'true' ? '*' : ''}`))

if (scenario === 'shot' || scenario === 'missing' || scenario === 'missing-char' || scenario === 'nowebgl' || scenario === 'chunkfail') {
  await shot(scenario === 'shot' ? (rest.find((a) => a.startsWith('--name='))?.split('=')[1] ?? 'shot') : scenario)
  Object.assign(out, await stats())
  out.renderer = noWebgl ? null : await gpu()
  const body = await page.innerText('body')
  out.text = { failNote: body.includes('gagal dimuat'), noWebgl: body.includes('butuh WebGL'), panels: body.includes('Success rate') }
  out.src = await page.$$eval('.oi3-src div', (d) => d.map((x) => x.textContent)).catch(() => [])
  out.storedView = await page.evaluate(() => localStorage.getItem('cc-view'))
  out.dbg = await page.evaluate(() => window.__oi3dbg?.())
}

if (scenario === 'demo') {
  // satu siklus demo 40 dtk: rekam keadaan tiap detik + tangkapan layar tiap keadaan baru
  const seen = new Set()
  out.timeline = []
  for (let i = 0; i < 44; i++) {
    const s = await stats()
    const src = await page.$$eval('.oi3-src div', (d) => d.map((x) => x.textContent))
    const key = `${s.emp?.shown}/${s.emp?.clip}/${s.emp?.phase}`
    out.timeline.push({ t: i, key, fps: s.stats?.fps, target: s.stats?.fpsTarget, calls: s.stats?.calls, unit: src[1]?.split('→')[1]?.split('·')[0]?.trim() })
    if (!seen.has(key)) { seen.add(key); await shot(`demo-${String(i).padStart(2, '0')}-${key.replace(/\//g, '_')}`) }
    await page.waitForTimeout(1000)
  }
  out.states = [...seen]
  out.final = await stats()
}

if (scenario === 'camera') {
  const cam = async () => page.evaluate(() => window.__oi3cam?.())
  const box = await (await page.$('.oi3 canvas')).boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  out.cam0 = await cam()
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -600); await page.waitForTimeout(500)
  out.zoomIn = await cam(); await shot('camera-zoom-in')
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -600)
  await page.waitForTimeout(400); out.zoomMax = await cam()
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 600)
  await page.waitForTimeout(400); out.zoomMin = await cam()
  // geser: seret dengan tombol kanan
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 200, cy + 80, { steps: 8 }); await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(400); out.panned = await cam(); await shot('camera-panned')
  for (let k = 0; k < 12; k++) { await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 600, cy, { steps: 4 }); await page.mouse.up({ button: 'right' }) }
  await page.waitForTimeout(400); out.panLimit = await cam()
  await page.click('.oi3-btns button:has-text("Atur ulang")'); await page.waitForTimeout(500)
  out.reset = await cam(); await shot('camera-reset')
}

if (scenario === 'click') {
  const box = await (await page.$('.oi3 canvas')).boundingBox()
  const pos = await page.evaluate(() => window.__oi3pick?.())
  out.pick = pos
  const detail0 = await page.innerText('.cc-grid section:nth-of-type(2)')
  await page.mouse.click(box.x + pos.emp[0], box.y + pos.emp[1]); await page.waitForTimeout(600)
  out.afterEmp = (await page.innerText('.cc-grid section:nth-of-type(2)')).slice(0, 220)
  out.selAgent = await page.$eval('.cc-agents button.is-sel', (b) => b.textContent).catch(() => null)
  await shot('click-employee')
  await page.mouse.click(box.x + pos.unit[0], box.y + pos.unit[1]); await page.waitForTimeout(600)
  out.afterUnit = (await page.innerText('.cc-grid section:nth-of-type(2)')).slice(0, 220)
  out.selUnit = await page.$eval('.cc-agents button.is-sel', (b) => b.textContent).catch(() => null)
  await shot('click-unit')
  out.detailChanged = detail0 !== out.afterEmp
}

if (scenario === 'lifecycle') {
  // pindah tab -> kanvas dilepas, tidak ada draw call tersisa; kembali -> hidup lagi
  const d0 = (await stats()).draws
  await page.waitForTimeout(2000)
  out.drawsWhileOpen = (await stats()).draws - d0
  await page.click('.cc-tabs button:has-text("Tabel")'); await page.waitForTimeout(1500)
  const d1 = (await stats()).draws
  await page.waitForTimeout(3000)
  out.drawsAfterLeave = (await stats()).draws - d1
  out.canvasAfterLeave = await page.$$eval('canvas', (c) => c.length)
  await page.click('.cc-tabs button:has-text("Kantor")'); await page.waitForTimeout(3000)
  out.oldOfficeCanvas = !!(await page.$('.o3d canvas'))
  await shot('lifecycle-kantor-lama')
  await page.click('.cc-tabs button:has-text("Balok")'); await page.waitForTimeout(800); await shot('lifecycle-balok')
  await page.click('.cc-tabs button:has-text("3D Isometrik")'); await page.waitForTimeout(3000)
  out.canvasAfterReturn = !!(await page.$('.oi3 canvas'))
  // permintaan jaringan: poll tetap satu per 5 dtk, aset hanya diminta saat tab dibuka
  const t0 = requests.length
  await page.waitForTimeout(10500)
  out.pollsIn10s = requests.slice(t0).filter((u) => u.includes('/api/command-center')).length
  out.assetRequests = requests.filter((u) => u.includes('/office-iso3d/')).map((u) => u.split('/office-iso3d/')[1])
}

if (scenario === 'lazy') {
  // tampilan bawaan (tanpa memilih tab): modul & aset baru TIDAK boleh ikut dimuat
  out.storedView = await page.evaluate(() => localStorage.getItem('cc-view'))
  out.isoRequests = requests.filter((u) => /office-iso3d|OfficeIso3d/.test(u)).length
  await page.click('.cc-tabs button:has-text("3D Isometrik")'); await page.waitForTimeout(4000)
  out.isoRequestsAfterOpen = requests.filter((u) => /office-iso3d|OfficeIso3d/.test(u)).map((u) => u.split('/').slice(-2).join('/'))
  out.hasCanvasAfterOpen = !!(await page.$('.oi3 canvas'))
  out.stageText = (await page.innerText('.cc-stage')).slice(0, 300)
  await shot('lazy-after-open')
  Object.assign(out, await stats())
}

if (scenario === 'hidden') {
  const d0 = (await stats()).draws
  await page.waitForTimeout(3000)
  out.drawsVisible3s = (await stats()).draws - d0
  const other = await ctx.newPage(); await other.goto('about:blank'); await other.bringToFront()
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(500)
  const d1 = (await stats()).draws
  await page.waitForTimeout(3000)
  out.drawsHidden3s = (await stats()).draws - d1
}

if (scenario === 'perf') {
  // angka stabil: tunggu, lalu ambil 20 contoh tiap 500 ms
  const samples = []
  for (let i = 0; i < 20; i++) { samples.push((await stats()).stats); await page.waitForTimeout(500) }
  const pick = (k) => samples.map((s) => s?.[k]).filter((v) => typeof v === 'number')
  const avg = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null)
  out.renderer = await gpu()
  out.perf = { fpsTarget: samples.at(-1)?.fpsTarget, fpsAvg: avg(pick('fps')), fpsMin: Math.min(...pick('fps')), fpsMax: Math.max(...pick('fps')),
    frameMsAvg: avg(pick('frameMs')), cpuMsAvg: avg(pick('cpuMs')), calls: samples.at(-1)?.calls, triangles: samples.at(-1)?.triangles,
    geometries: samples.at(-1)?.geometries, textures: samples.at(-1)?.textures }
  const d0 = (await stats()).draws; await page.waitForTimeout(5000)
  out.glDrawsPerSec = +(((await stats()).draws - d0) / 5).toFixed(1)
}

out.errors = [...new Set(errors)].slice(0, 6)
console.log(JSON.stringify(out, null, 1))
await browser.close()
