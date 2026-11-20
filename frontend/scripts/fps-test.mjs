// Ukur laju render (draw call per 3 dtk): kantor sepi (data asli tanpa job) vs Mode Demo (ada aktivitas)
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] })
async function measure(url) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(() => {
    window.__draws = 0
    const o = WebGL2RenderingContext.prototype.drawElements
    WebGL2RenderingContext.prototype.drawElements = function (...a) { window.__draws++; return o.apply(this, a) }
    localStorage.setItem('cc-view', 'office')
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  const a = await page.evaluate(() => window.__draws); await page.waitForTimeout(3000)
  const n = (await page.evaluate(() => window.__draws)) - a
  await page.close()
  return n
}
console.log(JSON.stringify({ sepi: await measure('http://127.0.0.1:8000/command-center'), demo_aktif: await measure('http://127.0.0.1:8000/command-center?demo=1') }))
await browser.close()
