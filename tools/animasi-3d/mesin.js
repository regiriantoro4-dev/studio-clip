// Mesin perakit adegan generik: membaca /hasil/timeline.json (dibuat buat_video.py) lalu menyusun
// lokasi, tokoh, pose, ekspresi, kamera, dan caption secara otomatis. Tidak ada cerita yang di-hardcode.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { lerp, clamp, ease, v3, canvas } from './lib/util.js'
import { buatTokoh, poseDari, hidupkan, jalan, POSE } from './lib/tokoh.js'
import { buatGurun, buatSungai, buatKemah, buatRuangan } from './lib/lokasi.js'

const q = new URLSearchParams(location.search)
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920)
const TL = await (await fetch('/hasil/timeline.json')).json()
const KATA = TL.kata, ADEGAN = TL.adegan
const DUR = TL.durasi

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.6, 0.88); composer.addPass(bloom)
composer.addPass(new OutputPass())

// ---------- lokasi (hanya yang dipakai naskah yang dibangun) ----------
const PEMBUAT = { sungai: buatSungai, kemah: buatKemah, gurun: buatGurun, ruangan: buatRuangan }
const LOK = {}
const pmrem = new THREE.PMREMGenerator(renderer)
for (const nama of new Set(ADEGAN.map((a) => a.lokasi))) {
  const L = PEMBUAT[nama](); L.grup.visible = false; scene.add(L.grup); LOK[nama] = L
  if (L.langit) { const s = new THREE.Scene(); s.add(L.langit.clone()); L.env = pmrem.fromScene(s, 0, 0.1, 1000).texture }
  if (nama === 'sungai') L.grup.traverse((o) => { if (o.material && o.material.normalMap && o.material.roughness < 0.2) o.material.envMap = L.env })
}
const TINT = { sungai: '#e6e4f0', kemah: '#c4a084', gurun: '#fff3e6', ruangan: '#f2e2cc' }
let lokAktif = null
function pakaiLokasi(nama) {
  if (lokAktif === nama) return
  for (const [n, L] of Object.entries(LOK)) L.grup.visible = n === nama
  const L = LOK[nama]
  scene.fog = L.kabut ? new THREE.Fog(L.kabut[0], L.kabut[1], L.kabut[2]) : null
  scene.background = L.latar ? new THREE.Color(L.latar) : null
  renderer.toneMappingExposure = L.exposure
  bloom.strength = nama === 'kemah' ? 0.55 : 0.32; bloom.threshold = nama === 'kemah' ? 0.92 : 0.88
  for (const tk of Object.values(T)) tk.mesh.material.color.set(TINT[nama])
  lokAktif = nama
}

// Titik berdiri tiap lokasi. Sungai: tokoh di dalam perahu (x relatif posisi perahu).
const SLOT = {
  kemah: { kiri: [-1.05, 0.6], kanan: [0.95, 0.75], tengah: [0, -0.9] },
  gurun: { tengah: [0, 0], kiri: [-1.2, 0.25], kanan: [1.2, -0.2] },
  ruangan: { tengah: [0, -0.3], kiri: [-0.95, -0.95], kanan: [0.95, -1.05] },
  sungai: { kanan: [0.5, -1.15], tengah: [-0.3, -1.2], kiri: [-1.05, -1.25] },
}
const LANTAI = { sungai: -0.2 }

// ---------- tokoh dari naskah ----------
const T = {}
for (const [id, opsi] of Object.entries(TL.tokoh)) { T[id] = buatTokoh(opsi); T[id].mesh.visible = false; scene.add(T[id].mesh) }

// ---------- jadwal per adegan (pose & ekspresi berubah pada kata tertentu) ----------
const waktuKata = (a, kata) => {
  if (!kata) return a.mulai
  const kunci = kata.toLowerCase().replace(/[^a-z0-9-]/g, '')
  for (let i = a.kata0; i < a.kata1; i++) if (KATA[i].w.toLowerCase().replace(/[^a-z0-9-]/g, '').startsWith(kunci)) return KATA[i].s
  return a.mulai
}
ADEGAN.forEach((a, i) => {
  a.idx = i
  a.sisi = i % 2 ? 1 : -1 // kamera bergantian kiri/kanan supaya potongan terasa hidup
  for (const tk of a.tokoh) {
    tk.jadwalPose = [[a.mulai, POSE[tk.pose] ? tk.pose : 'diam']]
    tk.jadwalEks = [[a.mulai, tk.ekspresi || 'santai']]
    tk.lirik = tk.lirik || [0, 0]
  }
  for (const b of a.berubah || []) {
    const tk = a.tokoh.find((x) => x.id === b.tokoh) || a.tokoh[0]; if (!tk) continue
    const ts = waktuKata(a, b.pada)
    if (b.pose && POSE[b.pose]) tk.jadwalPose.push([ts, b.pose])
    if (b.ekspresi) tk.jadwalEks.push([ts, b.ekspresi])
    if (b.aksi) tk.aksiPada = { aksi: b.aksi, t: ts }
  }
  a.tKejadian = a.kejadian && a.kejadianPada ? waktuKata(a, a.kejadianPada) : null
})
const ADEGAN_LOK = {} // detik mulai & akhir rentang lokasi berurutan (dipakai gerak perahu)
ADEGAN.forEach((a, i) => { const prev = ADEGAN[i - 1]; a.lokMulai = prev && prev.lokasi === a.lokasi ? prev.lokMulai : a.mulai })
for (let i = ADEGAN.length - 1; i >= 0; i--) { const a = ADEGAN[i], next = ADEGAN[i + 1]; a.lokAkhir = next && next.lokasi === a.lokasi ? next.lokAkhir : a.akhir }

const KEDIP = [1.3, 4.1, 6.9, 9.4, 12.2, 15.1, 17.8, 20.6, 23.3, 26.1, 28.9, 31.6, 34.4, 37.2, 40]
const kedip = (t, off) => KEDIP.some((k) => t >= k + off && t < k + off + 0.12)
const adeganAt = (t) => { let a = ADEGAN[0]; for (const x of ADEGAN) if (t >= x.mulai) a = x; return a }

// ---------- kamera otomatis ----------
function kamera(a, t, pusat, fokus) {
  const k = ease((t - a.mulai) / (a.akhir - a.mulai)), s = a.sisi, L = a.lokasi
  const tipe = a.shot
  let dari, ke, look, ap = 0.004, fov = 40
  const fx = fokus.x, fz = fokus.z
  if (tipe === 'lebar') {
    if (L === 'sungai') { dari = v3(pusat.x - 6.5, 1.5, 8); ke = v3(pusat.x - 4.5, 1.5, 7.4); look = v3(pusat.x, 1.1, -1.5) }
    else if (L === 'ruangan') { dari = v3(0.5 * s, 1.5, 6.4); ke = v3(0.2 * s, 1.4, 5.4); look = v3(0, 1.2, -0.6) }
    else { dari = v3(pusat.x + 1.2 * s, 1.7, pusat.z + 6.6); ke = v3(pusat.x + 0.6 * s, 1.55, pusat.z + 5.6); look = v3(pusat.x, 1.0, pusat.z - 0.6) }
    ap = 0.0025
  } else if (tipe === 'dekat') {
    const zz = L === 'sungai' ? 1.4 : fz + 2.7
    dari = v3(fx + 0.75 * s, 1.22, zz + 0.5); ke = v3(fx + 0.55 * s, 1.18, zz); look = v3(fx + 0.1 * s, 1.12, fz)
    if (L === 'sungai' && a.kejadian === 'buaya_air') { dari = v3(fx + 0.9 * s, 0.75, 3.1); ke = v3(fx + 0.7 * s, 0.72, 2.6); look = v3(fx + 0.15 * s, 0.7, fz) } // air & buaya ikut masuk frame
  } else if (tipe === 'rendah') {
    const zz = L === 'sungai' ? 2.2 : fz + 2.8
    dari = v3(fx + 1.6 * s, L === 'sungai' ? 0.12 : 0.34, zz + 0.5); ke = v3(fx + 1.3 * s, L === 'sungai' ? 0.12 : 0.32, zz); look = v3(fx + 0.2 * s, 0.85, fz)
  } else { // sedang
    if (L === 'sungai') { dari = v3(pusat.x + 1.1 * s, 0.85, 4.6); ke = v3(pusat.x + 0.8 * s, 0.85, 4.1); look = v3(pusat.x, 0.85, -1.2) }
    else { dari = v3(pusat.x + 0.9 * s, 1.35, pusat.z + 4.6); ke = v3(pusat.x + 0.6 * s, 1.3, pusat.z + 3.8); look = v3(pusat.x, 1.05, pusat.z) }
  }
  const pos = dari.clone().lerp(ke, k)
  // hentakan kamera saat kejadian/aksi kaget
  const tk = a.tKejadian ?? a.tokoh.find((x) => x.aksiPada?.aksi === 'loncat')?.aksiPada.t
  if (tk != null && t >= tk) {
    const z = ease((t - tk) / 0.25); fov = lerp(40, 36, z)
    const g = Math.max(0, 1 - (t - tk) / 0.7); look.x += Math.sin(t * 61) * 0.03 * g; look.y += Math.cos(t * 53) * 0.03 * g
  }
  pos.x += Math.sin(t * 0.9) * 0.02; pos.y += Math.sin(t * 1.3 + 1) * 0.012
  return { pos, look, ap, fov }
}

// ---------- satu frame ----------
function adegan(t) {
  const a = adeganAt(t)
  for (const tk of Object.values(T)) tk.mesh.visible = false
  pakaiLokasi(a.lokasi)
  const L = LOK[a.lokasi], slot = SLOT[a.lokasi], y0 = LANTAI[a.lokasi] ?? 0
  // perahu bergerak sepanjang rentang lokasi sungai
  let bx = 0
  if (a.lokasi === 'sungai') {
    bx = lerp(-4.5, 2.2, ease((t - a.lokMulai) / Math.max(1, a.lokAkhir - a.lokMulai)))
    L.api.aturPerahu(t, bx); L.api.aturBuaya(t, bx + 3.6, 30) // disembunyikan jauh; ditaruh ulang di bawah bila ada kejadian
  }
  // posisi tokoh
  const posTokoh = {}
  a.tokoh.forEach((tk) => {
    const [sx, sz] = slot[tk.posisi] || slot.tengah
    let x = sx + bx, z = sz, bob = 0
    const P = poseDari(tk.jadwalPose.map(([ts, n]) => [ts, n]), t)
    if (tk.aksi === 'jalan_masuk' && a.lokasi !== 'sungai') {
      const j1 = a.mulai + 1.3, kk = clamp((t - a.mulai) / 1.3)
      x = lerp(sx + (sx >= 0 ? 2.2 : -2.2), sx, kk) // masuk dari sisi terdekat
      if (t < j1) bob = jalan(P, (t - a.mulai) * 9.5, clamp((j1 - t) / 0.25))
    } else hidupkan(P, t, x * 3)
    if (a.lokasi === 'sungai' && tk.pose === 'dayung') { P.lKa[0] += Math.sin(t * 2.2) * 18; P.lKi[0] += Math.sin(t * 2.2) * 14; P.miring += Math.sin(t * 2.2) * 3 }
    // ekspresi
    let e = tk.jadwalEks[0][1]; for (const [ts, n] of tk.jadwalEks) if (t >= ts) e = n
    if ((e === 'santai' || e === 'sombong') && kedip(t, x)) e = 'kedip'
    let lonc = 0
    const ap = tk.aksiPada || (tk.aksi && tk.aksi !== 'jalan_masuk' ? { aksi: tk.aksi, t: a.mulai } : null)
    if (ap && t >= ap.t) {
      if (ap.aksi === 'loncat') lonc = Math.max(0, Math.sin(clamp((t - ap.t) / 0.4) * Math.PI))
      if (ap.aksi === 'tawa') lonc = Math.abs(Math.sin((t - ap.t) * 10)) * 0.14
      if (ap.aksi === 'gemetar') x += Math.sin(t * 70) * 0.012
    }
    const lirik = e === 'heran' ? [0.6, 0.6] : tk.lirik
    const m = T[tk.id]; m.gambar(e, P, lirik); m.mesh.visible = true
    const n = Math.sin(x * 3 + t * 2.4) * 0.012, sk = m.opsi.skala
    m.mesh.position.set(x, y0 + L.tinggi(x, z) * (a.lokasi === 'sungai' ? 0 : 1) + lonc * 0.28 + bob, z)
    m.mesh.scale.set(sk * (1 - n * 0.5 - lonc * 0.05), sk * (1 + n + lonc * 0.08), sk)
    posTokoh[tk.id] = m.mesh.position
  })
  const ids = a.tokoh.map((x) => x.id)
  const fokus = posTokoh[a.fokus] || posTokoh[ids[0]] || v3(bx, 0, 0)
  const pusat = ids.length ? ids.reduce((p, id) => p.add(posTokoh[id]), v3(0, 0, 0)).multiplyScalar(1 / ids.length) : fokus.clone()
  // kejadian khusus lokasi
  if (a.lokasi === 'sungai' && a.kejadian === 'buaya_air') {
    // buaya di air antara kamera dan perahu, sisi berlawanan dari kamera supaya masuk frame; mendekat sepanjang adegan
    const kk = ease((t - a.mulai) / (a.akhir - a.mulai)), naik = a.tKejadian != null ? ease((t - a.tKejadian) / 0.5) : 0
    L.api.aturBuaya(t, fokus.x + a.sisi * lerp(1.1, 0.45, kk), lerp(0.9, 0.1, kk), naik, Math.PI / 2 + a.sisi * 0.35)
  }
  if (a.lokasi === 'gurun' && L.api) {
    const aktif = a.kejadian === 'gundukan' || a.kejadian === 'buaya_muncul'
    const mulaiG = a.mulai + 0.2, tk = a.tKejadian ?? a.akhir
    const gk = ease((t - mulaiG) / Math.max(0.5, (a.akhir - mulaiG)))
    const g = { x: fokus.x + lerp(2.6, 0.75, gk), z: fokus.z + lerp(2.2, 0.95, gk), naik: aktif ? clamp((t - a.mulai) / 0.8) : 0 }
    L.api.atur(t, g, a.kejadian === 'buaya_muncul' ? clamp((t - tk - 0.1) / 0.35) : 0)
  }
  const c = kamera(a, t, pusat, fokus)
  camera.position.copy(c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.look)
  for (const id of ids) T[id].mesh.rotation.y = Math.atan2(camera.position.x - T[id].mesh.position.x, camera.position.z - T[id].mesh.position.z)
  if (a.lokasi === 'sungai') { // dayung mengikuti tangan tokoh yang mendayung (sisi perahu yang menghadap kamera)
    const pendayung = a.tokoh.find((x) => x.pose === 'dayung')
    if (pendayung) {
      const p = T[pendayung.id].mesh.position, ph = Math.sin(t * 2.2)
      const kanan = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      const atas = p.clone().add(new THREE.Vector3(0, 0.82 + ph * 0.06, 0.25)).addScaledVector(kanan, 0.12 + ph * 0.1)
      const bawah = new THREE.Vector3(p.x - 0.25 + ph * 0.45, -0.25, -1.2 + 0.85)
      L.api.pegangDayung(atas, bawah)
    }
  }
  bokeh.uniforms.focus.value = c.pos.distanceTo(v3(fokus.x, fokus.y + 1.05, fokus.z)); bokeh.uniforms.aperture.value = c.ap
  L.update(t)
}

// ---------- caption ----------
const out = canvas(W, H), ox = out.getContext('2d')
const grupKata = (() => { const g = []; let cur = []
  KATA.forEach((w, i) => { const prev = KATA[i - 1]; if (cur.length && (cur.length >= 2 || w.s - prev.e > 0.25)) { g.push(cur); cur = [] } cur.push(w) })
  if (cur.length) g.push(cur)
  return g.map((ws, i) => ({ teks: ws.map((w) => w.w).join(' '), s: ws[0].s, e: g[i + 1] ? Math.min(g[i + 1][0].s, ws[ws.length - 1].e + 0.6) : ws[ws.length - 1].e + 0.5 }))
})()
function overlay(t) {
  ox.drawImage(renderer.domElement, 0, 0)
  const vg = ox.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,30,0.42)')
  ox.fillStyle = vg; ox.fillRect(0, 0, W, H)
  const c = grupKata.find((g) => t >= g.s && t < g.e)
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
window.renderAt = (t) => { adegan(t); composer.render(); overlay(t); return out.toDataURL('image/jpeg', 0.93) }
window.SIAP = true
