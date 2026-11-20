// Kuntilanak versi "lebih nyata & seram" (pengganti buatMakhluk('kuntilanak') — modul lama tidak diubah).
// Tetap billboard kanvas 2D, tapi dilukis berlapis: ratusan helai rambut basah yang bergoyang, wajah pucat
// kehijauan dengan rongga mata cekung, gaun kumal bernoda yang memudar transparan (melayang tanpa kaki),
// jari kurus berkuku panjang. Mode: jauh | lewat | dekat | depan (depan = jumpscare: mata & mulut terbuka).
import * as THREE from 'three'
import { rng, canvas, tex } from './util.js'

const TAU = Math.PI * 2

// lapisan statis dibuat sekali (noda gaun, tekstur kulit) supaya tiap frame cukup menggambar ulang yang bergerak
function lapisNoda(W, H) {
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(613)
  for (let i = 0; i < 70; i++) {
    const px = W * (0.25 + r() * 0.5), py = H * (0.32 + r() * 0.6), rr = 8 + r() * 46
    const g = x.createRadialGradient(px, py, 0, px, py, rr)
    const tanah = r() < 0.75
    g.addColorStop(0, tanah ? 'rgba(95,80,55,0.32)' : 'rgba(90,20,18,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rr, rr * (0.6 + r() * 0.8), r() * TAU, 0, TAU); x.fill()
  }
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(40,35,30,${0.05 + r() * 0.08})`; x.fillRect(r() * W, H * 0.28 + r() * H * 0.72, 1.5, 1.5) }
  return c
}

export function buatKuntiSeram() {
  const W = 768, H = 1536, c = canvas(W, H), x = c.getContext('2d'), tx = tex(c)
  const tinggi = 2.25
  const geo = new THREE.PlaneGeometry(tinggi * W / H, tinggi); geo.translate(0, tinggi / 2, 0)
  const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, alphaTest: 0.02, toneMapped: false, depthWrite: false, fog: true })
  const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.renderOrder = 5
  const noda = lapisNoda(W, H)
  const R = rng(4040)
  const helai = Array.from({ length: 260 }, () => ({ a: R(), p: R() * TAU, l: 0.75 + R() * 0.5, w: 1.2 + R() * 2.6, g: R() }))
  const cx = W / 2, hy = 300 // pusat kepala

  function gaun(t, mode) {
    const k = Math.sin(t * 1.8) * 14, k2 = Math.sin(t * 2.6 + 1) * 10
    x.save()
    const g = x.createLinearGradient(0, 420, 0, H)
    g.addColorStop(0, 'rgba(214,212,200,1)'); g.addColorStop(0.55, 'rgba(190,190,182,0.92)'); g.addColorStop(0.85, 'rgba(170,175,180,0.45)'); g.addColorStop(1, 'rgba(160,170,180,0)')
    x.beginPath(); x.moveTo(cx - 70, 430)
    x.bezierCurveTo(cx - 150, 640, cx - 200 + k, 1050, cx - 230 + k, 1460)
    for (let i = 0; i <= 14; i++) { const px = cx - 230 + k + i * (460 / 14), py = 1460 - (i % 2 ? 70 + 40 * Math.sin(t * 3 + i) : 0) - (i % 3 === 0 ? 50 : 0); x.lineTo(px + Math.sin(t * 4 + i) * 9, py) }
    x.bezierCurveTo(cx + 200 + k2, 1050, cx + 150, 640, cx + 70, 430); x.closePath()
    x.fillStyle = g; x.fill()
    x.clip()
    x.globalCompositeOperation = 'source-atop'; x.drawImage(noda, 0, 0)
    // lipatan kain: garis gelap-terang memanjang
    for (let i = -4; i <= 4; i++) {
      const sx = cx + i * 34, ex = cx + i * 52 + k * (0.6 + Math.abs(i) * 0.1)
      x.strokeStyle = i % 2 ? 'rgba(60,62,70,0.22)' : 'rgba(255,255,250,0.18)'; x.lineWidth = 10 + Math.abs(i) * 2
      x.beginPath(); x.moveTo(sx, 470); x.bezierCurveTo(sx - i * 6, 800, ex, 1100, ex + Math.sin(t * 2 + i) * 12, 1450); x.stroke()
    }
    // bayangan rambut di bahu & dada
    const sb = x.createLinearGradient(0, 420, 0, 760); sb.addColorStop(0, 'rgba(10,10,12,0.55)'); sb.addColorStop(1, 'rgba(10,10,12,0)')
    x.fillStyle = sb; x.fillRect(0, 420, W, 340)
    x.restore()
  }

  function lengan(t, mode) {
    const julur = mode === 'depan' ? 1 : mode === 'dekat' ? 0.55 : 0.15
    for (const s of [-1, 1]) {
      const bx = cx + s * 78, by = 470
      const ex = cx + s * (120 + 60 * julur), ey = 760 - 230 * julur
      const hx = cx + s * (110 + 120 * julur) + Math.sin(t * 2 + s) * 6, hy2 = 980 - 560 * julur
      // lengan kurus pucat, siku tajam
      x.strokeStyle = '#b9bdb4'; x.lineWidth = 26 - 6 * julur; x.lineCap = 'round'
      x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.lineTo(hx, hy2); x.stroke()
      x.strokeStyle = 'rgba(40,45,40,0.35)'; x.lineWidth = 4; x.beginPath(); x.moveTo(bx + s * 8, by + 6); x.lineTo(ex + s * 8, ey); x.lineTo(hx + s * 6, hy2); x.stroke()
      // tangan: telapak + lima jari panjang berkuku hitam, makin besar saat menjangkau kamera
      const sk = 1 + julur * 0.9
      x.fillStyle = '#c3c6bc'; x.beginPath(); x.ellipse(hx, hy2, 20 * sk, 26 * sk, 0, 0, TAU); x.fill()
      for (let j = 0; j < 5; j++) {
        const ang = -Math.PI / 2 + s * (-0.75 + j * 0.38) + Math.sin(t * 3 + j) * 0.06
        const L1 = (j === 0 ? 34 : 58 + (j === 2 ? 10 : 0)) * sk
        const mx = hx + Math.cos(ang) * L1 * 0.6, my = hy2 + Math.sin(ang) * L1 * 0.6
        const fx = hx + Math.cos(ang + s * 0.25) * L1, fy = hy2 + Math.sin(ang + s * 0.25) * L1
        x.strokeStyle = '#c3c6bc'; x.lineWidth = 7 * sk; x.beginPath(); x.moveTo(hx, hy2); x.lineTo(mx, my); x.lineTo(fx, fy); x.stroke()
        const nx = fx + Math.cos(ang + s * 0.45) * 16 * sk, ny = fy + Math.sin(ang + s * 0.45) * 16 * sk
        x.strokeStyle = '#141012'; x.lineWidth = 4.5 * sk; x.beginPath(); x.moveTo(fx, fy); x.lineTo(nx, ny); x.stroke()
      }
    }
  }

  function wajah(t, mode) {
    const buka = mode === 'depan' ? 1 : mode === 'dekat' ? 0.7 : 0.35
    // leher kurus
    const ln = x.createLinearGradient(0, hy + 80, 0, hy + 190); ln.addColorStop(0, '#9aa094'); ln.addColorStop(1, 'rgba(120,125,118,0)'); x.fillStyle = ln; x.beginPath(); x.ellipse(cx, hy + 130, 30, 70, 0, 0, TAU); x.fill()
    // wajah pucat kehijauan dengan bayangan cekung
    const g = x.createRadialGradient(cx, hy - 10, 10, cx, hy + 10, 130)
    g.addColorStop(0, '#d6d9cc'); g.addColorStop(0.6, '#b7bcae'); g.addColorStop(1, '#7d8478')
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, hy, 92, 120, 0, 0, TAU); x.fill()
    // rongga mata gelap
    for (const s of [-1, 1]) {
      const ex = cx + s * 36, ey = hy - 8
      const rg = x.createRadialGradient(ex, ey, 2, ex, ey, 40); rg.addColorStop(0, 'rgba(8,6,8,1)'); rg.addColorStop(0.55, 'rgba(25,20,24,0.85)'); rg.addColorStop(1, 'rgba(60,55,60,0)')
      x.fillStyle = rg; x.beginPath(); x.ellipse(ex, ey, 38, 30 + 6 * buka, s * 0.15, 0, TAU); x.fill()
      // pupil putih kecil yang menatap (sedikit bergetar)
      const jx = Math.sin(t * 23 + s) * 1.2
      x.fillStyle = `rgba(240,240,230,${0.6 + 0.4 * buka})`; x.beginPath(); x.arc(ex + jx + s * -3, ey + 2, 4 + 3 * buka, 0, TAU); x.fill()
      // urat halus
      x.strokeStyle = 'rgba(70,40,60,0.35)'; x.lineWidth = 1.5
      for (let v = 0; v < 3; v++) { x.beginPath(); x.moveTo(ex + s * 30, ey + 10 + v * 8); x.quadraticCurveTo(ex + s * 50, ey + 30 + v * 10, ex + s * 58, ey + 50 + v * 6); x.stroke() }
    }
    // hidung samar & mulut: garis tipis, saat depan menganga gelap memanjang
    x.strokeStyle = 'rgba(60,60,55,0.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 6, hy + 30); x.lineTo(cx - 10, hy + 46); x.lineTo(cx + 4, hy + 48); x.stroke()
    const mh = 6 + 70 * (buka - 0.35) / 0.65
    const mg = x.createLinearGradient(0, hy + 70, 0, hy + 70 + mh); mg.addColorStop(0, '#120a0c'); mg.addColorStop(1, '#3a0d10')
    x.fillStyle = mg; x.beginPath(); x.ellipse(cx + 2, hy + 78 + mh / 2, 18 + 10 * buka, mh / 2 + 3, 0, 0, TAU); x.fill()
    // bibir pecah gelap
    x.strokeStyle = 'rgba(60,30,40,0.7)'; x.lineWidth = 3; x.beginPath(); x.ellipse(cx + 2, hy + 78 + mh / 2, 19 + 10 * buka, mh / 2 + 4, 0, 0, TAU); x.stroke()
  }

  function rambut(t, mode, depan) {
    // depan=false: lapisan belakang (panjang sampai pinggang); true: tirai di depan wajah dengan celah di tengah
    const celah = mode === 'depan' ? 46 : mode === 'dekat' ? 34 : 18
    for (const h of helai) {
      const sisi = h.a < 0.5 ? -1 : 1
      let ax = cx + (h.a - 0.5) * 200, ay = hy - 110 + Math.abs(h.a - 0.5) * 70
      const ayun = Math.sin(t * 1.3 + h.p) * 10 + Math.sin(t * 3.1 + h.p * 2) * 4
      let panjang = (depan ? 430 : 780) * h.l
      let x1, x2
      if (depan) {
        // helai jatuh menutupi wajah, menyisakan celah di tengah
        // tirai rambut tersibak melengkung mengikuti pipi: helai dekat tengah didorong keluar lalu jatuh ke dalam lagi
        const dTengah = Math.abs(ax - cx), lebar = celah * 1.6
        if (dTengah < lebar) { const dorong = lebar + h.g * 18; x1 = cx + sisi * dorong * 1.05 + ayun * 0.3; x2 = cx + sisi * (dorong * 0.55 + h.g * 25) + ayun; ax = cx + sisi * (dTengah * 0.5 + 6) }
        else { x1 = ax + sisi * 10 + ayun * 0.4; x2 = ax + sisi * (20 + h.g * 30) + ayun }
      } else { x1 = ax + sisi * 70 + ayun * 0.5; x2 = ax + sisi * (90 + h.g * 60) + ayun * 1.5 }
      const y2 = ay + panjang
      const v = 8 + Math.floor(h.g * 14)
      x.strokeStyle = `rgb(${v},${v},${v + 3})`; x.lineWidth = h.w * (depan ? 1.3 : 1.8)
      x.beginPath(); x.moveTo(ax, ay); x.bezierCurveTo(x1, ay + panjang * 0.3, x2 - sisi * 10, ay + panjang * 0.7, x2, y2); x.stroke()
      if (h.g > 0.86) { x.strokeStyle = 'rgba(120,130,150,0.25)'; x.lineWidth = 1; x.stroke() } // kilau basah
    }
    if (!depan) { // massa rambut di atas kepala
      x.fillStyle = '#0a0a0c'; x.beginPath(); x.ellipse(cx, hy - 40, 104, 96, 0, Math.PI * 0.95, Math.PI * 2.05); x.fill()
    } else {
      x.fillStyle = '#0b0b0d'; x.beginPath(); x.ellipse(cx, hy - 70, 100, 62, 0, Math.PI, TAU); x.fill()
    }
  }

  return {
    mesh, jenis: 'kuntilanak',
    gambar(t, mode) {
      x.clearRect(0, 0, W, H); x.lineJoin = 'round'; x.lineCap = 'round'
      // pendar dingin tipis di sekeliling sosok
      x.save(); x.shadowColor = 'rgba(170,200,255,0.35)'; x.shadowBlur = 40
      rambut(t, mode, false)
      gaun(t, mode)
      x.restore()
      lengan(t, mode)
      wajah(t, mode)
      rambut(t, mode, true)
      // kedip/glitch singkat: sosok sesekali memudar sepersekian detik
      const gl = Math.sin(t * 7.3) * Math.sin(t * 2.9)
      mat.opacity = gl > 0.93 ? 0.45 : 1
      tx.needsUpdate = true
    },
  }
}
