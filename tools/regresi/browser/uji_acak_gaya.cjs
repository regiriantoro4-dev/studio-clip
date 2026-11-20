// Uji tombol "Acak gaya" (Tahap 4) di Frame Studio lewat Edge.
// Pakai: node tools/regresi/browser/uji_acak_gaya.cjs <folder-hasil> [url-dasar, default http://127.0.0.1:5173]
// Butuh backend yang sudah memuat /api/acakgaya (restart app setelah Tahap 4).
const path = require('path')
const { chromium } = require(path.join(__dirname, '../../../frontend/node_modules/playwright-core'))
const dir = process.argv[2]
const base = process.argv[3] || 'http://127.0.0.1:5173'
;(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const p = await b.newPage({ viewport: { width: 1600, height: 1100 } })
  const errs = []
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text() + ' @ ' + (m.location()?.url || '')) })
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`) })
  await p.goto(`${base}/frame-studio?template=rec`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.ag-bar', { timeout: 30000 })
  await p.waitForTimeout(3000)
  const cv = await p.$('.konvajs-content')
  const kode = async () => (await p.locator('.ag-kode').count()) ? (await p.locator('.ag-kode').textContent()) : '-'
  const shot = async (n) => { await p.waitForTimeout(900); await cv.screenshot({ path: `${dir}/${n}.png` }) }
  await shot('00_awal')
  const btn = p.getByRole('button', { name: /Acak gaya/ })
  const hasil = []
  for (let i = 1; i <= 4; i++) {
    await btn.click(); await p.waitForTimeout(600)
    hasil.push(await kode()); await shot(`0${i}_acak`)
  }
  console.log('kode tiap acakan:', hasil.join(' '))
  const k2 = hasil[1].replace('#', '')
  // kunci font + bingkai lalu acak
  await p.getByRole('button', { name: /Font$/ }).click()
  await p.getByRole('button', { name: /Bingkai$/ }).click()
  await btn.click(); await p.waitForTimeout(600); await shot('05_kunci_font_bingkai')
  console.log('setelah kunci:', await kode())
  // panggil kode acakan ke-2
  await p.getByLabel('Kode gaya').fill(k2)
  await p.getByRole('button', { name: 'Pakai kode' }).click(); await p.waitForTimeout(600)
  console.log('pakai kode', k2, '->', await kode()); await shot('06_pakai_kode')
  // urungkan
  await p.getByRole('button', { name: 'Acakan sebelumnya' }).click(); await p.waitForTimeout(400)
  console.log('setelah urungkan:', await kode()); await shot('07_urungkan')
  // panel aturan
  await p.getByRole('button', { name: /Aturan acak/ }).click(); await p.waitForTimeout(1200)
  await p.locator('.ag-bar').screenshot({ path: `${dir}/08_bilah_aturan.png` })
  console.log('jumlah kombinasi:', await p.locator('.ag-rules .hint.tnum').textContent())
  console.log('error halaman:', JSON.stringify(errs))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
