import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import './FontPicker.css'

// Pemilih font visual Frame Studio: contoh tampilan tiap font, kategori, cari, unggah font sendiri.
// Nilai yang disimpan tetap nama font (sama seperti <select> lama), jadi desain lama tetap terbaca.
let catalogPromise = null
export function loadCatalog(force = false) {
  if (force || !catalogPromise) {
    catalogPromise = api('/api/fonts').catch((e) => { catalogPromise = null; throw e })
  }
  return catalogPromise
}

async function addFontFace(name, url) {
  const ff = new FontFace(name, `url(${url})`, { weight: '100 900' })
  await ff.load()
  document.fonts.add(ff)
}

export default function FontPicker({ id, value, onChange, fonts, allowBrand = false, brandFont = '', sample = '', onFontAdded }) {
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState('semua')
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef()
  const searchRef = useRef()

  useEffect(() => { if (open && !catalog) loadCatalog().then(setCatalog).catch((e) => setErr(e.message)) }, [open, catalog])
  useEffect(() => { if (open) searchRef.current?.focus() }, [open])

  const loaded = useMemo(() => new Set(fonts), [fonts])
  const items = useMemo(() => {
    const list = (catalog?.fonts || []).filter((f) => loaded.has(f.name))
    const needle = q.trim().toLowerCase()
    return list.filter((f) => (cat === 'semua' || f.category === cat) && (!needle || f.name.toLowerCase().includes(needle)))
  }, [catalog, loaded, cat, q])
  const counts = useMemo(() => {
    const c = {}
    for (const f of catalog?.fonts || []) if (loaded.has(f.name)) c[f.category] = (c[f.category] || 0) + 1
    return c
  }, [catalog, loaded])

  const shown = (text || sample || 'Halo Dunia 2026').slice(0, 40)
  const current = value === '@brand' ? brandFont : value
  const pick = (name) => { onChange(name); setOpen(false) }

  const upload = async (file) => {
    if (!file) return
    setBusy('Mengunggah…'); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const f = await api('/api/fonts/upload', { method: 'POST', body: fd })
      await addFontFace(f.name, f.url)
      setCatalog(await loadCatalog(true))
      onFontAdded?.(f.name)
      setCat('user')
      onChange(f.name)
    } catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const remove = async (name) => {
    if (!window.confirm(`Hapus font "${name}"? Desain yang memakainya akan kembali ke font bawaan.`)) return
    setBusy('Menghapus…'); setErr('')
    try {
      await api(`/api/fonts/user/${encodeURIComponent(name)}`, { method: 'DELETE' })
      setCatalog(await loadCatalog(true))
    } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  return (
    <div className="fp" onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <button type="button" id={id} className="fp-current" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="fp-current-sample" style={{ fontFamily: `"${current}"` }}>{shown}</span>
        <span className="fp-current-name">{value === '@brand' ? `Font brand · ${brandFont}` : value}</span>
        <span aria-hidden="true" className="fp-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="fp-panel">
          <div className="fp-tools">
            <input ref={searchRef} className="input" placeholder="Cari font…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari font" />
            <input className="input" placeholder="Teks contoh" value={text} onChange={(e) => setText(e.target.value)} aria-label="Teks contoh" maxLength={40} />
          </div>
          <div className="fp-cats" role="tablist" aria-label="Kategori font">
            {[{ id: 'semua', label: 'Semua' }, ...(catalog?.categories || [])].map((c) => {
              const n = c.id === 'semua' ? loaded.size : (counts[c.id] || 0)
              if (c.id !== 'semua' && c.id !== 'user' && !n) return null
              return (
                <button key={c.id} type="button" role="tab" aria-selected={cat === c.id}
                  className={`fp-cat ${cat === c.id ? 'is-on' : ''}`} onClick={() => setCat(c.id)}>
                  {c.label} <small className="tnum">{n}</small>
                </button>
              )
            })}
          </div>

          {err && <p className="fp-err" role="alert">{err}</p>}
          {!catalog && !err && <p className="hint">Memuat daftar font…</p>}

          <ul className="fp-list">
            {allowBrand && cat === 'semua' && !q && (
              <li>
                <button type="button" className={`fp-item ${value === '@brand' ? 'is-on' : ''}`} onClick={() => pick('@brand')}>
                  <span className="fp-sample" style={{ fontFamily: `"${brandFont}"` }}>{shown}</span>
                  <span className="fp-name">Font brand · ikut preset ({brandFont})</span>
                </button>
              </li>
            )}
            {items.map((f) => (
              <li key={f.name} className="fp-row">
                <button type="button" className={`fp-item ${value === f.name ? 'is-on' : ''}`} onClick={() => pick(f.name)}>
                  <span className="fp-sample" style={{ fontFamily: `"${f.name}"` }}>{shown}</span>
                  <span className="fp-name">{f.name}</span>
                </button>
                {f.user && (
                  <button type="button" className="btn btn-sm btn-ghost btn-danger fp-del" disabled={!!busy}
                    onClick={() => remove(f.name)} aria-label={`Hapus font ${f.name}`}>Hapus</button>
                )}
              </li>
            ))}
            {catalog && !items.length && (
              <li className="hint fp-empty">{cat === 'user' ? 'Belum ada font unggahan.' : 'Tidak ada font yang cocok.'}</li>
            )}
          </ul>

          <div className="fp-foot">
            <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy || 'Unggah font (.ttf / .otf)'}
            </button>
            <input ref={fileRef} type="file" hidden accept=".ttf,.otf"
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
            <span className="hint">Pastikan lisensinya boleh untuk konten komersial.</span>
          </div>
        </div>
      )}
    </div>
  )
}
