// Lokasi 3D siap pakai. Tiap pembuat mengembalikan:
//   { grup, langit (mesh untuk peta pantulan) | null, kabut: [warna, dekat, jauh] | null, latar, exposure, tinggi(x,z), update(t) }
// Semua lokasi dibangun di sekitar titik (0,0,0); hanya satu yang terlihat dalam satu waktu.
import * as THREE from 'three'
import { rng, lerp, clamp, ease, canvas, tex, texData, petaTinggi, buatLangit, buatBintang, buatAwan, kayuTex } from './util.js'

const TAU = Math.PI * 2

// ---------- properti bersama ----------
function tanahMesh(lebar, dalam, segX, segZ, cz, tinggi, mat) {
  const g = new THREE.PlaneGeometry(lebar, dalam, segX, segZ); g.rotateX(-Math.PI / 2); g.translate(0, 0, cz)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, tinggi(p.getX(i), p.getZ(i)))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true
  return m
}

export function hutan(R, grup, titik, tinggi, { hue = 0.27, besar = 1 } = {}) {
  const daun = new THREE.IcosahedronGeometry(1, 2), batang = new THREE.CylinderGeometry(0.12, 0.18, 1, 6)
  const iD = new THREE.InstancedMesh(daun, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), titik.length * 3)
  const iB = new THREE.InstancedMesh(batang, new THREE.MeshStandardMaterial({ color: '#4e3324', roughness: 1 }), titik.length)
  const o = new THREE.Object3D(), col = new THREE.Color()
  titik.forEach(([px, pz], i) => {
    const h = (2.2 + R() * 2.8) * besar, y0 = tinggi(px, pz)
    o.position.set(px, y0 + h / 2, pz); o.scale.set(besar, h, besar); o.rotation.set(0, 0, 0); o.updateMatrix(); iB.setMatrixAt(i, o.matrix)
    for (let k = 0; k < 3; k++) {
      const s = (0.9 + R() * 1.1) * besar
      o.position.set(px + (R() - 0.5) * 1.6 * besar, y0 + h + (R() - 0.2) * 1.2 * besar, pz + (R() - 0.5) * 1.6 * besar); o.scale.set(s, s * (0.8 + R() * 0.5), s); o.rotation.set(R() * 3, R() * 3, R() * 3); o.updateMatrix()
      iD.setMatrixAt(i * 3 + k, o.matrix); iD.setColorAt(i * 3 + k, col.setHSL(hue + R() * 0.08, 0.45 + R() * 0.2, 0.2 + R() * 0.12))
    }
  })
  iD.castShadow = iB.castShadow = true; grup.add(iD, iB)
}

let _daunPalem
function daunPalemTex() {
  if (_daunPalem) return _daunPalem
  const c = canvas(128, 512), x = c.getContext('2d')
  x.strokeStyle = '#3d5a22'; x.lineWidth = 6; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 512); x.stroke()
  for (let i = 0; i < 34; i++) {
    const y = 10 + i * 14.5, len = 58 * Math.sin((i / 34) * Math.PI * 0.9 + 0.15)
    for (const s of [-1, 1]) {
      x.fillStyle = `hsl(${95 + (i % 3) * 6},${45 + (i % 2) * 10}%,${26 + (i % 4) * 3}%)`
      x.beginPath(); x.moveTo(64, y); x.quadraticCurveTo(64 + s * len * 0.6, y + 6, 64 + s * len, y + 22); x.quadraticCurveTo(64 + s * len * 0.5, y + 14, 64, y + 9); x.fill()
    }
  }
  _daunPalem = tex(c); return _daunPalem
}
export function palem(R, grup, px, pz, y0, h = 4.5, condong = [0.4, 0]) {
  const titik = []
  for (let i = 0; i <= 8; i++) { const k = i / 8; titik.push(new THREE.Vector3(px + condong[0] * h * k * k * 0.5, y0 + h * k, pz + condong[1] * h * k * k * 0.5)) }
  const kurva = new THREE.CatmullRomCurve3(titik)
  const c = canvas(64, 256), x = c.getContext('2d'); x.fillStyle = '#7a5a3c'; x.fillRect(0, 0, 64, 256)
  for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(40,25,15,0.55)'; x.fillRect(0, i * 16, 64, 4); x.fillStyle = 'rgba(160,120,80,0.35)'; x.fillRect(0, i * 16 + 5, 64, 3) }
  const bt = tex(c, 1, h * 1.5)
  const batang = new THREE.Mesh(new THREE.TubeGeometry(kurva, 24, 0.13, 8), new THREE.MeshStandardMaterial({ map: bt, roughness: 1 }))
  batang.castShadow = true; grup.add(batang)
  const puncak = titik[titik.length - 1], mat = new THREE.MeshStandardMaterial({ map: daunPalemTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 })
  const daun = []
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(0.7, 2.6, 1, 12); g.translate(0, 1.3, 0)
    const p = g.attributes.position
    for (let j = 0; j < p.count; j++) { const y = p.getY(j); p.setZ(j, -0.18 * y * y); p.setX(j, p.getX(j) * (0.6 + 0.4 * Math.sin((y / 2.6) * Math.PI))) }
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat); m.castShadow = true
    m.position.copy(puncak); m.rotation.order = 'YXZ'; m.rotation.y = (i / 9) * TAU + R() * 0.3; m.rotation.x = -1.0 - R() * 0.5
    grup.add(m); daun.push(m)
  }
  const ph = R() * 6
  return (t) => daun.forEach((m, i) => { m.rotation.z = Math.sin(t * 1.3 + ph + i) * 0.04 })
}

export function buaya() {
  const g = new THREE.Group()
  const kulit = new THREE.MeshStandardMaterial({ color: '#5d8048', roughness: 0.7, flatShading: true })
  const perut = new THREE.MeshStandardMaterial({ color: '#8a8a55', roughness: 0.8, flatShading: true })
  const badan = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), kulit); badan.scale.set(1.3, 0.3, 0.45); badan.position.set(-1.2, 0, 0)
  const ekor = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.2, 8), kulit); ekor.rotation.z = Math.PI / 2; ekor.position.set(-3.4, 0, 0); ekor.scale.set(1, 1, 0.5)
  const kepala = new THREE.Group(); kepala.position.set(0.1, 0.05, 0)
  const tengkorak = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 0.5), kulit); tengkorak.position.x = 0.1
  const moncong = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.32), kulit); moncong.position.set(0.9, -0.04, 0)
  const rahang = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.36), perut); rahang.position.set(0.6, -0.16, 0)
  kepala.add(tengkorak, moncong, rahang)
  for (const s of [-1, 1]) {
    const mata = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c840', emissive: '#6a5000', roughness: 0.3 }))
    mata.position.set(0.15, 0.17, s * 0.14); kepala.add(mata)
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.03), new THREE.MeshBasicMaterial({ color: '#111' })); pupil.position.set(0.23, 0.18, s * 0.14); kepala.add(pupil)
  }
  for (let i = 0; i < 12; i++) { // gigi
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), new THREE.MeshStandardMaterial({ color: '#f2eedc' }))
    t.rotation.x = Math.PI; t.position.set(0.45 + (i % 6) * 0.17, -0.12, (i < 6 ? 1 : -1) * 0.15); kepala.add(t)
  }
  for (let i = 0; i < 14; i++) { // sisik punggung
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), kulit); s.position.set(-0.3 - i * 0.28, 0.27 - Math.abs(i - 4) * 0.012, (i % 2 ? 1 : -1) * 0.1); g.add(s)
  }
  g.add(badan, ekor, kepala)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData.kepala = kepala; g.userData.rahang = rahang
  return g
}

function perahu() {
  const g = new THREE.Group()
  const kayu = tex(kayuTex(41, { papan: 4, dasar: [160, 104, 62], arah: 'h' }))
  const lambung = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ map: kayu, side: THREE.DoubleSide, roughness: 0.85, emissive: '#2a1608', emissiveIntensity: 0.6 }))
  lambung.scale.set(2.6, 0.55, 0.62); lambung.castShadow = lambung.receiveShadow = true
  const bibir = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 48), new THREE.MeshStandardMaterial({ color: '#4a2e1c' })); bibir.rotation.x = Math.PI / 2; bibir.scale.set(2.6, 0.62, 1)
  g.add(lambung, bibir)
  const petiTex = tex(kayuTex(43, { papan: 5, dasar: [150, 110, 70] }))
  for (const [px, s] of [[1.25, 0.3], [1.75, 0.26]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 1.1), new THREE.MeshStandardMaterial({ map: petiTex })); b.position.set(px, -0.1 + s / 2, 0); b.rotation.y = 0.2; b.castShadow = true; g.add(b) }
  const dayung = new THREE.Group()
  const gagang = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#7a5030' }))
  const bilah = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.03), new THREE.MeshStandardMaterial({ color: '#7a5030' })); bilah.position.y = -1.2
  gagang.castShadow = bilah.castShadow = true
  dayung.add(gagang, bilah); g.add(dayung)
  g.userData.dayung = dayung
  return g
}

function airMat(warna = '#2c4870') {
  const { normal } = petaTinggi(512, (u, v) => 0.5 * Math.sin(TAU * (u * 6 + 0.3 * Math.sin(TAU * v * 2))) + 0.35 * Math.sin(TAU * (v * 9 + 0.4 * Math.sin(TAU * u * 3))) + 0.2 * Math.sin(TAU * (u * 13 + v * 11)), null, 3)
  const n = texData(normal, 60)
  const m = new THREE.MeshStandardMaterial({ color: warna, roughness: 0.12, metalness: 0.1, normalMap: n, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.7 })
  return { m, n }
}

function partikelTex(warna = '255,230,190') {
  const c = canvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, `rgba(${warna},1)`); g.addColorStop(0.4, `rgba(${warna},0.55)`); g.addColorStop(1, `rgba(${warna},0)`)
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return tex(c)
}
// Partikel melayang (debu/kunang-kunang) dalam kotak di sekitar titik pusat
export function partikel(R, grup, { n = 500, pusat = [0, 0, -2], ukuran = [14, 4, 14], warna = '255,230,190', besar = 0.06, naik = 0.08 } = {}) {
  const pp = new Float32Array(n * 3), base = []
  for (let i = 0; i < n; i++) base.push([(R() - 0.5) * ukuran[0], R() * ukuran[1], (R() - 0.5) * ukuran[2], R() * 6.28, 0.2 + R() * 0.5])
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pp, 3))
  grup.add(new THREE.Points(g, new THREE.PointsMaterial({ map: partikelTex(warna), size: besar, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
  return (t) => {
    for (let i = 0; i < n; i++) { const [x, y, z, ph, sp] = base[i]; pp[i * 3] = pusat[0] + x + Math.sin(t * sp + ph) * 0.3; pp[i * 3 + 1] = pusat[1] + ((y + t * sp * naik) % ukuran[1]) + 0.05; pp[i * 3 + 2] = pusat[2] + z + Math.cos(t * sp * 0.7 + ph) * 0.3 }
    g.attributes.position.needsUpdate = true
  }
}

function matahari(grup, warna, kuat, pos, area = 9, ukuran = 4096) {
  const l = new THREE.DirectionalLight(warna, kuat); l.position.set(...pos); l.castShadow = true
  l.shadow.mapSize.set(ukuran, ukuran); Object.assign(l.shadow.camera, { left: -area, right: area, top: area, bottom: -area, near: 0.5, far: 60 })
  l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 3
  grup.add(l); grup.add(l.target); return l
}

// =====================================================================
// 1) GURUN PASIR SENJA (adegan awal, dengan gundukan & buaya muncul)
// =====================================================================
export function buatGurun() {
  const R = rng(1850), grup = new THREE.Group()
  const langit = buatLangit({ top: '#14307a', mid: '#3f6fc4', hor: '#f3b679', sun: [-0.55, 0.12, -0.83] })
  grup.add(langit, buatBintang(R))
  const awan = buatAwan(R, grup, 9)
  matahari(grup, '#ffd2a0', 2.6, [-9, 6, -7])
  grup.add(new THREE.HemisphereLight('#8fb0ff', '#7a4a3a', 1.15))
  const isi = new THREE.DirectionalLight('#9db7ff', 0.45); isi.position.set(6, 4, 8); grup.add(isi)
  const tinggi = (x, z) => 0.35 * Math.sin(x * 0.11 + 1.2) * Math.cos(z * 0.08) * clamp((Math.hypot(x, z) - 6) / 10)
  const r = rng(7)
  const pasir = petaTinggi(1024, (u, v) => {
    const warp = 0.06 * Math.sin(TAU * (u * 2 + v)) + 0.035 * Math.sin(TAU * (u * 5 - v * 2)) + 0.02 * Math.sin(TAU * (u * 9 + v * 3))
    const w = Math.sin(TAU * (v * 9 + warp * 3 + 0.08 * Math.sin(TAU * u * 3)))
    return Math.sign(w) * Math.pow(Math.abs(w), 0.7) * (0.75 + 0.25 * Math.sin(TAU * (u * 3 + v * 2)))
  }, (h) => { const l = 1 - (h * 0.5 + 0.5), n = r(); return [196 - l * 52 + n * 22, 146 - l * 46 + n * 16, 108 - l * 26 + n * 14] })
  const xw = pasir.warna.getContext('2d')
  for (let i = 0; i < 70; i++) { xw.fillStyle = `rgba(90,50,45,${0.03 + r() * 0.05})`; xw.beginPath(); xw.arc(r() * 1024, r() * 1024, 30 + r() * 110, 0, TAU); xw.fill() }
  const pasirN = texData(pasir.normal, 40)
  grup.add(tanahMesh(140, 80, 280, 160, -14, tinggi, new THREE.MeshStandardMaterial({ map: tex(pasir.warna, 40), normalMap: pasirN, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.95 })))
  const air = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshPhongMaterial({ color: '#4f6fa8', specular: '#ffd9a8', shininess: 90 }))
  air.rotation.x = -Math.PI / 2; air.position.set(0, 0.05, -304); grup.add(air)
  const pohon = []; for (let i = 0; i < 90; i++) pohon.push([-6 + R() * 44, -20 - R() * 16])
  for (let i = 0; i < 70; i++) pohon.push([-40 + R() * 30, -45 - R() * 8])
  hutan(R, grup, pohon, tinggi)
  // batang kayu, tombak, ranting, kerikil
  const kulitKayu = tex(kayuTex(3, { papan: 1, dasar: [107, 65, 40] }))
  const kayu = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 14), new THREE.MeshStandardMaterial({ map: kulitKayu, roughness: 0.9 }))
  kayu.rotation.set(0, 0.5, Math.PI / 2); kayu.position.set(1.6, 0.18, -2.6); kayu.castShadow = kayu.receiveShadow = true; grup.add(kayu)
  const tombak = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#8a5a34' }))
  tombak.rotation.set(Math.PI / 2, 0, 1.1); tombak.position.set(0.9, 0.05, 0.4); tombak.castShadow = true; grup.add(tombak)
  const ranting = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.018, 1, 4), new THREE.MeshStandardMaterial({ color: '#4a3020' }), 90)
  const batu = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8c6a55', flatShading: true }), 120)
  const o = new THREE.Object3D()
  for (let i = 0; i < 90; i++) { const px = (R() - 0.5) * 16, pz = (R() - 0.7) * 14; o.position.set(px, tinggi(px, pz) + 0.01, pz); o.rotation.set(Math.PI / 2, 0, R() * 6); o.scale.set(1, 0.2 + R() * 0.6, 1); o.updateMatrix(); ranting.setMatrixAt(i, o.matrix) }
  for (let i = 0; i < 120; i++) { const px = (R() - 0.5) * 18, pz = (R() - 0.7) * 16, s = 0.02 + R() * 0.05; o.position.set(px, tinggi(px, pz), pz); o.rotation.set(R() * 3, R() * 3, R() * 3); o.scale.set(s, s * 0.7, s); o.updateMatrix(); batu.setMatrixAt(i, o.matrix) }
  ranting.castShadow = batu.castShadow = true; grup.add(ranting, batu)
  // gundukan + debu + buaya yang muncul
  const gundukan = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: '#d2a27a', roughness: 1, normalMap: pasirN, normalScale: new THREE.Vector2(0.8, 0.8) }))
  gundukan.castShadow = gundukan.receiveShadow = true; grup.add(gundukan)
  const dt = partikelTex('220,180,140'), debu = []
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dt, transparent: true, depthWrite: false })); s.userData = { o: R() * 1.2, a: R() * 6.28, sp: 0.4 + R() * 0.8 }; grup.add(s); debu.push(s) }
  const bya = buaya(); bya.scale.setScalar(0.48); grup.add(bya)
  const partikelUpd = partikel(R, grup, {})
  const api = {
    // g = {x, z, naik 0..1}, muncul 0..1 (kepala buaya keluar dari pasir)
    atur(t, g, muncul) {
      gundukan.visible = g.naik > 0
      gundukan.position.set(g.x, tinggi(g.x, g.z) - 0.06 + Math.abs(Math.sin(t * 9)) * 0.015 * g.naik, g.z); gundukan.scale.set(0.55, 0.02 + 0.14 * g.naik, 0.4)
      gundukan.rotation.y = Math.sin(t * 7) * 0.08
      debu.forEach((s) => {
        const u = s.userData, f = ((t * u.sp + u.o) % 1.2) / 1.2
        s.visible = g.naik > 0.2
        s.position.set(g.x + Math.cos(u.a) * (0.25 + f * 0.5), 0.05 + f * 0.45, g.z + Math.sin(u.a) * (0.2 + f * 0.4))
        const sc = (0.15 + f * 0.45) * (1 + muncul); s.scale.set(sc, sc, 1); s.material.opacity = (1 - f) * (0.25 + muncul * 0.12) * g.naik
      })
      bya.visible = muncul > 0
      bya.position.set(g.x + 0.35, lerp(-0.3, 0.1, ease(muncul)), g.z - 0.6); bya.rotation.set(0, -2.43, lerp(0.45, 0.28, muncul))
      bya.userData.rahang.rotation.z = -0.35 * Math.max(0, Math.sin(t * 14)) * muncul
    },
  }
  return { nama: 'gurun', grup, langit, kabut: ['#e9b98a', 40, 190], exposure: 0.95, tinggi, api, update: (t) => { awan(t); partikelUpd(t) } }
}

// =====================================================================
// 2) SUNGAI DI HUTAN (senja biru): perahu, palem, buaya mengintai, dermaga
// =====================================================================
export function buatSungai() {
  const R = rng(77), grup = new THREE.Group()
  const langit = buatLangit({ top: '#0f2a6e', mid: '#3e6bbd', hor: '#f0b88a', sun: [0.7, 0.08, -0.7] })
  grup.add(langit, buatBintang(R, 300, 0.8))
  const awan = buatAwan(R, grup, 7, { warna: 0.9 })
  matahari(grup, '#ffc890', 2.2, [10, 5, -8], 14)
  grup.add(new THREE.HemisphereLight('#7fa2ff', '#4a4a38', 1.35))
  const isiS = new THREE.DirectionalLight('#b8c4ff', 0.9); isiS.position.set(-3, 4, 10); grup.add(isiS)
  const tinggi = (x, z) => {
    const dekat = lerp(-0.9, 0.3, ease((z - 3.0) / 1.8)), jauh = lerp(-0.9, 0.5, ease((-11.5 - z) / 2.2))
    return Math.max(dekat, jauh) + 0.08 * Math.sin(x * 0.7) * Math.cos(z * 0.9) + (z < -14 ? (-14 - z) * 0.08 : 0)
  }
  const r = rng(9)
  const tanah = petaTinggi(512, (u, v) => 0.5 * Math.sin(TAU * (u * 7 + 0.2 * Math.sin(TAU * v * 3))) * Math.sin(TAU * (v * 5)) + 0.3 * Math.sin(TAU * (u * 17 + v * 13)),
    (h) => { const n = r(), hijau = r() < 0.5; return hijau ? [70 + n * 30, 90 + n * 35 + h * 10, 45 + n * 20] : [110 + n * 30 + h * 10, 82 + n * 22, 58 + n * 16] })
  grup.add(tanahMesh(140, 90, 280, 180, -12, tinggi, new THREE.MeshStandardMaterial({ map: tex(tanah.warna, 30), normalMap: texData(tanah.normal, 30), roughness: 0.95 })))
  const { m: airM, n: airN } = airMat()
  const air = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), airM); air.rotation.x = -Math.PI / 2; air.position.y = 0; air.receiveShadow = true; grup.add(air)
  // hutan lebat di seberang + palem
  const pohon = []; for (let i = 0; i < 160; i++) pohon.push([-45 + R() * 90, -14.5 - R() * 22])
  hutan(R, grup, pohon, tinggi, { hue: 0.25, besar: 1.15 })
  const goyang = []
  for (let i = 0; i < 14; i++) { const px = -24 + i * 3.6 + R(), pz = -13.2 - R() * 1.5; goyang.push(palem(R, grup, px, pz, tinggi(px, pz), 4 + R() * 2.5, [(R() - 0.5) * 0.8, 0.3])) }
  for (const [px, pz, h, cx] of [[-3.6, 5.2, 5.5, 0.5], [4.2, 5.8, 6, -0.6], [-6.5, 7, 5, 0.4]]) goyang.push(palem(R, grup, px, pz, tinggi(px, pz), h, [cx, -0.2]))
  // alang-alang di tepi air
  const ilalang = new THREE.InstancedMesh(new THREE.ConeGeometry(0.02, 1, 3), new THREE.MeshStandardMaterial({ color: '#5d7a35', roughness: 1 }), 500)
  const o = new THREE.Object3D()
  for (let i = 0; i < 500; i++) { const tepi = i % 2, px = (R() - 0.5) * 50, pz = tepi ? 3.2 + R() * 1.2 : -11.6 - R() * 1.4, h = 0.4 + R() * 0.8; o.position.set(px, tinggi(px, pz) + h / 2, pz); o.rotation.set((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4); o.scale.set(1, h, 1); o.updateMatrix(); ilalang.setMatrixAt(i, o.matrix) }
  grup.add(ilalang)
  // dermaga kecil di seberang
  const kayuD = new THREE.MeshStandardMaterial({ map: tex(kayuTex(51, { papan: 8, dasar: [120, 90, 70], arah: 'v' })), roughness: 0.9 })
  const lantai = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 3.2), kayuD); lantai.position.set(5.5, 0.45, -10.8); lantai.castShadow = lantai.receiveShadow = true; grup.add(lantai)
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), kayuD); t.position.set(5.5 + (i % 2 ? 0.6 : -0.6), -0.2, -12 + Math.floor(i / 2) * 1.2); t.castShadow = true; grup.add(t) }
  // perahu (tokoh ditempatkan di dalamnya oleh skrip adegan)
  const prh = perahu(); grup.add(prh)
  // buaya mengintai: hanya kepala di permukaan
  const bya = buaya(); bya.scale.setScalar(0.6); grup.add(bya)
  const partikelUpd = partikel(R, grup, { n: 260, pusat: [0, 0.2, -1], ukuran: [20, 3, 12], warna: '255,240,170', besar: 0.07, naik: 0.03 })
  const api = {
    perahu: prh,
    aturPerahu(t, x) {
      prh.position.set(x, 0.25 + Math.sin(t * 1.6) * 0.03, -1.2); prh.rotation.set(Math.sin(t * 1.3) * 0.03, 0, Math.sin(t * 1.1) * 0.025)
      const d = prh.userData.dayung; d.position.set(-0.2, -0.12, 0.18); d.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - 0.08) // tergeletak di dasar perahu
    },
    // dayung dipegang: atas = titik genggaman (dunia), bawah = arah bilah di air (dunia)
    pegangDayung(atas, bawah) {
      const d = prh.userData.dayung; prh.updateMatrixWorld(true)
      const A = prh.worldToLocal(atas.clone()), B = prh.worldToLocal(bawah.clone())
      const arah = A.clone().sub(B).normalize()
      d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arah)
      d.position.copy(A).addScaledVector(arah, -0.75) // genggaman di seperempat atas gagang
    },
    aturBuaya(t, x, z, naik = 0, arah = 0.2) { bya.position.set(x, -0.1 + naik * 0.22 + Math.sin(t * 1.2) * 0.015, z); bya.rotation.set(0, arah, naik * 0.35); bya.userData.rahang.rotation.z = -0.4 * naik * Math.max(0, Math.sin(t * 9)) },
  }
  return {
    nama: 'sungai', grup, langit, kabut: ['#9fa9c9', 30, 160], exposure: 0.95, tinggi, api,
    update: (t) => { awan(t); goyang.forEach((f) => f(t)); partikelUpd(t); airN.offset.set(t * 0.012, t * 0.02) },
  }
}

// =====================================================================
// 3) KEMAH MALAM: tenda bermotif, api unggun berkedip, peti koleksi, bulan
// =====================================================================
function apiFrames() {
  const frames = []
  for (let f = 0; f < 12; f++) {
    const r = rng(500 + f), c = canvas(128, 256), x = c.getContext('2d')
    for (const [warna, sk] of [['rgba(255,90,20,0.9)', 1], ['rgba(255,170,40,0.95)', 0.72], ['rgba(255,240,170,1)', 0.42]]) {
      x.fillStyle = warna; x.beginPath(); const w = 54 * sk, h = 220 * sk * (0.85 + r() * 0.3), sway = (r() - 0.5) * 26 * sk
      x.moveTo(64 - w, 250); x.bezierCurveTo(64 - w * 1.1, 250 - h * 0.5, 64 + sway - w * 0.3, 250 - h * 0.8, 64 + sway, 250 - h)
      x.bezierCurveTo(64 + sway + w * 0.3, 250 - h * 0.8, 64 + w * 1.1, 250 - h * 0.5, 64 + w, 250); x.closePath(); x.fill()
    }
    frames.push(tex(c))
  }
  return frames
}
export function buatKemah() {
  const R = rng(303), grup = new THREE.Group()
  const langit = buatLangit({ top: '#060c26', mid: '#14255a', hor: '#2e3f78', sun: [0.4, 0.45, -0.8], sunWarna: '#9fb6ff', bulan: true })
  grup.add(langit, buatBintang(R, 700, 0.95))
  const awan = buatAwan(R, grup, 5, { warna: 0.35, bawah: 'rgba(120,140,220,0.3)', opacity: 0.6 })
  matahari(grup, '#8fa8ff', 0.7, [6, 10, -9], 10, 2048)
  grup.add(new THREE.HemisphereLight('#3c4f9a', '#1a1410', 0.55))
  const tinggi = (x, z) => 0.06 * Math.sin(x * 0.8) * Math.cos(z * 0.6) + clamp((Math.hypot(x, z) - 8) / 20) * 1.2
  const r = rng(11)
  const tanah = petaTinggi(512, (u, v) => 0.4 * Math.sin(TAU * (u * 9 + 0.3 * Math.sin(TAU * v * 4))) * Math.sin(TAU * v * 7) + 0.3 * Math.sin(TAU * (u * 19 + v * 15)),
    () => { const n = r(), rumput = r() < 0.35; return rumput ? [60 + n * 25, 80 + n * 25, 42 + n * 15] : [118 + n * 30, 86 + n * 22, 60 + n * 16] })
  grup.add(tanahMesh(100, 100, 200, 200, -10, tinggi, new THREE.MeshStandardMaterial({ map: tex(tanah.warna, 25), normalMap: texData(tanah.normal, 25), roughness: 1 })))
  // tenda bermotif zigzag
  const c = canvas(512, 512), x = c.getContext('2d')
  x.fillStyle = '#e9dcc0'; x.fillRect(0, 0, 512, 512)
  for (const [y, warna] of [[120, '#2f3f7a'], [300, '#9a3a2a']]) { x.strokeStyle = warna; x.lineWidth = 14; x.beginPath(); for (let i = 0; i <= 16; i++) x.lineTo(i * 32, y + (i % 2 ? -26 : 26)); x.stroke() }
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(120,90,60,${r() * 0.08})`; x.fillRect(r() * 512, r() * 512, 2, 2) }
  const kain = new THREE.MeshStandardMaterial({ map: tex(c), side: THREE.DoubleSide, roughness: 0.95 })
  const bentuk = new THREE.Shape(); bentuk.moveTo(-1.4, 0); bentuk.lineTo(0, 1.9); bentuk.lineTo(1.4, 0); bentuk.lineTo(-1.4, 0)
  const tenda = new THREE.Mesh(new THREE.ExtrudeGeometry(bentuk, { depth: 2.8, bevelEnabled: false }), kain)
  tenda.position.set(-2.4, 0, -4.2); tenda.rotation.y = 0.5; tenda.castShadow = tenda.receiveShadow = true; grup.add(tenda)
  const pintu = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0, 1.1); s.lineTo(0.5, 0); return s })()), new THREE.MeshBasicMaterial({ color: '#2a1a12' }))
  pintu.position.set(0, 0.01, 2.81); tenda.add(pintu)
  // api unggun: batu melingkar, kayu bakar, nyala sprite, bara, cahaya berkedip
  const batuG = new THREE.IcosahedronGeometry(0.16, 0), batuM = new THREE.MeshStandardMaterial({ color: '#6b6460', flatShading: true })
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, b = new THREE.Mesh(batuG, batuM); b.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55); b.rotation.set(R() * 3, R() * 3, 0); b.castShadow = true; grup.add(b) }
  const kayuM = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 1, emissive: '#5a1800', emissiveIntensity: 0.4 })
  for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), kayuM); k.rotation.set(Math.PI / 2 - 0.4, (i / 5) * TAU, 0); k.position.y = 0.18; grup.add(k) }
  const frames = apiFrames(), nyala = []
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.position.set((i - 1) * 0.12, 0.55, (i - 1) * 0.05); s.scale.set(0.55, 1.1, 1); grup.add(s); nyala.push(s) }
  const cahayaApi = new THREE.PointLight('#ff8a3a', 9, 14, 1.6); cahayaApi.position.set(0, 0.9, 0); cahayaApi.castShadow = true
  cahayaApi.shadow.mapSize.set(1024, 1024); cahayaApi.shadow.bias = -0.002; grup.add(cahayaApi)
  const baraUpd = partikel(R, grup, { n: 120, pusat: [0, 0.3, 0], ukuran: [0.8, 2.5, 0.8], warna: '255,150,60', besar: 0.05, naik: 0.5 })
  // peti koleksi bertuliskan KOLEKSI, tunggul kayu untuk duduk
  const pc = kayuTex(61, { papan: 5, dasar: [150, 108, 66] }), px = pc.getContext('2d')
  px.font = 'bold 74px Georgia'; px.fillStyle = 'rgba(30,18,10,0.85)'; px.textAlign = 'center'; px.fillText('KOLEKSI', 256, 290)
  const peti = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7), new THREE.MeshStandardMaterial({ map: tex(pc), roughness: 0.85 }))
  peti.position.set(1.9, 0.35, -1.6); peti.rotation.y = -0.4; peti.castShadow = peti.receiveShadow = true; grup.add(peti)
  const peti2 = peti.clone(); peti2.scale.setScalar(0.7); peti2.position.set(2.6, 0.25, -0.9); peti2.rotation.y = 0.3; grup.add(peti2)
  for (const [tx, tz] of [[-1.5, 0.9], [1.4, 1.2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.4, 12), new THREE.MeshStandardMaterial({ color: '#6a4528' })); t.position.set(tx, 0.2, tz); t.castShadow = t.receiveShadow = true; grup.add(t) }
  // lentera tergantung + palem & hutan gelap di sekeliling
  const goyang = []
  for (let i = 0; i < 10; i++) { const a = -2.6 + i * 0.55 + R() * 0.2, d = 7 + R() * 4, ppx = Math.sin(a) * d, ppz = -Math.cos(a) * d; goyang.push(palem(R, grup, ppx, ppz, tinggi(ppx, ppz), 4.5 + R() * 2, [(R() - 0.5) * 0.8, (R() - 0.5) * 0.5])) }
  const pohon = []; for (let i = 0; i < 120; i++) { const a = R() * TAU, d = 13 + R() * 14; pohon.push([Math.sin(a) * d, -Math.cos(a) * d]) }
  hutan(R, grup, pohon, tinggi, { hue: 0.3, besar: 1.2 })
  const kunangUpd = partikel(R, grup, { n: 140, pusat: [0, 0.4, -2], ukuran: [16, 2.5, 12], warna: '200,255,140', besar: 0.06, naik: 0.04 })
  return {
    nama: 'kemah', grup, langit, kabut: ['#141c3a', 18, 70], exposure: 1.0, tinggi,
    update: (t) => {
      awan(t); goyang.forEach((f) => f(t)); baraUpd(t); kunangUpd(t)
      nyala.forEach((s, i) => { s.material.map = frames[Math.floor(t * 18 + i * 4) % frames.length]; const k = 1 + Math.sin(t * 9 + i * 2) * 0.08; s.scale.set(0.55 * k, 1.1 * k, 1) })
      cahayaApi.intensity = 9 * (0.85 + 0.1 * Math.sin(t * 13) + 0.07 * Math.sin(t * 29 + 1) + 0.05 * Math.sin(t * 47))
    },
  }
}

// =====================================================================
// 4) RUANGAN KLUB: lantai kayu, dinding panel, lukisan berburu, buaya pajangan, rak buku, karpet
// =====================================================================
export function buatRuangan() {
  const R = rng(909), grup = new THREE.Group()
  const L = 12, D = 9, T = 4.2
  const lantai = new THREE.Mesh(new THREE.PlaneGeometry(L, D), new THREE.MeshStandardMaterial({ map: tex(kayuTex(71, { papan: 10, dasar: [120, 72, 40], arah: 'v' }), 3, 2), roughness: 0.55 }))
  lantai.rotation.x = -Math.PI / 2; lantai.position.z = -D / 2 + 3; lantai.receiveShadow = true; grup.add(lantai)
  // dinding: wallpaper hijau tua + panel kayu bawah
  const wc = canvas(512, 512), wx = wc.getContext('2d')
  wx.fillStyle = '#2e4a3a'; wx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { wx.fillStyle = 'rgba(200,180,110,0.12)'; wx.beginPath(); wx.ellipse(32 + i * 64, 32 + j * 64, 10, 18, 0, 0, TAU); wx.fill() }
  const dinding = new THREE.MeshStandardMaterial({ map: tex(wc, 4, 2), roughness: 0.9 })
  const panel = new THREE.MeshStandardMaterial({ map: tex(kayuTex(73, { papan: 12, dasar: [95, 55, 30], arah: 'v' }), 2, 1), roughness: 0.6 })
  const belakang = new THREE.Mesh(new THREE.PlaneGeometry(L, T), dinding); belakang.position.set(0, T / 2, -D + 3); belakang.receiveShadow = true; grup.add(belakang)
  const pb = new THREE.Mesh(new THREE.BoxGeometry(L, 1.2, 0.08), panel); pb.position.set(0, 0.6, -D + 3.04); pb.receiveShadow = true; grup.add(pb)
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(D, T), dinding); w.position.set(s * L / 2, T / 2, -D / 2 + 3); w.rotation.y = -s * Math.PI / 2; w.receiveShadow = true; grup.add(w) }
  const plafon = new THREE.Mesh(new THREE.PlaneGeometry(L, D), new THREE.MeshStandardMaterial({ color: '#3a2a1e' })); plafon.rotation.x = Math.PI / 2; plafon.position.set(0, T, -D / 2 + 3); grup.add(plafon)
  // lukisan berburu berbingkai emas
  const lc = canvas(640, 400), lx = lc.getContext('2d')
  const lg = lx.createLinearGradient(0, 0, 0, 400); lg.addColorStop(0, '#9fc0d8'); lg.addColorStop(0.55, '#e8dcb0'); lg.addColorStop(0.56, '#6d8a45'); lg.addColorStop(1, '#4a6a30'); lx.fillStyle = lg; lx.fillRect(0, 0, 640, 400)
  lx.fillStyle = '#3e5a2c'; for (let i = 0; i < 9; i++) { lx.beginPath(); lx.arc(40 + i * 75, 222, 30 + (i % 3) * 8, Math.PI, 0); lx.fill() }
  lx.fillStyle = '#5a3a24'; lx.beginPath(); lx.ellipse(330, 280, 60, 22, 0, 0, TAU); lx.fill(); lx.fillRect(285, 290, 10, 46); lx.fillRect(365, 290, 10, 46); lx.beginPath(); lx.moveTo(380, 270); lx.lineTo(420, 240); lx.lineTo(410, 262); lx.fill()
  lx.fillStyle = '#7a1f2a'; lx.fillRect(318, 220, 22, 40); lx.fillStyle = '#1c1c22'; lx.fillRect(318, 196, 22, 24)
  for (let i = 0; i < 4; i++) { lx.fillStyle = '#f2ead8'; lx.beginPath(); lx.ellipse(120 + i * 50, 310 + (i % 2) * 10, 22, 10, 0, 0, TAU); lx.fill() }
  const lukisan = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: tex(lc), roughness: 0.7 }))
  lukisan.position.set(0, 2.6, -D + 3.06); grup.add(lukisan)
  const emas = new THREE.MeshStandardMaterial({ color: '#c9a04a', metalness: 0.8, roughness: 0.35 })
  for (const [w, h, x0, y0] of [[2.6, 0.1, 0, 0.8], [2.6, 0.1, 0, -0.8], [0.1, 1.7, 1.25, 0], [0.1, 1.7, -1.25, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), emas); b.position.set(x0, 2.6 + y0, -D + 3.08); grup.add(b) }
  // buaya pajangan di atas papan
  const papan = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.5), panel); papan.position.set(0, 1.55, -D + 3.25); papan.castShadow = true; grup.add(papan)
  const bya = buaya(); bya.scale.setScalar(0.45); bya.position.set(0.7, 1.72, -D + 3.3); bya.userData.rahang.rotation.z = -0.25; grup.add(bya)
  // rak buku kiri & kanan
  const warnaBuku = ['#7a1f2a', '#24385e', '#2f5a3a', '#8a6a2a', '#4a2a4a', '#a0542a']
  for (const s of [-1, 1]) {
    const rak = new THREE.Group(); rak.position.set(s * 4.2, 0, -D + 3.4)
    const kotak = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 0.6), panel); kotak.position.y = 1.6; kotak.castShadow = kotak.receiveShadow = true; rak.add(kotak)
    for (let row = 0; row < 4; row++) {
      let bx = -0.85
      while (bx < 0.8) { const w = 0.08 + R() * 0.08, h = 0.45 + R() * 0.2, b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), new THREE.MeshStandardMaterial({ color: warnaBuku[Math.floor(R() * 6)], roughness: 0.7 })); b.position.set(bx + w / 2, 0.25 + row * 0.75 + h / 2, 0.15); rak.add(b); bx += w + 0.01 }
    }
    grup.add(rak)
  }
  // karpet bermotif
  const kc2 = canvas(512, 512), kx2 = kc2.getContext('2d')
  kx2.fillStyle = '#2b3a78'; kx2.fillRect(0, 0, 512, 512); kx2.strokeStyle = '#d8b25a'; kx2.lineWidth = 12; kx2.strokeRect(24, 24, 464, 464)
  kx2.fillStyle = '#d8b25a'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; kx2.beginPath(); kx2.arc(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120, 22, 0, TAU); kx2.fill() }
  kx2.fillStyle = '#8a2a2a'; kx2.beginPath(); kx2.arc(256, 256, 70, 0, TAU); kx2.fill()
  const karpet = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.2), new THREE.MeshStandardMaterial({ map: tex(kc2), roughness: 1 })); karpet.rotation.x = -Math.PI / 2; karpet.position.set(0, 0.01, -0.4); karpet.receiveShadow = true; grup.add(karpet)
  // cahaya: lampu hangat + cahaya jendela
  grup.add(new THREE.HemisphereLight('#ffe6c0', '#2a1a10', 0.6))
  const jendela = new THREE.DirectionalLight('#ffe0b0', 1.6); jendela.position.set(5, 6, 6); jendela.castShadow = true
  jendela.shadow.mapSize.set(2048, 2048); Object.assign(jendela.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 }); jendela.shadow.bias = -0.0005; jendela.shadow.radius = 4
  grup.add(jendela)
  for (const s of [-1, 1]) {
    const lampu = new THREE.PointLight('#ffb060', 4, 9, 1.8); lampu.position.set(s * 2.4, 2.9, -D + 3.6); grup.add(lampu)
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false })); bola.position.copy(lampu.position); grup.add(bola)
  }
  const debuUpd = partikel(R, grup, { n: 200, pusat: [0, 0.3, -2], ukuran: [8, 3.5, 6], warna: '255,230,180', besar: 0.03, naik: 0.03 })
  return { nama: 'ruangan', grup, langit: null, kabut: null, latar: '#120c08', exposure: 1.0, tinggi: () => 0, update: (t) => debuUpd(t) }
}
