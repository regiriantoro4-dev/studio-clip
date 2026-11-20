// Tokoh kartun 2D ber-rig yang ditempel di dunia 3D (billboard), digambar ulang tiap frame.
// Variasi penampilan lewat opsi: rambut, topi, baju, jas, syal, kumis, kacamata, monokel.
import * as THREE from 'three'
import { canvas, tex, lerp, clamp, D2R } from './util.js'

const KW = 768, KH = 1024, OFS = 128, TINGGI = 1.9
const GARIS = '#17151a'

// Sudut derajat. lengan [a, b]: a = dari bawah ke luar, b = tekuk siku. kaki [c, k]: c = ayun, k = tekuk lutut.
export const POSE = {
  diam:     { lKa: [10, -6], lKi: [10, -6], kKa: [3, 0], kKi: [3, 0], miring: 0, kepala: 0 },
  pinggang: { lKa: [48, -92], lKi: [48, -92], kKa: [7, 0], kKi: [7, 0], miring: -2, kepala: -6 },
  tunjuk:   { lKa: [100, -4], lKi: [48, -92], kKa: [6, 0], kKi: [6, 0], miring: -3, kepala: 5 },
  lihat:    { lKa: [14, -20], lKi: [22, -60], kKa: [4, 0], kKi: [4, 0], miring: 3, kepala: 8 },
  kaget:    { lKa: [150, 18], lKi: [150, 18], kKa: [20, 0], kKi: [20, 0], miring: 0, kepala: 0 },
  dayung:   { lKa: [70, -70], lKi: [40, -100], kKa: [3, 0], kKi: [3, 0], miring: 4, kepala: 0 },
  sedekap:  { lKa: [30, -128], lKi: [30, -128], kKa: [5, 0], kKi: [5, 0], miring: 0, kepala: -4 },
  angkat:   { lKa: [160, 5], lKi: [12, -8], kKa: [5, 0], kKi: [5, 0], miring: -4, kepala: 6 },
  takut:    { lKa: [70, -150], lKi: [70, -150], kKa: [10, 15], kKi: [10, 15], miring: 0, kepala: -10 },
  hangat:   { lKa: [55, -40], lKi: [55, -40], kKa: [6, 0], kKi: [6, 0], miring: 6, kepala: 4 }, // tangan ke api
}
export function campur(p, q, k) {
  const o = {}
  for (const key in p) o[key] = Array.isArray(p[key]) ? p[key].map((v, i) => lerp(v, q[key][i], k)) : lerp(p[key], q[key] ?? p[key], k)
  return o
}

function lengan(x, sx, sy, side, a, b, lebar) {
  const L1 = 98, L2 = 92, ex = sx + side * L1 * Math.sin(a * D2R), ey = sy + L1 * Math.cos(a * D2R)
  const hx = ex + side * L2 * Math.sin((a + b) * D2R), hy = ey + L2 * Math.cos((a + b) * D2R)
  x.lineWidth = lebar; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(2 * ex - (sx + hx) / 2, 2 * ey - (sy + hy) / 2, hx, hy); x.stroke()
  x.fillStyle = GARIS; x.beginPath(); x.arc(hx, hy, 9, 0, 7); x.fill()
}
function kaki(x, hx, hy, side, c, k, angkat) {
  const L = 96, kxp = hx + side * L * Math.sin(c * D2R), kyp = hy + L * Math.cos(c * D2R) - angkat * 0.5
  const fx = kxp + side * L * Math.sin((c - k) * D2R), fy = kyp + L * Math.cos((c - k) * D2R) - angkat * 0.5
  x.lineWidth = 12; x.beginPath(); x.moveTo(hx, hy); x.quadraticCurveTo(2 * kxp - (hx + fx) / 2, 2 * kyp - (hy + fy) / 2, fx, fy); x.stroke()
  x.fillStyle = GARIS; x.beginPath(); x.ellipse(fx + side * 10, fy + 4, 26, 12, 0, 0, 7); x.fill()
}

function rambut(x, jenis, warna) {
  x.fillStyle = warna
  if (jenis === 'mangkok') {
    x.beginPath(); x.moveTo(106, 300); x.bezierCurveTo(96, 170, 190, 145, 262, 150); x.bezierCurveTo(350, 152, 418, 200, 406, 300)
    x.bezierCurveTo(380, 250, 330, 236, 290, 248); x.bezierCurveTo(250, 222, 190, 230, 150, 262); x.bezierCurveTo(130, 275, 116, 290, 106, 300); x.fill()
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 5; x.beginPath(); x.moveTo(200, 180); x.quadraticCurveTo(250, 168, 300, 178); x.moveTo(170, 205); x.quadraticCurveTo(220, 190, 270, 196); x.stroke()
  } else if (jenis === 'pendek') {
    x.beginPath(); x.moveTo(112, 268); x.bezierCurveTo(110, 175, 200, 150, 260, 152); x.bezierCurveTo(330, 152, 404, 180, 400, 268)
    for (let i = 0; i <= 8; i++) { const px = 400 - i * 36, py = i % 2 ? 228 : 206; x.lineTo(px, py) }
    x.closePath(); x.fill()
  } else if (jenis === 'botak') {
    x.beginPath(); x.ellipse(112, 300, 18, 46, 0.2, 0, 7); x.ellipse(400, 300, 18, 46, -0.2, 0, 7); x.fill()
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(220, 200, 40, 16, -0.4, 0, 7); x.fill()
  } else if (jenis === 'sanggul') {
    x.beginPath(); x.arc(256, 140, 50, 0, 7); x.fill()
    x.beginPath(); x.moveTo(106, 310); x.bezierCurveTo(90, 160, 200, 150, 256, 152); x.bezierCurveTo(320, 150, 424, 160, 406, 310); x.bezierCurveTo(390, 230, 330, 210, 256, 214); x.bezierCurveTo(180, 210, 122, 230, 106, 310); x.fill()
  }
}
function topi(x, jenis) {
  if (jenis === 'safari') {
    x.fillStyle = '#cbb37e'; x.strokeStyle = GARIS; x.lineWidth = 10
    x.beginPath(); x.ellipse(256, 215, 205, 40, 0, 0, 7); x.fill(); x.stroke()
    x.beginPath(); x.moveTo(140, 214); x.bezierCurveTo(140, 90, 372, 90, 372, 214); x.closePath(); x.fill(); x.stroke()
    x.fillStyle = '#6a4a30'; x.fillRect(146, 186, 220, 22)
  } else if (jenis === 'tinggi') {
    x.fillStyle = '#1c1c22'; x.strokeStyle = GARIS; x.lineWidth = 8
    x.beginPath(); x.ellipse(256, 180, 170, 30, 0, 0, 7); x.fill(); x.stroke()
    x.beginPath(); x.roundRect(170, 30, 172, 152, 12); x.fill(); x.stroke()
    x.fillStyle = '#7a1f2a'; x.fillRect(172, 150, 168, 22)
  }
}

export function buatTokoh(opsi = {}) {
  const o = { kulit: '#f7edd8', baju: '#f7edd8', rambut: 'mangkok', warnaRambut: '#1e1b22', topi: null, syal: '#c8302e', tas: true, jas: null, dasi: '#7a1f2a', kumis: false, kacamata: false, monokel: false, skala: 1, ...opsi }
  const kc = canvas(KW, KH), x = kc.getContext('2d'), kTex = tex(kc)
  const geo = new THREE.PlaneGeometry(TINGGI * KW / KH, TINGGI); geo.translate(0, TINGGI / 2, 0)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: kTex, transparent: true, alphaTest: 0.5, toneMapped: false, color: '#fff3e6' }))
  mesh.castShadow = true
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: kTex, alphaTest: 0.5 })
  mesh.scale.setScalar(o.skala)

  function gambar(ekspresi, P, lirik = [0, 0]) {
    x.clearRect(0, 0, KW, KH); x.lineCap = 'round'; x.lineJoin = 'round'
    x.save(); x.translate(OFS, 0)
    x.translate(256, 800); x.rotate(P.miring * D2R); x.translate(-256, -800)
    x.strokeStyle = GARIS
    kaki(x, 222, 800, -1, P.kKi[0], P.kKi[1], P.angkatKi || 0); kaki(x, 292, 800, 1, P.kKa[0], P.kKa[1], P.angkatKa || 0)
    // badan
    x.fillStyle = o.baju; x.strokeStyle = GARIS; x.lineWidth = 14; x.beginPath(); x.roundRect(140, 440, 232, 390, 112); x.fill(); x.stroke()
    x.save(); x.beginPath(); x.roundRect(147, 447, 218, 376, 105); x.clip()
    if (o.jas) {
      x.fillStyle = o.jas; x.beginPath(); x.moveTo(140, 440); x.lineTo(236, 440); x.lineTo(250, 640); x.lineTo(232, 840); x.lineTo(140, 840); x.fill()
      x.beginPath(); x.moveTo(372, 440); x.lineTo(276, 440); x.lineTo(262, 640); x.lineTo(280, 840); x.lineTo(372, 840); x.fill()
      x.fillStyle = o.dasi; x.beginPath(); x.moveTo(246, 470); x.lineTo(266, 470); x.lineTo(274, 600); x.lineTo(256, 625); x.lineTo(238, 600); x.fill()
      x.fillStyle = '#d8c070'; for (const yy of [660, 720]) { x.beginPath(); x.arc(228, yy, 7, 0, 7); x.arc(284, yy, 7, 0, 7); x.fill() }
    } else {
      x.fillStyle = 'rgba(160,120,90,0.16)'; x.fillRect(300, 440, 80, 400)
      x.fillStyle = '#6a4a30'; x.fillRect(140, 735, 240, 26); x.fillStyle = '#d8b25a'; x.fillRect(240, 731, 34, 34)
      if (o.tas) { x.strokeStyle = '#6a4a30'; x.lineWidth = 9; x.beginPath(); x.moveTo(160, 470); x.lineTo(350, 740); x.stroke() }
    }
    x.restore()
    if (!o.jas) { x.strokeStyle = 'rgba(23,21,26,0.7)'; x.lineWidth = 5; x.strokeRect(282, 590, 50, 46) }
    if (o.tas && !o.jas) { x.fillStyle = '#8a6a48'; x.strokeStyle = GARIS; x.lineWidth = 6; x.beginPath(); x.roundRect(310, 700, 60, 50, 10); x.fill(); x.stroke() }
    x.strokeStyle = o.jas || GARIS
    lengan(x, 150, 556, -1, P.lKi[0], P.lKi[1], o.jas ? 18 : 10); lengan(x, 362, 556, 1, P.lKa[0], P.lKa[1], o.jas ? 18 : 10)
    // kepala
    x.save(); x.translate(256, 450); x.rotate(P.kepala * D2R); x.translate(-256, -450)
    if (o.syal) { x.fillStyle = o.syal; x.strokeStyle = GARIS; x.lineWidth = 6; x.beginPath(); x.moveTo(192, 452); x.lineTo(320, 452); x.lineTo(258, 540); x.closePath(); x.fill(); x.stroke() }
    x.fillStyle = o.kulit; x.strokeStyle = GARIS; x.lineWidth = 14; x.beginPath(); x.ellipse(256, 300, 150, 142, 0, 0, 7); x.fill(); x.stroke()
    rambut(x, o.rambut, o.warnaRambut)
    x.strokeStyle = GARIS; x.lineWidth = 14; x.beginPath(); x.ellipse(256, 300, 150, 142, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke()
    // wajah
    const [lx, ly] = lirik
    x.strokeStyle = GARIS; x.fillStyle = GARIS; x.lineWidth = 8
    const mata = [[205, 322], [312, 322]], mulutY = o.kumis ? 20 : 0
    if (ekspresi === 'kaget') {
      for (const [ex, ey] of mata) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey - 6, 30, 36, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = GARIS; x.beginPath(); x.arc(ex + lx * 12, ey - 4 + ly * 14, 9, 0, 7); x.fill() }
      x.beginPath(); x.ellipse(258, 395 + mulutY, 26, 32, 0, 0, 7); x.fill(); x.fillStyle = '#e0605a'; x.beginPath(); x.ellipse(258, 412 + mulutY, 15, 10, 0, 0, 7); x.fill()
      x.fillStyle = 'rgba(240,120,120,0.35)'; x.beginPath(); x.ellipse(160, 372, 26, 14, 0, 0, 7); x.ellipse(356, 372, 26, 14, 0, 0, 7); x.fill()
      x.fillStyle = '#7cc4ff'; x.strokeStyle = GARIS; x.lineWidth = 4
      for (const [dx, dy] of [[408, 214], [96, 236]]) { x.beginPath(); x.moveTo(dx, dy - 26); x.quadraticCurveTo(dx + 18, dy, dx, dy + 12); x.quadraticCurveTo(dx - 18, dy, dx, dy - 26); x.fill(); x.stroke() }
      if (!o.topi) { x.strokeStyle = GARIS; x.lineWidth = 9; for (const [a, b, c, d] of [[200, 120, 186, 70], [256, 110, 256, 52], [312, 120, 326, 70]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke() } }
    } else if (ekspresi === 'kedip') {
      for (const [ex, ey] of mata) { x.beginPath(); x.arc(ex, ey - 8, 20, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke() }
      x.beginPath(); x.arc(258, 368 + mulutY, 26, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke()
    } else if (ekspresi === 'heran' || ekspresi === 'cemas') {
      for (const [ex, ey] of mata) { x.beginPath(); x.ellipse(ex + lx * 10, ey - 4 + ly * 10, 11, 15, 0, 0, 7); x.fill() }
      if (ekspresi === 'cemas') {
        x.beginPath(); x.moveTo(172, 262); x.quadraticCurveTo(205, 268, 236, 284); x.moveTo(280, 284); x.quadraticCurveTo(312, 268, 342, 262); x.stroke()
        x.lineWidth = 6; x.beginPath(); for (let i = 0; i <= 6; i++) x.lineTo(226 + i * 10, 380 + mulutY + (i % 2 ? -6 : 6)); x.stroke()
        x.fillStyle = '#7cc4ff'; x.strokeStyle = GARIS; x.lineWidth = 4; const dx = 398, dy = 230
        x.beginPath(); x.moveTo(dx, dy - 26); x.quadraticCurveTo(dx + 18, dy, dx, dy + 12); x.quadraticCurveTo(dx - 18, dy, dx, dy - 26); x.fill(); x.stroke()
      } else {
        x.beginPath(); x.moveTo(170, 270); x.quadraticCurveTo(205, 258, 236, 272); x.moveTo(282, 266); x.quadraticCurveTo(312, 250, 342, 262); x.stroke()
        x.beginPath(); x.moveTo(238, 372 + mulutY); x.lineTo(280, 368 + mulutY); x.stroke()
      }
    } else if (ekspresi === 'tawa') {
      for (const [ex, ey] of mata) { x.beginPath(); x.arc(ex, ey, 18, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke() }
      x.beginPath(); x.moveTo(214, 360 + mulutY); x.quadraticCurveTo(258, 440 + mulutY, 302, 360 + mulutY); x.closePath(); x.fill()
      x.fillStyle = '#e0605a'; x.beginPath(); x.ellipse(258, 392 + mulutY, 18, 9, 0, 0, 7); x.fill()
    } else {
      for (const [ex, ey] of mata) { x.beginPath(); x.moveTo(ex - 24, ey - 10); x.lineTo(ex + 24, ey - 10); x.stroke(); x.beginPath(); x.arc(ex + lx * 8, ey - 6, 11, 0, Math.PI); x.fill() }
      if (ekspresi === 'sombong') {
        x.beginPath(); x.moveTo(282, 270); x.quadraticCurveTo(312, 252, 342, 266); x.stroke()
        x.beginPath(); x.moveTo(222, 372 + mulutY); x.quadraticCurveTo(262, 392 + mulutY, 300, 362 + mulutY); x.quadraticCurveTo(306, 356 + mulutY, 310, 350 + mulutY); x.stroke()
      } else {
        x.beginPath(); x.arc(258, 360 + mulutY, 22, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke()
      }
    }
    if (o.kumis) {
      x.fillStyle = o.warnaRambut === '#1e1b22' ? '#2a2420' : '#e8e4dc'; x.strokeStyle = GARIS; x.lineWidth = 5
      x.beginPath(); x.moveTo(256, 352); x.bezierCurveTo(230, 330, 180, 340, 168, 372); x.bezierCurveTo(200, 362, 230, 372, 256, 366)
      x.bezierCurveTo(282, 372, 312, 362, 344, 372); x.bezierCurveTo(332, 340, 282, 330, 256, 352); x.fill(); x.stroke()
    }
    if (o.kacamata) {
      x.strokeStyle = GARIS; x.lineWidth = 6; x.fillStyle = 'rgba(200,230,255,0.25)'
      for (const [ex, ey] of mata) { x.beginPath(); x.arc(ex, ey - 6, 36, 0, 7); x.fill(); x.stroke() }
      x.beginPath(); x.moveTo(241, 316); x.quadraticCurveTo(258, 304, 276, 316); x.stroke()
    }
    if (o.monokel) {
      x.strokeStyle = '#c9a54a'; x.lineWidth = 6; x.beginPath(); x.arc(312, 316, 38, 0, 7); x.stroke()
      x.lineWidth = 3; x.beginPath(); x.moveTo(346, 334); x.quadraticCurveTo(380, 420, 350, 470); x.stroke()
    }
    topi(x, o.topi)
    x.restore(); x.restore()
    kTex.needsUpdate = true
  }
  return { mesh, gambar, opsi: o }
}

// Pose pada detik t dari jadwal [[detik, namaPose], ...] dengan transisi halus.
export function poseDari(jadwal, t, cepat = ['kaget']) {
  let P = POSE[jadwal[0][1]]
  for (let i = 0; i < jadwal.length; i++) {
    const [ts, nama] = jadwal[i]; if (t < ts) break
    const dari = i ? POSE[jadwal[i - 1][1]] : POSE[nama]
    const k = clamp((t - ts) / (cepat.includes(nama) ? 0.12 : 0.3)); P = campur(dari, POSE[nama], k * k * (3 - 2 * k))
  }
  return { ...P, lKa: [...P.lKa], lKi: [...P.lKi], kKa: [...P.kKa], kKi: [...P.kKi] }
}
// Gerak hidup saat diam: lengan bergoyang, kepala bernapas. seed membedakan tiap tokoh.
export function hidupkan(P, t, seed = 0) {
  P.lKi[0] += Math.sin(t * 1.7 + seed) * 3; P.lKa[0] += Math.sin(t * 1.7 + 1 + seed) * 3; P.kepala += Math.sin(t * 1.1 + seed) * 2
  if (P.lKa[0] > 90 && P.lKa[0] < 120) P.lKa[1] += Math.sin(t * 12) * 6
  return P
}
// Siklus jalan: ubah P di tempat, kembalikan naik-turun badan (unit dunia).
export function jalan(P, fase, kuat = 1) {
  const s1 = Math.sin(fase)
  P.kKi = [3 + 22 * s1 * kuat, Math.max(0, -s1) * 35 * kuat]; P.kKa = [3 - 22 * s1 * kuat, Math.max(0, s1) * 35 * kuat]
  P.angkatKi = Math.max(0, -s1) * 30 * kuat; P.angkatKa = Math.max(0, s1) * 30 * kuat
  P.lKi = [12 - 22 * s1 * kuat, -18]; P.lKa = [12 + 22 * s1 * kuat, -18]; P.miring = 3 * s1 * kuat
  return Math.abs(Math.cos(fase)) * 0.035 * kuat
}
