// Halaman uji aset horor (bukan cerita): tiap 2 detik ganti susunan lokasi + makhluk.
// node render.cjs <folder> --skrip uji_horor.js --still 1,3,5,7
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { v3, canvas, rng } from './lib/util.js'
import { buatTokoh, POSE, hidupkan } from './lib/tokoh.js'
import { buatJalanHutan, buatRumahTua, buatMakhluk } from './lib/horor.js'

const W = 1080, H = 1920
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 900)
const composer = new EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0.003, maxblur: 0.01 }); composer.addPass(bokeh)
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.6, 0.85)); composer.addPass(new OutputPass())

const LOK = { jalan: buatJalanHutan(), rumah: buatRumahTua() }
for (const L of Object.values(LOK)) { L.grup.visible = false; scene.add(L.grup) }
const MK = { kuntilanak: buatMakhluk('kuntilanak'), pocong: buatMakhluk('pocong'), bayangan: buatMakhluk('bayangan') }
for (const m of Object.values(MK)) scene.add(m.mesh)
const ojol = buatTokoh({ rambut: 'pendek', baju: '#2f8a4a', syal: null, tas: false, kulit: '#efd9bd' })
ojol.mesh.material.color.set('#c4cce4'); scene.add(ojol.mesh)

const SUSUN = [
  { lok: 'jalan', mk: 'kuntilanak', mode: 'jauh', mkPos: [-2.6, -5.5], tk: [0.6, 0.6], pose: 'lihat', eks: 'cemas', cam: [1.6, 1.3, 4.6], look: [-0.6, 1.0, -2] },
  { lok: 'rumah', mk: 'pocong', mode: 'jauh', mkPos: [-1.6, -1.4], tk: [0.9, 2.4], pose: 'takut', eks: 'cemas', cam: [1.8, 1.4, 7.4], look: [0.2, 1.2, 0], pintu: 0.8 },
  { lok: 'rumah', mk: 'kuntilanak', mode: 'depan', mkPos: [0.1, 3.6], tk: null, cam: [0, 1.6, 6.6], look: [0, 1.45, 3.6], lampu: 0.3 },
  { lok: 'jalan', mk: 'bayangan', mode: 'lewat', mkPos: [-1.8, -1.5], tk: [0.4, 0.8], pose: 'kaget', eks: 'kaget', cam: [-0.4, 1.2, 4.2], look: [-0.6, 1.1, -0.5] },
]
const out = canvas(W, H), ox = out.getContext('2d')
const grain = (() => { const c = canvas(512, 512), x = c.getContext('2d'), d = x.createImageData(512, 512), r = rng(9); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data.set([v, v, v, 28], i) } x.putImageData(d, 0, 0); return c })()
window.DUR = 8
window.renderAt = (t) => {
  const s = SUSUN[Math.min(SUSUN.length - 1, Math.floor(t / 2))]
  for (const [n, L] of Object.entries(LOK)) L.grup.visible = n === s.lok
  const L = LOK[s.lok]
  scene.fog = new THREE.Fog(L.kabut[0], L.kabut[1], L.kabut[2]); renderer.toneMappingExposure = L.exposure
  L.api.lampu(s.lampu ?? 1); if (L.api.pintu) L.api.pintu(s.pintu ?? 0)
  for (const m of Object.values(MK)) m.mesh.visible = false
  const m = MK[s.mk]; m.gambar(t, s.mode); m.mesh.visible = true
  const hop = s.mk === 'pocong' ? Math.abs(Math.sin(t * 3)) * 0.12 : s.mk === 'kuntilanak' ? 0.25 + Math.sin(t * 1.5) * 0.06 : 0
  m.mesh.position.set(s.mkPos[0] + (s.mode === 'lewat' ? (t % 2) * 1.6 : 0), hop, s.mkPos[1])
  ojol.mesh.visible = !!s.tk
  if (s.tk) { const P = hidupkan({ ...POSE[s.pose], lKa: [...POSE[s.pose].lKa], lKi: [...POSE[s.pose].lKi], kKa: [...POSE[s.pose].kKa], kKi: [...POSE[s.pose].kKi] }, t, 0); ojol.gambar(s.eks, P, [-0.6, 0]); ojol.mesh.position.set(s.tk[0], 0, s.tk[1]) }
  camera.position.set(...s.cam); camera.lookAt(...s.look)
  for (const o of [m.mesh, ojol.mesh]) o.rotation.y = Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z)
  bokeh.uniforms.focus.value = camera.position.distanceTo(s.tk ? v3(s.tk[0], 1, s.tk[1]) : v3(s.mkPos[0], 1.5, s.mkPos[1]))
  L.update(t); composer.render()
  // grading horor: dingin & sedikit pudar, grain, vignette pekat
  ox.filter = 'saturate(0.75) contrast(1.08)'; ox.drawImage(renderer.domElement, 0, 0); ox.filter = 'none'
  ox.globalCompositeOperation = 'soft-light'; ox.fillStyle = 'rgba(40,70,110,0.22)'; ox.fillRect(0, 0, W, H); ox.globalCompositeOperation = 'source-over'
  const off = Math.floor(t * 30) * 97 % 512; ox.globalAlpha = 0.9
  for (let y = -off; y < H; y += 512) for (let x = -((off * 3) % 512); x < W; x += 512) ox.drawImage(grain, x, y)
  ox.globalAlpha = 1
  const vg = ox.createRadialGradient(W / 2, H * 0.47, H * 0.18, W / 2, H * 0.5, H * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.6)')
  ox.fillStyle = vg; ox.fillRect(0, 0, W, H)
  return out.toDataURL('image/jpeg', 0.92)
}
window.SIAP = true
