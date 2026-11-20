// Uji coba 1 adegan: karakter kartun 2D di dunia 3D (pasir senja), kamera sinematik, caption per kata.
// Deterministik: window.renderAt(t) menggambar frame pada detik t dan mengembalikan JPEG (dataURL).
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const q = new URLSearchParams(location.search)
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920)
const KATA = await (await fetch(q.get('kata') || '/hasil/kata.json')).json()
const DUR = (KATA.length ? KATA[KATA.length - 1].e : 5) + 0.9

// ---------- util ----------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const R = rng(1850)
const lerp = (a, b, k) => a + (b - a) * k
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k) }
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
function tex(c, rep) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep) }
  return t
}
const kataMulai = (awal) => { const k = KATA.find((w) => w.w.toLowerCase().startsWith(awal)); return k ? k.s : null }

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(W, H)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const HAZE = new THREE.Color('#e9b98a')
scene.fog = new THREE.Fog(HAZE, 40, 190)
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 900)

// ---------- langit ----------
{
  const g = new THREE.SphereGeometry(500, 48, 24)
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#14307a') }, mid: { value: new THREE.Color('#3f6fc4') }, hor: { value: new THREE.Color('#f3b679') }, sun: { value: v3(-0.55, 0.12, -0.83).normalize() } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top,mid,hor,sun; varying vec3 vd;
      void main(){ float y = vd.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.75, y));
      float s = max(dot(vd, sun), 0.0); c += vec3(1.0,0.75,0.45)*pow(s, 18.0)*0.55 + vec3(1.0,0.9,0.7)*pow(s, 600.0)*2.0;
      gl_FragColor = vec4(c, 1.0); }`,
  })
  scene.add(new THREE.Mesh(g, m))
}
// bintang samar (seperti di referensi: titik putih kecil di langit biru)
{
  const n = 260, p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, y = 0.25 + R() * 0.7, r = Math.sqrt(1 - y * y); p.set([Math.cos(a) * r * 480, y * 480, Math.sin(a) * r * 480], i * 3) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false })))
}
// awan: sprite kanvas lembut, bawahnya kena cahaya senja
function awanTex(seed) {
  const r = rng(seed), c = canvas(1024, 384), x = c.getContext('2d')
  for (let i = 0; i < 22; i++) {
    const cx = 160 + r() * 700, cy = 170 + (r() - 0.5) * 90, rad = 60 + r() * 110
    const g = x.createRadialGradient(cx, cy - rad * 0.3, rad * 0.1, cx, cy, rad)
    g.addColorStop(0, 'rgba(255,248,235,0.95)'); g.addColorStop(0.55, 'rgba(250,226,196,0.75)'); g.addColorStop(1, 'rgba(240,190,150,0)')
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rad * 1.5, rad * 0.75, 0, 0, Math.PI * 2); x.fill()
  }
  const sh = x.createLinearGradient(0, 150, 0, 384); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,170,110,0.35)')
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = sh; x.fillRect(0, 0, 1024, 384)
  return tex(c)
}
const awan = []
for (let i = 0; i < 9; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.375), new THREE.MeshBasicMaterial({ map: awanTex(10 + i), transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0.92 }))
  const a = -2.4 + i * 0.6 + R() * 0.3, d = 260 + R() * 120, s = 90 + R() * 90
  m.position.set(Math.sin(a) * d, 28 + R() * 55, -Math.cos(a) * d); m.scale.set(s, s, 1); m.lookAt(0, m.position.y * 0.6, 0)
  m.userData = { a, d, v: 0.0012 + R() * 0.001 }
  scene.add(m); awan.push(m)
}

// ---------- cahaya ----------
const matahari = new THREE.DirectionalLight('#ffd2a0', 2.6)
matahari.position.set(-9, 6, -7); matahari.castShadow = true
matahari.shadow.mapSize.set(4096, 4096)
Object.assign(matahari.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 })
matahari.shadow.bias = -0.0004; matahari.shadow.normalBias = 0.02; matahari.shadow.radius = 3
scene.add(matahari)
scene.add(new THREE.HemisphereLight('#8fb0ff', '#7a4a3a', 1.15))
const isi = new THREE.DirectionalLight('#9db7ff', 0.45); isi.position.set(6, 4, 8); scene.add(isi)

// ---------- tanah pasir bergelombang ----------
function tinggi(x, z) {
  const warp = 0.5 * Math.sin(x * 0.55 + z * 0.23) + 0.3 * Math.sin(x * 1.3 - z * 0.7)
  const riak = 0.0 * Math.sin((z * 2.4 + x * 0.6 + warp) * 5.2) * (0.6 + 0.4 * Math.sin(x * 0.4))
  const bukit = 0.35 * Math.sin(x * 0.11 + 1.2) * Math.cos(z * 0.08) * clamp((Math.hypot(x, z) - 6) / 10)
  return riak + bukit
}
{
  const N = 1024, r = rng(7), TAU = Math.PI * 2
  const hgt = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N
    const warp = 0.06 * Math.sin(TAU * (u * 2 + v)) + 0.035 * Math.sin(TAU * (u * 5 - v * 2)) + 0.02 * Math.sin(TAU * (u * 9 + v * 3))
    const ph = TAU * (v * 9 + warp * 3 + 0.08 * Math.sin(TAU * u * 3))
    const w = Math.sin(ph); hgt[j * N + i] = Math.sign(w) * Math.pow(Math.abs(w), 0.7) * (0.75 + 0.25 * Math.sin(TAU * (u * 3 + v * 2)))
  }
  const c = canvas(N, N), x = c.getContext('2d'), cn = canvas(N, N), xn = cn.getContext('2d')
  const img = x.createImageData(N, N), nim = xn.createImageData(N, N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, hx = hgt[j * N + (i + 1) % N] - hgt[j * N + (i + N - 1) % N], hy = hgt[((j + 1) % N) * N + i] - hgt[((j + N - 1) % N) * N + i]
    let nx = -hx * 6, ny = -hy * 6, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
    nim.data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], k * 4)
    const lembah = 1 - (hgt[k] * 0.5 + 0.5), n = r()
    const R0 = 196 - lembah * 52 + n * 22, G0 = 146 - lembah * 46 + n * 16, B0 = 108 - lembah * 26 + n * 14
    img.data.set([R0, G0, B0, 255], k * 4)
  }
  x.putImageData(img, 0, 0); xn.putImageData(nim, 0, 0)
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(90,50,45,${0.03 + r() * 0.05})`; x.beginPath(); x.arc(r() * N, r() * N, 30 + r() * 110, 0, TAU); x.fill() }
  var pasirWarna = tex(c, 40), pasirNormal = new THREE.CanvasTexture(cn)
  pasirNormal.wrapS = pasirNormal.wrapT = THREE.RepeatWrapping; pasirNormal.repeat.set(40, 40); pasirNormal.anisotropy = 8
  const g = new THREE.PlaneGeometry(140, 80, 560, 320); g.rotateX(-Math.PI / 2); g.translate(0, 0, -14)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setY(i, tinggi(pos.getX(i), pos.getZ(i)))
  g.computeVertexNormals()
  const tanah = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: pasirWarna, normalMap: pasirNormal, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.95, metalness: 0 }))
  tanah.receiveShadow = true; scene.add(tanah)
}
// air di kejauhan (sungai/laut) memantulkan senja
{
  const air = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshPhongMaterial({ color: '#4f6fa8', specular: '#ffd9a8', shininess: 90 }))
  air.rotation.x = -Math.PI / 2; air.position.set(0, 0.05, -304); scene.add(air)
}

// ---------- hutan low-poly ----------
{
  const daun = new THREE.IcosahedronGeometry(1, 2), batang = new THREE.CylinderGeometry(0.12, 0.18, 1, 6)
  const mD = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), mB = new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 1 })
  const pohon = []
  for (let i = 0; i < 90; i++) pohon.push([-6 + R() * 44, -20 - R() * 16])
  for (let i = 0; i < 70; i++) pohon.push([-40 + R() * 30, -45 - R() * 8])
  const iD = new THREE.InstancedMesh(daun, mD, pohon.length * 3), iB = new THREE.InstancedMesh(batang, mB, pohon.length)
  const o = new THREE.Object3D(), col = new THREE.Color()
  pohon.forEach(([px, pz], i) => {
    const h = 2.2 + R() * 2.8, y0 = tinggi(px, pz)
    o.position.set(px, y0 + h / 2, pz); o.scale.set(1, h, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); iB.setMatrixAt(i, o.matrix)
    for (let k = 0; k < 3; k++) {
      const s = 0.9 + R() * 1.1
      o.position.set(px + (R() - 0.5) * 1.6, y0 + h + (R() - 0.2) * 1.2, pz + (R() - 0.5) * 1.6); o.scale.set(s, s * (0.8 + R() * 0.5), s); o.rotation.set(R() * 3, R() * 3, R() * 3); o.updateMatrix()
      iD.setMatrixAt(i * 3 + k, o.matrix); iD.setColorAt(i * 3 + k, col.setHSL(0.27 + R() * 0.08, 0.45 + R() * 0.2, 0.2 + R() * 0.12))
    }
  })
  iD.castShadow = iB.castShadow = true; scene.add(iD, iB)
}

// ---------- properti: batang kayu, tombak, ranting, kerikil ----------
{
  const c = canvas(512, 256), x = c.getContext('2d'), r = rng(3)
  x.fillStyle = '#6b4128'; x.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 140; i++) { x.strokeStyle = `rgba(${30 + r() * 40},${15 + r() * 20},10,${0.3 + r() * 0.4})`; x.lineWidth = 1 + r() * 4; x.beginPath(); const yy = r() * 256; x.moveTo(0, yy); x.bezierCurveTo(170, yy + (r() - 0.5) * 30, 340, yy + (r() - 0.5) * 30, 512, yy + (r() - 0.5) * 20); x.stroke() }
  const kulit = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.9 })
  const kayu = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 14), kulit)
  kayu.rotation.set(0, 0.5, Math.PI / 2); kayu.position.set(1.6, 0.18, -2.6); kayu.castShadow = kayu.receiveShadow = true; scene.add(kayu)
  const ujung = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), new THREE.MeshStandardMaterial({ color: '#c99a6a', roughness: 0.8 }))
  ujung.position.set(0.04, 1.3, 0); ujung.rotation.x = -Math.PI / 2; kayu.add(ujung)
  const tombak = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#8a5a34' }))
  tombak.rotation.set(Math.PI / 2, 0, 1.1); tombak.position.set(0.9, 0.05, 0.4); tombak.castShadow = true; scene.add(tombak)
  const mata = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), new THREE.MeshStandardMaterial({ color: '#7d7d86', metalness: 0.6, roughness: 0.4 }))
  mata.position.y = 1.4; tombak.add(mata)
  const ranting = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.018, 1, 4), new THREE.MeshStandardMaterial({ color: '#4a3020' }), 90)
  const batu = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8c6a55', flatShading: true }), 120)
  const o = new THREE.Object3D()
  for (let i = 0; i < 90; i++) { const px = (R() - 0.5) * 16, pz = (R() - 0.7) * 14; o.position.set(px, tinggi(px, pz) + 0.01, pz); o.rotation.set(Math.PI / 2, 0, R() * 6); o.scale.set(1, 0.2 + R() * 0.6, 1); o.updateMatrix(); ranting.setMatrixAt(i, o.matrix) }
  for (let i = 0; i < 120; i++) { const px = (R() - 0.5) * 18, pz = (R() - 0.7) * 16, s = 0.02 + R() * 0.05; o.position.set(px, tinggi(px, pz), pz); o.rotation.set(R() * 3, R() * 3, R() * 3); o.scale.set(s, s * 0.7, s); o.updateMatrix(); batu.setMatrixAt(i, o.matrix) }
  ranting.castShadow = batu.castShadow = true; scene.add(ranting, batu)
}

// ---------- karakter 2D ber-rig: digambar ulang tiap frame sesuai pose ----------
// Koordinat gambar asli (badan x 140..372) digeser OFS ke kanan supaya lengan terentang tetap muat.
const KW = 768, KH = 1024, OFS = 128
const kc = canvas(KW, KH), kx = kc.getContext('2d')
const GARIS = '#17151a', KULIT = '#f7edd8'
const D2R = Math.PI / 180
// Sudut dalam derajat. lengan [a, b]: a = dari bawah ke arah luar, b = tekuk siku. kaki [c, k]: c = ayun, k = tekuk lutut.
const POSE = {
  diam:     { lKa: [10, -6], lKi: [10, -6], kKa: [3, 0], kKi: [3, 0], miring: 0, kepala: 0 },
  pinggang: { lKa: [48, -92], lKi: [48, -92], kKa: [7, 0], kKi: [7, 0], miring: -2, kepala: -6 },
  tunjuk:   { lKa: [100, -4], lKi: [48, -92], kKa: [6, 0], kKi: [6, 0], miring: -3, kepala: 5 },
  lihat:    { lKa: [14, -20], lKi: [22, -60], kKa: [4, 0], kKi: [4, 0], miring: 3, kepala: 8 },
  kaget:    { lKa: [150, 18], lKi: [150, 18], kKa: [20, 0], kKi: [20, 0], miring: 0, kepala: 0 },
}
function campur(p, q, k) {
  const o = {}
  for (const key in p) o[key] = Array.isArray(p[key]) ? p[key].map((v, i) => lerp(v, q[key][i], k)) : lerp(p[key], q[key], k)
  return o
}
function lengan(x, sx, sy, side, a, b) {
  const L1 = 98, L2 = 92, ex = sx + side * L1 * Math.sin(a * D2R), ey = sy + L1 * Math.cos(a * D2R)
  const hx = ex + side * L2 * Math.sin((a + b) * D2R), hy = ey + L2 * Math.cos((a + b) * D2R)
  x.lineWidth = 10; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(2 * ex - (sx + hx) / 2, 2 * ey - (sy + hy) / 2, hx, hy); x.stroke() // kurva lewat siku (gaya karet)
  x.fillStyle = GARIS; x.beginPath(); x.arc(hx, hy, 9, 0, 7); x.fill()
}
function kaki(x, hx, hy, side, c, k, angkat) {
  const L = 96, kxp = hx + side * L * Math.sin(c * D2R), kyp = hy + L * Math.cos(c * D2R) - angkat * 0.5
  const fx = kxp + side * L * Math.sin((c - k) * D2R), fy = kyp + L * Math.cos((c - k) * D2R) - angkat * 0.5
  x.lineWidth = 12; x.beginPath(); x.moveTo(hx, hy); x.quadraticCurveTo(2 * kxp - (hx + fx) / 2, 2 * kyp - (hy + fy) / 2, fx, fy); x.stroke()
  x.fillStyle = GARIS; x.beginPath(); x.ellipse(fx + side * 10, fy + 4, 26, 12, 0, 0, 7); x.fill()
}
function gambarKarakter(ekspresi, P, lirik) {
  const x = kx; x.clearRect(0, 0, KW, KH); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = GARIS
  x.save(); x.translate(OFS, 0)
  x.translate(256, 800); x.rotate(P.miring * D2R); x.translate(-256, -800) // badan miring di sekitar pinggul
  kaki(x, 222, 800, -1, P.kKi[0], P.kKi[1], P.angkatKi || 0); kaki(x, 292, 800, 1, P.kKa[0], P.kKa[1], P.angkatKa || 0)
  x.strokeStyle = GARIS
  // badan kacang
  x.fillStyle = KULIT; x.lineWidth = 14; x.beginPath(); x.roundRect(140, 440, 232, 390, 112); x.fill(); x.stroke()
  x.save(); x.beginPath(); x.roundRect(147, 447, 218, 376, 105); x.clip()
  x.fillStyle = 'rgba(160,120,90,0.16)'; x.fillRect(300, 440, 80, 400) // bayangan sisi kanan
  x.fillStyle = '#6a4a30'; x.fillRect(140, 735, 240, 26); x.fillStyle = '#d8b25a'; x.fillRect(240, 731, 34, 34) // ikat pinggang
  x.strokeStyle = '#6a4a30'; x.lineWidth = 9; x.beginPath(); x.moveTo(160, 470); x.lineTo(350, 740); x.stroke() // tali tas
  x.restore()
  x.strokeStyle = 'rgba(23,21,26,0.7)'; x.lineWidth = 5; x.strokeRect(282, 590, 50, 46) // saku
  x.fillStyle = '#8a6a48'; x.strokeStyle = GARIS; x.lineWidth = 6; x.beginPath(); x.roundRect(310, 700, 60, 50, 10); x.fill(); x.stroke() // tas
  x.strokeStyle = GARIS
  lengan(x, 150, 556, -1, P.lKi[0], P.lKi[1]); lengan(x, 362, 556, 1, P.lKa[0], P.lKa[1])
  // kepala (miring di sekitar leher)
  x.save(); x.translate(256, 450); x.rotate(P.kepala * D2R); x.translate(-256, -450)
  x.fillStyle = '#c8302e'; x.strokeStyle = GARIS; x.lineWidth = 6; x.beginPath(); x.moveTo(192, 452); x.lineTo(320, 452); x.lineTo(258, 540); x.closePath(); x.fill(); x.stroke() // syal merah
  x.fillStyle = KULIT; x.lineWidth = 14; x.beginPath(); x.ellipse(256, 300, 150, 142, 0, 0, 7); x.fill(); x.stroke()
  // rambut mangkok
  x.fillStyle = '#1e1b22'; x.beginPath(); x.moveTo(106, 300); x.bezierCurveTo(96, 170, 190, 145, 262, 150); x.bezierCurveTo(350, 152, 418, 200, 406, 300)
  x.bezierCurveTo(380, 250, 330, 236, 290, 248); x.bezierCurveTo(250, 222, 190, 230, 150, 262); x.bezierCurveTo(130, 275, 116, 290, 106, 300); x.fill()
  x.strokeStyle = '#4a4656'; x.lineWidth = 5; x.beginPath(); x.moveTo(200, 180); x.quadraticCurveTo(250, 168, 300, 178); x.moveTo(170, 205); x.quadraticCurveTo(220, 190, 270, 196); x.stroke()
  x.strokeStyle = GARIS; x.lineWidth = 14; x.beginPath(); x.ellipse(256, 300, 150, 142, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke()
  // wajah
  const [lx, ly] = lirik || [0, 0]
  x.strokeStyle = GARIS; x.fillStyle = GARIS; x.lineWidth = 8
  const mata = [[205, 322], [312, 322]]
  if (ekspresi === 'kaget') {
    for (const [ex, ey] of mata) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey - 6, 30, 36, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = GARIS; x.beginPath(); x.arc(ex + lx * 12, ey - 4 + ly * 14, 9, 0, 7); x.fill() }
    x.beginPath(); x.ellipse(258, 395, 26, 32, 0, 0, 7); x.fill(); x.fillStyle = '#e0605a'; x.beginPath(); x.ellipse(258, 412, 15, 10, 0, 0, 7); x.fill()
    x.fillStyle = 'rgba(240,120,120,0.35)'; x.beginPath(); x.ellipse(160, 372, 26, 14, 0, 0, 7); x.ellipse(356, 372, 26, 14, 0, 0, 7); x.fill()
    x.fillStyle = '#7cc4ff'; x.strokeStyle = GARIS; x.lineWidth = 4
    for (const [dx, dy] of [[408, 214], [96, 236]]) { x.beginPath(); x.moveTo(dx, dy - 26); x.quadraticCurveTo(dx + 18, dy, dx, dy + 12); x.quadraticCurveTo(dx - 18, dy, dx, dy - 26); x.fill(); x.stroke() }
    x.strokeStyle = GARIS; x.lineWidth = 9
    for (const [a, b, c, d] of [[200, 120, 186, 70], [256, 110, 256, 52], [312, 120, 326, 70]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke() }
  } else if (ekspresi === 'kedip') {
    for (const [ex, ey] of mata) { x.beginPath(); x.arc(ex, ey - 8, 20, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke() }
    x.beginPath(); x.arc(258, 368, 26, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke()
  } else if (ekspresi === 'heran') {
    for (const [ex, ey] of mata) { x.beginPath(); x.ellipse(ex + lx * 10, ey - 4 + ly * 10, 11, 15, 0, 0, 7); x.fill() }
    x.beginPath(); x.moveTo(170, 270); x.quadraticCurveTo(205, 258, 236, 272); x.moveTo(282, 266); x.quadraticCurveTo(312, 250, 342, 262); x.stroke()
    x.beginPath(); x.moveTo(238, 372); x.lineTo(280, 368); x.stroke()
  } else {
    // santai / sombong: kelopak setengah turun
    for (const [ex, ey] of mata) { x.beginPath(); x.moveTo(ex - 24, ey - 10); x.lineTo(ex + 24, ey - 10); x.stroke(); x.beginPath(); x.arc(ex + lx * 8, ey - 6, 11, 0, Math.PI); x.fill() }
    if (ekspresi === 'sombong') {
      x.beginPath(); x.moveTo(282, 270); x.quadraticCurveTo(312, 252, 342, 266); x.stroke() // alis naik
      x.beginPath(); x.moveTo(222, 372); x.quadraticCurveTo(262, 392, 300, 362); x.quadraticCurveTo(306, 356, 310, 350); x.stroke() // seringai
    } else {
      x.beginPath(); x.arc(258, 360, 22, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke()
    }
  }
  x.restore(); x.restore()
  kTex.needsUpdate = true
}
const kTex = tex(kc)
const kGeo = new THREE.PlaneGeometry(1.9 * KW / KH, 1.9); kGeo.translate(0, 0.95, 0)
const tokoh = new THREE.Mesh(kGeo, new THREE.MeshBasicMaterial({ map: kTex, transparent: true, alphaTest: 0.5, toneMapped: false, color: '#fff3e6' }))
tokoh.castShadow = true
tokoh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: kTex, alphaTest: 0.5 })
const TX = 0, TZ = 0
scene.add(tokoh)

// ---------- gundukan pasir yang bergerak + debu ----------
const tKata = { yakin: kataMulai('yakin') ?? 6, sampai: kataMulai('sampai') ?? 8, gerak: kataMulai('bergerak') ?? 10, pasir: kataMulai('pasir') ?? 9 }
const gundukan = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: '#d2a27a', roughness: 1, normalMap: pasirNormal, normalScale: new THREE.Vector2(0.8, 0.8) }))
gundukan.castShadow = gundukan.receiveShadow = true; scene.add(gundukan)
const debuTex = (() => { const c = canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(220,180,140,0.9)'); g.addColorStop(1, 'rgba(220,180,140,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return tex(c) })()
const debu = []
for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: debuTex, transparent: true, depthWrite: false })); s.userData = { o: R() * 1.2, a: R() * 6.28, sp: 0.4 + R() * 0.8 }; scene.add(s); debu.push(s) }
function jalurGundukan(t) { // dari kanan depan menuju tokoh
  const k = ease((t - tKata.pasir + 0.6) / (DUR - tKata.pasir + 0.2))
  return { x: lerp(2.6, 0.7, k), z: lerp(2.2, 0.9, k), naik: clamp((t - tKata.pasir + 0.8) / 0.8) }
}

// ---------- partikel melayang ----------
const NP = 500, pp = new Float32Array(NP * 3), pBase = []
for (let i = 0; i < NP; i++) pBase.push([(R() - 0.5) * 14, R() * 4, (R() - 0.8) * 14, R() * 6.28, 0.2 + R() * 0.5])
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3))
const titikTex = (() => { const c = canvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(0.4, 'rgba(255,220,170,0.6)'); g.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return tex(c) })()
scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ map: titikTex, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe2b8' })))

// ---------- post-processing ----------
const composer = new EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.004, maxblur: 0.012 })
composer.addPass(bokeh)
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.6, 0.86))
composer.addPass(new OutputPass())

// ---------- kamera: 3 shot dengan potongan keras ----------
const SHOT2 = kataMulai('seorang') ?? 2.6, SHOT3 = tKata.sampai - 0.15
function kameraAt(t) {
  let pos, look, fokus, fov = 40, ap = 0.004
  if (t < SHOT2) { // establishing lebar, geser samping
    const k = ease(t / SHOT2); pos = v3(lerp(-3.5, -1.8, k), lerp(1.1, 1.0, k), lerp(8.0, 7.2, k)); look = v3(lerp(-0.6, 0.2, k), 1.9, 0); fokus = pos.distanceTo(v3(TX, 1, TZ)); ap = 0.0025
  } else if (t < SHOT3) { // medium, dorong pelan ke tokoh
    const k = ease((t - SHOT2) / (SHOT3 - SHOT2)); pos = v3(lerp(1.5, 0.9, k), lerp(1.3, 1.22, k), lerp(3.9, 2.8, k)); look = v3(0, 1.08, 0); fokus = pos.distanceTo(v3(TX, 1.1, TZ))
  } else { // rendah di pasir: gundukan depan, lalu tarik fokus ke tokoh yang kaget
    const k = ease((t - SHOT3) / (DUR - SHOT3)); pos = v3(lerp(2.9, 2.5, k), lerp(0.36, 0.33, k), lerp(3.4, 2.9, k)); look = v3(0.3, 0.75, 0)
    const g = jalurGundukan(t), dG = pos.distanceTo(v3(g.x, 0.1, g.z)), dT = pos.distanceTo(v3(TX, 1, TZ))
    const rak = ease((t - tKata.gerak) / 0.35); fokus = lerp(dG, dT, rak)
    const z = ease((t - tKata.gerak) / 0.25); fov = lerp(40, 35, z); look.y = lerp(0.75, 1.25, z)
    const goyang = Math.max(0, 1 - (t - tKata.gerak) / 0.6) * (t > tKata.gerak ? 1 : 0)
    look.x += Math.sin(t * 61) * 0.03 * goyang; look.y += Math.cos(t * 53) * 0.03 * goyang
  }
  // napas kamera (handheld halus)
  pos.x += Math.sin(t * 0.9) * 0.02; pos.y += Math.sin(t * 1.3 + 1) * 0.012
  return { pos, look, fokus, fov, ap }
}

// ---------- overlay 2D: vignette + caption ----------
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
    ox.save(); ox.translate(W / 2, H * 0.7); ox.scale(pop, pop)
    ox.font = `800 ${Math.round(W * 0.066)}px "Segoe UI", Arial, sans-serif`; ox.textAlign = 'center'; ox.textBaseline = 'middle'
    ox.lineJoin = 'round'; ox.shadowColor = 'rgba(0,0,0,0.55)'; ox.shadowBlur = 18; ox.shadowOffsetY = 4
    ox.strokeStyle = 'rgba(10,8,12,0.85)'; ox.lineWidth = W * 0.012; ox.strokeText(c.teks, 0, 0)
    ox.shadowColor = 'transparent'; ox.fillStyle = '#fff'; ox.fillText(c.teks, 0, 0); ox.restore()
  }
}

// ---------- frame ----------
const KEDIP = [1.3, 4.7, 7.0]
window.DUR = DUR
window.renderAt = (t) => {
  // ---- tokoh: jalan masuk -> diam -> pinggang (sombong) -> menunjuk -> lihat pasir -> kaget ----
  const JALAN0 = 0.15, JALAN1 = SHOT2 - 0.35
  const berjalan = t >= JALAN0 && t < JALAN1
  const posX = lerp(-2.2, TX, clamp((t - JALAN0) / (JALAN1 - JALAN0)))
  const jadwal = [[0, 'diam'], [tKata.yakin - 0.1, 'pinggang'], [kataMulai('mengalahkannya') ?? 99, 'tunjuk'], [tKata.sampai, 'lihat'], [tKata.gerak, 'kaget']]
  let P = POSE.diam
  for (let i = 0; i < jadwal.length; i++) {
    const [ts, nama] = jadwal[i]; if (t < ts) break
    const dari = i ? POSE[jadwal[i - 1][1]] : POSE.diam
    P = campur(dari, POSE[nama], ease((t - ts) / (nama === 'kaget' ? 0.12 : 0.3)))
  }
  P = { ...P, lKa: [...P.lKa], lKi: [...P.lKi], kKa: [...P.kKa], kKi: [...P.kKi] }
  let bob = 0
  if (berjalan) { // siklus jalan: kaki & lengan berayun berlawanan, badan naik-turun
    const ph = (t - JALAN0) * 9.5, s1 = Math.sin(ph), mulus = clamp((JALAN1 - t) / 0.25) // langkah melambat di akhir
    P.kKi = [3 + 22 * s1 * mulus, Math.max(0, -s1) * 35 * mulus]; P.kKa = [3 - 22 * s1 * mulus, Math.max(0, s1) * 35 * mulus]
    P.angkatKi = Math.max(0, -s1) * 30 * mulus; P.angkatKa = Math.max(0, s1) * 30 * mulus
    P.lKi = [12 - 22 * s1 * mulus, -18]; P.lKa = [12 + 22 * s1 * mulus, -18]; P.miring = 3 * s1 * mulus; bob = Math.abs(Math.cos(ph)) * 0.035 * mulus
  } else { // diam: lengan bergoyang halus, kepala ikut napas
    P.lKi[0] += Math.sin(t * 1.7) * 3; P.lKa[0] += Math.sin(t * 1.7 + 1) * 3; P.kepala += Math.sin(t * 1.1) * 2
    if (P.lKa[0] > 90 && P.lKa[0] < 120) P.lKa[1] += Math.sin(t * 12) * 6 // tangan menunjuk sambil mengayun
  }
  let e = t >= tKata.gerak ? 'kaget' : t >= tKata.sampai ? 'heran' : t >= tKata.yakin ? 'sombong' : 'santai'
  if ((e === 'santai' || e === 'sombong') && KEDIP.some((k) => t >= k && t < k + 0.12)) e = 'kedip'
  const lirik = e === 'heran' ? [0.8, 0.9] : e === 'kaget' ? [0, 0] : [Math.sin(t * 0.7) * 0.4, 0]
  gambarKarakter(e, P, lirik)
  const c = kameraAt(t)
  camera.position.copy(c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.look)
  // tokoh: billboard (hadap kamera di sumbu Y), napas, loncat kaget
  const lonc = t >= tKata.gerak ? Math.max(0, Math.sin(clamp((t - tKata.gerak) / 0.4) * Math.PI)) : 0
  tokoh.position.set(posX, tinggi(posX, TZ) + lonc * 0.28 + bob, TZ)
  tokoh.rotation.y = Math.atan2(camera.position.x - posX, camera.position.z - TZ)
  const napas = berjalan ? 0 : Math.sin(t * 2.4) * 0.012
  tokoh.scale.set(1 - napas * 0.5 - lonc * 0.05, 1 + napas + lonc * 0.08, 1)
  // gundukan + debu
  const g = jalurGundukan(t)
  gundukan.visible = g.naik > 0
  gundukan.position.set(g.x, tinggi(g.x, g.z) - 0.06, g.z); gundukan.scale.set(0.55, 0.02 + 0.14 * g.naik, 0.4)
  gundukan.rotation.y = Math.sin(t * 7) * 0.08; gundukan.position.y += Math.abs(Math.sin(t * 9)) * 0.015 * g.naik
  debu.forEach((s) => {
    const u = s.userData, f = ((t * u.sp + u.o) % 1.2) / 1.2
    s.visible = g.naik > 0.2
    s.position.set(g.x + Math.cos(u.a) * (0.25 + f * 0.5), 0.05 + f * 0.45, g.z + Math.sin(u.a) * (0.2 + f * 0.4))
    const sc = 0.15 + f * 0.45; s.scale.set(sc, sc, 1); s.material.opacity = (1 - f) * 0.3 * g.naik
  })
  // partikel & awan
  for (let i = 0; i < NP; i++) { const [x, y, z, ph, sp] = pBase[i]; pp[i * 3] = x + Math.sin(t * sp + ph) * 0.3; pp[i * 3 + 1] = ((y + t * sp * 0.08) % 4) + 0.05; pp[i * 3 + 2] = z + Math.cos(t * sp * 0.7 + ph) * 0.3 }
  pGeo.attributes.position.needsUpdate = true
  awan.forEach((m) => { const a = m.userData.a + t * m.userData.v; m.position.x = Math.sin(a) * m.userData.d; m.position.z = -Math.cos(a) * m.userData.d; m.lookAt(0, m.position.y * 0.6, 0) })
  // DOF
  bokeh.uniforms.focus.value = c.fokus; bokeh.uniforms.aperture.value = c.ap
  composer.render()
  overlay(t)
  return out.toDataURL('image/jpeg', 0.93)
}
window.SIAP = true
