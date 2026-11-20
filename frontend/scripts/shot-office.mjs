// Tangkapan layar kantor 3D memakai Microsoft Edge yang sudah terpasang (playwright-core, tanpa unduh browser).
// Pakai: node scripts/shot-office.mjs <url> <out.png> [tunggu_ms] [--no-webgl] [--fail-api]
import { chromium } from 'playwright-core'

const [url, out, waitMs = '6000', ...flags] = process.argv.slice(2)
const args = flags.includes('--no-webgl') ? ['--disable-webgl', '--disable-3d-apis'] : ['--use-angle=d3d11', '--enable-gpu']
const browser = await chromium.launch({ channel: 'msedge', headless: true, args })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.addInitScript(() => { try { localStorage.setItem('cc-view', 'office') } catch { /* abaikan */ } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

let failApi = false
if (flags.includes('--fail-chunk')) {
  // tiru tab lama setelah build ulang: file kantor 3D tidak ditemukan
  await page.route('**/assets/Office3D-*.js', (route) => route.abort())
}
if (flags.includes('--fail-api')) {
  await page.route('**/api/command-center**', (route) => (failApi ? route.fulfill({ status: 500, body: 'gagal' }) : route.continue()))
}
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(Number(waitMs))
if (flags.includes('--fail-api')) {
  failApi = true
  await page.waitForTimeout(7000) // tunggu poll otomatis berikutnya (5 dtk) gagal
}
const stage = await page.$('.cc-stage')
const series = Number((flags.find((f) => f.startsWith('--series=')) || '--series=1').split('=')[1])
for (let i = 0; i < series; i++) {
  const path = series > 1 ? out.replace(/\.png$/, `-${i + 1}.png`) : out
  await (stage || page).screenshot({ path })
  if (i < series - 1) await page.waitForTimeout(3000)
}
const text = await page.innerText('body')
console.log(JSON.stringify({ out, errors: errors.slice(0, 5), hasFallback: text.includes('Tampilan 3D tidak didukung'),
  hasDisconnected: text.includes('Terputus'), hasPanels: text.includes('Success rate'), hasCanvas: !!(await page.$('.o3d canvas')) }))
await browser.close()
