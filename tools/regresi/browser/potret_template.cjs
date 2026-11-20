// Tangkapan layar daftar template Frame Studio (dev server 5173) memakai Edge.
const { chromium } = require(require("path").resolve(__dirname, "../../../frontend/node_modules/playwright-core"))
const out = process.argv[2]
;(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://127.0.0.1:5173/frame-studio', { waitUntil: 'networkidle' })
  await p.waitForSelector('.fs-card', { timeout: 30000 })
  await p.waitForTimeout(4000) // font & kanvas selesai
  const cards = await p.$$('.fs-card')
  console.log('kartu template:', cards.length)
  const grid = await p.$('.fs-cards')
  await grid.screenshot({ path: out })
  console.log('error:', JSON.stringify(errs.slice(0, 5)))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
