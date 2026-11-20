// Aset horor: makhluk (billboard 2D kanvas, gaya kartun yang sama dengan tokoh) + lokasi malam yang seram.
// Seram lewat suasana: kabut, cahaya bulan dingin, lampu hangat yang bisa berkedip, bayangan. Tanpa gore.
import * as THREE from 'three'
import { rng, lerp, clamp, ease, canvas, tex, texData, petaTinggi, buatLangit, buatBintang, kayuTex } from './util.js'
import { hutan, partikel } from './lokasi.js'

const TAU = Math.PI * 2
const GARIS = '#141217'

// =====================================================================
// MAKHLUK
// =====================================================================
function gambarKunti(x, W, H, t, mode) {
  x.clearRect(0, 0, W, H); x.lineJoin = 'round'; x.lineCap = 'round'
  const cx = W / 2, kibar = Math.sin(t * 3) * 10
  // gaun putih panjang, ujung bawah compang-camping & berkibar
  const g = x.createLinearGradient(0, 300, 0, H); g.addColorStop(0, '#f4f1ea'); g.addColorStop(1, 'rgba(230,232,236,0.15)')
  x.fillStyle = g; x.beginPath(); x.moveTo(cx - 70, 330); x.bezierCurveTo(cx - 120, 560, cx - 150 + kibar, 820, cx - 170 + kibar, H - 40)
  for (let i = 0; i <= 8; i++) x.lineTo(cx - 170 + kibar + i * 42 + Math.sin(t * 5 + i) * 8, H - 40 - (i % 2 ? 50 : 0))
  x.bezierCurveTo(cx + 150 + kibar, 820, cx + 120, 560, cx + 70, 330); x.closePath(); x.fill()
  x.strokeStyle = 'rgba(20,18,23,0.55)'; x.lineWidth = 8; x.stroke()
  x.strokeStyle = 'rgba(160,160,170,0.35)'; x.lineWidth = 4
  for (const dx of [-50, 0, 50]) { x.beginPath(); x.moveTo(cx + dx, 380); x.quadraticCurveTo(cx + dx * 1.6 + kibar, 700, cx + dx * 2 + kibar, H - 80); x.stroke() }
  // lengan pucat terjulur
  x.strokeStyle = '#e8e2d6'; x.lineWidth = 16
  const julur = mode === 'depan' ? 1 : 0.35
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 70, 360); x.quadraticCurveTo(cx + s * (120 + 60 * julur), 430, cx + s * (110 + 90 * julur), 500 - 120 * julur); x.stroke() }
  x.strokeStyle = GARIS; x.lineWidth = 4
  for (const s of [-1, 1]) for (let j = 0; j < 4; j++) { const hx = cx + s * (110 + 90 * julur), hy = 500 - 120 * julur; x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx + s * (8 + j * 6), hy - 20 + j * 4); x.stroke() }
  // kepala & rambut hitam panjang menutupi wajah
  x.fillStyle = '#ece6da'; x.beginPath(); x.ellipse(cx, 230, 78, 92, 0, 0, TAU); x.fill()
  x.fillStyle = '#0b0a0d'; x.beginPath(); x.moveTo(cx - 92, 210); x.bezierCurveTo(cx - 110, 90, cx + 110, 90, cx + 92, 210)
  x.bezierCurveTo(cx + 130 + kibar, 420, cx + 120 + kibar, 560, cx + 70 + kibar, 640)
  for (let i = 0; i <= 10; i++) x.lineTo(cx + 70 + kibar - i * 14, 640 - (i % 2 ? 30 : 0))
  x.bezierCurveTo(cx - 120, 520, cx - 130, 400, cx - 92, 210); x.fill()
  // celah rambut: sedikit wajah pucat + satu mata menatap (lebih jelas saat dekat/depan)
  const buka = mode === 'depan' ? 1 : mode === 'dekat' ? 0.55 : 0.2
  x.fillStyle = '#e9e3d8'; x.beginPath(); x.ellipse(cx + 8, 250, 22 * buka + 4, 60 * buka + 6, 0.05, 0, TAU); x.fill()
  if (buka > 0.3) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + 10, 235, 11 * buka, 9 * buka, 0, 0, TAU); x.fill(); x.fillStyle = '#7a0d10'; x.beginPath(); x.arc(cx + 11, 236, 5 * buka, 0, TAU); x.fill() }
}
function gambarPocong(x, W, H, t, mode) {
  x.clearRect(0, 0, W, H); x.lineJoin = 'round'
  const cx = W / 2
  const g = x.createLinearGradient(cx - 120, 0, cx + 120, 0); g.addColorStop(0, '#d8d4ca'); g.addColorStop(0.5, '#f6f3ec'); g.addColorStop(1, '#cfcac0')
  x.fillStyle = g; x.strokeStyle = 'rgba(20,18,23,0.7)'; x.lineWidth = 9
  x.beginPath(); x.moveTo(cx, 120); x.bezierCurveTo(cx - 140, 160, cx - 130, 420, cx - 110, 700); x.bezierCurveTo(cx - 100, 900, cx - 60, H - 40, cx, H - 30)
  x.bezierCurveTo(cx + 60, H - 40, cx + 100, 900, cx + 110, 700); x.bezierCurveTo(cx + 130, 420, cx + 140, 160, cx, 120); x.fill(); x.stroke()
  // ikatan kafan: kepala, leher, perut, kaki
  x.strokeStyle = '#b8b2a6'; x.lineWidth = 10
  for (const y of [190, 330, 600, 880]) { x.beginPath(); x.moveTo(cx - 105, y); x.quadraticCurveTo(cx, y + 18, cx + 105, y); x.stroke() }
  x.fillStyle = '#f6f3ec'; x.strokeStyle = 'rgba(20,18,23,0.7)'; x.lineWidth = 6
  x.beginPath(); x.moveTo(cx, 128); x.quadraticCurveTo(cx - 30, 70, cx - 12, 40); x.quadraticCurveTo(cx, 80, cx + 10, 38); x.quadraticCurveTo(cx + 30, 70, cx, 128); x.fill(); x.stroke()
  // wajah gelap kehijauan di bukaan kain
  const dekat = mode === 'depan' ? 1 : mode === 'dekat' ? 0.7 : 0.4
  x.fillStyle = '#2d3328'; x.beginPath(); x.ellipse(cx, 255, 52, 62, 0, 0, TAU); x.fill()
  x.fillStyle = '#9aa58c'; x.beginPath(); x.ellipse(cx, 262, 40 * dekat + 8, 48 * dekat + 8, 0, 0, TAU); x.fill()
  x.fillStyle = '#0c0d0b'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 16, 250, 9, 12, 0, 0, TAU); x.fill() }
  if (dekat > 0.6) { x.fillStyle = '#e8e2d0'; for (const s of [-1, 1]) { x.beginPath(); x.arc(cx + s * 16, 251, 3, 0, TAU); x.fill() } }
}
function gambarBayangan(x, W, H, t) {
  x.clearRect(0, 0, W, H)
  const cx = W / 2, g = x.createRadialGradient(cx, H * 0.45, 40, cx, H * 0.5, H * 0.55)
  g.addColorStop(0, 'rgba(6,5,8,0.98)'); g.addColorStop(0.7, 'rgba(6,5,8,0.9)'); g.addColorStop(1, 'rgba(6,5,8,0)')
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, 150, 70, 85, 0, 0, TAU); x.fill()
  x.beginPath(); x.moveTo(cx - 70, 230); x.bezierCurveTo(cx - 170, 500, cx - 150, 900, cx - 120 + Math.sin(t * 2) * 10, H - 20)
  x.lineTo(cx + 120 + Math.sin(t * 2 + 1) * 10, H - 20); x.bezierCurveTo(cx + 150, 900, cx + 170, 500, cx + 70, 230); x.fill()
  x.fillStyle = 'rgba(220,40,40,0.85)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 24, 150, 9, 5, 0, 0, TAU); x.fill() }
}
const GAMBAR = { kuntilanak: gambarKunti, pocong: gambarPocong, bayangan: gambarBayangan }
const TINGGI_MAKHLUK = { kuntilanak: 2.1, pocong: 1.85, bayangan: 2.4 }

export function buatMakhluk(jenis) {
  const W = 512, H = 1024, c = canvas(W, H), x = c.getContext('2d'), tx = tex(c)
  const tinggi = TINGGI_MAKHLUK[jenis] || 2, geo = new THREE.PlaneGeometry(tinggi * W / H, tinggi); geo.translate(0, tinggi / 2, 0)
  const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, alphaTest: 0.08, toneMapped: false, depthWrite: true, fog: true })
  const mesh = new THREE.Mesh(geo, mat); mesh.visible = false
  let modeLalu = ''
  return {
    mesh, jenis,
    gambar(t, mode) { // digambar ulang tiap frame (kain/rambut bergerak)
      (GAMBAR[jenis] || gambarBayangan)(x, W, H, t, mode); tx.needsUpdate = true; modeLalu = mode
    },
  }
}

// =====================================================================
// LOKASI HOROR
// =====================================================================
function cahayaBulan(grup, kuat = 1.3) {
  const l = new THREE.DirectionalLight('#9db2ff', kuat); l.position.set(-6, 12, -8); l.castShadow = true
  l.shadow.mapSize.set(2048, 2048); Object.assign(l.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 50 }); l.shadow.bias = -0.0005; l.shadow.radius = 4
  grup.add(l, l.target); grup.add(new THREE.HemisphereLight('#41529a', '#16120e', 1.0))
  const isi = new THREE.DirectionalLight('#6f82c8', 0.35); isi.position.set(3, 3, 10); grup.add(isi) // pengisi dari arah kamera supaya siluet terbaca
  return l
}
// kabut: lembaran lembut transparan yang melayang rendah (bukan titik partikel)
function kabutLapis(R, grup, n, [lx, lz], cz) {
  const c = canvas(256, 128), x = c.getContext('2d'), g = x.createRadialGradient(128, 64, 4, 128, 64, 126)
  g.addColorStop(0, 'rgba(190,205,235,0.55)'); g.addColorStop(1, 'rgba(190,205,235,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 128)
  const t0 = tex(c), daftar = []
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t0, transparent: true, depthWrite: false, opacity: 0.04 + R() * 0.05, fog: false }))
    const sk = 3 + R() * 4; s.scale.set(sk * 2, sk * 0.6, 1); s.userData = { x: (R() - 0.5) * lx, z: cz + (R() - 0.5) * lz, y: 0.2 + R() * 0.7, v: 0.05 + R() * 0.08, ph: R() * 6 }
    grup.add(s); daftar.push(s)
  }
  return (t) => daftar.forEach((s) => { const u = s.userData; s.position.set(u.x + Math.sin(t * u.v + u.ph) * 1.2, u.y, u.z) })
}
function lampuBerkedip(t, seed, level) { // level 0 = mati, 1 = normal; berkedip acak deterministik
  const n = Math.sin(t * 37 + seed) * Math.sin(t * 13.3 + seed * 2) * Math.sin(t * 5.1)
  return level >= 1 ? 1 : level <= 0 ? 0 : (n > 0.15 - level * 0.4 ? 1 : 0.08)
}

// ---------- JALAN HUTAN MALAM ----------
export function buatJalanHutan() {
  const R = rng(4242), grup = new THREE.Group()
  const langit = buatLangit({ top: '#03060f', mid: '#0b1430', hor: '#1b2340', sun: [-0.4, 0.35, -0.85], sunWarna: '#9fb2ff', bulan: true })
  grup.add(langit, buatBintang(R, 400, 0.6))
  cahayaBulan(grup, 1.25)
  const tinggi = (x, z) => (Math.abs(x) < 1.6 ? -0.03 : 0.08 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + clamp((Math.abs(x) - 1.6) / 6) * 0.5)
  const r = rng(13)
  const tanah = petaTinggi(512, (u, v) => 0.4 * Math.sin(TAU * (u * 11 + 0.3 * Math.sin(TAU * v * 3))) * Math.sin(TAU * v * 9) + 0.3 * Math.sin(TAU * (u * 23 + v * 17)),
    () => { const n = r(); return [62 + n * 26, 50 + n * 20, 40 + n * 16] })
  const g = new THREE.PlaneGeometry(60, 120, 180, 360); g.rotateX(-Math.PI / 2); g.translate(0, 0, -30)
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, tinggi(p.getX(i), p.getZ(i))); g.computeVertexNormals()
  const tn = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex(tanah.warna, 12, 24), normalMap: texData(tanah.normal, 12, 24), roughness: 1 })); tn.receiveShadow = true; grup.add(tn)
  // jejak roda di jalan
  const jejak = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 120), new THREE.MeshStandardMaterial({ color: '#2c2219', roughness: 1, transparent: true, opacity: 0.5 }))
  jejak.rotation.x = -Math.PI / 2; jejak.position.set(0.45, -0.02, -30); grup.add(jejak); const j2 = jejak.clone(); j2.position.x = -0.45; grup.add(j2)
  // pohon tinggi gelap rapat di kiri-kanan jalan
  const titik = []; for (let i = 0; i < 260; i++) { const s = R() < 0.5 ? -1 : 1; titik.push([s * (2.6 + R() * 16), 6 - R() * 70]) }
  hutan(R, grup, titik, tinggi, { hue: 0.33, besar: 1.5 })
  // pohon beringin besar dengan akar gantung (penanda tempat angker)
  const beringin = new THREE.Group(); beringin.position.set(-3.4, 0, -6)
  const kulit = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 })
  const batang = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 5, 10), kulit); batang.position.y = 2.5; batang.castShadow = true; beringin.add(batang)
  const tajuk = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 2), new THREE.MeshStandardMaterial({ color: '#16241a', flatShading: true, roughness: 1 })); tajuk.position.y = 6.2; tajuk.scale.set(1.3, 0.75, 1.2); tajuk.castShadow = true; beringin.add(tajuk)
  const akar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1, 4), kulit, 80); const o = new THREE.Object3D()
  for (let i = 0; i < 80; i++) { const a = R() * TAU, d = 1.2 + R() * 3, h = 1.5 + R() * 3; o.position.set(Math.cos(a) * d, 5.2 - h / 2, Math.sin(a) * d); o.scale.set(1, h, 1); o.rotation.set((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1); o.updateMatrix(); akar.setMatrixAt(i, o.matrix) }
  beringin.add(akar); grup.add(beringin)
  // motor bebek di pinggir jalan dengan lampu depan
  const motor = new THREE.Group(); motor.position.set(1.0, 0, 1.2); motor.rotation.y = -0.4
  const cat = new THREE.MeshStandardMaterial({ color: '#2b5a8a', roughness: 0.5, metalness: 0.3 }), hitam = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 })
  for (const z of [-0.55, 0.55]) { const roda = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 20), hitam); roda.position.set(0, 0.3, z); roda.rotation.y = Math.PI / 2; motor.add(roda) }
  const bodi = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.9), cat); bodi.position.set(0, 0.62, 0); motor.add(bodi)
  const jok = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.55), hitam); jok.position.set(0, 0.82, -0.2); motor.add(jok)
  const stang = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), hitam); stang.rotation.z = Math.PI / 2; stang.position.set(0, 1.0, 0.45); motor.add(stang)
  const lampuM = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false })); lampuM.position.set(0, 0.88, 0.58); motor.add(lampuM)
  motor.traverse((m) => { if (m.isMesh) m.castShadow = true }); grup.add(motor)
  const sorot = new THREE.SpotLight('#fff1cc', 30, 18, 0.45, 0.6, 1.4); sorot.position.set(0, 0.88, 0.6); sorot.target.position.set(0, 0, 6); sorot.castShadow = true; sorot.shadow.mapSize.set(1024, 1024)
  motor.add(sorot, sorot.target)
  const kabut = kabutLapis(R, grup, 22, [12, 16], -3)
  const kunang = partikel(R, grup, { n: 60, pusat: [0, 0.6, -4], ukuran: [12, 2, 12], warna: '190,255,150', besar: 0.05, naik: 0.03 })
  let level = 1
  return {
    nama: 'jalan_hutan', grup, langit, kabut: ['#141c36', 10, 60], exposure: 1.25, tinggi, slot: { kiri: [-0.8, 0.4], tengah: [0, 0], kanan: [0.9, 0.2] },
    api: { lampu(l) { level = l }, motor },
    update(t) { kabut(t); kunang(t); const k = lampuBerkedip(t, 1, level); sorot.intensity = 30 * k; lampuM.material.color.setScalar(0.2 + 0.8 * k) },
  }
}

// ---------- RUMAH TUA DI KAMPUNG (teras) ----------
export function buatRumahTua() {
  const R = rng(5151), grup = new THREE.Group()
  const langit = buatLangit({ top: '#04070f', mid: '#0d1631', hor: '#1d2442', sun: [0.5, 0.4, -0.75], sunWarna: '#9fb2ff', bulan: true })
  grup.add(langit, buatBintang(R, 350, 0.6))
  cahayaBulan(grup, 1.2)
  const tinggi = () => 0
  const r = rng(17)
  const halaman = petaTinggi(512, (u, v) => 0.35 * Math.sin(TAU * (u * 13 + v * 7)) * Math.sin(TAU * v * 11), () => { const n = r(), rumput = r() < 0.45; return rumput ? [38 + n * 18, 52 + n * 20, 32 + n * 12] : [70 + n * 20, 56 + n * 16, 42 + n * 12] })
  const tanahM = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: tex(halaman.warna, 18), normalMap: texData(halaman.normal, 18), roughness: 1 }))
  tanahM.rotation.x = -Math.PI / 2; tanahM.position.z = -10; tanahM.receiveShadow = true; grup.add(tanahM)
  // rumah kayu: dinding papan vertikal, atap genteng gelap, teras panggung rendah
  const papan = new THREE.MeshStandardMaterial({ map: tex(kayuTex(81, { papan: 14, dasar: [92, 64, 44], arah: 'v' }), 3, 1), roughness: 0.95 })
  const rumah = new THREE.Group(); rumah.position.set(0, 0, -3.2); grup.add(rumah)
  const lantai = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 2.6), new THREE.MeshStandardMaterial({ map: tex(kayuTex(83, { papan: 10, dasar: [100, 70, 48] }), 2, 1), roughness: 0.9 }))
  lantai.position.set(0, 0.17, 1.3); lantai.castShadow = lantai.receiveShadow = true; rumah.add(lantai)
  const dinding = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.15), papan); dinding.position.set(0, 1.85, 0); dinding.castShadow = dinding.receiveShadow = true; rumah.add(dinding)
  const atap = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.2, 1.8, 4, 1), new THREE.MeshStandardMaterial({ color: '#2c1e1a', roughness: 0.9, flatShading: true }))
  atap.rotation.y = Math.PI / 4; atap.scale.set(1.25, 1, 0.75); atap.position.set(0, 4.2, 0.9); atap.castShadow = true; rumah.add(atap)
  for (const x of [-3.3, -1.1, 1.1, 3.3]) { const tiang = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), papan); tiang.position.set(x, 1.85, 2.5); tiang.castShadow = true; rumah.add(tiang) }
  // pintu jati dua daun (bisa membuka sendiri)
  const jati = new THREE.MeshStandardMaterial({ map: tex(kayuTex(85, { papan: 3, dasar: [70, 44, 28], arah: 'v' })), roughness: 0.8 })
  const pintuKi = new THREE.Group(), pintuKa = new THREE.Group()
  for (const [pg, s] of [[pintuKi, -1], [pintuKa, 1]]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 0.06), jati); d.position.x = -s * 0.3; d.castShadow = true; pg.add(d); pg.position.set(s * 0.6, 1.4, 0.09); rumah.add(pg) }
  const gelapDalam = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), new THREE.MeshBasicMaterial({ color: '#030203' })); gelapDalam.position.set(0, 1.4, 0.07); rumah.add(gelapDalam)
  // jendela dengan cahaya samar & tirai
  for (const s of [-1, 1]) {
    const kaca = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), new THREE.MeshBasicMaterial({ color: '#3a2a12', toneMapped: false })); kaca.position.set(s * 2.2, 2.0, 0.09); rumah.add(kaca); kaca.userData.jendela = true
    const bingkai = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), jati); bingkai.position.set(s * 2.2, 2.0, 0.1); rumah.add(bingkai)
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.1), jati); b2.position.set(s * 2.2, 2.0, 0.1); rumah.add(b2)
  }
  // kursi goyang & lampu minyak di teras, foto lama di dinding
  const kursi = new THREE.Group(); kursi.position.set(-2.4, 0.35, 1.2)
  const rotan = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.9 })
  const dudukan = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.55), rotan); dudukan.position.y = 0.45; kursi.add(dudukan)
  const sandaran = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.06), rotan); sandaran.position.set(0, 0.85, -0.25); sandaran.rotation.x = -0.25; kursi.add(sandaran)
  for (const s of [-1, 1]) { const ayun = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 24, Math.PI * 0.6), rotan); ayun.rotation.set(0, Math.PI / 2, Math.PI * 1.2); ayun.position.set(s * 0.28, 0.42, 0); kursi.add(ayun) }
  kursi.traverse((m) => { if (m.isMesh) m.castShadow = true }); rumah.add(kursi)
  const lampuMinyak = new THREE.PointLight('#ff9a3c', 3.2, 7, 1.8); lampuMinyak.position.set(1.6, 1.9, 0.5); lampuMinyak.castShadow = true; lampuMinyak.shadow.mapSize.set(1024, 1024); rumah.add(lampuMinyak)
  const semprong = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffc070', toneMapped: false })); semprong.position.copy(lampuMinyak.position); rumah.add(semprong)
  const fc = canvas(256, 320), fx = fc.getContext('2d'); fx.fillStyle = '#c9b48a'; fx.fillRect(0, 0, 256, 320); fx.fillStyle = '#5a4630'; fx.beginPath(); fx.ellipse(128, 120, 50, 62, 0, 0, TAU); fx.fill(); fx.fillRect(68, 180, 120, 140)
  fx.fillStyle = 'rgba(60,40,20,0.35)'; for (let i = 0; i < 3000; i++) fx.fillRect(Math.random() * 256, Math.random() * 320, 2, 2)
  const foto = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshStandardMaterial({ map: tex(fc) })); foto.position.set(-1.0, 2.3, 0.09); rumah.add(foto)
  // pohon pisang & hutan gelap di sekeliling
  const titik = []; for (let i = 0; i < 140; i++) { const a = R() * TAU, d = 9 + R() * 14; titik.push([Math.sin(a) * d, -3 - Math.abs(Math.cos(a)) * d]) }
  hutan(R, grup, titik, tinggi, { hue: 0.32, besar: 1.3 })
  const kabut = kabutLapis(R, grup, 18, [14, 12], 0)
  let level = 1, pintu = 0
  return {
    nama: 'rumah_tua', grup, langit, kabut: ['#141c36', 10, 60], exposure: 1.25, tinggi, slot: { kiri: [-1.3, 2.2], tengah: [0, 2.6], kanan: [1.3, 2.3] },
    pintuPos: new THREE.Vector3(0, 0.35, -3.0),
    api: { lampu(l) { level = l }, pintu(k) { pintu = k } },
    update(t) {
      kabut(t); kursi.rotation.x = Math.sin(t * 1.4) * 0.12
      const k = lampuBerkedip(t, 3, level); lampuMinyak.intensity = 3.2 * k * (0.9 + 0.1 * Math.sin(t * 17)); semprong.material.color.setRGB(k, 0.75 * k, 0.44 * k)
      pintuKi.rotation.y = -pintu * 1.2; pintuKa.rotation.y = pintu * 1.1
    },
  }
}
