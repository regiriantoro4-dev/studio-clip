// Uji tahap (b): 4 lokasi + beberapa tokoh dalam satu cerita pendek.
// Deterministik: window.renderAt(t) menggambar frame pada detik t dan mengembalikan JPEG (dataURL).
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { lerp, clamp, ease, v3, canvas } from './lib/util.js'
import { buatTokoh, poseDari, hidupkan, jalan } from './lib/tokoh.js'
import { buatGurun, buatSungai, buatKemah, buatRuangan } from './lib/lokasi.js'

const q = new URLSearchParams(location.search)
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920)
const KATA = await (await fetch(q.get('kata') || '/hasil/kata.json')).json()
const DUR = (KATA.length ? KATA[KATA.length - 1].e : 5) + 1.0
const kata = (awal, cadangan) => { const k = KATA.find((w) => w.w.toLowerCase().replace(/[^a-z-]/g, '').startsWith(awal)); return k ? k.s : cadangan }

// ---------- renderer & post ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(W, H)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 900)
const composer = new EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.004, maxblur: 0.012 }); composer.addPass(bokeh)
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.6, 0.86); composer.addPass(bloom)
composer.addPass(new OutputPass())

// ---------- lokasi ----------
const LOK = { sungai: buatSungai(), kemah: buatKemah(), gurun: buatGurun(), ruangan: buatRuangan() }
const pmrem = new THREE.PMREMGenerator(renderer)
for (const L of Object.values(LOK)) {
  L.grup.visible = false; scene.add(L.grup)
  if (L.langit) { const s = new THREE.Scene(); s.add(L.langit.clone()); L.env = pmrem.fromScene(s, 0, 0.1, 1000).texture }
}
LOK.sungai.grup.traverse((o) => { if (o.material && o.material.normalMap && o.material.roughness < 0.1) { o.material.envMap = LOK.sungai.env } }) // pantulan langit di air
let lokAktif = null
function pakaiLokasi(nama) {
  if (lokAktif === nama) return
  for (const [n, L] of Object.entries(LOK)) L.grup.visible = n === nama
  const L = LOK[nama]
  scene.fog = L.kabut ? new THREE.Fog(L.kabut[0], L.kabut[1], L.kabut[2]) : null
  scene.background = L.latar ? new THREE.Color(L.latar) : null
  renderer.toneMappingExposure = L.exposure
  bloom.strength = nama === 'kemah' ? 0.55 : 0.32; bloom.threshold = nama === 'kemah' ? 0.92 : 0.88
  const tint = { sungai: '#e6e4f0', kemah: '#c4a084', gurun: '#fff3e6', ruangan: '#f2e2cc' }[nama]
  for (const tk of Object.values(T)) tk.mesh.material.color.set(tint)
  lokAktif = nama
}

// ---------- tokoh ----------
const T = {
  penjelajah: buatTokoh({}),
  pemandu: buatTokoh({ rambut: 'pendek', topi: 'safari', syal: '#2f6a4a', baju: '#efe2c4', tas: false, kulit: '#efd9bd' }),
  tuan: buatTokoh({ rambut: 'mangkok', jas: '#2a2f48', syal: null, kumis: true, tas: false }),
  bangsawan1: buatTokoh({ rambut: 'botak', warnaRambut: '#cfcac0', jas: '#203528', dasi: '#c9a04a', syal: null, kumis: true, monokel: true, tas: false }),
  bangsawan2: buatTokoh({ rambut: 'sanggul', warnaRambut: '#8a8478', jas: '#4a2a48', dasi: '#e8e0d0', syal: null, kacamata: true, tas: false }),
}
for (const t of Object.values(T)) { t.mesh.visible = false; scene.add(t.mesh) }

// ---------- jadwal cerita (mengikuti kata narasi) ----------
const K = {
  sebuah: kata('sebuah', 2.6), malam: kata('malamnya', 6), sang: kata('sang', 8.5), yakin: kata('yakin', 9),
  kalah: kata('mengalahkannya', 10.5), sampai: kata('sampai', 12), pasir: kata('pasir', 12.6), gerak: kata('bergerak', 13.5),
  tahun2: kata('bertahun', 14.6), klub: kata('klub', 16), gampang: kata('gampang', 18),
}
const SHOT = [
  { mulai: 0, lok: 'sungai', nama: 'sungai-lebar' },
  { mulai: K.sebuah, lok: 'sungai', nama: 'sungai-perahu' },
  { mulai: K.malam - 0.1, lok: 'kemah', nama: 'kemah-lebar' },
  { mulai: K.sang - 0.1, lok: 'kemah', nama: 'kemah-dekat' },
  { mulai: K.sampai - 0.15, lok: 'gurun', nama: 'gurun-rendah' },
  { mulai: K.tahun2 - 0.1, lok: 'ruangan', nama: 'ruangan' },
]
const KEDIP = [1.3, 4.7, 7.6, 10.2, 16.4]
const kedip = (t, off = 0) => KEDIP.some((k) => t >= k + off && t < k + off + 0.12)

function shotAt(t) { let s = SHOT[0], i = 0; SHOT.forEach((x, j) => { if (t >= x.mulai) { s = x; i = j } }); const akhir = SHOT[i + 1]?.mulai ?? DUR; return { ...s, k: (t - s.mulai) / (akhir - s.mulai) } }

function taruh(tk, x, y, z, ekspresi, P, lirik, lonc = 0, bob = 0, napas = true) {
  tk.gambar(ekspresi, P, lirik)
  tk.mesh.visible = true
  tk.mesh.position.set(x, y + lonc * 0.28 + bob, z)
  tk.mesh.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z)
  const n = napas ? Math.sin(x * 3 + tNow * 2.4) * 0.012 : 0
  const s = tk.opsi.skala
  tk.mesh.scale.set(s * (1 - n * 0.5 - lonc * 0.05), s * (1 + n + lonc * 0.08), s)
}
let tNow = 0

// ---------- kamera + isi tiap shot ----------
function adegan(t) {
  const sh = shotAt(t), k = ease(sh.k)
  for (const tk of Object.values(T)) tk.mesh.visible = false
  pakaiLokasi(sh.lok)
  const L = LOK[sh.lok]
  let pos, look, fokusKe, fov = 40, ap = 0.004

  if (sh.lok === 'sungai') {
    const bx = lerp(-4.5, 2.2, ease(t / K.malam))
    L.api.aturPerahu(t, bx); L.api.aturBuaya(t, bx + lerp(4.2, 3.4, ease(t / K.malam)), 0.9)
    if (sh.nama === 'sungai-lebar') { pos = v3(lerp(-6.5, -4.5, k), 1.5, lerp(8, 7.4, k)); look = v3(bx, 1.1, -1.5); fokusKe = v3(bx, 0.6, -1.2); ap = 0.002 }
    else { pos = v3(bx + lerp(2.4, 1.9, k), 0.8, 3.7); look = v3(bx - 0.25, 0.85, -1.2); fokusKe = v3(bx, 0.7, -1.2); ap = 0.005 }
    const P1 = hidupkan(poseDari([[0, 'diam'], [K.sebuah + 0.6, 'tunjuk']], t), t, 0)
    taruh(T.penjelajah, bx + 0.5, -0.2, -1.15, kedip(t) ? 'kedip' : 'santai', P1, [0.5, 0], 0, 0)
    const P2 = poseDari([[0, 'dayung']], t); P2.lKa[0] += Math.sin(t * 2.2) * 18; P2.lKi[0] += Math.sin(t * 2.2) * 14; P2.miring += Math.sin(t * 2.2) * 3
    taruh(T.pemandu, bx - 1.0, -0.2, -1.25, 'heran', P2, [0.6, 0.4], 0, 0)
  } else if (sh.lok === 'kemah') {
    if (sh.nama === 'kemah-lebar') { pos = v3(lerp(-0.8, 0.4, k), lerp(1.7, 1.5, k), lerp(6.4, 5.6, k)); look = v3(0, 0.9, -0.5); fokusKe = v3(0, 0.8, 0.5); ap = 0.003 }
    else { pos = v3(lerp(1.7, 1.35, k), 1.25, lerp(4.4, 3.5, k)); look = v3(1.0, 1.05, 0.7); fokusKe = v3(0.9, 1.1, 0.8) }
    const P1 = hidupkan(poseDari([[0, 'hangat'], [K.yakin - 0.1, 'pinggang'], [K.kalah, 'tunjuk']], t), t, 0)
    const e1 = t >= K.yakin ? (kedip(t) ? 'kedip' : 'sombong') : (kedip(t) ? 'kedip' : 'santai')
    taruh(T.penjelajah, 0.95, 0, 0.75, e1, P1, [-0.3, 0])
    const P2 = hidupkan(poseDari([[0, 'hangat'], [K.yakin + 0.4, 'takut']], t), t, 2)
    taruh(T.pemandu, -1.05, 0, 0.6, t >= K.yakin + 0.4 ? 'cemas' : 'santai', P2, [0.7, 0])
  } else if (sh.lok === 'gurun') {
    const gk = ease((t - K.pasir + 0.6) / (K.tahun2 - K.pasir + 0.2))
    const g = { x: lerp(2.6, 0.75, gk), z: lerp(2.2, 0.95, gk), naik: clamp((t - K.pasir + 0.8) / 0.8) }
    const muncul = clamp((t - K.gerak - 0.1) / 0.35)
    L.api.atur(t, g, muncul)
    pos = v3(lerp(2.9, 2.5, k), lerp(0.36, 0.33, k), lerp(3.4, 2.9, k)); look = v3(0.3, 0.75, 0)
    const dG = pos.distanceTo(v3(g.x, 0.1, g.z)), rak = ease((t - K.gerak) / 0.35)
    const z = ease((t - K.gerak) / 0.25); fov = lerp(40, 36, z); look.y = lerp(0.75, 1.0, z)
    const goyang = t > K.gerak ? Math.max(0, 1 - (t - K.gerak) / 0.7) : 0
    look.x += Math.sin(t * 61) * 0.03 * goyang; look.y += Math.cos(t * 53) * 0.03 * goyang
    fokusKe = null; bokeh.uniforms.focus.value = lerp(dG, pos.distanceTo(v3(0, 1, 0)), rak)
    const P = hidupkan(poseDari([[0, 'diam'], [K.sampai, 'lihat'], [K.gerak, 'kaget']], t), t, 0)
    const lonc = t >= K.gerak ? Math.max(0, Math.sin(clamp((t - K.gerak) / 0.4) * Math.PI)) : 0
    taruh(T.penjelajah, 0, 0, 0, t >= K.gerak ? 'kaget' : 'heran', P, t >= K.gerak ? [0, 0] : [0.8, 0.9], lonc)
  } else {
    pos = v3(lerp(0.5, 0.15, k), lerp(1.5, 1.38, k), lerp(6.4, 5.0, k)); look = v3(0, 1.2, -0.6); fokusKe = v3(0, 1.1, -0.3)
    if (t >= K.gampang) { const z = ease((t - K.gampang) / 0.3); pos.lerp(v3(0.1, 1.3, 2.6), z) }
    const P = hidupkan(poseDari([[0, 'sedekap'], [K.gampang - 0.1, 'angkat']], t), t, 0)
    taruh(T.tuan, 0, 0, -0.3, t >= K.gampang ? (t > K.gampang + 0.5 && t < K.gampang + 0.65 ? 'kedip' : 'sombong') : (kedip(t) ? 'kedip' : 'santai'), P, [0, 0])
    const tawa = t >= K.gampang + 0.25
    const Pb = hidupkan(poseDari([[0, 'diam'], [K.gampang + 0.25, 'pinggang']], t), t, 1)
    taruh(T.bangsawan1, -0.95, 0, -0.95, tawa ? 'tawa' : 'heran', Pb, [0.6, 0], tawa ? Math.abs(Math.sin(t * 10)) * 0.15 : 0)
    const Pc = hidupkan(poseDari([[0, 'diam'], [K.gampang + 0.3, 'sedekap']], t), t, 3)
    taruh(T.bangsawan2, 0.95, 0, -1.05, tawa ? 'tawa' : 'heran', Pc, [-0.6, 0], tawa ? Math.abs(Math.sin(t * 10 + 1)) * 0.12 : 0)
  }
  pos.x += Math.sin(t * 0.9) * 0.02; pos.y += Math.sin(t * 1.3 + 1) * 0.012
  camera.position.copy(pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(look)
  if (fokusKe) bokeh.uniforms.focus.value = pos.distanceTo(fokusKe)
  bokeh.uniforms.aperture.value = ap
  L.update(t)
}

// ---------- caption ----------
const out = canvas(W, H), ox = out.getContext('2d')
const grup = (() => { const g = []; let cur = []
  KATA.forEach((w, i) => { const prev = KATA[i - 1]; if (cur.length && (cur.length >= 2 || w.s - prev.e > 0.25)) { g.push(cur); cur = [] } cur.push(w) })
  if (cur.length) g.push(cur)
  return g.map((ws, i) => ({ teks: ws.map((w) => w.w).join(' '), s: ws[0].s, e: g[i + 1] ? g[i + 1][0].s : ws[ws.length - 1].e + 0.5 }))
})()
function overlay(t) {
  ox.drawImage(renderer.domElement, 0, 0)
  const vg = ox.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,30,0.42)')
  ox.fillStyle = vg; ox.fillRect(0, 0, W, H)
  const c = grup.find((g) => t >= g.s && t < g.e)
  if (c) {
    const pop = 1 + 0.14 * (1 - ease((t - c.s) / 0.12))
    ox.save(); ox.translate(W / 2, H * 0.72); ox.scale(pop, pop)
    ox.font = `800 ${Math.round(W * 0.066)}px "Segoe UI", Arial, sans-serif`; ox.textAlign = 'center'; ox.textBaseline = 'middle'
    ox.lineJoin = 'round'; ox.shadowColor = 'rgba(0,0,0,0.55)'; ox.shadowBlur = 18; ox.shadowOffsetY = 4
    ox.strokeStyle = 'rgba(10,8,12,0.85)'; ox.lineWidth = W * 0.012; ox.strokeText(c.teks, 0, 0)
    ox.shadowColor = 'transparent'; ox.fillStyle = '#fff'; ox.fillText(c.teks, 0, 0); ox.restore()
  }
}

window.DUR = DUR
window.renderAt = (t) => {
  tNow = t; adegan(t)
  // arahkan ulang tokoh ke posisi kamera frame INI (adegan() menaruh tokoh sebelum kamera dipindah)
  for (const tk of Object.values(T)) if (tk.mesh.visible) tk.mesh.rotation.y = Math.atan2(camera.position.x - tk.mesh.position.x, camera.position.z - tk.mesh.position.z)
  composer.render(); overlay(t); return out.toDataURL('image/jpeg', 0.93)
}
window.SIAP = true
