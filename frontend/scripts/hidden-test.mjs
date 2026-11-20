import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(() => {
  // hitung frame WebGL yang benar-benar digambar
  window.__draws = 0
  const orig = WebGL2RenderingContext.prototype.drawElements
  WebGL2RenderingContext.prototype.drawElements = function (...a) { window.__draws++; return orig.apply(this, a) }
  localStorage.setItem('cc-view', 'office')
})
await page.goto('http://127.0.0.1:8000/command-center?demo=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const a0 = await page.evaluate(() => window.__draws); await page.waitForTimeout(3000)
const visible = (await page.evaluate(() => window.__draws)) - a0
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(500)
const b0 = await page.evaluate(() => window.__draws); await page.waitForTimeout(3000)
const hidden = (await page.evaluate(() => window.__draws)) - b0
console.log(JSON.stringify({ drawCalls_3dtk_terlihat: visible, drawCalls_3dtk_tersembunyi: hidden }))
await browser.close()
