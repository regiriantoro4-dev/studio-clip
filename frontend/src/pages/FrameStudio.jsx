import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import StudioCanvas, { waitTextFx } from '../studio/StudioCanvas.jsx'
import AnimControls from '../components/AnimControls.jsx'
import FontPicker from '../components/FontPicker.jsx'
import TextStyleGallery from '../components/TextStyleGallery.jsx'
import TikTokFxControls from '../components/TikTokFxControls.jsx'
import AcakGaya from '../components/AcakGaya.jsx'
import {
  BORDER_COLOR2, BORDER_STYLES, COLOR_TOKENS, GRAD_TYPES, H, ORNAMENTS, hasAnim, SECTIONS, TEMPLATES, TEXTURES, TEXT_TOKENS, TITLE_SAMPLE, TITLE_TOKEN, W, presetFor,
  resolveColor, resolveText,
  imageLayer, logoLayer, newPreset, shapeLayer, textLayer, uid,
} from '../studio/model.js'

const clone = (o) => JSON.parse(JSON.stringify(o))
const TYPE_NAMES = { text: 'Teks', logo: 'Logo', shape: 'Bentuk', image: 'Gambar' }

// ---------------------------------------------------------------- font: sama persis dengan backend
let fontsPromise = null
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = api('/api/studio/fonts').then(async (map) => {
      await Promise.all(Object.entries(map).map(async ([name, url]) => {
        try {
          const ff = new FontFace(name, `url(${url})`, { weight: '100 900' })
          await ff.load()
          document.fonts.add(ff)
        } catch { /* font gagal -> pakai fallback */ }
      }))
      return Object.keys(map)
    })
  }
  return fontsPromise
}

async function uploadAsset(file) {
  const fd = new FormData()
  fd.append('file', file)
  return (await api('/api/studio/assets', { method: 'POST', body: fd })).url
}

// Frame jadi (PNG dengan jendela transparan) dipakai sebagai latar: cari kotak area
// transparan di skala desain 1080x1920 (gambar di-cover seperti di kanvas).
function detectHole(url) {
  return new Promise((resolve) => {
    const im = new window.Image()
    im.onload = () => {
      const cw = 270, ch = 480
      const c = document.createElement('canvas')
      c.width = cw; c.height = ch
      const ctx = c.getContext('2d')
      const s = Math.max(cw / im.width, ch / im.height)
      ctx.drawImage(im, (cw - im.width * s) / 2, (ch - im.height * s) / 2, im.width * s, im.height * s)
      const a = ctx.getImageData(0, 0, cw, ch).data
      // hitung piksel transparan per baris/kolom; ambil yang mayoritas transparan
      // (piksel transparan kecil di ornamen tidak ikut memperbesar kotak)
      const rows = new Array(ch).fill(0), cols = new Array(cw).fill(0)
      let n = 0
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (a[(y * cw + x) * 4 + 3] < 20) { n++; rows[y]++; cols[x]++ }
      }
      if (n < cw * ch * 0.08) return resolve(null)
      const rmax = Math.max(...rows), cmax = Math.max(...cols)
      const ys = rows.map((v, i) => (v > rmax * 0.6 ? i : -1)).filter((i) => i >= 0)
      const xs = cols.map((v, i) => (v > cmax * 0.6 ? i : -1)).filter((i) => i >= 0)
      const x0 = xs[0], x1 = xs[xs.length - 1], y0 = ys[0], y1 = ys[ys.length - 1]
      const k = W / cw
      resolve({ x: Math.round(x0 * k), y: Math.round(y0 * k), w: Math.round((x1 - x0 + 1) * k), h: Math.round((y1 - y0 + 1) * k) })
    }
    im.onerror = () => resolve(null)
    im.src = url
  })
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: head.match(/:(.*?);/)[1] })
}

// ---------------------------------------------------------------- frame jadi -> desain

const COLOR_KEYS = ['color', 'fill2', 'fill3', 'stroke', 'bg', 'depthColor', 'depthColor2', 'shadowColor', 'glow', 'outline2',
  'lineBoxColor', 'marker', 'hlColor', 'hlBg', 'longColor'] // baris 2: efek TikTok (tahap 2)
const isTitleLayer = (l) => l.type === 'text' && l.visible !== false && String(l.text || '').includes(TITLE_TOKEN)
// layer {judul} & layer beranimasi tidak dibakar ke PNG: dirender server per video
const isDynLayer = (l) => isTitleLayer(l) || (l.type === 'text' && l.visible !== false && hasAnim(l))

// layer {judul} -> spesifikasi siap render server (warna/font/token brand sudah diselesaikan)
function dynamicSpec(l, preset) {
  const out = { ...l, text: resolveText(l.text, preset), fallback: resolveText(l.fallback ?? '{tagline}', preset),
    font: l.font === '@brand' || !l.font ? (preset?.font || 'Space Grotesk') : l.font, autoFit: l.autoFit !== false }
  for (const k of COLOR_KEYS) out[k] = l[k] ? resolveColor(l[k], preset) : ''
  return out
}

function darken(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#1A1000'
  const n = parseInt(m[1], 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0'))
  return '#' + c.join('')
}

// Frame jadi (ornamen AI / upload) dibuka sebagai latar, plus layer brand & judul di papannya
function designFromFrame(f) {
  const [fw, fh] = f.size || [W, H]
  const s = Math.max(W / fw, H / fh)
  const ox = (fw * s - W) / 2, oy = (fh * s - H) / 2
  const [wx, wy, ww, wh] = f.win
  const video = { x: Math.round(wx * s - ox), y: Math.round(wy * s - oy), w: Math.round(ww * s), h: Math.round(wh * s),
    radius: 0, borderWidth: 0, borderColor: '@accent', glow: 0 }
  const vb = video.y + video.h
  const [bx0, by0, bx1, by1] = f.board
    ? f.board.map((v, i) => Math.round(v * s - (i % 2 ? oy : ox)))
    : [90, Math.min(H - 300, vb + 30), W - 90, H - 60]
  const bw = bx1 - bx0, bh = by1 - by0
  const ix = bw * 0.08, iy = bh * 0.1
  const x = Math.round(bx0 + ix), w = Math.round(bw - 2 * ix)
  const top = by0 + iy, ch = bh - 2 * iy
  const accent = f.accent || '#F2C66D'
  const dark = darken(accent, 0.2)
  const bh1 = Math.round(ch * 0.56), bh2 = Math.round(ch * 0.44)
  return {
    id: '', name: `${f.name} (edit)`.slice(0, 40), preset_id: 'default', frame_id: '', width: W, height: H,
    source_frame: f.id,
    sections: { header: Math.max(40, video.y), footer: Math.min(H - 40, vb) },
    background: { type: 'image', color1: '@primary', color2: '@secondary', angle: 180, image: `${f.url}?v=${f.v || 0}` },
    video,
    layers: [
      textLayer({ name: 'Nama brand', section: 'footer', text: '{brand}', x, y: Math.round(top), w, h: bh1,
        size: Math.round(bh1 * 0.78), uppercase: true, letterSpacing: 3, color: '#FFFFFF', fill2: accent, shine: true,
        stroke: dark, strokeWidth: 5, depth: 6, depthColor: dark, depthAngle: 90, shadowColor: '#000000', shadowBlur: 14, shadowY: 4 }),
      textLayer({ name: 'Judul video', section: 'footer', text: TITLE_TOKEN, x, y: Math.round(top + bh1), w, h: bh2,
        size: Math.round(bh2 * 0.5), color: '#FFFFFF', stroke: '#000000', strokeWidth: 6, fallback: '{tagline}', autoFit: true }),
    ],
  }
}

// ---------------------------------------------------------------- input kecil

function Num({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="fs-num">
      <span>{label}</span>
      <input className="input" type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </label>
  )
}

function ColorField({ label, value, onChange, allowNone }) {
  const isToken = typeof value === 'string' && value.startsWith('@')
  const mode = !value ? 'none' : isToken ? value : 'custom'
  return (
    <div className="fs-color">
      <span>{label}</span>
      <select className="select" value={mode} onChange={(e) => {
        const m = e.target.value
        onChange(m === 'none' ? '' : m === 'custom' ? (isToken || !value ? '#FFFFFF' : value) : m)
      }}>
        {allowNone && <option value="none">Tidak ada</option>}
        {COLOR_TOKENS.map((t) => <option key={t.id} value={t.id}>Brand: {t.name}</option>)}
        <option value="custom">Warna sendiri</option>
      </select>
      {mode === 'custom' && <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label}, warna sendiri`} />}
    </div>
  )
}

// ---------------------------------------------------------------- inspector

function TextEffects({ l, set, preset }) {
  const [open, setOpen] = useState(false)
  const has = !!(l.fill2 || l.depth || l.shadowColor || l.glow || l.outline2 || l.bevel || l.texture || l.gloss || l.gradType || l.hollow || l.glitch)
  return (
    <div className="fs-fx">
      <div className="field">
        <label>Gaya cepat (efek)</label>
        {/* tahap 2: galeri bergambar; nilai yang diterapkan sama dengan tombol gaya lama */}
        <TextStyleGallery font={l.font === '@brand' || !l.font ? (preset?.font || 'Space Grotesk') : l.font} preset={preset} onApply={set} />
      </div>
      <button type="button" className="btn btn-sm btn-ghost fs-fx-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Atur efek 3D, gradasi &amp; cahaya{has && !open ? ' (aktif)' : ''}
      </button>
      {open && (
        <>
          <label className="fs-num">
            <span>Gaya isi teks</span>
            <select className="select" value={l.gradType || ''} onChange={(e) => set({ gradType: e.target.value })}>
              {GRAD_TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
          <ColorField label={l.gradType === 'horizontal' ? 'Gradasi: warna kanan' : 'Gradasi: warna bawah'} value={l.fill2} allowNone onChange={(fill2) => set({ fill2 })} />
          {l.gradType === 'tri' && <ColorField label="Warna tengah" value={l.fill3 || '#7C4DFF'} onChange={(fill3) => set({ fill3 })} />}
          <div className="fs-checks">
            <label><input type="checkbox" checked={!!l.hollow} onChange={(e) => set({ hollow: e.target.checked, ...(e.target.checked && !l.stroke ? { stroke: '#FF2BD6', strokeWidth: 10 } : {}) })} /> Berongga (neon tabung)</label>
            <label><input type="checkbox" checked={!!l.glitchSlices} onChange={(e) => set({ glitchSlices: e.target.checked, glitch: l.glitch || 6 })} /> Potongan glitch</label>
          </div>
          <Num label="Glitch RGB (geser px, 0 = mati)" value={l.glitch || 0} min={0} max={30} onChange={(glitch) => set({ glitch: Math.max(0, Math.min(30, glitch)) })} />
          {l.fill2 && <div className="fs-checks"><label><input type="checkbox" checked={!!l.shine} onChange={(e) => set({ shine: e.target.checked })} /> Kilau metalik</label></div>}
          <div className="fs-grid2">
            <Num label="Tebal 3D" value={l.depth} min={0} max={80} onChange={(depth) => set({ depth: Math.max(0, Math.min(80, depth)) })} />
            <Num label="Arah 3D (°)" value={l.depthAngle ?? 45} onChange={(depthAngle) => set({ depthAngle })} />
          </div>
          {l.depth > 0 && <ColorField label="Warna sisi 3D (belakang)" value={l.depthColor || '#000000'} onChange={(depthColor) => set({ depthColor })} />}
          {l.depth > 1 && <ColorField label="Sisi 3D bergradasi: warna dekat muka" value={l.depthColor2} allowNone onChange={(depthColor2) => set({ depthColor2 })} />}
          <div className="fs-fx-real">
            <b>3D realistis</b>
            <div className="fs-grid2">
              <Num label="Bevel (timbul)" value={l.bevel || 0} min={0} max={40} onChange={(bevel) => set({ bevel: Math.max(0, Math.min(40, bevel)) })} />
              <Num label="Kekuatan bevel" value={l.bevelStrength ?? 70} min={0} max={100} onChange={(bevelStrength) => set({ bevelStrength })} />
            </div>
            <div className="fs-grid2">
              <Num label="Arah cahaya (°)" value={l.lightAngle ?? 240} min={0} max={359} onChange={(lightAngle) => set({ lightAngle: ((lightAngle % 360) + 360) % 360 })} />
              <label className="fs-num">
                <span>Tekstur</span>
                <select className="select" value={l.texture || ''} onChange={(e) => set({ texture: e.target.value })}>
                  {TEXTURES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </label>
            </div>
            {l.texture && <Num label="Kekuatan tekstur" value={l.textureStrength ?? 60} min={0} max={100} onChange={(textureStrength) => set({ textureStrength })} />}
            <div className="fs-checks"><label><input type="checkbox" checked={!!l.gloss} onChange={(e) => set({ gloss: e.target.checked })} /> Kilap kaca</label></div>
            <span className="hint">Arah cahaya 240° = dari kiri atas, 270° = dari atas.</span>
          </div>
          <ColorField label="Garis tepi luar" value={l.outline2} allowNone onChange={(outline2) => set({ outline2, outline2Width: outline2 ? (l.outline2Width || 6) : 0 })} />
          {l.outline2 && <Num label="Tebal garis luar" value={l.outline2Width} min={0} onChange={(outline2Width) => set({ outline2Width })} />}
          <ColorField label="Cahaya (glow)" value={l.glow} allowNone onChange={(glow) => set({ glow })} />
          {l.glow && <Num label="Besar cahaya" value={l.glowSize ?? 30} min={0} onChange={(glowSize) => set({ glowSize })} />}
          <ColorField label="Bayangan" value={l.shadowColor} allowNone onChange={(shadowColor) => set({ shadowColor })} />
          {l.shadowColor && (
            <div className="fs-grid4">
              <Num label="Blur" value={l.shadowBlur ?? 20} min={0} onChange={(shadowBlur) => set({ shadowBlur })} />
              <Num label="Geser X" value={l.shadowX ?? 0} onChange={(shadowX) => set({ shadowX })} />
              <Num label="Geser Y" value={l.shadowY ?? 8} onChange={(shadowY) => set({ shadowY })} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LayerInspector({ l, fonts, set, assets, onUploadImage, preset, onFontAdded }) {
  return (
    <>
      <div className="field">
        <label>Nama layer</label>
        <input className="input" value={l.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="field">
        <label>Section</label>
        <select className="select" value={l.section} onChange={(e) => set({ section: e.target.value })}>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="fs-grid4">
        <Num label="X" value={l.x} onChange={(x) => set({ x })} />
        <Num label="Y" value={l.y} onChange={(y) => set({ y })} />
        <Num label="Lebar" value={l.w} onChange={(w) => set({ w: Math.max(4, w) })} />
        <Num label="Tinggi" value={l.h} onChange={(h) => set({ h: Math.max(4, h) })} />
      </div>
      <div className="fs-grid2">
        <Num label="Rotasi" value={l.rotation} onChange={(rotation) => set({ rotation })} />
        <Num label="Opasitas %" value={Math.round((l.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v / 100)) })} />
      </div>

      {l.type === 'text' && (
        <>
          <div className="field">
            <label>Isi teks</label>
            <textarea className="input" rows={2} value={l.text} onChange={(e) => set({ text: e.target.value })} />
            <span className="hint">Token brand: {TEXT_TOKENS.map((t) => (
              <button key={t} type="button" className="fs-token" onClick={() => set({ text: (l.text || '') + t })}>{t}</button>
            ))}</span>
          </div>
          {String(l.text || '').includes(TITLE_TOKEN) && (
            <div className="fs-title-box">
              <p className="hint" style={{ marginTop: 0 }}><b>{TITLE_TOKEN}</b> diganti judul tiap video: isian "Judul di frame" di Studio, atau hook klip.</p>
              <div className="field">
                <label>Contoh judul (hanya pratinjau)</label>
                <input className="input" value={l.sample || ''} placeholder={TITLE_SAMPLE} onChange={(e) => set({ sample: e.target.value })} />
              </div>
              <div className="field">
                <label>Kalau video tanpa judul, tampilkan</label>
                <input className="input" value={l.fallback ?? '{tagline}'} onChange={(e) => set({ fallback: e.target.value })} />
              </div>
              <div className="fs-checks">
                <label><input type="checkbox" checked={l.autoFit !== false} onChange={(e) => set({ autoFit: e.target.checked })} /> Kecilkan otomatis kalau judul panjang</label>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor={`fp-${l.id}`}>Font</label>
            <FontPicker id={`fp-${l.id}`} value={l.font} onChange={(font) => set({ font })} fonts={fonts} allowBrand
              brandFont={preset?.font || ''} sample={resolveText(l.text, preset).replace(TITLE_TOKEN, l.sample || TITLE_SAMPLE)}
              onFontAdded={onFontAdded} />
          </div>
          <div className="fs-grid2">
            <Num label="Ukuran" value={l.size} min={8} onChange={(size) => set({ size: Math.max(8, size) })} />
            <Num label="Spasi huruf" value={l.letterSpacing} onChange={(letterSpacing) => set({ letterSpacing })} />
          </div>
          <div className="fs-checks">
            <label><input type="checkbox" checked={!!l.bold} onChange={(e) => set({ bold: e.target.checked })} /> Tebal</label>
            <label><input type="checkbox" checked={!!l.italic} onChange={(e) => set({ italic: e.target.checked })} /> Miring</label>
            <label><input type="checkbox" checked={!!l.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /> Kapital</label>
          </div>
          <div className="seg fs-seg" role="group" aria-label="Rata teks">
            {[['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']].map(([a, n]) => (
              <button key={a} type="button" className={`btn btn-sm ${l.align === a ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set({ align: a })}>{n}</button>
            ))}
          </div>
          <ColorField label="Warna teks" value={l.color} onChange={(color) => set({ color })} />
          <ColorField label="Garis tepi teks" value={l.stroke} allowNone onChange={(stroke) => set({ stroke, strokeWidth: stroke ? (l.strokeWidth || 4) : 0 })} />
          {l.stroke && <Num label="Tebal garis tepi" value={l.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />}
          <TextEffects l={l} set={set} preset={preset} />
          <TikTokFxControls l={l} set={set} Num={Num} ColorField={ColorField} />
          <AnimControls value={l} onChange={set} spec={dynamicSpec(l, preset)}
            text={resolveText(String(l.text ?? '').split(TITLE_TOKEN).join(l.sample || TITLE_SAMPLE), preset)} />
          <ColorField label="Kotak teks (latar)" value={l.bg} allowNone onChange={(bg) => set({ bg })} />
          {l.bg && (
            <div className="fs-grid2">
              <Num label="Sudut kotak" value={l.radius} min={0} onChange={(radius) => set({ radius })} />
              <Num label="Opasitas kotak %" value={Math.round((l.bgOpacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set({ bgOpacity: v / 100 })} />
            </div>
          )}
        </>
      )}

      {l.type === 'logo' && (
        <>
          <div className="field">
            <label>Bentuk logo</label>
            <select className="select" value={l.shape} onChange={(e) => set({ shape: e.target.value })}>
              <option value="circle">Lingkaran</option>
              <option value="rounded">Kotak sudut bulat</option>
              <option value="square">Kotak</option>
              <option value="none">Apa adanya (tanpa potong)</option>
            </select>
          </div>
          <ColorField label="Cincin logo" value={l.ring} onChange={(ring) => set({ ring })} />
          <Num label="Tebal cincin" value={l.ringWidth} min={0} onChange={(ringWidth) => set({ ringWidth })} />
          <p className="hint">Gambar logo diambil dari brand preset (tab Brand). Kalau kosong, tampil inisial brand.</p>
        </>
      )}

      {l.type === 'shape' && (
        <>
          <div className="field">
            <label>Jenis</label>
            <select className="select" value={l.shape} onChange={(e) => set({ shape: e.target.value })}>
              <option value="rect">Kotak / garis</option>
              <option value="circle">Lingkaran / elips</option>
              <option value="diamond">Permata (belah ketupat)</option>
            </select>
          </div>
          <ColorField label="Isi" value={l.fill} allowNone onChange={(fill) => set({ fill })} />
          {l.fill && <ColorField label="Gradasi ke" value={l.fill2} allowNone onChange={(fill2) => set({ fill2 })} />}
          {l.fill && l.fill2 && (
            <div className="fs-checks"><label><input type="checkbox" checked={!!l.metal} onChange={(e) => set({ metal: e.target.checked })} /> Efek logam mengkilap</label></div>
          )}
          <ColorField label="Garis tepi" value={l.stroke} allowNone onChange={(stroke) => set({ stroke, strokeWidth: stroke ? (l.strokeWidth || 4) : 0 })} />
          <div className="fs-grid2">
            {l.stroke && <Num label="Tebal garis" value={l.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />}
            {l.shape === 'rect' && <Num label="Sudut" value={l.radius} min={0} onChange={(radius) => set({ radius })} />}
          </div>
        </>
      )}

      {l.type === 'image' && (
        <>
          <div className="field">
            <label>Gambar (ornamen, karakter, stiker)</label>
            <label className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start' }}>
              Upload gambar
              <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={(e) => { onUploadImage(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          <div className="fs-checks">
            <label><input type="checkbox" checked={!!l.flipX} onChange={(e) => set({ flipX: e.target.checked })} /> Cermin kiri-kanan</label>
            <label><input type="checkbox" checked={!!l.flipY} onChange={(e) => set({ flipY: e.target.checked })} /> Cermin atas-bawah</label>
          </div>
          <ColorField label="Warnai ulang (ikut warna brand)" value={l.tint} allowNone onChange={(tint) => set({ tint })} />
          <span className="lbl-sm">Ornamen bawaan</span>
          <div className="fs-assets" aria-label="Ornamen bawaan">
            {ORNAMENTS.map((a) => (
              <button key={a} type="button" className={l.src === a ? 'is-on' : ''} onClick={() => set({ src: a })}>
                <img src={a} alt="" />
              </button>
            ))}
          </div>
          {assets.length > 0 && (
            <div className="fs-assets" aria-label="Gambar yang pernah diupload">
              {assets.map((a) => (
                <button key={a} type="button" className={l.src === a ? 'is-on' : ''} onClick={() => set({ src: a })}>
                  <img src={a} alt="" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function VideoInspector({ v, set }) {
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>Geser dan tarik sudut kotak video di kanvas, atau isi angkanya di sini. Video diisi penuh (dipotong dari tengah) seperti hasil export.</p>
      <div className="fs-grid4">
        <Num label="X" value={v.x} onChange={(x) => set({ x })} />
        <Num label="Y" value={v.y} onChange={(y) => set({ y })} />
        <Num label="Lebar" value={v.w} onChange={(w) => set({ w: Math.max(80, w) })} />
        <Num label="Tinggi" value={v.h} onChange={(h) => set({ h: Math.max(80, h) })} />
      </div>
      <div className="fs-presets">
        <span className="lbl-sm">Ukuran cepat</span>
        <div className="fs-row-wrap">
          {[['Penuh', { x: 0, y: 0, w: W, h: H }], ['4:5 tengah', { x: 60, y: 285, w: 960, h: 1200 }], ['1:1', { x: 60, y: 420, w: 960, h: 960 }], ['16:9', { x: 0, y: 656, w: 1080, h: 608 }]].map(([n, p]) => (
            <button key={n} type="button" className="btn btn-sm btn-ghost" onClick={() => set(p)}>{n}</button>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ x: Math.round((W - v.w) / 2) })}>Tengahkan</button>
        </div>
      </div>
      <Num label="Sudut membulat" value={v.radius} min={0} onChange={(radius) => set({ radius })} />
      {/* tahap 3: gaya bingkai; '' = garis polos lama */}
      <label className="fs-num">
        <span>Gaya bingkai</span>
        <select className="select" value={v.borderStyle || ''} onChange={(e) => {
          const borderStyle = e.target.value
          const paper = ['polaroid', 'torn'].includes(borderStyle)
          set({ borderStyle,
            ...(borderStyle && !v.borderWidth ? { borderWidth: paper ? 30 : 8 } : {}),
            ...(paper ? { borderColor: borderStyle === 'torn' ? '#F5F1E8' : '#FFFFFF' } : {}) })
        }}>
          {BORDER_STYLES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </label>
      {BORDER_STYLES.find(([id]) => id === (v.borderStyle || ''))?.[2] && (
        <span className="hint">{BORDER_STYLES.find(([id]) => id === (v.borderStyle || ''))[2]}</span>
      )}
      <Num label="Tebal bingkai" value={v.borderWidth} min={0} onChange={(borderWidth) => set({ borderWidth })} />
      <ColorField label="Warna bingkai" value={v.borderColor} onChange={(borderColor) => set({ borderColor })} />
      {BORDER_COLOR2.has(v.borderStyle) && (
        <ColorField label="Warna kedua" value={v.borderColor2 || ''} allowNone onChange={(borderColor2) => set({ borderColor2 })} />
      )}
      <Num label="Efek cahaya (glow)" value={v.glow} min={0} max={120} onChange={(glow) => set({ glow })} />
    </>
  )
}

function BackgroundInspector({ design, setDesign, onUploadBg }) {
  const bg = design.background
  const setBg = (p) => setDesign((d) => ({ ...d, background: { ...d.background, ...p } }))
  return (
    <>
      <div className="seg fs-seg" role="group" aria-label="Jenis latar">
        {[['solid', 'Polos'], ['gradient', 'Gradasi'], ['image', 'Gambar']].map(([t, n]) => (
          <button key={t} type="button" className={`btn btn-sm ${bg.type === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBg({ type: t })}>{n}</button>
        ))}
      </div>
      {bg.type !== 'image' && <ColorField label={bg.type === 'gradient' ? 'Warna atas' : 'Warna'} value={bg.color1} onChange={(color1) => setBg({ color1 })} />}
      {bg.type === 'gradient' && (
        <>
          <ColorField label="Warna bawah" value={bg.color2} onChange={(color2) => setBg({ color2 })} />
          <Num label="Arah (derajat)" value={bg.angle} onChange={(angle) => setBg({ angle })} />
        </>
      )}
      {bg.type === 'image' && (
        <label className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start' }}>
          {bg.image ? 'Ganti gambar latar' : 'Upload gambar latar'}
          <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={(e) => { onUploadBg(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      )}
      <span className="lbl-sm" style={{ marginTop: 12 }}>Batas section (garis bantu kuning)</span>
      <div className="fs-grid2">
        <Num label="Akhir header (Y)" value={design.sections.header} onChange={(header) => setDesign((d) => ({ ...d, sections: { ...d.sections, header } }))} />
        <Num label="Awal footer (Y)" value={design.sections.footer} onChange={(footer) => setDesign((d) => ({ ...d, sections: { ...d.sections, footer } }))} />
      </div>
    </>
  )
}

function BrandInspector({ presets, preset, presetId, onPick, onChange, onSave, onNew, onDelete, fonts, dirty, onFontAdded }) {
  const set = (p) => onChange({ ...preset, ...p })
  const setC = (k, v) => onChange({ ...preset, colors: { ...preset.colors, [k]: v } })
  const uploadLogo = async (f) => { if (f) set({ logo: await uploadAsset(f) }) }
  return (
    <>
      <div className="field">
        <label>Brand preset dipakai desain ini</label>
        <select className="select" value={presetId} onChange={(e) => onPick(e.target.value)}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="fs-row-wrap" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onNew}>Preset baru</button>
        <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={onDelete} disabled={presets.length < 2}>Hapus preset</button>
      </div>
      <div className="field"><label>Nama preset</label><input className="input" value={preset.name} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="field"><label>Nama brand {'{brand}'}</label><input className="input" value={preset.brand} onChange={(e) => set({ brand: e.target.value })} /></div>
      <div className="field"><label>Tagline {'{tagline}'}</label><input className="input" value={preset.tagline} onChange={(e) => set({ tagline: e.target.value })} /></div>
      <div className="field"><label>Username {'{handle}'}</label><input className="input" value={preset.handle} onChange={(e) => set({ handle: e.target.value })} /></div>
      <div className="field"><label>Info tambahan {'{website}'}</label><input className="input" value={preset.website} placeholder="Link, jadwal live, dll." onChange={(e) => set({ website: e.target.value })} /></div>
      <div className="field"><label>Teks sambutan {'{welcome}'}</label><input className="input" value={preset.welcome} onChange={(e) => set({ welcome: e.target.value })} /></div>
      <div className="field">
        <label htmlFor="fp-brand">Font brand</label>
        <FontPicker id="fp-brand" value={preset.font} onChange={(font) => set({ font })} fonts={fonts}
          sample={preset.brand} onFontAdded={onFontAdded} />
      </div>
      <div className="fs-colors4">
        {[['primary', 'Utama'], ['secondary', 'Kedua'], ['accent', 'Aksen'], ['text', 'Teks']].map(([k, n]) => (
          <label key={k}>{n}<input type="color" value={preset.colors[k]} onChange={(e) => setC(k, e.target.value)} /></label>
        ))}
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Logo brand</label>
        <div className="fs-row-wrap">
          {preset.logo && <img src={preset.logo} alt="Logo brand" className="fs-logo-prev" />}
          <label className="btn btn-sm btn-ghost">
            {preset.logo ? 'Ganti logo' : 'Upload logo'}
            <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {preset.logo && <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ logo: '' })}>Pakai inisial</button>}
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={!dirty}>
        {dirty ? 'Simpan preset' : 'Preset tersimpan'}
      </button>
      <p className="hint">Preset dipakai bersama oleh semua desain. Desain lain yang memakai preset ini ikut berubah.</p>
    </>
  )
}

// ---------------------------------------------------------------- daftar desain

function DesignList({ designs, presets, onOpen, onNew, onDelete, onDuplicate, fontsVersion, frames, onFrame }) {
  const preset = presets[0]
  return (
    <div className="page">
      <div className="page-head">
        <h1>Frame Studio</h1>
        <p>Desain bingkai video bermerek: logo, teks, warna, dan ornamen bisa diedit per bagian. Simpan sebagai template, lalu pakai berulang untuk video-videomu.</p>
      </div>

      <h2 className="card-title">Mulai dari template</h2>
      <div className="fs-cards">
        {TEMPLATES.map((t) => {
          const d = t.make()
          return (
            <button key={t.id} type="button" className="fs-card" onClick={() => onNew(t)}>
              <div className="fs-card-canvas">
                {preset && <StudioCanvas design={d} preset={preset} selected={null} onSelect={() => {}} onChangeLayer={() => {}}
                  onChangeVideo={() => {}} displayH={300} fontsVersion={fontsVersion} />}
              </div>
              <span>{t.name}</span>
            </button>
          )
        })}
      </div>

      {frames.length > 0 && (
        <>
          <h2 className="card-title" style={{ marginTop: 32 }}>Edit frame jadi</h2>
          <p className="hint" style={{ marginTop: -4 }}>Pilih frame, termasuk frame ornamen. Brand dan judulnya bisa diatur bebas: font, efek 3D, posisi.</p>
          <div className="fs-frames">
            {frames.map((f) => (
              <button key={f.id} type="button" className="fs-frame" onClick={() => onFrame(f)} title={f.name}>
                <img src={`${f.url}?v=${f.v || 0}`} alt="" loading="lazy" />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="card-title" style={{ marginTop: 32 }}>Desain tersimpan</h2>
      {!designs.length ? (
        <p className="hint">Belum ada desain. Pilih template di atas untuk mulai.</p>
      ) : (
        <div className="fs-cards">
          {designs.map((d) => (
            <div key={d.id} className="fs-card">
              <button type="button" className="fs-card-open" onClick={() => onOpen(d.id)} aria-label={`Buka ${d.name}`}>
                {d.thumb ? <img src={`${d.thumb}?v=${d.updated_at}`} alt="" /> : <div className="fs-card-canvas" />}
                <span>{d.name}</span>
              </button>
              <div className="fs-card-actions">
                {d.frame_id && <span className="fs-badge">Dipakai di Studio Clip</span>}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onDuplicate(d.id)}>Duplikat</button>
                <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => onDelete(d)}>Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- halaman

export default function FrameStudio() {
  const nav = useNavigate()
  const canvasRef = useRef()
  const wrapRef = useRef()
  const mp4Ref = useRef()
  const [view, setView] = useState('list')
  const [designs, setDesigns] = useState([])
  const [presets, setPresets] = useState([])
  const [fonts, setFonts] = useState([])
  const [fontsVersion, setFontsVersion] = useState(0)
  const [assets, setAssets] = useState([])
  const [frameList, setFrameList] = useState([])

  const [design, setDesignRaw] = useState(null)
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('item')
  const [presetDraft, setPresetDraft] = useState(null)
  const [presetDirty, setPresetDirty] = useState(false)
  const [showGuides, setShowGuides] = useState(true)
  const [showSafe, setShowSafe] = useState(false)
  const [videoEl, setVideoEl] = useState(null)
  const [videoFile, setVideoFile] = useState(null)
  const [displayH, setDisplayH] = useState(640)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const refreshList = useCallback(() => {
    api('/api/studio/designs').then((r) => setDesigns(r.designs || [])).catch(() => {})
    // frame jadi selain hasil Frame Studio (yang itu sudah ada di "Desain tersimpan")
    api('/api/frames').then((r) => setFrameList((r.frames || []).filter((f) => f.source !== 'studio'))).catch(() => {})
  }, [])

  useEffect(() => {
    refreshList()
    api('/api/studio/presets').then((r) => setPresets(r.presets || [])).catch(() => {})
    api('/api/studio/assets').then((r) => setAssets(r.assets || [])).catch(() => {})
    loadFonts().then((names) => { setFonts(names); setFontsVersion((v) => v + 1) })
  }, [refreshList])
  // font unggahan baru: FontPicker sudah memuat FontFace-nya, tinggal masuk daftar + gambar ulang kanvas
  const onFontAdded = useCallback((name) => {
    fontsPromise = null // buka Frame Studio berikutnya memuat ulang daftar dari server (termasuk font ini)
    setFonts((f) => (f.includes(name) ? f : [...f, name]))
    setFontsVersion((v) => v + 1)
  }, [])

  // buka langsung lewat URL: ?template=neon atau ?design=<id>
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (!presets.length) return
    const t = params.get('template')
    const did = params.get('design')
    const fid = params.get('frame')
    if (fid) {
      api('/api/frames').then((r) => {
        const f = (r.frames || []).find((x) => x.id === fid)
        if (f) openFromFrame(f)
        else setMsg('Frame tidak ditemukan.')
      }).catch((e) => setMsg(e.message))
      setParams({}, { replace: true })
    } else if (t) {
      const tpl = TEMPLATES.find((x) => x.id === t)
      if (tpl) openDesign({ ...tpl.make(), preset_id: presetFor(tpl, presets) })
      setParams({}, { replace: true })
    } else if (did) {
      api(`/api/studio/designs/${did}`).then(openDesign).catch((e) => setMsg(e.message))
      setParams({}, { replace: true })
    }
  }, [presets]) // eslint-disable-line react-hooks/exhaustive-deps

  // ukuran kanvas mengikuti tinggi area tengah
  useEffect(() => {
    if (view !== 'edit' || !wrapRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setDisplayH(Math.max(320, Math.min(height - 8, (width - 8) * H / W)))
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [view])

  // ---- riwayat (undo/redo)
  const setDesign = useCallback((upd) => {
    setDesignRaw((cur) => {
      const next = typeof upd === 'function' ? upd(cur) : upd
      if (next !== cur) {
        setPast((p) => [...p.slice(-59), cur])
        setFuture([])
        setDirty(true)
      }
      return next
    })
  }, [])
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      setDesignRaw((cur) => { setFuture((f) => [cur, ...f]); return p[p.length - 1] })
      setDirty(true)
      return p.slice(0, -1)
    })
  }, [])
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      setDesignRaw((cur) => { setPast((p) => [...p, cur]); return f[0] })
      setDirty(true)
      return f.slice(1)
    })
  }, [])

  const preset = useMemo(() => {
    if (presetDraft && design && presetDraft.id === design.preset_id) return presetDraft
    return presets.find((p) => p.id === design?.preset_id) || presets[0]
  }, [presets, presetDraft, design])

  // frame jadi: kalau frame itu hasil Frame Studio, buka desain aslinya; selain itu desain baru
  const openFromFrame = async (f) => {
    try {
      const own = (await api('/api/studio/designs')).designs.find((d) => d.frame_id === f.id)
      if (own) { openDesign(await api(`/api/studio/designs/${own.id}`)); return }
    } catch { /* lanjut buat desain baru */ }
    openDesign({ ...designFromFrame(f), preset_id: presets[0]?.id || 'default' })
  }

  const openDesign = (doc) => {
    setDesignRaw(doc)
    setPast([]); setFuture([]); setDirty(!doc.id); setSelected(null); setTab('item')
    setPresetDraft(null); setPresetDirty(false)
    setView('edit')
  }

  const updateLayer = (id, patch) => setDesign((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  const updateVideo = (patch) => setDesign((d) => ({ ...d, video: { ...d.video, ...patch } }))

  const addLayer = (maker, section) => {
    const y = section === 'header' ? 80 : section === 'footer' ? design.sections.footer + 60 : 900
    const l = maker({ section, y })
    setDesign((d) => ({ ...d, layers: [...d.layers, l] }))
    setSelected(l.id); setTab('item')
  }
  const removeLayer = (id) => {
    setDesign((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }))
    setSelected(null)
  }
  const duplicateLayer = (id) => {
    const l = design.layers.find((x) => x.id === id)
    if (!l) return
    const c = { ...clone(l), id: uid(), name: l.name + ' (salinan)', x: l.x + 30, y: l.y + 30 }
    setDesign((d) => ({ ...d, layers: [...d.layers, c] }))
    setSelected(c.id)
  }
  const moveLayer = (id, dir) => setDesign((d) => {
    const i = d.layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.layers.length) return d
    const layers = [...d.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]]
    return { ...d, layers }
  })

  // ---- keyboard
  useEffect(() => {
    if (view !== 'edit') return
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return }
      if (!selected) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== 'video') { e.preventDefault(); removeLayer(selected); return }
      const step = e.shiftKey ? 10 : 1
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (d) {
        e.preventDefault()
        if (selected === 'video') updateVideo({ x: design.video.x + d[0], y: design.video.y + d[1] })
        else { const l = design.layers.find((x) => x.id === selected); if (l && !l.locked) updateLayer(selected, { x: l.x + d[0], y: l.y + d[1] }) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- video preview
  const pickVideo = (f) => {
    if (!f) return
    if (videoEl) { videoEl.pause(); URL.revokeObjectURL(videoEl.src) }
    const el = document.createElement('video')
    el.src = URL.createObjectURL(f)
    el.muted = true; el.loop = true; el.playsInline = true
    el.onloadeddata = () => { el.play().catch(() => {}); setVideoEl(el) }
    el.onerror = () => setMsg('Video ini tidak bisa diputar di browser (mungkin HEVC). Export MP4 tetap bisa, preview-nya saja yang kosong.')
    setVideoFile(f)
  }
  useEffect(() => () => { if (videoEl) { videoEl.pause(); URL.revokeObjectURL(videoEl.src) } }, [videoEl])

  // ---- simpan / publish / export
  const save = async () => {
    if (!design) return null
    setBusy('save')
    try {
      const thumb = canvasRef.current?.thumb()
      const saved = await api('/api/studio/designs', { method: 'POST', body: { design, thumb } })
      setDesignRaw((d) => ({ ...d, id: saved.id, frame_id: saved.frame_id }))
      setDirty(false)
      setMsg('Desain tersimpan.')
      // tahap 4: kode Acak gaya yang disimpan masuk riwayat anti-kembar
      if (design.acak?.kode) api('/api/acakgaya/catat', { method: 'POST', body: { kode: [design.acak.kode], sumber: 'studio' } }).catch(() => {})
      refreshList()
      return saved
    } catch (e) {
      setMsg(e.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const publish = async () => {
    const saved = dirty || !design.id ? await save() : design
    if (!saved) return null
    setBusy('publish')
    try {
      const dyn = design.layers.filter(isDynLayer)
      await waitTextFx()  // efek 3D realistis dirender server: pastikan sudah tampil di kanvas
      const png = canvasRef.current.exportFrame(dyn.map((l) => l.id))
      const fd = new FormData()
      fd.append('png', dataUrlToBlob(png), 'frame.png')
      fd.append('layers', JSON.stringify(dyn.map((l) => dynamicSpec(l, preset))))
      // tanpa layer {brand}/logo -> teks brand global (Video jadi) ikut dipasang di frame ini
      const hasBrand = design.layers.some((l) => l.visible !== false && (l.type === 'logo' || String(l.text || '').includes('{brand}')))
      fd.append('has_brand', hasBrand ? '1' : '0')
      fd.append('win', JSON.stringify([design.video.x, design.video.y, design.video.w, design.video.h]))
      fd.append('name', design.name)
      const r = await api(`/api/studio/designs/${saved.id}/publish`, { method: 'POST', body: fd })
      setDesignRaw((d) => ({ ...d, id: saved.id, frame_id: r.frame_id }))
      refreshList()
      setMsg(`"${r.name}" siap dipakai: muncul di galeri tema Pengaturan, tab Efek, dan mode Video jadi.`)
      return r
    } catch (e) {
      setMsg(e.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const exportPng = async () => {
    await waitTextFx()
    const url = canvasRef.current.exportFrame()
    const a = document.createElement('a')
    a.href = url
    a.download = `${(design.name || 'frame').replace(/[^\w\- ]+/g, '').trim() || 'frame'}.png`
    a.click()
  }

  const exportMp4 = async (file) => {
    const f = file || videoFile
    if (!f) { mp4Ref.current?.click(); return }
    const r = await publish()
    if (!r) return
    setBusy('mp4')
    try {
      const fd = new FormData()
      fd.append('files', f)
      fd.append('ratio', '9:16')
      fd.append('theme', r.theme)
      const res = await api('/api/projects/readymade', { method: 'POST', body: fd })
      nav(`/studio/${res.projects[0]}`)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy('')
    }
  }

  // ---- brand preset
  const changePreset = (p) => { setPresetDraft(p); setPresetDirty(true) }
  const newPresetClick = () => {
    const p = { ...newPreset(), id: 'draft' + uid() }
    setPresets((ps) => [...ps, p])
    setDesign((d) => ({ ...d, preset_id: p.id }))
    setPresetDraft(p); setPresetDirty(true)
  }
  const deletePreset = async () => {
    if (!window.confirm(`Hapus preset "${preset.name}"?`)) return
    if (String(preset.id).startsWith('draft')) {
      setPresets((ps) => ps.filter((p) => p.id !== preset.id))
    } else {
      const r = await api(`/api/studio/presets/${preset.id}`, { method: 'DELETE' })
      setPresets(r.presets)
    }
    setPresetDraft(null); setPresetDirty(false)
    setDesign((d) => ({ ...d, preset_id: presets.find((p) => p.id !== preset.id)?.id || 'default' }))
  }
  // id draft -> kirim tanpa id supaya backend membuat id baru
  const presetForSave = presetDraft && String(presetDraft.id).startsWith('draft') ? { ...presetDraft, id: '' } : presetDraft

  const onUploadImage = async (f) => {
    if (!f) return
    try {
      const url = await uploadAsset(f)
      setAssets((a) => [url, ...a])
      if (selected) updateLayer(selected, { src: url })
    } catch (e) { setMsg(e.message) }
  }
  const onUploadBg = async (f) => {
    if (!f) return
    try {
      const url = await uploadAsset(f)
      const hole = await detectHole(url)
      setDesign((d) => ({
        ...d,
        background: { ...d.background, type: 'image', image: url },
        ...(hole ? { video: { ...d.video, ...hole, radius: 0, borderWidth: 0, glow: 0 } } : {}),
      }))
      if (hole) setMsg('Area transparan di gambar latar terdeteksi, kotak video sudah disesuaikan.')
    } catch (e) { setMsg(e.message) }
  }

  // ---------------------------------------------------------------- render
  if (view === 'list' || !design) {
    return (
      <DesignList
        designs={designs} presets={presets} fontsVersion={fontsVersion}
        onNew={(t) => openDesign({ ...t.make(), preset_id: presetFor(t, presets) })}
        frames={frameList} onFrame={openFromFrame}
        onOpen={async (id) => { try { openDesign(await api(`/api/studio/designs/${id}`)) } catch (e) { setMsg(e.message) } }}
        onDuplicate={async (id) => {
          const d = await api(`/api/studio/designs/${id}`)
          openDesign({ ...d, id: '', frame_id: '', name: d.name + ' (salinan)' })
        }}
        onDelete={async (d) => {
          if (!window.confirm(`Hapus desain "${d.name}"? Frame yang sudah dipakai di Studio Clip tetap ada.`)) return
          await api(`/api/studio/designs/${d.id}`, { method: 'DELETE' })
          refreshList()
        }}
      />
    )
  }

  const sel = design.layers.find((l) => l.id === selected)

  return (
    <div className="fs-editor">
      <div className="fs-topbar">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => {
          if (dirty && !window.confirm('Ada perubahan yang belum disimpan. Tetap keluar?')) return
          setView('list'); setSelected(null)
        }}>Kembali</button>
        <input className="input fs-name" value={design.name} aria-label="Nama desain"
          onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={undo} disabled={!past.length} title="Ctrl+Z">Urungkan</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={redo} disabled={!future.length} title="Ctrl+Y">Ulangi</button>
        <label className="fs-toggle"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Garis section</label>
        <label className="fs-toggle"><input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} /> Safe area</label>
        <label className="btn btn-sm btn-ghost">
          {videoFile ? 'Ganti video preview' : 'Coba dengan video'}
          <input type="file" hidden accept=".mp4,.mov,.webm,.m4v" onChange={(e) => { pickVideo(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <span className="fs-spacer" />
        <button type="button" className="btn btn-sm" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Menyimpanâ€¦' : dirty ? 'Simpan' : 'Tersimpan'}</button>
        <button type="button" className="btn btn-sm" onClick={exportPng}>Export PNG</button>
        <button type="button" className="btn btn-sm" onClick={publish} disabled={!!busy}>{busy === 'publish' ? 'Memprosesâ€¦' : design.frame_id ? 'Perbarui di Studio Clip' : 'Pakai di Studio Clip'}</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => exportMp4()} disabled={!!busy}>{busy === 'mp4' ? 'Mengirimâ€¦' : 'Export MP4'}</button>
        <input ref={mp4Ref} type="file" hidden accept=".mp4,.mov,.mkv,.webm,.m4v,.avi" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { pickVideo(f); exportMp4(f) } }} />
      </div>
      <AcakGaya design={design} setDesign={setDesign} selected={selected} onUndo={undo} canUndo={past.length > 0} />
      {msg && <div className="fs-msg" role="status">{msg}<button type="button" className="btn btn-sm btn-ghost" onClick={() => setMsg('')} aria-label="Tutup pesan">Ã—</button></div>}

      <div className="fs-body">
        {/* kiri: layer per section */}
        <aside className="fs-panel fs-left" aria-label="Layer">
          {SECTIONS.map((s) => {
            const items = design.layers.map((l, i) => ({ l, i })).filter(({ l }) => l.section === s.id).reverse()
            const allHidden = items.length > 0 && items.every(({ l }) => l.visible === false)
            const allLocked = items.length > 0 && items.every(({ l }) => l.locked)
            const setAll = (patch) => setDesign((d) => ({ ...d, layers: d.layers.map((l) => (l.section === s.id ? { ...l, ...patch } : l)) }))
            return (
              <section key={s.id} className="fs-section">
                <div className="fs-section-head">
                  <b>{s.name}</b>
                  {items.length > 0 && (
                    <>
                      <button type="button" className="fs-mini" onClick={() => setAll({ visible: allHidden })}>{allHidden ? 'Tampilkan' : 'Sembunyikan'}</button>
                      <button type="button" className="fs-mini" onClick={() => setAll({ locked: !allLocked })}>{allLocked ? 'Buka kunci' : 'Kunci'}</button>
                    </>
                  )}
                </div>
                {s.id === 'main' && (
                  <button type="button" className={`fs-layer ${selected === 'video' ? 'is-on' : ''}`} onClick={() => { setSelected('video'); setTab('item') }}>
                    <span className="fs-layer-type">Video</span><span className="fs-layer-name">Area video utama</span>
                  </button>
                )}
                {items.map(({ l }) => (
                  <div key={l.id} className={`fs-layer ${selected === l.id ? 'is-on' : ''} ${l.visible === false ? 'is-hidden' : ''}`}>
                    <button type="button" className="fs-layer-main" onClick={() => { setSelected(l.id); setTab('item') }}>
                      <span className="fs-layer-type">{TYPE_NAMES[l.type]}</span><span className="fs-layer-name">{l.name}</span>
                    </button>
                    <button type="button" className="fs-mini" aria-label={l.visible === false ? 'Tampilkan' : 'Sembunyikan'} onClick={() => updateLayer(l.id, { visible: l.visible === false })}>{l.visible === false ? 'Lihat' : 'Sembunyi'}</button>
                    <button type="button" className="fs-mini" aria-label={l.locked ? 'Buka kunci' : 'Kunci'} onClick={() => updateLayer(l.id, { locked: !l.locked })}>{l.locked ? 'Buka' : 'Kunci'}</button>
                  </div>
                ))}
                <div className="fs-add">
                  <span>Tambah:</span>
                  <button type="button" className="fs-mini" onClick={() => addLayer(textLayer, s.id)}>Teks</button>
                  <button type="button" className="fs-mini" onClick={() => addLayer((p) => textLayer({ ...p, name: 'Kotak teks', text: '{welcome}', bg: '@accent', color: '@primary', radius: 30, size: 48 }), s.id)}>Kotak teks</button>
                  <button type="button" className="fs-mini" onClick={() => addLayer(logoLayer, s.id)}>Logo</button>
                  <button type="button" className="fs-mini" onClick={() => addLayer(shapeLayer, s.id)}>Bentuk</button>
                  <button type="button" className="fs-mini" onClick={() => addLayer(imageLayer, s.id)}>Gambar</button>
                </div>
              </section>
            )
          })}
        </aside>

        {/* tengah: kanvas */}
        <div className="fs-stage" ref={wrapRef}>
          <div className="fs-stage-inner" style={{ width: displayH * W / H, height: displayH }}>
            <StudioCanvas ref={canvasRef} design={design} preset={preset} selected={selected} onSelect={(id) => { setSelected(id); if (id) setTab('item') }}
              onChangeLayer={updateLayer} onChangeVideo={updateVideo} videoEl={videoEl}
              showGuides={showGuides} showSafe={showSafe} displayH={displayH} fontsVersion={fontsVersion} />
          </div>
        </div>

        {/* kanan: inspector */}
        <aside className="fs-panel fs-right" aria-label="Pengaturan">
          <div className="tabs fs-tabs" role="tablist">
            {[['item', 'Item'], ['bg', 'Latar'], ['brand', 'Brand']].map(([t, n]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{n}</button>
            ))}
          </div>
          {tab === 'item' && (
            selected === 'video' ? <VideoInspector v={design.video} set={updateVideo} />
              : sel ? (
                <>
                  <div className="fs-row-wrap" style={{ marginBottom: 12 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveLayer(sel.id, 1)}>Naikkan</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveLayer(sel.id, -1)}>Turunkan</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => duplicateLayer(sel.id)}>Duplikat</button>
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => removeLayer(sel.id)}>Hapus</button>
                  </div>
                  <LayerInspector l={sel} fonts={fonts} set={(p) => updateLayer(sel.id, p)} assets={assets} onUploadImage={onUploadImage} preset={preset} onFontAdded={onFontAdded} />
                </>
              ) : <p className="hint">Klik elemen di kanvas atau di daftar layer untuk mengeditnya. Klik area video untuk mengatur posisi dan ukuran video.</p>
          )}
          {tab === 'bg' && <BackgroundInspector design={design} setDesign={setDesign} onUploadBg={onUploadBg} />}
          {tab === 'brand' && preset && (
            <BrandInspector presets={presets} preset={preset} presetId={design.preset_id} fonts={fonts} dirty={presetDirty} onFontAdded={onFontAdded}
              onPick={(id) => { setDesign((d) => ({ ...d, preset_id: id })); setPresetDraft(null); setPresetDirty(false) }}
              onChange={changePreset}
              onSave={async () => {
                const body = presetForSave || preset
                try {
                  const r = await api('/api/studio/presets', { method: 'POST', body })
                  const savedP = body.id ? r.presets.find((p) => p.id === body.id) : r.presets[r.presets.length - 1]
                  setPresets(r.presets)
                  if (savedP) setDesign((d) => ({ ...d, preset_id: savedP.id }))
                  setPresetDraft(null); setPresetDirty(false)
                  setMsg('Brand preset tersimpan.')
                } catch (e) { setMsg(e.message) }
              }}
              onNew={newPresetClick} onDelete={deletePreset} />
          )}
        </aside>
      </div>
    </div>
  )
}
