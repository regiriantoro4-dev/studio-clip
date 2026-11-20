import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ANIMS, ANIM_INS } from '../studio/model.js'

// Kontrol animasi teks + pratinjau WebP dari server (mesin yang sama dengan render video).
// spec: layer teks siap render (warna/font sudah diselesaikan), text: isi teks yang tampil.
export default function AnimControls({ value, onChange, spec, text }) {
  const v = value || {}
  const on = !!(v.anim || v.animIn)
  const [img, setImg] = useState('')
  const [busy, setBusy] = useState(false)
  const key = on && spec ? JSON.stringify([spec, text]) : ''

  useEffect(() => {
    if (!key) { setImg(''); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      api('/api/studio/textfx/anim', { method: 'POST', body: { spec, text } })
        .then((r) => { if (alive) setImg(r.image || '') })
        .catch(() => { if (alive) setImg('') })
        .finally(() => { if (alive) setBusy(false) })
    }, 450)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="anim-box">
      <b>Animasi</b>
      <div className="fs-grid2">
        <label className="fs-num">
          <span>Gerakan</span>
          <select className="select" value={v.anim || ''} onChange={(e) => onChange({ anim: e.target.value })}>
            {ANIMS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </label>
        <label className="fs-num">
          <span>Muncul di awal</span>
          <select className="select" value={v.animIn || ''} onChange={(e) => onChange({ animIn: e.target.value })}>
            {ANIM_INS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </label>
      </div>
      {v.anim && (
        <div className="fs-grid2">
          <label className="fs-num">
            <span>Durasi 1 putaran (detik)</span>
            <input className="input" type="number" min={0.5} max={8} step={0.1} value={v.animSpeed ?? 2}
              onChange={(e) => onChange({ animSpeed: Math.max(0.5, Math.min(8, Number(e.target.value) || 2)) })} />
          </label>
          <label className="fs-num">
            <span>Kekuatan (0-100)</span>
            <input className="input" type="number" min={0} max={100} value={v.animAmount ?? 50}
              onChange={(e) => onChange({ animAmount: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </label>
        </div>
      )}
      {on && (
        <div className="anim-preview">
          {img ? <img src={img} alt="Pratinjau animasi teks" /> : <span className="hint">{busy ? 'Membuat pratinjau…' : 'Pratinjau tidak tersedia'}</span>}
        </div>
      )}
      <span className="hint">Animasi diputar di video hasil export. Di kanvas, teks tampil diam.</span>
    </div>
  )
}
