import { useState } from 'react'
import { api } from '../api.js'
import { TEXT_STYLES, TITLE_TOKEN } from '../studio/model.js'
import { styleFx } from './TextStyleGallery.jsx'
import AturanAcak from './AturanAcak.jsx'
import './AcakGaya.css'

// Tahap 4A Frame Studio: acak font, gaya teks, animasi muncul, gerakan, dan gaya bingkai video sekaligus.
// Satu klik = satu langkah riwayat, jadi Ctrl+Z / "Acakan sebelumnya" mengembalikannya.
const PARTS = [['font', 'Font'], ['gaya', 'Gaya teks'], ['animIn', 'Animasi muncul'], ['anim', 'Gerakan'], ['border', 'Bingkai']]

function targetsOf(design, selected) {
  const sel = design.layers.find((l) => l.id === selected && l.type === 'text')
  if (sel) return { all: [sel], main: sel }
  const all = design.layers.filter((l) => l.type === 'text' && l.visible !== false && !l.locked)
  const main = all.find((l) => String(l.text || '').includes(TITLE_TOKEN))
    || [...all].sort((a, b) => (b.size || 0) - (a.size || 0))[0]
  return { all, main }
}

export default function AcakGaya({ design, setDesign, selected, onUndo, canUndo }) {
  const [kunci, setKunci] = useState({})
  const [semua, setSemua] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [kodeIn, setKodeIn] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const { all, main } = targetsOf(design, selected)
  const last = design.acak

  // exact=true (Pakai kode): kunci diabaikan supaya tampilan kembali persis
  const apply = (c, exact = false) => {
    const s = TEXT_STYLES.find((x) => x.id === c.gaya)
    const lock = exact ? {} : kunci
    setDesign((d) => {
      const layers = d.layers.map((l) => {
        if (!all.some((t) => t.id === l.id)) return l
        const isMain = l.id === main?.id
        const p = {}
        if (!lock.font && c.font) p.font = c.font
        if (!lock.gaya && s && (isMain || semua)) Object.assign(p, styleFx(s))
        if (isMain && !lock.animIn) p.animIn = c.animIn || ''
        if (isMain && !lock.anim) p.anim = c.anim || ''
        return { ...l, ...p }
      })
      let video = d.video
      if (!lock.border && c.border !== null && c.border !== undefined && video) {
        const paper = ['polaroid', 'torn'].includes(c.border)
        video = { ...video, borderStyle: c.border,
          ...(c.border && !video.borderWidth ? { borderWidth: paper ? 30 : 8 } : {}),
          ...(paper ? { borderColor: c.border === 'torn' ? '#F5F1E8' : '#FFFFFF', radius: 0 } : {}) }
      }
      return { ...d, layers, video, acak: { kode: c.kode, gaya: lock.gaya ? d.acak?.gaya ?? null : c.gaya } }
    })
  }

  const run = async (kode) => {
    if (!all.length) { setErr('Belum ada teks yang bisa diacak. Tambah teks dulu, atau buka kunci layer.'); return }
    setErr(''); setBusy(true)
    try {
      const body = {}
      if (kode) body.kode = kode
      else {
        const k = {}
        if (kunci.font) k.font = main && !String(main.font || '').startsWith('@') ? main.font : null
        if (kunci.gaya) k.gaya = last?.gaya ?? null
        if (kunci.anim) k.anim = main?.anim || ''
        if (kunci.animIn) k.animIn = main?.animIn || ''
        if (kunci.border) k.border = design.video?.borderStyle || ''
        body.kunci = k
      }
      apply(await api('/api/acakgaya/acak', { method: 'POST', body }), !!kode)
      if (kode) setKodeIn('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ag-bar" aria-label="Acak gaya">
      <div className="ag-main">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => run()} disabled={busy}
          title="Acak font, gaya teks, animasi, dan bingkai">🎲 {busy ? 'Mengacak…' : 'Acak gaya'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onUndo} disabled={!canUndo} title="Sama dengan Ctrl+Z">Acakan sebelumnya</button>
        {last?.kode && <span className="ag-kode tnum" title="Kode gaya: ketik di kolom Pakai kode untuk memanggil ulang tampilan ini">#{last.kode}</span>}
        <span className="ag-sep" aria-hidden="true" />
        <span className="ag-lbl">Kunci:</span>
        <div className="ag-chips">
          {PARTS.map(([id, n]) => (
            <button key={id} type="button" className={`ag-chip ${kunci[id] ? 'is-lock' : ''}`} aria-pressed={!!kunci[id]}
              onClick={() => setKunci((k) => ({ ...k, [id]: !k[id] }))} title={kunci[id] ? 'Terkunci: tidak ikut diacak' : 'Ikut diacak'}>
              {kunci[id] ? '🔒' : '🔓'} {n}
            </button>
          ))}
        </div>
        <span className="ag-sep" aria-hidden="true" />
        <form className="ag-kodeform" onSubmit={(e) => { e.preventDefault(); if (kodeIn.trim()) run(kodeIn.trim()) }}>
          <input className="input" value={kodeIn} onChange={(e) => setKodeIn(e.target.value.toUpperCase())}
            placeholder="Kode" maxLength={5} aria-label="Kode gaya" />
          <button type="submit" className="btn btn-sm btn-ghost" disabled={!kodeIn.trim() || busy}>Pakai kode</button>
        </form>
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={showRules} onClick={() => setShowRules((v) => !v)}>
          Aturan acak {showRules ? '▴' : '▾'}
        </button>
      </div>
      <div className="ag-sub">
        <span className="hint">
          {all.length ? <>Diacak: {all.length > 1 ? `font ${all.length} teks; gaya & animasi di teks utama ` : 'teks terpilih '}
            {main && <b>“{String(main.name || main.text || '').slice(0, 24)}”</b>}</> : 'Tidak ada teks yang bisa diacak.'}
        </span>
        {all.length > 1 && (
          <label className="ag-semua"><input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Gaya juga untuk teks lain</label>
        )}
        {err && <span className="ag-err" role="alert">{err}</span>}
      </div>
      {showRules && <AturanAcak />}
    </div>
  )
}
