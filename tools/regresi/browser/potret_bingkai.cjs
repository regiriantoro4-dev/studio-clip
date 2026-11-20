// Buka template Kosong, pilih jendela video, coba setiap "Gaya bingkai", potret kanvasnya.
const { chromium } = require(require("path").resolve(__dirname, "../../../frontend/node_modules/playwright-core"))
const dir = process.argv[2]
;(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://127.0.0.1:5173/frame-studio?template=kosong', { waitUntil: 'networkidle' })
  await p.waitForSelector('canvas', { timeout: 30000 })
  await p.waitForTimeout(2500)
  const cv = await p.$('.konvajs-content')
  const bb = await cv.boundingBox()
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.55) // tengah jendela video
  await p.waitForTimeout(500)
  const sel = p.locator('label.fs-num', { hasText: 'Gaya bingkai' }).locator('select')
  const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]))
  console.log('opsi:', opts.length)
  let i = 0
  for (const [val] of opts) {
    await sel.selectOption(val)
    await p.waitForTimeout(350)
    await cv.screenshot({ path: `${dir}/bingkai_${String(i).padStart(2, '0')}_${val || 'polos'}.png` })
    i++
  }
  console.log('error halaman:', JSON.stringify(errs))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
