import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { GRAD_TYPES, TEXTURES, TEXT_FX_NONE, TEXT_STYLES } from '../studio/model.js'
import AnimControls from './AnimControls.jsx'

// Teks brand global: diatur sekali, dipasang otomatis di setiap frame (border.brand_text_active).
// Disimpan di settings.brand.brand_text; preview memakai renderer server yang sama dengan export.

export const BRAND_TEXT_DEFAULT = {
  enabled: false, text: '{brand}', position: 'top_in', offset_y: 0, width: 90,
  font: 'Cinzel Decorative', size: 96, bold: true, italic: false, uppercase: true,
  letterSpacing: 2, color: '#FFF1A8', fill2: '#B8860B', shine: true,
  stroke: '#5A3A00', strokeWidth: 4, depth: 10, depthColor: '#4A2C00', depthAngle: 90,
  shadowColor: '#000000', shadowBlur: 18, shadowX: 0, shadowY: 6,
  glow: '', glowSize: 30, outline2: '', outline2Width: 0,
  anim: '', animIn: '', animSpeed: 2, animAmount: 50,
}

const POSITIONS = [
  ['top_in', 'Atas, di dalam video'],
  ['top', 'Header (di atas jendela video)'],
  ['board', 'Papan bawah frame'],
  ['bottom', 'Bawah frame'],
]

let fontsPromise = null
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = api('/api/studio/fonts').then(async (map) => {
      await Promise.all(Object.entries(map).map(async ([name, url]) => {
        try {
          const ff = new FontFace(name, `url(${url})`, { weight: '100 900' })
          await ff.load()
          document.fonts.add(ff)
        } catch { /* fallback */ }
      }))
      return Object.keys(map)
    })
  }
  return fontsPromise
}

function Color({ label, value, onChange, optional, fallback = '#FFFFFF' }) {
  const on = !!value
  return (
    <div className="bt-color">
      <span>{label}</span>
      {optional && (
        <label className="bt-mini">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? fallback : '')} /> pakai
        </label>
      )}
      {(on || !optional) && (
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      )}
    </div>
  )
}

function Range({ label, value, min, max, step = 1, onChange, unit = '' }) {
  return (
    <div className="slider-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value ?? 0} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val tnum">{value ?? 0}{unit}</span>
    </div>
  )
}

export default function BrandTextPanel({ theme, title }) {
  const [brand, setBrand] = useState(null)
  const [bt, setBt] = useState(null)
  const [fonts, setFonts] = useState([])
  const [frameTheme, setFrameTheme] = useState('')
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState('')
  const [more, setMore] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    api('/api/settings').then((s) => {
      setBrand(s.brand || {})
      setBt({ ...BRAND_TEXT_DEFAULT, ...(s.brand?.brand_text || {}) })
    }).catch((e) => setStatus(e.message))
    loadFonts().then(setFonts).catch(() => {})
    api('/api/frames').then((r) => {
      const f = (r.frames || []).find((x) => x.source === 'ornamen-ai') || (r.frames || [])[0]
      if (f) setFrameTheme(f.theme)
    }).catch(() => {})
  }, [])

  const previewTheme = String(theme || '').startsWith('frame:') ? theme : frameTheme
  const set = (patch) => { dirty.current = true; setBt((b) => ({ ...b, ...patch })) }

  // simpan otomatis (debounce)
  useEffect(() => {
    if (!bt || !dirty.current) return
    setStatus('Menyimpan…')
    const t = setTimeout(() => {
      api('/api/settings', { method: 'PUT', body: { brand: { brand_text: bt } } })
        .then(() => setStatus('Tersimpan, dipakai di semua frame'))
        .catch((e) => setStatus(`Gagal menyimpan: ${e.message}`))
    }, 700)
    return () => clearTimeout(t)
  }, [bt])

  // preview server (renderer yang sama dengan export)
  const key = useMemo(() => (bt && brand && previewTheme ? JSON.stringify([bt, previewTheme, title]) : ''), [bt, brand, previewTheme, title])
  useEffect(() => {
    if (!key) return
    let alive = true
    const t = setTimeout(() => {
      api('/api/brand/preview', {
        method: 'POST',
        body: { brand: { theme: previewTheme, brand_text: { ...bt, enabled: true } }, title: title || '', ratio: '9:16', placeholder: true },
      }).then((r) => { if (alive) setPreview(r.image) }).catch(() => {})
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!bt) return null

  const tok = (c) => ({ '@accent': brand?.accent || '#F2C66D', '@primary': brand?.color || '#111418', '@secondary': '#2A2F3A', '@text': '#FFFFFF' }[c] || c)
  const applyStyle = (s) => {
    const fx = { ...TEXT_FX_NONE, ...(s.id === 'plain' ? { stroke: '', strokeWidth: 0, color: '#FFFFFF' } : {}), ...s.fx }
    for (const k of Object.keys(fx)) if (typeof fx[k] === 'string') fx[k] = tok(fx[k])
    set(fx)
  }

  // spesifikasi pratinjau animasi: sama dengan teks brand di frame (1 baris, warna token diselesaikan)
  const animText = String(bt.text || '{brand}').replace('{brand}', brand?.name || '').replace('{handle}', brand?.handle || '')
  const animSpec = { ...bt, w: 900, h: Math.round((bt.size || 96) * 1.45), singleLine: true, autoFit: true, lineHeight: 1.1, align: 'center', padding: 0 }
  for (const k of ['color', 'fill2', 'fill3', 'stroke', 'depthColor', 'depthColor2', 'shadowColor', 'glow', 'outline2']) animSpec[k] = bt[k] ? tok(bt[k]) : ''

  return (
    <details className="bt-panel" open>
      <summary>
        <b>Teks brand di semua frame</b>
        <span className="hint"> · diatur sekali, otomatis terpasang di setiap frame</span>
      </summary>
      <div className="bt-body">
        <div className="bt-controls">
          <label className="check-row">
            <input type="checkbox" checked={!!bt.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Pasang teks brand di setiap frame
          </label>
          <div className="field">
            <label htmlFor="bt-text">Teks</label>
            <input id="bt-text" className="input" value={bt.text} maxLength={60} onChange={(e) => set({ text: e.target.value })} />
            <span className="hint"><code>{'{brand}'}</code> = nama brand di Pengaturan ({brand?.name || '-'}). Bisa juga diketik langsung.</span>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="bt-font">Font</label>
              <select id="bt-font" className="select" value={bt.font} onChange={(e) => set({ font: e.target.value })} style={{ fontFamily: `"${bt.font}"` }}>
                {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bt-pos">Posisi</label>
              <select id="bt-pos" className="select" value={bt.position} onChange={(e) => set({ position: e.target.value })}>
                {POSITIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </div>
          </div>
          <Range label="Ukuran" value={bt.size} min={30} max={220} onChange={(size) => set({ size })} />
          <Range label="Lebar maks" value={bt.width} min={30} max={100} unit="%" onChange={(width) => set({ width })} />
          <Range label="Geser naik/turun" value={bt.offset_y} min={-400} max={400} onChange={(offset_y) => set({ offset_y })} />

          <div className="field">
            <label>Gaya cepat</label>
            <div className="fs-styles">
              {TEXT_STYLES.filter((s) => !s.real && !s.group).map((s) => (
                <button key={s.id} type="button" className="btn btn-sm btn-ghost" onClick={() => applyStyle(s)}>{s.name}</button>
              ))}
            </div>
            <span className="hint">3D realistis</span>
            <div className="fs-styles">
              {TEXT_STYLES.filter((s) => s.real).map((s) => (
                <button key={s.id} type="button" className="btn btn-sm btn-ghost" onClick={() => applyStyle(s)}>{s.name}</button>
              ))}
            </div>
            <span className="hint">Gaya baru</span>
            <div className="fs-styles">
              {TEXT_STYLES.filter((s) => s.group === 'new').map((s) => (
                <button key={s.id} type="button" className="btn btn-sm btn-ghost" onClick={() => applyStyle(s)}>{s.name}</button>
              ))}
            </div>
          </div>

          <AnimControls value={bt} onChange={set} spec={animSpec} text={animText} />

          <div className="fs-checks">
            <label><input type="checkbox" checked={!!bt.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /> Kapital</label>
            <label><input type="checkbox" checked={!!bt.bold} onChange={(e) => set({ bold: e.target.checked })} /> Tebal</label>
            <label><input type="checkbox" checked={!!bt.italic} onChange={(e) => set({ italic: e.target.checked })} /> Miring</label>
          </div>

          <button type="button" className="btn btn-sm btn-ghost fs-fx-toggle" aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? '▾' : '▸'} Atur warna, efek 3D, cahaya &amp; bayangan
          </button>
          {more && (
            <div className="bt-fx">
              <Range label="Spasi huruf" value={bt.letterSpacing} min={-5} max={30} onChange={(letterSpacing) => set({ letterSpacing })} />
              <Color label="Warna teks" value={bt.color} onChange={(color) => set({ color })} />
              <div className="slider-row">
                <label htmlFor="bt-grad">Gaya isi</label>
                <select id="bt-grad" className="select" value={bt.gradType || ''} onChange={(e) => set({ gradType: e.target.value })}>
                  {GRAD_TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              {bt.gradType === 'tri' && <Color label="Warna tengah" value={bt.fill3} fallback="#7C4DFF" onChange={(fill3) => set({ fill3 })} />}
              <label className="check-row"><input type="checkbox" checked={!!bt.hollow} onChange={(e) => set({ hollow: e.target.checked })} /> Berongga (neon tabung, butuh garis tepi)</label>
              <Range label="Glitch RGB" value={bt.glitch || 0} min={0} max={30} onChange={(glitch) => set({ glitch })} />
              {bt.glitch > 0 && <label className="check-row"><input type="checkbox" checked={!!bt.glitchSlices} onChange={(e) => set({ glitchSlices: e.target.checked })} /> Potongan glitch</label>}
              <Color label="Gradasi bawah" value={bt.fill2} optional fallback="#B8860B" onChange={(fill2) => set({ fill2 })} />
              {bt.fill2 && (
                <label className="check-row"><input type="checkbox" checked={!!bt.shine} onChange={(e) => set({ shine: e.target.checked })} /> Kilau metalik</label>
              )}
              <Color label="Garis tepi" value={bt.stroke} optional fallback="#000000" onChange={(stroke) => set({ stroke, strokeWidth: stroke ? (bt.strokeWidth || 4) : 0 })} />
              {bt.stroke && <Range label="Tebal garis" value={bt.strokeWidth} min={0} max={20} onChange={(strokeWidth) => set({ strokeWidth })} />}
              <Range label="Tebal 3D" value={bt.depth} min={0} max={40} onChange={(depth) => set({ depth })} />
              {bt.depth > 0 && (
                <>
                  <Range label="Arah 3D" value={bt.depthAngle} min={0} max={359} unit="°" onChange={(depthAngle) => set({ depthAngle })} />
                  <Color label="Warna sisi 3D (belakang)" value={bt.depthColor} fallback="#000000" onChange={(depthColor) => set({ depthColor })} />
                  <Color label="Gradasi sisi 3D (dekat muka)" value={bt.depthColor2} optional fallback="#A06C14" onChange={(depthColor2) => set({ depthColor2 })} />
                </>
              )}
              <Range label="Bevel (timbul)" value={bt.bevel || 0} min={0} max={40} onChange={(bevel) => set({ bevel })} />
              {bt.bevel > 0 && <Range label="Kekuatan bevel" value={bt.bevelStrength ?? 70} min={0} max={100} onChange={(bevelStrength) => set({ bevelStrength })} />}
              <Range label="Arah cahaya" value={bt.lightAngle ?? 240} min={0} max={359} unit="°" onChange={(lightAngle) => set({ lightAngle })} />
              <div className="slider-row">
                <label htmlFor="bt-tex">Tekstur</label>
                <select id="bt-tex" className="select" value={bt.texture || ''} onChange={(e) => set({ texture: e.target.value })}>
                  {TEXTURES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              {bt.texture && <Range label="Kekuatan tekstur" value={bt.textureStrength ?? 60} min={0} max={100} onChange={(textureStrength) => set({ textureStrength })} />}
              <label className="check-row"><input type="checkbox" checked={!!bt.gloss} onChange={(e) => set({ gloss: e.target.checked })} /> Kilap kaca</label>
              <Color label="Garis tepi luar" value={bt.outline2} optional fallback="#000000" onChange={(outline2) => set({ outline2, outline2Width: outline2 ? (bt.outline2Width || 6) : 0 })} />
              {bt.outline2 && <Range label="Tebal garis luar" value={bt.outline2Width} min={0} max={20} onChange={(outline2Width) => set({ outline2Width })} />}
              <Color label="Cahaya (glow)" value={bt.glow} optional fallback={brand?.accent || '#00E5FF'} onChange={(glow) => set({ glow })} />
              {bt.glow && <Range label="Besar cahaya" value={bt.glowSize} min={0} max={80} onChange={(glowSize) => set({ glowSize })} />}
              <Color label="Bayangan" value={bt.shadowColor} optional fallback="#000000" onChange={(shadowColor) => set({ shadowColor })} />
              {bt.shadowColor && (
                <>
                  <Range label="Blur bayangan" value={bt.shadowBlur} min={0} max={60} onChange={(shadowBlur) => set({ shadowBlur })} />
                  <Range label="Jarak bayangan" value={bt.shadowY} min={-30} max={30} onChange={(shadowY) => set({ shadowY })} />
                </>
              )}
            </div>
          )}
          <p className="hint" aria-live="polite">{status}</p>
        </div>
        <div className="bt-preview">
          {preview ? <img src={preview} alt="Pratinjau teks brand di frame" /> : <div className="bt-preview-empty">Memuat pratinjau…</div>}
          <span className="hint">
            {String(theme || '').startsWith('frame:') ? 'Pratinjau frame terpilih' : 'Pratinjau di contoh frame. Berlaku untuk semua tema frame.'}
            {!bt.enabled && ' (belum aktif)'}
          </span>
        </div>
      </div>
    </details>
  )
}
