// Render uji coba animasi 3D lewat Edge headless (GPU) -> ffmpeg (NVENC, cadangan x264).
// Pakai:
//   node render.cjs hasil                 -> hasil/adegan.mp4 (pakai hasil/kata.json + hasil/narasi.mp3)
//   node render.cjs hasil --still 1,5,10  -> hasil/still_<t>.jpg untuk cek cepat
//   --skrip cerita.js                     -> pakai skrip adegan lain (bawaan scene.js)
const http = require('http'), fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process')
const ROOT = path.resolve(__dirname, '../..')
const { chromium } = require(path.join(ROOT, 'frontend/node_modules/playwright-core'))
const dir = path.resolve(process.argv[2] || 'hasil')
const iStill = process.argv.indexOf('--still')
const stills = iStill > 0 ? process.argv[iStill + 1].split(',').map(Number) : null
const iSkrip = process.argv.indexOf('--skrip')
const skrip = iSkrip > 0 ? process.argv[iSkrip + 1] : 'scene.js'
const FPS = 30, W = 1080, H = 1920

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg' }
function serve() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0])
      let f
      if (u.startsWith('/three/')) f = path.join(ROOT, 'frontend/node_modules/three', u.slice(7))
      else if (u.startsWith('/hasil/')) f = path.join(dir, u.slice(7))
      else f = path.join(__dirname, u === '/' ? 'scene.html' : u)
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end() } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d) } })
    })
    s.listen(0, '127.0.0.1', () => ok(s))
  })
}

function nvencOk() {
  const p = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'])
  return p.status === 0
}

;(async () => {
  const srv = await serve(), port = srv.address().port
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 400, height: 400 } })
  p.on('pageerror', (e) => console.log('pageerror:', e.message))
  p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
  await p.goto(`http://127.0.0.1:${port}/scene.html?w=${W}&h=${H}&skrip=./${skrip}`)
  await p.waitForFunction(() => window.SIAP === true, null, { timeout: 60000 })
  const gpu = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?' })
  const DUR = await p.evaluate(() => window.DUR)
  console.log('GPU:', gpu, '| durasi:', DUR.toFixed(2), 'dtk')
  const frame = async (t) => Buffer.from((await p.evaluate((t) => window.renderAt(t), t)).split(',')[1], 'base64')

  if (stills) {
    for (const t of stills) { fs.writeFileSync(path.join(dir, `still_${t}.jpg`), await frame(t)); console.log('still', t) }
  } else {
    const n = Math.ceil(DUR * FPS), venc = nvencOk()
      ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'constqp', '-qp', '18', '-profile:v', 'high']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']
    const outF = path.join(dir, 'adegan.mp4')
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-i', path.join(dir, 'narasi.mp3'), '-map', '0:v', '-map', '1:a', ...venc, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outF], { stdio: ['pipe', 'inherit', 'inherit'] })
    const t0 = Date.now()
    for (let i = 0; i < n; i++) {
      const buf = await frame(i / FPS)
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
      if (i % 30 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(1)} dtk`)
    }
    ff.stdin.end()
    await new Promise((r) => ff.on('close', r))
    console.log('selesai:', outF, ((Date.now() - t0) / 1000).toFixed(1), 'dtk render')
  }
  await b.close(); srv.close()
})()
