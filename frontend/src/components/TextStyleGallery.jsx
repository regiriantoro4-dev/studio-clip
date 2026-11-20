import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { TEXT_FX_NONE, TEXT_STYLES, resolveColor } from '../studio/model.js'
import './TextStyleGallery.css'

// Galeri gaya teks bergambar (Frame Studio tahap 2). Contoh dirender server dengan renderer
// export, memakai font layer & warna brand aktif. Klik = terapkan gaya (sama dengan tombol lama).
const COLOR_KEYS = ['color', 'fill2', 'fill3', 'stroke', 'bg', 'depthColor', 'depthColor2', 'shadowColor', 'glow', 'outline2',
  'lineBoxColor', 'marker', 'hlColor', 'hlBg', 'longColor']
const SAMPLE = 'Gaya Keren'
const GROUPS = [
  { id: 'tiktok', label: 'Konten TikTok', test: (s) => s.group === 'tiktok' },
  { id: 'klasik', label: 'Klasik', test: (s) => !s.real && !s.group },
  { id: 'real', label: '3D realistis', test: (s) => s.real },
  { id: 'new', label: 'Gaya baru', test: (s) => s.group === 'new' },
]
const cache = new Map()

// nilai yang diterapkan ke layer: sama persis dengan tombol gaya cepat sebelumnya
export function styleFx(s) {
  return { ...TEXT_FX_NONE, ...(s.id === 'plain' ? { stroke: '', strokeWidth: 0 } : {}), ...s.fx }
}

function thumbSpec(s, font, preset) {
  const spec = { w: 520, h: 140, size: 64, font, bold: true, align: 'center', lineHeight: 1.1, letterSpacing: 0,
    color: '#FFFFFF', stroke: '', strokeWidth: 0, padding: 0, ...styleFx(s) }
  for (const k of COLOR_KEYS) spec[k] = spec[k] ? resolveColor(spec[k], preset) : ''
  return spec
}

export default function TextStyleGallery({ font, preset, onApply }) {
  const [group, setGroup] = useState('tiktok')
  const [thumbs, setThumbs] = useState(null)
  const [failed, setFailed] = useState(false)
  const key = JSON.stringify([font, preset?.colors || {}])

  useEffect(() => {
    if (cache.has(key)) { setThumbs(cache.get(key)); return }
    let alive = true
    setThumbs(null); setFailed(false)
    const items = TEXT_STYLES.map((s) => ({ spec: thumbSpec(s, font, preset), text: SAMPLE }))
    api('/api/textstyle/thumbs', { method: 'POST', body: { items } })
      .then((r) => {
        const map = Object.fromEntries(TEXT_STYLES.map((s, i) => [s.id, r.items?.[i]?.image || '']))
        if (cache.size > 12) cache.delete(cache.keys().next().value)
        cache.set(key, map)
        if (alive) setThumbs(map)
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => TEXT_STYLES.filter(GROUPS.find((g) => g.id === group).test), [group])

  return (
    <div className="tsg">
      <div className="tsg-tabs" role="tablist" aria-label="Kelompok gaya teks">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id}
            className={`tsg-tab ${group === g.id ? 'is-on' : ''}`} onClick={() => setGroup(g.id)}>
            {g.label} <small className="tnum">{TEXT_STYLES.filter(g.test).length}</small>
          </button>
        ))}
      </div>
      {!thumbs && !failed && <p className="hint">Menyiapkan contoh gaya…</p>}
      {failed && <p className="hint">Contoh gambar belum bisa dimuat (restart app?). Gaya tetap bisa dipakai.</p>}
      <div className="tsg-grid">
        {list.map((s) => (
          <button key={s.id} type="button" className="tsg-item" onClick={() => onApply(styleFx(s))} title={`Terapkan gaya ${s.name}`}>
            <span className="tsg-img">
              {thumbs?.[s.id] ? <img src={thumbs[s.id]} alt="" /> : <span className="tsg-ph" aria-hidden="true">Aa</span>}
            </span>
            <span className="tsg-name">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
