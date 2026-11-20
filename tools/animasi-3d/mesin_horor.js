// Mesin video horor: membaca /hasil/timeline.json (dibuat horor_video.py). Semua waktu kejadian sudah
// dalam detik. Lokasi & makhluk dari lib/horor.js, tokoh dari lib/tokoh.js (keduanya tidak diubah).
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { lerp, clamp, ease, v3, canvas, tex, rng } from './lib/util.js'
import { buatTokoh, poseDari, hidupkan } from './lib/tokoh.js'
import { buatJalanHutan, buatRumahTua } from './lib/horor.js'
import { buatKuntiSeram } from './lib/kunti_seram.js'

const q = new URLSearchParams(location.search)
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920)
const TL = await (await fetch('/hasil/timeline.json')).json()
const KATA = TL.kata, ADEGAN = TL.adegan, DUR = TL.durasi
const VHS = (q.get('gaya') || TL.gaya) === 'vhs'

// ---------- renderer & post ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(W, H)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 900)
scene.add(camera)
const composer = new EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0.003, maxblur: 0.01 }); composer.addPass(bokeh)
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.6, 0.85); composer.addPass(bloom)
composer.addPass(new OutputPass())

// ---------- gaya VHS (opsional): pita kaset rusak, dikerjakan di GPU setelah OutputPass ----------
const vhs = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uG: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT, uG; uniform vec2 uRes; varying vec2 vUv;
    float h(float n){ return fract(sin(n) * 43758.5453); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 ambil(vec2 uv, float ca){
      float b = 0.0016;
      float r = texture2D(tDiffuse, uv + vec2(ca, 0.)).r * .5 + texture2D(tDiffuse, uv + vec2(ca + b, 0.)).r * .25 + texture2D(tDiffuse, uv + vec2(ca - b, 0.)).r * .25;
      float g = texture2D(tDiffuse, uv).g * .5 + texture2D(tDiffuse, uv + vec2(b, 0.)).g * .25 + texture2D(tDiffuse, uv - vec2(b, 0.)).g * .25;
      float bl = texture2D(tDiffuse, uv - vec2(ca, 0.)).b * .5 + texture2D(tDiffuse, uv - vec2(ca + b, 0.)).b * .25 + texture2D(tDiffuse, uv - vec2(ca - b, 0.)).b * .25;
      return vec3(r, g, bl);
    }
    void main(){
      vec2 uv = vUv; float fr = floor(uT * 30.);
      float row = floor(uv.y * uRes.y / 3.);
      float j = (h(row + fr * 7.) - .5) * .003 * (.3 + uG * 4.);                 // goyang garis
      float band = fract(uT * .07 + .3), inBand = smoothstep(.04, 0., abs(uv.y - band)); // pita tracking bergulir
      j += inBand * (h(row * 1.3 + fr) - .5) * .035 * (.4 + uG);
      float hs = smoothstep(.03, 0., uv.y); j += hs * (.02 + .04 * h(row + fr));    // noise head-switching di bawah
      uv.x += j;
      vec3 c = ambil(uv, .0022 + .007 * uG);                                       // warna geser + lembut
      float l = dot(c, vec3(.299, .587, .114)); c = mix(vec3(l), c, .8);
      c = c * .88 + .055; c *= vec3(1.03, 1.0, .9);                               // hitam terangkat, hangat kehijauan
      c *= .9 + .1 * sin(uv.y * uRes.y * 1.5708);                                  // garis scan
      float n = h2(vec2(uv.x * uRes.x, uv.y * uRes.y) + fr * 1.7);
      c += (n - .5) * (.05 + .05 * uG);
      c = mix(c, vec3(n), inBand * .22 + hs * .5);
      float x0 = h2(vec2(row, fr + 3.)), drop = step(.9993 - uG * .0025, h2(vec2(row, fr))) * step(x0, uv.x) * step(uv.x, x0 + .04 + .08 * h(row));
      c = mix(c, vec3(.95), drop * .8);                                            // bintik putih pita aus
      gl_FragColor = vec4(c, 1.);
    }`,
})
if (VHS) composer.addPass(vhs)
const glitchPada = (t) => { // 0..1: lonjakan di tiap potongan adegan, saat makhluk muncul, dan sesekali acak
  let g = 0.12
  for (const a of ADEGAN) {
    if (t >= a.mulai && t < a.mulai + 0.22) g = Math.max(g, 1 - (t - a.mulai) / 0.22)
    for (const k of ['t_jadiKunti', 't_jumpscare', 't_hpMati']) if (a[k] != null && Math.abs(t - a[k]) < 0.35) g = Math.max(g, 1 - Math.abs(t - a[k]) / 0.35)
  }
  const blok = Math.floor(t * 2), acak = Math.abs(Math.sin(blok * 91.7)) % 1
  if (acak > 0.9 && (t * 2) % 1 < 0.15) g = Math.max(g, 0.7)
  return g
}

// ---------- lokasi ----------
const PEMBUAT = { jalan_hutan: buatJalanHutan, rumah_tua: buatRumahTua }
const LOK = {}
for (const n of new Set(ADEGAN.map((a) => a.lokasi))) { const L = PEMBUAT[n](); L.grup.visible = false; scene.add(L.grup); LOK[n] = L }
const TINT = { jalan_hutan: '#bcc6e2', rumah_tua: '#cdc3c6' }
const SLOT = {
  jalan_hutan: { kiri: [-0.75, 0.9, 0], kanan: [0.55, 1.6, 0], tengah: [0, 0.6, 0] },
  rumah_tua: { kiri: [-1.0, 2.0, 0], kanan: [0.9, 2.4, 0], tengah: [0, 2.6, 0], foto: [-0.55, -2.55, 0.35] },
}
const FOTO = v3(-1.0, 2.3, -3.105) // foto lama di dinding rumah (posisi dunia)

// potret pengganti di depan foto lama: perempuan bergaun putih bersanggul (sepia)
if (LOK.rumah_tua) {
  const c = canvas(256, 320), x = c.getContext('2d'), r = rng(77)
  x.fillStyle = '#b9a47c'; x.fillRect(0, 0, 256, 320)
  x.fillStyle = '#8c7a5a'; x.fillRect(0, 230, 256, 90)
  x.fillStyle = '#efe6d2'; x.beginPath(); x.moveTo(78, 320); x.bezierCurveTo(70, 220, 90, 175, 128, 172); x.bezierCurveTo(166, 175, 186, 220, 178, 320); x.fill()
  x.fillStyle = '#d9c3a0'; x.beginPath(); x.ellipse(128, 128, 34, 42, 0, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#2a2018'; x.beginPath(); x.ellipse(128, 98, 38, 26, 0, Math.PI, 0); x.fill(); x.beginPath(); x.arc(128, 70, 18, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#3a2c20'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 13, 128, 4, 3, 0, 0, Math.PI * 2); x.fill() }
  x.strokeStyle = '#5a4030'; x.lineWidth = 2; x.beginPath(); x.moveTo(118, 150); x.quadraticCurveTo(128, 154, 138, 150); x.stroke()
  x.fillStyle = 'rgba(60,40,20,0.3)'; for (let i = 0; i < 700; i++) x.fillRect(r() * 256, r() * 320, 1.5, 1.5)
  const g = x.createRadialGradient(128, 160, 60, 128, 160, 200); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,25,10,0.6)'); x.fillStyle = g; x.fillRect(0, 0, 256, 320)
  x.strokeStyle = '#3b2a1c'; x.lineWidth = 14; x.strokeRect(0, 0, 256, 320)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.7), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.8, emissive: '#ffffff', emissiveMap: tex(c), emissiveIntensity: 0.3 }))
  m.position.copy(FOTO); LOK.rumah_tua.grup.add(m)
}

// senter HP (ikut kamera) — mati saat HP mati
const senter = new THREE.SpotLight('#eaf0ff', 0, 14, 0.42, 0.7, 1.3); senter.position.set(0.15, -0.2, 0); senter.target.position.set(0, -0.1, -3)
camera.add(senter, senter.target)

// ---------- tokoh & makhluk ----------
const T = {}
for (const [id, opsi] of Object.entries(TL.tokoh)) { T[id] = buatTokoh(opsi); T[id].mesh.visible = false; scene.add(T[id].mesh) }
const kunti = buatKuntiSeram(); scene.add(kunti.mesh)

ADEGAN.forEach((a, i) => {
  a.sisi = i % 2 ? 1 : -1
  for (const tk of a.tokoh) {
    tk.jadwalPose = [[a.mulai, tk.pose || 'diam'], ...tk.berubah.map(([ts, p]) => [ts, p])]
    tk.jadwalEks = [[a.mulai, tk.ekspresi || 'santai'], ...tk.berubah.map(([ts, , e]) => [ts, e])]
  }
})
const adeganAt = (t) => { let a = ADEGAN[0]; for (const x of ADEGAN) if (t >= x.mulai) a = x; return a }
const KEDIP = [1.3, 4.1, 6.9, 9.4, 12.2, 15.1, 17.8, 20.6, 23.3, 26.1, 28.9, 31.6, 34.4, 37.2, 40, 43.1, 46.3, 49.8, 52.6, 55.9]
const kedip = (t, off) => KEDIP.some((k) => t >= k + off && t < k + off + 0.12)
const lampuPada = (a, t) => { let lv = 1; for (const [ts, l] of a.lampu || []) if (t >= ts) lv = l; return lv }
const hpMatiPada = (a, t) => a.hpMati === true || (a.t_hpMati != null && t >= a.t_hpMati)

let lokAktif = null
function pakaiLokasi(n) {
  if (lokAktif === n) return
  for (const [k, L] of Object.entries(LOK)) L.grup.visible = k === n
  const L = LOK[n]; scene.fog = new THREE.Fog(L.kabut[0], L.kabut[1], L.kabut[2])
  for (const tk of Object.values(T)) tk.mesh.material.color.set(TINT[n])
  lokAktif = n
}

// ---------- kamera per shot ----------
const goyang = (t, k) => v3(Math.sin(t * 1.7) * 0.03 + Math.sin(t * 4.3) * 0.012, Math.sin(t * 2.3 + 1) * 0.022 + Math.sin(t * 5.1) * 0.008, 0).multiplyScalar(k)
function kamera(a, t, pusat, fokus) {
  const k = ease(clamp((t - a.mulai) / (a.akhir - a.mulai))), s = a.sisi, L = a.lokasi
  let dari, ke, look, ap = 0.003, fov = 40, tangan = 0.4
  if (a.shot === 'lebar') {
    if (L === 'rumah_tua') { dari = v3(1.4 * s, 1.55, 9.2); ke = v3(0.7 * s, 1.5, 7.6); look = v3(0, 1.45, -1.6) }
    else { dari = v3(pusat.x + 1.4 * s, 1.6, pusat.z + 7.2); ke = v3(pusat.x + 0.8 * s, 1.5, pusat.z + 5.8); look = v3(pusat.x - 0.4, 1.2, pusat.z - 2) }
    ap = 0.002
  } else if (a.shot === 'sedang') {
    dari = v3(pusat.x + 1.0 * s, 1.35, pusat.z + 4.4); ke = v3(pusat.x + 0.6 * s, 1.3, pusat.z + 3.6); look = v3(pusat.x, 1.1, pusat.z)
  } else if (a.shot === 'dekat') {
    dari = v3(fokus.x + 0.8 * s, fokus.y + 1.3, fokus.z + 2.7); ke = v3(fokus.x + 0.55 * s, fokus.y + 1.25, fokus.z + 2.1); look = v3(fokus.x + 0.1 * s, fokus.y + 1.12, fokus.z)
  } else if (a.shot === 'pov') { // mata Budi: genggam tangan, gemetar, mendorong pelan ke depan
    dari = v3(0.75, 1.6, 2.3); ke = v3(0.35, 1.55, 0.7); look = v3(fokus.x, fokus.y + 1.1, fokus.z); tangan = 1.4; fov = 44
  } else if (a.shot === 'foto') {
    const tp = a.t_potong ?? a.akhir
    if (t < tp) { // dorong pelan ke foto
      const kk = ease(clamp((t - a.mulai) / (tp - a.mulai)))
      dari = v3(-0.85, 2.15, -1.2); ke = v3(-0.95, 2.28, -2.3); look = FOTO.clone(); tangan = 0.8; fov = lerp(40, 34, kk)
      return { pos: dari.lerp(ke, kk).add(goyang(t, tangan)), look, ap: 0.002, fov }
    }
    const kk = ease(clamp((t - tp) / (a.akhir - tp)))
    dari = v3(fokus.x + 0.4, fokus.y + 1.5, fokus.z + 3.0); ke = v3(fokus.x + 0.2, fokus.y + 1.45, fokus.z + 2.3); look = v3(fokus.x, fokus.y + 1.32, fokus.z)
    return { pos: dari.lerp(ke, kk).add(goyang(t, 0.7)), look, ap: 0.003, fov: 38 }
  }
  return { pos: dari.lerp(ke, k).add(goyang(t, tangan)), look, ap, fov }
}

// ---------- satu frame ----------
let efek = { flash: 0, gelap: 0, merah: 0 }
function adegan(t) {
  const a = adeganAt(t)
  pakaiLokasi(a.lokasi)
  const L = LOK[a.lokasi], slot = SLOT[a.lokasi]
  for (const tk of Object.values(T)) tk.mesh.visible = false
  kunti.mesh.visible = false
  efek = { flash: 0, gelap: 0, merah: 0 }

  const jadiKunti = a.t_jadiKunti != null && t >= a.t_jadiKunti
  const pos = {}
  a.tokoh.forEach((tk, i) => {
    const [sx, sz, sy] = slot[tk.posisi] || slot.tengah
    const P = poseDari(tk.jadwalPose, t); hidupkan(P, t, sx * 3 + i)
    let e = tk.jadwalEks[0][1]; for (const [ts, n] of tk.jadwalEks) if (t >= ts) e = n
    if ((e === 'santai' || e === 'sombong') && kedip(t, sx)) e = 'kedip'
    let x = sx
    if (e === 'cemas' || tk.pose === 'takut') x += Math.sin(t * 60) * 0.006 // gemetar
    const m = T[tk.id]
    pos[tk.id] = v3(x, sy, sz)
    if (tk.id === 'siti' && jadiKunti) return // Siti berubah wujud
    m.gambar(e, P, [0, 0]); m.mesh.visible = true
    const n = Math.sin(x * 3 + t * 2.4) * 0.012, sk = m.opsi.skala
    m.mesh.position.set(x, sy, sz); m.mesh.scale.set(sk * (1 - n * 0.5), sk * (1 + n), sk)
  })
  let fokus = pos[a.fokus] || Object.values(pos)[0] || v3(0, 0, 0)
  if (a.t_fokusAkhir != null && t >= a.t_fokusAkhir && pos[a.fokusAkhir[1]]) fokus = pos[a.fokusAkhir[1]]
  const ids = Object.keys(pos)
  const pusat = ids.length ? ids.reduce((p, id) => p.add(pos[id]), v3(0, 0, 0)).multiplyScalar(1 / ids.length) : v3(0, 0, 0)

  // lampu, pintu, HP
  L.api.lampu(lampuPada(a, t))
  if (L.api.pintu) {
    const kp = a.t_pintu != null ? ease(clamp((t - a.t_pintu) / 2.2)) : 0
    const sudahTerbuka = ADEGAN.indexOf(a) > ADEGAN.findIndex((x) => x.t_pintu != null) && ADEGAN.some((x) => x.t_pintu != null)
    L.api.pintu(a.t_pintu != null ? kp * 0.85 : sudahTerbuka ? 0.85 : 0)
  }
  const hpMati = hpMatiPada(a, t)
  let sen = a.lokasi === 'rumah_tua' ? 5.5 : 0
  if (hpMati) { const dt = a.t_hpMati != null ? t - a.t_hpMati : 99; sen = dt < 0.5 ? (Math.sin(dt * 90) > 0 ? 5.5 : 0.3) : 0 }
  senter.intensity = sen
  renderer.toneMappingExposure = L.exposure * (hpMati ? 0.82 : 1)

  // kamera
  const c = kamera(a, t, pusat, fokus)
  camera.position.copy(c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.look)

  // makhluk: Siti -> kuntilanak, lalu jumpscare di depan kamera
  const tj = a.t_jumpscare
  if (jadiKunti && (tj == null || t < tj)) {
    const p = pos.siti; kunti.gambar(t, 'dekat'); kunti.mesh.visible = true
    kunti.mesh.position.set(p.x, p.y + 0.12 + Math.sin(t * 1.5) * 0.04, p.z); efek.merah = clamp((t - a.t_jadiKunti) / 1.2) * 0.5
  }
  if (tj != null && t >= tj) {
    const dt = t - tj
    if (dt < 0.7) {
      const maju = new THREE.Vector3(); camera.getWorldDirection(maju)
      kunti.gambar(t, 'depan'); kunti.mesh.visible = true
      kunti.mesh.position.copy(camera.position).addScaledVector(maju, lerp(2.6, 1.55, ease(dt / 0.12))); kunti.mesh.position.y = camera.position.y - 1.81
      camera.position.x += Math.sin(t * 83) * 0.05 * (1 - dt / 0.7); camera.position.y += Math.cos(t * 71) * 0.04 * (1 - dt / 0.7)
      efek.flash = Math.max(0, 1 - dt / 0.14); efek.merah = 0.6
    } else efek.gelap = 1
  }
  // penutup: kuntilanak berdiri di ambang pintu sampai lampu padam, lalu gelap
  if (a.gelap) {
    const tpadam = (a.lampu.find(([, l]) => l === 0) || [a.akhir])[0]
    if (t < tpadam) { kunti.gambar(t, 'jauh'); kunti.mesh.visible = true; kunti.mesh.position.set(0, 0.37, -3.05) }
    efek.gelap = Math.max(efek.gelap, clamp((t - tpadam) / 1.4) * 0.9, clamp((t - (a.akhir - 1.2)) / 0.6))
    if (t < tpadam + 0.2) efek.gelap = Math.max(efek.gelap, 0)
  }
  // fade masuk di awal video
  efek.gelap = Math.max(efek.gelap, 1 - clamp(t / 0.8))

  for (const o of [...ids.map((id) => T[id].mesh), kunti.mesh]) o.rotation.y = Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z)
  const fp = a.shot === 'foto' && (a.t_potong == null || t < a.t_potong) ? FOTO : v3(fokus.x, fokus.y + 1.1, fokus.z)
  bokeh.uniforms.focus.value = camera.position.distanceTo(kunti.mesh.visible && tj != null && t >= tj ? kunti.mesh.position : fp); bokeh.uniforms.aperture.value = c.ap
  bloom.strength = efek.flash > 0 ? 1.2 : 0.45
  L.update(t)
}

// ---------- caption & grading ----------
const out = canvas(W, H), ox = out.getContext('2d')
const grain = (() => { const c = canvas(512, 512), x = c.getContext('2d'), d = x.createImageData(512, 512), r = rng(9); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data.set([v, v, v, 30], i) } x.putImageData(d, 0, 0); return c })()
const grupKata = (() => { const g = []; let cur = []
  KATA.forEach((w, i) => { const prev = KATA[i - 1]; if (cur.length && (cur.length >= 2 || w.s - prev.e > 0.3 || /[.?!,…]$/.test(prev.w))) { g.push(cur); cur = [] } cur.push(w) })
  if (cur.length) g.push(cur)
  return g.map((ws, i) => ({ teks: ws.map((w) => w.w.replace(/['"]/g, '')).join(' '), s: ws[0].s, e: g[i + 1] ? Math.min(g[i + 1][0].s, ws[ws.length - 1].e + 0.5) : ws[ws.length - 1].e + 0.8 }))
})()
const SERAM = /^(jangan|mati|hantu|persis|siti|pulang|padam|sendiri|ketawa|kunci|foto|bintang)/i
function overlay(t) {
  ox.filter = VHS ? 'contrast(1.04)' : 'saturate(0.72) contrast(1.1)'; ox.drawImage(renderer.domElement, 0, 0); ox.filter = 'none'
  ox.globalCompositeOperation = 'soft-light'; ox.fillStyle = VHS ? 'rgba(60,80,70,0.16)' : 'rgba(40,70,115,0.24)'; ox.fillRect(0, 0, W, H)
  if (efek.merah) { ox.globalCompositeOperation = 'multiply'; ox.fillStyle = `rgba(255,${Math.round(255 - 120 * efek.merah)},${Math.round(255 - 140 * efek.merah)},1)`; ox.fillRect(0, 0, W, H) }
  ox.globalCompositeOperation = 'source-over'
  if (efek.flash) { ox.fillStyle = `rgba(255,255,255,${efek.flash * 0.85})`; ox.fillRect(0, 0, W, H) }
  if (efek.gelap) { ox.fillStyle = `rgba(0,0,0,${efek.gelap})`; ox.fillRect(0, 0, W, H) }
  const off = Math.floor(t * 30) * 97 % 512; ox.globalAlpha = VHS ? 0.45 : 0.9
  for (let y = -off; y < H; y += 512) for (let x = -((off * 3) % 512); x < W; x += 512) ox.drawImage(grain, x, y)
  ox.globalAlpha = 1
  const vg = ox.createRadialGradient(W / 2, H * 0.47, H * 0.18, W / 2, H * 0.5, H * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.65)')
  ox.fillStyle = vg; ox.fillRect(0, 0, W, H)
  if (VHS) osd(t)
  const a = adeganAt(t)
  if (a.t_layarHp != null && t >= a.t_layarHp) layarHp(t - a.t_layarHp)
  const c = grupKata.find((g) => t >= g.s && t < g.e)
  if (c) {
    const pop = 1 + 0.1 * (1 - ease((t - c.s) / 0.12)), seram = SERAM.test(c.teks)
    const jit = seram ? Math.sin(t * 90) * 2 : 0
    ox.save(); ox.translate(W / 2 + jit, H * (a.t_layarHp != null && t >= a.t_layarHp ? 0.86 : 0.7)); ox.scale(pop, pop)
    ox.font = `800 ${Math.round(W * 0.064)}px "Segoe UI", Arial, sans-serif`; ox.textAlign = 'center'; ox.textBaseline = 'middle'
    ox.lineJoin = 'round'; ox.shadowColor = 'rgba(0,0,0,0.8)'; ox.shadowBlur = 22; ox.shadowOffsetY = 4
    ox.strokeStyle = 'rgba(5,4,8,0.9)'; ox.lineWidth = W * 0.013; ox.strokeText(c.teks, 0, 0)
    ox.shadowColor = 'transparent'; ox.fillStyle = seram ? '#ff4a4a' : '#f2f0ea'; ox.fillText(c.teks, 0, 0); ox.restore()
  }
}

function teksOsd(s, x0, y0, al = 'left') { // tulisan kamera: putih dengan pinggiran merah/sian seperti pita
  ox.textAlign = al; ox.textBaseline = 'top'
  ox.fillStyle = 'rgba(255,40,40,0.55)'; ox.fillText(s, x0 - 3, y0)
  ox.fillStyle = 'rgba(40,255,255,0.45)'; ox.fillText(s, x0 + 3, y0)
  ox.fillStyle = '#f4f4ee'; ox.fillText(s, x0, y0)
}
function osd(t) {
  ox.save(); ox.font = `700 ${Math.round(W * 0.046)}px Consolas, "Courier New", monospace`
  ox.shadowColor = 'rgba(0,0,0,0.6)'; ox.shadowBlur = 6
  teksOsd('PLAY' + (Math.floor(t * 1.5) % 2 ? ' ▶' : ''), W * 0.07, H * 0.045)
  teksOsd('SP', W * 0.93, H * 0.045, 'right')
  const dtk = 2 * 3600 + 13 * 60 + 5 + Math.floor(t), jj = Math.floor(dtk / 3600), mm = Math.floor(dtk / 60) % 60, ss = dtk % 60
  const pad = (n) => String(n).padStart(2, '0')
  teksOsd(`AM ${jj}:${pad(mm)}:${pad(ss)}`, W * 0.07, H * 0.905)
  teksOsd('NOV.20 2026', W * 0.93, H * 0.905, 'right')
  ox.restore()
}
function kotak(x0, y0, w, h, r) { ox.beginPath(); ox.roundRect(x0, y0, w, h, r) }
function layarHp(dt) { // HP menyala lagi di kegelapan: minta rating penumpang (UI generik, bukan merek apa pun)
  const k = ease(clamp(dt / 0.6)), w = W * 0.5, h = w * 1.9, x0 = (W - w) / 2, y0 = H * 0.2 + (1 - k) * 60
  ox.save(); ox.globalAlpha = k
  ox.shadowColor = 'rgba(150,190,255,0.55)'; ox.shadowBlur = 90; ox.fillStyle = '#0b0d12'; kotak(x0, y0, w, h, 48); ox.fill(); ox.shadowBlur = 0
  ox.fillStyle = '#e9edf4'; kotak(x0 + 16, y0 + 16, w - 32, h - 32, 36); ox.fill()
  ox.fillStyle = '#1d2533'; ox.textAlign = 'center'; ox.textBaseline = 'middle'
  ox.font = `700 ${Math.round(w * 0.075)}px "Segoe UI", Arial`; ox.fillText('Perjalanan selesai', W / 2, y0 + h * 0.14)
  ox.fillStyle = '#c9ced8'; ox.beginPath(); ox.arc(W / 2, y0 + h * 0.33, w * 0.16, 0, Math.PI * 2); ox.fill() // foto profil kosong
  ox.fillStyle = '#9aa1ad'; ox.beginPath(); ox.arc(W / 2, y0 + h * 0.31, w * 0.06, 0, Math.PI * 2); ox.fill(); ox.beginPath(); ox.ellipse(W / 2, y0 + h * 0.4, w * 0.1, w * 0.06, 0, Math.PI, 0); ox.fill()
  ox.fillStyle = '#1d2533'; ox.font = `600 ${Math.round(w * 0.07)}px "Segoe UI", Arial`; ox.fillText('Penumpang: Siti', W / 2, y0 + h * 0.52)
  ox.fillStyle = '#6b7383'; ox.font = `400 ${Math.round(w * 0.05)}px "Segoe UI", Arial`; ox.fillText('Tujuan: Rumah', W / 2, y0 + h * 0.58)
  ox.fillText('Beri rating penumpangmu', W / 2, y0 + h * 0.68)
  for (let i = 0; i < 5; i++) { // bintang kosong, berdenyut pelan
    const cx = W / 2 + (i - 2) * w * 0.15, cy = y0 + h * 0.77, rr = w * 0.055 * (1 + 0.06 * Math.sin(dt * 4 + i))
    ox.beginPath(); for (let j = 0; j < 10; j++) { const ang = -Math.PI / 2 + j * Math.PI / 5, rad = j % 2 ? rr * 0.45 : rr; ox.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad) } ox.closePath()
    ox.strokeStyle = '#f2b51d'; ox.lineWidth = 5; ox.stroke()
  }
  ox.restore()
}

window.DUR = DUR
window.renderAt = (t) => { adegan(t); if (VHS) { vhs.uniforms.uT.value = t; vhs.uniforms.uG.value = Math.max(glitchPada(t), kunti.mesh.visible ? 0.35 : 0) } composer.render(); overlay(t); return out.toDataURL('image/jpeg', 0.92) }
window.SIAP = true
