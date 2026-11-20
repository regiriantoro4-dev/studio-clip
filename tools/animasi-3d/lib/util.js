// Alat bantu bersama untuk animasi 3D (deterministik: semua acak memakai seed).
import * as THREE from 'three'

export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const lerp = (a, b, k) => a + (b - a) * k
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k) }
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
export const D2R = Math.PI / 180

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
export function tex(c, rep, repY) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, repY ?? rep) }
  return t
}
export function texData(c, rep, repY) { // tekstur non-warna (normal map, dsb.)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, repY ?? rep) }
  return t
}

// Normal map + warna dari medan tinggi tileable h(u,v) -> [-1..1]
export function petaTinggi(N, h, warna, kuat = 6) {
  const hg = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hg[j * N + i] = h(i / N, j / N)
  const c = canvas(N, N), x = c.getContext('2d'), cn = canvas(N, N), xn = cn.getContext('2d')
  const img = x.createImageData(N, N), nim = xn.createImageData(N, N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i
    const hx = hg[j * N + (i + 1) % N] - hg[j * N + (i + N - 1) % N], hy = hg[((j + 1) % N) * N + i] - hg[((j + N - 1) % N) * N + i]
    let nx = -hx * kuat, ny = -hy * kuat, nz = 1; const l = Math.hypot(nx, ny, nz)
    nim.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255, 255], k * 4)
    if (warna) img.data.set([...warna(hg[k], i, j), 255], k * 4)
  }
  xn.putImageData(nim, 0, 0); if (warna) x.putImageData(img, 0, 0)
  return { warna: c, normal: cn }
}

// Langit gradasi + matahari/bulan (shader), dipakai tiap lokasi luar ruangan
export function buatLangit({ top, mid, hor, sun, sunWarna = '#ffbf73', bulan = false }) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, hor: { value: new THREE.Color(hor) }, sun: { value: new THREE.Vector3(...sun).normalize() }, sw: { value: new THREE.Color(sunWarna) }, bulan: { value: bulan ? 1 : 0 } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top,mid,hor,sun,sw; uniform float bulan; varying vec3 vd;
      void main(){ float y = vd.y; vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.75, y));
      float s = max(dot(vd, sun), 0.0);
      if (bulan > 0.5) { c += sw*pow(s, 40.0)*0.35; c = mix(c, vec3(1.0,0.98,0.92)*1.6, smoothstep(0.99955, 0.9997, s)); }
      else { c += sw*pow(s, 18.0)*0.55 + vec3(1.0,0.9,0.7)*pow(s, 600.0)*2.0; }
      gl_FragColor = vec4(c, 1.0); }`,
  })
  return new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), m)
}

export function buatBintang(R, n = 260, opacity = 0.7) {
  const p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, y = 0.2 + R() * 0.75, r = Math.sqrt(1 - y * y); p.set([Math.cos(a) * r * 480, y * 480, Math.sin(a) * r * 480], i * 3) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity, fog: false }))
}

export function awanTex(seed, bawah = 'rgba(255,170,110,0.35)') {
  const r = rng(seed), c = canvas(1024, 384), x = c.getContext('2d')
  for (let i = 0; i < 22; i++) {
    const cx = 160 + r() * 700, cy = 170 + (r() - 0.5) * 90, rad = 60 + r() * 110
    const g = x.createRadialGradient(cx, cy - rad * 0.3, rad * 0.1, cx, cy, rad)
    g.addColorStop(0, 'rgba(255,248,235,0.95)'); g.addColorStop(0.55, 'rgba(250,226,196,0.75)'); g.addColorStop(1, 'rgba(240,190,150,0)')
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rad * 1.5, rad * 0.75, 0, 0, Math.PI * 2); x.fill()
  }
  const sh = x.createLinearGradient(0, 150, 0, 384); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, bawah)
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = sh; x.fillRect(0, 0, 1024, 384)
  return tex(c)
}
export function buatAwan(R, grup, n, { warna = 1, bawah, opacity = 0.92, tinggiMin = 28 } = {}) {
  const daftar = []
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.375), new THREE.MeshBasicMaterial({ map: awanTex(10 + i + n, bawah), transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity, color: new THREE.Color(warna, warna, warna) }))
    const a = -2.4 + i * (4.8 / n) + R() * 0.3, d = 260 + R() * 120, s = 90 + R() * 90
    m.position.set(Math.sin(a) * d, tinggiMin + R() * 55, -Math.cos(a) * d); m.scale.set(s, s, 1); m.lookAt(0, m.position.y * 0.6, 0)
    m.userData = { a, d, v: 0.0012 + R() * 0.001 }
    grup.add(m); daftar.push(m)
  }
  return (t) => daftar.forEach((m) => { const a = m.userData.a + t * m.userData.v; m.position.x = Math.sin(a) * m.userData.d; m.position.z = -Math.cos(a) * m.userData.d; m.lookAt(0, m.position.y * 0.6, 0) })
}

// Tekstur papan kayu (lantai, peti, dinding)
export function kayuTex(seed, { w = 512, h = 512, papan = 6, dasar = [120, 78, 48], arah = 'h' } = {}) {
  const r = rng(seed), c = canvas(w, h), x = c.getContext('2d')
  const n = papan, size = (arah === 'h' ? h : w) / n
  for (let i = 0; i < n; i++) {
    const k = 0.8 + r() * 0.35, [R0, G0, B0] = dasar.map((v) => Math.round(v * k))
    x.fillStyle = `rgb(${R0},${G0},${B0})`
    if (arah === 'h') x.fillRect(0, i * size, w, size); else x.fillRect(i * size, 0, size, h)
    for (let s = 0; s < 40; s++) {
      x.strokeStyle = `rgba(${R0 * 0.6},${G0 * 0.55},${B0 * 0.5},${0.15 + r() * 0.25})`; x.lineWidth = 1 + r() * 2; x.beginPath()
      if (arah === 'h') { const yy = i * size + r() * size; x.moveTo(0, yy); x.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 6, w * 0.7, yy + (r() - 0.5) * 6, w, yy) }
      else { const xx = i * size + r() * size; x.moveTo(xx, 0); x.bezierCurveTo(xx + (r() - 0.5) * 6, h * 0.3, xx + (r() - 0.5) * 6, h * 0.7, xx, h) }
      x.stroke()
    }
    x.fillStyle = 'rgba(25,14,8,0.8)'
    if (arah === 'h') x.fillRect(0, i * size, w, 3); else x.fillRect(i * size, 0, 3, h)
  }
  return c
}
