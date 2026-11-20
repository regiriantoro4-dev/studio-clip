// Frame Studio: model dokumen desain, token brand, template awal.
//
// Warna boleh berupa hex (#RRGGBB) atau token brand: @primary @secondary @accent @text.
// Teks boleh berisi token: {brand} {tagline} {handle} {website} {welcome}.
// Token di-resolve dari brand preset aktif, jadi ganti preset = semua desain ikut
// berubah tanpa merusak struktur (prinsip konsistensi branding).

export const W = 1080
export const H = 1920

export const SECTIONS = [
  { id: 'header', name: 'Header' },
  { id: 'main', name: 'Video' },
  { id: 'footer', name: 'Footer' },
]

export const COLOR_TOKENS = [
  { id: '@primary', name: 'Utama' },
  { id: '@secondary', name: 'Kedua' },
  { id: '@accent', name: 'Aksen' },
  { id: '@text', name: 'Teks' },
]

export const TEXT_TOKENS = ['{brand}', '{tagline}', '{handle}', '{website}', '{welcome}', '{judul}']
// {judul} = judul per video (diisi per klip / hook), dirender server saat export
export const TITLE_TOKEN = '{judul}'
export const TITLE_SAMPLE = 'Judul video tampil di sini'

// Perkiraan area yang tertutup UI aplikasi (9:16, 1080x1920)
export const SAFE_ZONES = [
  { x: 0, y: 0, w: W, h: 150, label: 'Status bar & tab' },
  { x: 930, y: 760, w: 150, h: 760, label: 'Tombol like/komen' },
  { x: 0, y: 1560, w: W, h: 360, label: 'Caption & username' },
]

export function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function resolveColor(c, preset) {
  if (typeof c !== 'string' || !c) return 'rgba(0,0,0,0)'
  if (c.startsWith('@')) return preset?.colors?.[c.slice(1)] || '#888888'
  return c
}

export function resolveText(t, preset) {
  return String(t ?? '').replace(/\{(brand|tagline|handle|website|welcome)\}/g, (_, k) => preset?.[k] ?? '')
}

export function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] || 'B') + (w[1]?.[0] || '')).toUpperCase()
}

// ---------------------------------------------------------------- pembuat layer

export function textLayer(p = {}) {
  return {
    id: uid(), type: 'text', section: 'header', name: 'Teks',
    x: 140, y: 100, w: 800, h: 110, rotation: 0, opacity: 1, visible: true, locked: false,
    text: 'Teks baru', font: '@brand', size: 64, color: '@text', align: 'center', bold: true,
    italic: false, uppercase: false, letterSpacing: 0, lineHeight: 1.1,
    bg: '', bgOpacity: 1, radius: 0, padding: 0, stroke: '', strokeWidth: 0,
    ...TEXT_FX_NONE,
    ...ANIM_NONE,
    ...p,
  }
}

// ---- efek teks: nilai netral + gaya cepat (preset) untuk inspector
export const TEXT_FX_NONE = {
  fill2: '', shine: false,
  depth: 0, depthColor: '#000000', depthAngle: 45,
  shadowColor: '', shadowBlur: 20, shadowX: 0, shadowY: 8,
  glow: '', glowSize: 30,
  outline2: '', outline2Width: 0,
  // tahap 2: 3D realistis (dirender server, lihat needsServerFx)
  depthColor2: '', bevel: 0, bevelStrength: 70, lightAngle: 240,
  texture: '', textureStrength: 60, gloss: false,
  // gaya baru: isi gradasi khusus, neon berongga, glitch RGB
  gradType: '', fill3: '', hollow: false, glitch: 0, glitchSlices: false,
  // tahap 2 Frame Studio (17 Nov): efek TikTok, dirender server (lihat needsServerFx)
  lineBox: '', lineBoxColor: '#FFFFFF', lineBoxPad: 30, lineBoxRadius: 30, lineBoxOpacity: 100,
  marker: '', hlWords: '', hlAuto: '', hlColor: '', hlBg: '',
  longShadow: 0, longColor: '#000000', longAngle: 45, longFade: false, curve: 0,
}

// kata yang disorot otomatis (berguna untuk {judul} yang isinya berubah per video)
export const HL_AUTO = [['', 'Hanya kata yang ditulis'], ['last', 'Kata terakhir'], ['first', 'Kata pertama'], ['longest', 'Kata terpanjang']]
export const hasTikTokFx = (l) => !!(l.lineBox || l.marker || ((l.hlColor || l.hlBg) && (l.hlWords || l.hlAuto)) || l.longShadow > 0 || l.curve)

// ---- animasi teks (tahap 3): diputar di video hasil export, di kanvas teks diam
export const ANIM_NONE = { anim: '', animIn: '', animSpeed: 2, animAmount: 50 }
export const ANIMS = [
  ['', 'Diam'], ['float', 'Melayang'], ['wobble', 'Goyang'], ['pulse', 'Denyut'], ['shine', 'Kilau berjalan'],
  ['wave', 'Gelombang per huruf'], ['bounce', 'Lompat bergantian'], ['flicker', 'Neon berkedip'], ['glitch', 'Glitch berkala'],
  // gelombang 1 (17 Nov)
  ['shake', 'Getar / gemetar'], ['jitter', 'Huruf bergetar acak (horor)'], ['heartbeat', 'Detak jantung'],
  ['swing', 'Ayun bandul'], ['jelly', 'Jelly kenyal'], ['tada', 'Tada! (perhatian)'], ['breathe', 'Cahaya bernapas'],
  ['rainbow', 'Warna pelangi berjalan'], ['beat', 'Zoom ikut ketukan'], ['flip3d', 'Balik 3D berkala'],
]
// animasi masuk (sekali di awal video)
export const ANIM_INS = [
  ['', 'Tanpa'], ['pop', 'Pop-in'], ['slide', 'Masuk dari samping'], ['glitchin', 'Glitch masuk'],
  ['type', 'Ketik huruf satu-satu'], ['letters', 'Huruf pop bergiliran'], ['assemble', 'Pecah lalu menyatu'],
  // gelombang 1 (17 Nov)
  ['words', 'Kata per kata (gaya TikTok)'], ['drop', 'Jatuh lalu memantul'], ['zoomin', 'Zoom dari besar (hentak)'],
  ['blurin', 'Blur jadi fokus'], ['slideup', 'Masuk dari bawah'], ['slidedown', 'Masuk dari atas'],
  ['slideright', 'Masuk dari kanan'], ['wipe', 'Sapuan kiri ke kanan'], ['spinin', 'Putar masuk'],
  ['flip', 'Balik 3D masuk'], ['rubber', 'Membal kenyal'], ['neonon', 'Neon menyala tersendat'],
]
export const hasAnim = (l) => !!(l && (l.anim || l.animIn))

// efek yang tidak bisa digambar Konva -> pratinjau memakai renderer server (= hasil export)
export const needsServerFx = (l) => !!(l.bevel > 0 || l.texture || l.gloss || (l.depthColor2 && l.depth > 1)
  || l.gradType || (l.hollow && l.stroke && l.strokeWidth > 0) || l.glitch > 0 || hasTikTokFx(l))

export const GRAD_TYPES = [
  ['', 'Standar (atas ke bawah)'], ['horizontal', 'Ombre kiri ke kanan'], ['tri', 'Tiga warna'],
  ['chrome', 'Krom Y2K'], ['holo', 'Hologram pelangi'],
]

export const TEXTURES = [
  ['', 'Tidak ada'], ['brushed', 'Logam sikat'], ['grain', 'Butiran (batu/cat)'], ['glitter', 'Glitter'],
]

export const TEXT_STYLES = [
  { id: 'plain', name: 'Polos', fx: {} },
  { id: 'gold3d', name: 'Emas 3D', fx: { color: '#FFF1A8', fill2: '#B8860B', shine: true, stroke: '#5A3A00', strokeWidth: 3, depth: 10, depthColor: '#4A2C00', depthAngle: 90, shadowColor: '#000000', shadowBlur: 18, shadowY: 6 } },
  { id: 'chrome', name: 'Krom 3D', fx: { color: '#FFFFFF', fill2: '#5B6270', shine: true, stroke: '#111111', strokeWidth: 3, depth: 7, depthColor: '#1C1F26', depthAngle: 90, shadowColor: '#000000', shadowBlur: 14, shadowY: 4 } },
  { id: 'retro', name: 'Retro 3D', fx: { color: '#FFD100', stroke: '#000000', strokeWidth: 4, depth: 16, depthColor: '#E4007C', depthAngle: 45, outline2: '#000000', outline2Width: 4 } },
  { id: 'neon', name: 'Neon', fx: { color: '#FFFFFF', stroke: '@accent', strokeWidth: 4, glow: '@accent', glowSize: 40 } },
  { id: 'fire', name: 'Api', fx: { color: '#FFF59D', fill2: '#FF3D00', stroke: '#6D0F00', strokeWidth: 3, glow: '#FF6D00', glowSize: 32 } },
  { id: 'ice', name: 'Es', fx: { color: '#F2FCFF', fill2: '#29B6F6', stroke: '#01579B', strokeWidth: 3, glow: '#80D8FF', glowSize: 26 } },
  { id: 'sticker', name: 'Stiker komik', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 5, outline2: '#FFD100', outline2Width: 7, depth: 9, depthColor: '#000000', depthAngle: 60 } },
  { id: 'block', name: 'Blok tebal', fx: { color: '@text', stroke: '', strokeWidth: 0, depth: 22, depthColor: '@primary', depthAngle: 135 } },
  { id: 'gold_real', name: 'Emas mewah', real: true, fx: { color: '#FFF4C2', fill2: '#A8730F', shine: true, stroke: '#3D2600', strokeWidth: 5, depth: 14, depthColor: '#241400', depthColor2: '#A06C14', depthAngle: 90, shadowColor: '#000000', shadowBlur: 22, shadowY: 8, bevel: 10, bevelStrength: 80, lightAngle: 240, texture: 'brushed', textureStrength: 40 } },
  { id: 'chrome_real', name: 'Krom mewah', real: true, fx: { color: '#FFFFFF', fill2: '#4A5160', shine: true, stroke: '#0D0F14', strokeWidth: 4, depth: 12, depthColor: '#0A0C10', depthColor2: '#6B7385', depthAngle: 90, shadowColor: '#000000', shadowBlur: 18, shadowY: 6, bevel: 9, bevelStrength: 85, lightAngle: 240, texture: 'brushed', textureStrength: 55 } },
  { id: 'glitter', name: 'Emas glitter', real: true, fx: { color: '#FFE27A', fill2: '#C9A227', stroke: '#3B2A00', strokeWidth: 4, depth: 10, depthColor: '#2A1D00', depthColor2: '#8C6A10', depthAngle: 90, shadowColor: '#000000', shadowBlur: 16, shadowY: 6, bevel: 7, bevelStrength: 70, lightAngle: 240, texture: 'glitter', textureStrength: 80 } },
  { id: 'ruby', name: 'Ruby kilap', real: true, fx: { color: '#FF4D6D', fill2: '#7A0019', stroke: '#2B0008', strokeWidth: 4, depth: 12, depthColor: '#2B0008', depthColor2: '#A3132F', depthAngle: 100, shadowColor: '#000000', shadowBlur: 20, shadowY: 8, bevel: 12, bevelStrength: 75, lightAngle: 240, gloss: true } },
  { id: 'jelly', name: 'Permen jelly', real: true, fx: { color: '#7CFFB2', fill2: '#00A86B', stroke: '#003D24', strokeWidth: 4, depth: 10, depthColor: '#00261A', depthColor2: '#00804F', depthAngle: 90, shadowColor: '#000000', shadowBlur: 18, shadowY: 6, bevel: 14, bevelStrength: 70, lightAngle: 240, gloss: true } },
  { id: 'stone', name: 'Batu pahat', real: true, fx: { color: '#C9C7BD', fill2: '#6E6C64', stroke: '#2A2926', strokeWidth: 3, depth: 12, depthColor: '#1A1A18', depthColor2: '#5A5850', depthAngle: 90, shadowColor: '#000000', shadowBlur: 16, shadowY: 6, bevel: 6, bevelStrength: 90, lightAngle: 240, texture: 'grain', textureStrength: 70 } },
  { id: 'glitch', name: 'Glitch RGB', group: 'new', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 3, glitch: 7, glitchSlices: true, shadowColor: '#000000', shadowBlur: 10, shadowY: 4 } },
  { id: 'neon_tube', name: 'Neon tabung', group: 'new', fx: { color: '#FFFFFF', stroke: '#FF2BD6', strokeWidth: 12, hollow: true, glow: '#FF2BD6', glowSize: 36 } },
  { id: 'neon_tube_brand', name: 'Neon tabung (aksen)', group: 'new', fx: { color: '#FFFFFF', stroke: '@accent', strokeWidth: 12, hollow: true, glow: '@accent', glowSize: 36 } },
  { id: 'puffy', name: 'Gembung', group: 'new', fx: { color: '#FF7AC6', fill2: '#C2187A', stroke: '#FFFFFF', strokeWidth: 10, bevel: 22, bevelStrength: 85, lightAngle: 240, gloss: true, depth: 8, depthColor: '#7A0E4A', depthAngle: 90, shadowColor: '#000000', shadowBlur: 16, shadowY: 6 } },
  { id: 'y2k', name: 'Krom Y2K', group: 'new', fx: { color: '#CFE8FF', fill2: '#1B2B4A', gradType: 'chrome', stroke: '#FFFFFF', strokeWidth: 3, outline2: '#0A0F1E', outline2Width: 4, bevel: 5, bevelStrength: 70, lightAngle: 240, glow: '#9AD8FF', glowSize: 20 } },
  { id: 'holo', name: 'Hologram', group: 'new', fx: { color: '#FFFFFF', gradType: 'holo', stroke: '#3A2A6A', strokeWidth: 4, gloss: true, depth: 6, depthColor: '#2A1A4A', depthAngle: 90 } },
  { id: 'ombre', name: 'Ombre senja', group: 'new', fx: { color: '#FF6B6B', fill2: '#7A5CFF', gradType: 'horizontal', stroke: '#1A1030', strokeWidth: 4, depth: 8, depthColor: '#1A1030', depthAngle: 90 } },
  { id: 'tri', name: 'Tiga warna', group: 'new', fx: { color: '#00E5FF', fill3: '#7C4DFF', fill2: '#FF4081', gradType: 'tri', stroke: '#0D0820', strokeWidth: 4, depth: 6, depthColor: '#0D0820', depthAngle: 90 } },
  { id: 'soft', name: 'Bayangan lembut', fx: { shadowColor: '#000000', shadowBlur: 28, shadowX: 0, shadowY: 10 } },
  // ---- tahap 2: gaya konten TikTok (grup 'tiktok' -> tidak muncul di panel teks brand)
  { id: 'cap_white', name: 'Caption TikTok', group: 'tiktok', fx: { color: '#111111', lineBox: 'box', lineBoxColor: '#FFFFFF', lineBoxPad: 30, lineBoxRadius: 35 } },
  { id: 'cap_dark', name: 'Caption gelap', group: 'tiktok', fx: { color: '#FFFFFF', lineBox: 'box', lineBoxColor: '#000000', lineBoxOpacity: 72, lineBoxPad: 28, lineBoxRadius: 30 } },
  { id: 'cap_yellow', name: 'Caption kuning', group: 'tiktok', fx: { color: '#111111', lineBox: 'box', lineBoxColor: '#FFE14D', lineBoxPad: 30, lineBoxRadius: 30 } },
  { id: 'cap_brand', name: 'Caption warna brand', group: 'tiktok', fx: { color: '@primary', lineBox: 'box', lineBoxColor: '@accent', lineBoxPad: 30, lineBoxRadius: 30 } },
  { id: 'news_red', name: 'Label berita', group: 'tiktok', fx: { color: '#FFFFFF', lineBox: 'box', lineBoxColor: '#E50914', lineBoxPad: 22, lineBoxRadius: 0, shadowColor: '#000000', shadowBlur: 12, shadowY: 4 } },
  { id: 'cap_keyword', name: 'Caption + kata merah', group: 'tiktok', fx: { color: '#FFFFFF', lineBox: 'box', lineBoxColor: '#000000', lineBoxOpacity: 80, lineBoxPad: 28, lineBoxRadius: 30, hlColor: '#FF3B3B', hlAuto: 'longest' } },
  { id: 'hl_yellow', name: 'Sorot kata kuning', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 7, hlColor: '#FFE14D', hlAuto: 'last', shadowColor: '#000000', shadowBlur: 14, shadowY: 5 } },
  { id: 'hl_box', name: 'Sorot kata berkotak', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 6, hlColor: '#111111', hlBg: '#FFE14D', hlAuto: 'last' } },
  { id: 'hl_green', name: 'Sorot kata hijau', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 7, hlColor: '#3CFF6B', hlAuto: 'first' } },
  { id: 'marker_y', name: 'Stabilo kuning', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#111111', strokeWidth: 5, marker: '#FFD000' } },
  { id: 'marker_p', name: 'Stabilo pink', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#2A0016', strokeWidth: 5, marker: '#FF3EA5' } },
  { id: 'long_dark', name: 'Bayangan panjang', group: 'tiktok', fx: { color: '#FFFFFF', longShadow: 140, longColor: '#000000', longAngle: 45, longFade: true } },
  { id: 'long_retro', name: 'Retro bayangan panjang', group: 'tiktok', fx: { color: '#FFD100', stroke: '#000000', strokeWidth: 3, longShadow: 120, longColor: '#E4007C', longAngle: 45 } },
  { id: 'long_brand', name: 'Bayangan panjang brand', group: 'tiktok', fx: { color: '@text', longShadow: 120, longColor: '@primary', longAngle: 135, longFade: true } },
  { id: 'arc_up', name: 'Lengkung pelangi', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 7, curve: 45, shadowColor: '#000000', shadowBlur: 14, shadowY: 6 } },
  { id: 'arc_smile', name: 'Lengkung senyum', group: 'tiktok', fx: { color: '#FFD100', stroke: '#000000', strokeWidth: 7, curve: -45, depth: 8, depthColor: '#000000', depthAngle: 90 } },
  { id: 'die_cut', name: 'Stiker potong', group: 'tiktok', fx: { color: '#111111', stroke: '#FFFFFF', strokeWidth: 20, shadowColor: '#000000', shadowBlur: 16, shadowY: 6 } },
  { id: 'meme', name: 'Meme klasik', group: 'tiktok', fx: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 10 } },
]

export function logoLayer(p = {}) {
  return {
    id: uid(), type: 'logo', section: 'header', name: 'Logo brand',
    x: 465, y: 40, w: 150, h: 150, rotation: 0, opacity: 1, visible: true, locked: false,
    shape: 'circle', ring: '@accent', ringWidth: 6, fallbackBg: '@accent', fallbackText: '@primary',
    ...p,
  }
}

export function shapeLayer(p = {}) {
  return {
    id: uid(), type: 'shape', section: 'main', name: 'Bentuk',
    x: 390, y: 900, w: 300, h: 120, rotation: 0, opacity: 1, visible: true, locked: false,
    shape: 'rect', fill: '@accent', stroke: '', strokeWidth: 0, radius: 16,
    ...p,
  }
}

export function imageLayer(p = {}) {
  return {
    id: uid(), type: 'image', section: 'footer', name: 'Gambar',
    x: 390, y: 1500, w: 300, h: 300, rotation: 0, opacity: 1, visible: true, locked: false,
    src: '',
    ...p,
  }
}

// ---------------------------------------------------------------- template

function base(name, extra) {
  return {
    id: '', name, preset_id: 'default', frame_id: '', width: W, height: H,
    sections: { header: 330, footer: 1590 },
    background: { type: 'gradient', color1: '@primary', color2: '@secondary', angle: 180, image: '' },
    video: { x: 60, y: 330, w: 960, h: 1260, radius: 28, borderWidth: 6, borderColor: '@accent', glow: 0 },
    layers: [],
    ...extra,
  }
}

export const TEMPLATES = [
  {
    id: 'neon', name: 'Neon Futuristik',
    make: () => base('Neon Futuristik', {
      background: { type: 'gradient', color1: '#07060C', color2: '@primary', angle: 180, image: '' },
      video: { x: 70, y: 340, w: 940, h: 1230, radius: 34, borderWidth: 6, borderColor: '@accent', glow: 40 },
      layers: [
        logoLayer({ x: 70, y: 160, w: 150, h: 150 }),
        textLayer({ name: 'Nama brand', text: '{brand}', x: 245, y: 158, w: 765, h: 96, size: 80, align: 'left', uppercase: true, color: '@accent', letterSpacing: 4 }),
        textLayer({ name: 'Tagline', text: '{tagline}', x: 245, y: 254, w: 765, h: 52, size: 36, align: 'left', bold: false, color: '@text' }),
        shapeLayer({ name: 'Garis atas', section: 'header', x: 70, y: 322, w: 940, h: 5, radius: 3, fill: '@accent' }),
        textLayer({ name: 'Kotak sambutan', section: 'footer', text: '{welcome}', x: 120, y: 1620, w: 840, h: 120, size: 52, color: '@primary', bg: '@accent', radius: 60, padding: 10 }),
        textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 140, y: 1770, w: 800, h: 70, size: 44, bold: false, color: '@accent', letterSpacing: 2 }),
      ],
    }),
  },
  {
    id: 'clean', name: 'Podcast Clean',
    make: () => base('Podcast Clean', {
      background: { type: 'solid', color1: '@primary', color2: '@primary', angle: 180, image: '' },
      sections: { header: 360, footer: 1560 },
      video: { x: 0, y: 380, w: 1080, h: 1160, radius: 0, borderWidth: 0, borderColor: '@accent', glow: 0 },
      layers: [
        textLayer({ name: 'Label', text: '{tagline}', x: 60, y: 160, w: 520, h: 56, size: 32, align: 'left', color: '@primary', bg: '@accent', radius: 32, padding: 6, uppercase: true }),
        textLayer({ name: 'Nama brand', text: '{brand}', x: 60, y: 226, w: 960, h: 130, size: 96, align: 'left', color: '@text', letterSpacing: -2 }),
        shapeLayer({ name: 'Garis aksen', section: 'footer', x: 60, y: 1600, w: 160, h: 10, radius: 5, fill: '@accent' }),
        logoLayer({ section: 'footer', x: 60, y: 1660, w: 140, h: 140, ringWidth: 0 }),
        textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 230, y: 1670, w: 790, h: 70, size: 50, align: 'left', color: '@text' }),
        textLayer({ name: 'Info', section: 'footer', text: '{website}', x: 230, y: 1740, w: 790, h: 60, size: 38, align: 'left', bold: false, color: '@accent' }),
      ],
    }),
  },
  {
    id: 'elegan', name: 'Gradient Elegan',
    make: () => base('Gradient Elegan', {
      background: { type: 'gradient', color1: '@accent', color2: '@secondary', angle: 135, image: '' },
      video: { x: 90, y: 370, w: 900, h: 1190, radius: 60, borderWidth: 14, borderColor: '#FFFFFF', glow: 24 },
      layers: [
        textLayer({ name: 'Nama brand', text: '{brand}', font: 'Playfair Display', x: 90, y: 155, w: 900, h: 120, size: 92, color: '#FFFFFF', italic: true }),
        textLayer({ name: 'Tagline', text: '{tagline}', x: 90, y: 280, w: 900, h: 56, size: 34, bold: false, color: '#FFFFFF', letterSpacing: 6, uppercase: true }),
        logoLayer({ section: 'footer', x: 470, y: 1600, w: 140, h: 140, ring: '#FFFFFF' }),
        textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 140, y: 1760, w: 800, h: 70, size: 46, color: '#FFFFFF' }),
      ],
    }),
  },
  {
    id: 'royal', name: 'Royal Ornamen', preset: 'royal',
    // bingkai ukir ala UI game fantasi: list emas berlapis, permata, lambang ruby, papan nama.
    // Semua warna terikat brand (@primary bingkai, @secondary bayangan, @accent emas).
    make: () => {
      const O = '/media/assets/ornaments/'
      const darkGold = '#7A5418'
      const gem = { section: 'main', shape: 'diamond', fill: '#F0263F', fill2: '#5C0010', metal: true, stroke: '@accent', strokeWidth: 6 }
      return base('Royal Ornamen', {
        background: { type: 'gradient', color1: '@primary', color2: '@secondary', angle: 180, image: '' },
        sections: { header: 110, footer: 1500 },
        video: { x: 95, y: 110, w: 890, h: 1360, radius: 6, borderWidth: 18, borderColor: '@accent', glow: 18 },
        layers: [
          shapeLayer({ name: 'Bingkai luar', section: 'main', x: 18, y: 18, w: 1044, h: 1884, fill: '', stroke: '@accent', strokeWidth: 10, radius: 30 }),
          shapeLayer({ name: 'List dalam', section: 'main', x: 40, y: 40, w: 1000, h: 1840, fill: '', stroke: darkGold, strokeWidth: 4, radius: 22 }),
          shapeLayer({ name: 'List jendela', section: 'main', x: 70, y: 85, w: 940, h: 1410, fill: '', stroke: darkGold, strokeWidth: 6, radius: 8 }),
          shapeLayer({ ...gem, name: 'Permata kiri', x: 24, y: 730, w: 80, h: 120 }),
          shapeLayer({ ...gem, name: 'Permata kanan', x: 976, y: 730, w: 80, h: 120 }),
          imageLayer({ name: 'Ukiran kiri atas', section: 'main', src: O + 'scroll_sudut.png', x: 0, y: 0, w: 230, h: 310, tint: '@accent' }),
          imageLayer({ name: 'Ukiran kanan atas', section: 'main', src: O + 'scroll_sudut.png', x: 850, y: 0, w: 230, h: 310, tint: '@accent', flipX: true }),
          imageLayer({ name: 'Ukiran kiri bawah', section: 'footer', src: O + 'scroll_sudut.png', x: 0, y: 1610, w: 230, h: 310, tint: '@accent', flipY: true }),
          imageLayer({ name: 'Ukiran kanan bawah', section: 'footer', src: O + 'scroll_sudut.png', x: 850, y: 1610, w: 230, h: 310, tint: '@accent', flipX: true, flipY: true }),
          imageLayer({ name: 'Lambang atas', section: 'header', src: O + 'lambang_ruby.png', x: 455, y: 20, w: 170, h: 170 }),
          imageLayer({ name: 'Lambang tengah', section: 'main', src: O + 'lambang_ruby.png', x: 470, y: 1400, w: 140, h: 140 }),
          shapeLayer({ name: 'Papan nama', section: 'footer', x: 120, y: 1560, w: 840, h: 230, radius: 46, fill: '@primary', fill2: '@secondary', stroke: '@accent', strokeWidth: 8 }),
          shapeLayer({ name: 'List papan', section: 'footer', x: 140, y: 1578, w: 800, h: 194, radius: 36, fill: '', stroke: darkGold, strokeWidth: 3 }),
          imageLayer({ name: 'Hiasan papan', section: 'footer', src: O + 'acanthus.png', x: 475, y: 1765, w: 130, h: 130, tint: '@accent' }),
          textLayer({ name: 'Nama brand', section: 'footer', text: '{brand}', x: 150, y: 1592, w: 780, h: 110, size: 88, color: '#FFFFFF', uppercase: true, letterSpacing: 4, stroke: '#2A0005', strokeWidth: 6 }),
          textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 150, y: 1696, w: 780, h: 60, size: 40, bold: false, color: '@accent', letterSpacing: 2 }),
        ],
      })
    },
  },
  {
    id: 'ornamen', name: 'Frame ornamen AI',
    // cocok dengan D:\ComfyUI\buat_frame_ornamen.py: jendela video + papan teks bawah
    make: () => base('Frame ornamen AI', {
      background: { type: 'image', color1: '@primary', color2: '@secondary', angle: 180, image: '' },
      sections: { header: 107, footer: 1500 },
      video: { x: 93, y: 107, w: 894, h: 1347, radius: 0, borderWidth: 0, borderColor: '@accent', glow: 0 },
      layers: [
        textLayer({ name: 'Nama brand', section: 'footer', text: '{brand}', x: 130, y: 1545, w: 820, h: 110, size: 84, color: '#FFFFFF', uppercase: true, letterSpacing: 3, stroke: '#000000', strokeWidth: 6 }),
        textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 130, y: 1655, w: 820, h: 70, size: 44, bold: false, color: '@accent', letterSpacing: 2 }),
      ],
    }),
  },
  {
    id: 'kosong', name: 'Kosong',
    make: () => base('Desain baru', {
      layers: [textLayer({ name: 'Nama brand', text: '{brand}' })],
    }),
  },
]

// ---- tahap 3 (17 Nov): gaya bingkai jendela video. '' = garis polos lama (kode asli).
export const BORDER_STYLES = [
  ['', 'Garis polos', ''],
  ['dashed', 'Garis putus-putus', ''],
  ['dotted', 'Titik-titik', ''],
  ['double', 'Garis ganda', 'Warna kedua = garis luar.'],
  ['gradient', 'Garis gradasi', 'Warna kedua = ujung gradasi.'],
  ['neon2', 'Neon ganda', 'Warna kedua = inti neon (default putih). Atur "Efek cahaya" untuk besar pendar.'],
  ['corners', 'Sudut bidik kamera', ''],
  ['film', 'Pita film', 'Warna bingkai = lubang film, warna kedua = pita (default hitam).'],
  ['polaroid', 'Polaroid', 'Warna bingkai = kertas. Tebal bingkai = lebar tepi; tepi bawah lebih lebar untuk tulisan.'],
  ['torn', 'Kertas sobek', 'Warna bingkai = kertas.'],
  ['tape', 'Selotip di sudut', 'Warna kedua = warna selotip.'],
]
export const BORDER_COLOR2 = new Set(['double', 'gradient', 'neon2', 'film', 'tape'])

const TPL3 = { section: 'header' }
TEMPLATES.splice(TEMPLATES.length - 1, 0,
  {
    id: 'pil', name: 'Minimal pil',
    make: () => base('Minimal pil', {
      background: { type: 'solid', color1: '@primary', color2: '@primary', angle: 180, image: '' },
      sections: { header: 250, footer: 1530 },
      video: { x: 40, y: 250, w: 1000, h: 1280, radius: 48, borderWidth: 0, borderColor: '@accent', glow: 0 },
      layers: [
        textLayer({ ...TPL3, name: 'Pil username', text: '{handle}', x: 330, y: 160, w: 420, h: 66, size: 36, color: '@primary', bg: '@accent', radius: 33, padding: 6 }),
        textLayer({ name: 'Nama brand', section: 'footer', text: '{brand}', x: 140, y: 1540, w: 800, h: 50, size: 34, bold: false, color: '@text', letterSpacing: 3, uppercase: true }),
      ],
    }),
  },
  {
    id: 'pita', name: 'Pita judul',
    make: () => base('Pita judul', {
      sections: { header: 300, footer: 1520 },
      video: { x: 60, y: 300, w: 960, h: 1220, radius: 24, borderWidth: 6, borderColor: '@accent', glow: 0 },
      layers: [
        logoLayer({ x: 60, y: 140, w: 120, h: 120 }),
        textLayer({ ...TPL3, name: 'Nama brand', text: '{brand}', x: 200, y: 150, w: 820, h: 100, size: 64, align: 'left', uppercase: true, color: '@text' }),
        shapeLayer({ name: 'Pita', section: 'main', x: 30, y: 262, w: 1020, h: 120, radius: 10, fill: '#E50914', rotation: -2, stroke: '#7A0006', strokeWidth: 4 }),
        textLayer({ name: 'Judul di pita', section: 'main', text: '{judul}', fallback: '{tagline}', autoFit: true, x: 60, y: 266, w: 960, h: 100, size: 58, color: '#FFFFFF', uppercase: true, rotation: -2, shadowColor: '#000000', shadowBlur: 10, shadowY: 4 }),
      ],
    }),
  },
  {
    id: 'majalah', name: 'Sampul majalah',
    make: () => base('Sampul majalah', {
      background: { type: 'solid', color1: '#F2EDE4', color2: '#F2EDE4', angle: 180, image: '' },
      sections: { header: 330, footer: 1510 },
      video: { x: 60, y: 330, w: 960, h: 1180, radius: 0, borderWidth: 0, borderColor: '@accent', glow: 0 },
      layers: [
        textLayer({ ...TPL3, name: 'Judul majalah', text: '{brand}', font: 'Bodoni Moda', x: 40, y: 150, w: 1000, h: 175, size: 150, color: '#111111', uppercase: true, letterSpacing: -2 }),
        textLayer({ name: 'Edisi', section: 'main', text: 'EDISI {handle}', x: 90, y: 360, w: 600, h: 44, size: 28, align: 'left', color: '#FFFFFF', letterSpacing: 4, shadowColor: '#000000', shadowBlur: 10, shadowY: 3 }),
        textLayer({ name: 'Judul sampul', section: 'main', text: '{judul}', fallback: '{tagline}', autoFit: true, font: 'DM Serif Display', x: 90, y: 1230, w: 820, h: 250, size: 84, align: 'left', bold: false, color: '#FFFFFF', shadowColor: '#000000', shadowBlur: 22, shadowY: 6 }),
        textLayer({ name: 'Garis label', section: 'footer', text: '{tagline}', x: 60, y: 1522, w: 960, h: 36, size: 26, bold: false, color: '#111111', letterSpacing: 5, uppercase: true }),
      ],
    }),
  },
  {
    id: 'film', name: 'Pita film',
    make: () => base('Pita film', {
      background: { type: 'solid', color1: '#0B0B0B', color2: '#0B0B0B', angle: 180, image: '' },
      sections: { header: 300, footer: 1500 },
      video: { x: 130, y: 300, w: 820, h: 1200, radius: 0, borderWidth: 10, borderColor: '#E8E2D0', borderColor2: '#141414', borderStyle: 'film', glow: 0 },
      layers: [
        textLayer({ ...TPL3, name: 'Nama brand', text: '{brand}', font: 'Bebas Neue', x: 90, y: 150, w: 900, h: 110, size: 96, color: '#E8E2D0', letterSpacing: 10, uppercase: true }),
        textLayer({ name: 'Judul', section: 'footer', text: '{judul}', fallback: '{tagline}', autoFit: true, x: 130, y: 1512, w: 820, h: 48, size: 34, color: '#E8E2D0', letterSpacing: 2 }),
      ],
    }),
  },
  {
    id: 'neon_tepi', name: 'Neon tepi',
    make: () => base('Neon tepi', {
      background: { type: 'solid', color1: '#05040A', color2: '#05040A', angle: 180, image: '' },
      sections: { header: 40, footer: 1880 },
      video: { x: 28, y: 28, w: 1024, h: 1864, radius: 44, borderWidth: 8, borderColor: '@accent', borderStyle: 'neon2', glow: 46 },
      layers: [
        textLayer({ name: 'Nama brand', section: 'main', text: '{brand}', x: 140, y: 170, w: 800, h: 90, size: 64, color: '#FFFFFF', uppercase: true, letterSpacing: 4, stroke: '@accent', strokeWidth: 3, glow: '@accent', glowSize: 26 }),
      ],
    }),
  },
  {
    id: 'polaroid', name: 'Polaroid',
    make: () => base('Polaroid', {
      background: { type: 'gradient', color1: '@secondary', color2: '@primary', angle: 160, image: '' },
      sections: { header: 280, footer: 1340 },
      video: { x: 120, y: 280, w: 840, h: 1060, radius: 0, borderWidth: 34, borderColor: '#FFFFFF', borderColor2: 'rgba(245,230,168,0.85)', borderStyle: 'polaroid', glow: 0 },
      layers: [
        textLayer({ ...TPL3, name: 'Nama brand', text: '{brand}', x: 90, y: 140, w: 900, h: 90, size: 64, color: '@text', uppercase: true, letterSpacing: 3 }),
        textLayer({ name: 'Tulisan tangan', section: 'footer', text: '{judul}', fallback: '{tagline}', autoFit: true, font: 'Caveat', x: 130, y: 1350, w: 820, h: 92, size: 64, color: '#222222' }),
      ],
    }),
  },
  {
    id: 'sobek', name: 'Kertas sobek',
    make: () => base('Kertas sobek', {
      background: { type: 'solid', color1: '@primary', color2: '@primary', angle: 180, image: '' },
      sections: { header: 340, footer: 1480 },
      video: { x: 110, y: 340, w: 860, h: 1140, radius: 0, borderWidth: 26, borderColor: '#F5F1E8', borderStyle: 'torn', glow: 0 },
      layers: [
        textLayer({ ...TPL3, name: 'Judul stabilo', text: '{judul}', fallback: '{brand}', autoFit: true, x: 90, y: 150, w: 900, h: 130, size: 76, color: '#FFFFFF', stroke: '#111111', strokeWidth: 5, marker: '#FFD000' }),
        textLayer({ name: 'Username', section: 'footer', text: '{handle}', x: 140, y: 1530, w: 800, h: 50, size: 34, bold: false, color: '@text', letterSpacing: 2 }),
      ],
    }),
  },
  {
    id: 'rec', name: 'Kamera rekam',
    make: () => base('Kamera rekam', {
      background: { type: 'solid', color1: '#000000', color2: '#000000', angle: 180, image: '' },
      sections: { header: 190, footer: 1610 },
      video: { x: 40, y: 190, w: 1000, h: 1420, radius: 0, borderWidth: 10, borderColor: '#FFFFFF', borderStyle: 'corners', glow: 0 },
      layers: [
        textLayer({ name: 'REC', section: 'main', text: '● REC', x: 80, y: 225, w: 260, h: 70, size: 46, align: 'left', color: '#FF2D2D', font: 'VT323', bold: false, shadowColor: '#000000', shadowBlur: 8, shadowY: 2 }),
        textLayer({ name: 'Username', section: 'main', text: '{handle}', x: 420, y: 225, w: 470, h: 70, size: 42, align: 'right', color: '#FFFFFF', font: 'VT323', bold: false, shadowColor: '#000000', shadowBlur: 8, shadowY: 2 }),
        textLayer({ name: 'Nama brand', section: 'header', text: '{brand}', x: 140, y: 80, w: 800, h: 90, size: 60, color: '#FFFFFF', uppercase: true, letterSpacing: 6 }),
      ],
    }),
  },
)

export const ORNAMENTS =['scroll_sudut', 'lambang_ruby', 'acanthus', 'pusaran'].map((n) => `/media/assets/ornaments/${n}.png`)

export function presetFor(tpl, presets) {
  return tpl.preset && presets.some((p) => p.id === tpl.preset) ? tpl.preset : (presets[0]?.id || 'default')
}

export function newPreset() {
  return {
    id: '', name: 'Preset baru', brand: 'Nama Brand', tagline: 'Tagline brand', handle: '@akunmu',
    website: '', welcome: 'Selamat menonton!', logo: '', font: 'Space Grotesk',
    colors: { primary: '#111418', secondary: '#2A2F3A', accent: '#3BE8B0', text: '#FFFFFF' },
  }
}
