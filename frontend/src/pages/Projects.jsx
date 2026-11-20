import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { fmtDate, fmtTime } from '../presets.js'

const CHIP = {
  ready: ['chip-ready', 'Siap'],
  processing: ['chip-processing', 'Diproses'],
  error: ['chip-error', 'Gagal'],
  new: ['chip-new', 'Baru'],
}

export default function Projects() {
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')

  const load = () => {
    setErr('')
    return api('/api/projects').then(setItems).catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [])

  const remove = async (id) => {
    if (!confirm('Hapus project ini beserta semua hasil exportnya?')) return
    await api(`/api/projects/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Riwayat</h1>
        {items && items.length > 0 && <p>{items.length} project, terbaru di atas.</p>}
      </div>

      {err && (
        <div className="state-box" role="alert">
          <h2>Riwayat tidak bisa dimuat</h2>
          <p>{err}. Pastikan backend berjalan, lalu coba lagi.</p>
          <button className="btn" onClick={load}>Coba lagi</button>
        </div>
      )}

      {!err && !items && (
        <div className="state-box" aria-live="polite"><p>Memuat riwayat…</p></div>
      )}

      {!err && items && items.length === 0 && (
        <div className="state-box">
          <h2>Belum ada project</h2>
          <p>Setiap video yang kamu proses akan muncul di sini.</p>
          <Link to="/" className="btn btn-primary">Proses video pertama</Link>
        </div>
      )}

      {!err && items && items.length > 0 && (
        <div className="proj-list">
          {items.map((p) => {
            const [cls, label] = CHIP[p.status] || CHIP.new
            return (
              <div className="proj-row" key={p.id}>
                <div style={{ minWidth: 0 }}>
                  <h3><Link to={`/studio/${p.id}`}>{p.title}</Link></h3>
                  <div className="proj-meta tnum">
                    <span>{fmtDate(p.created_at)}</span>
                    {p.duration > 0 && <span>Durasi {fmtTime(p.duration)}</span>}
                    <span>{p.clips_count} klip</span>
                  </div>
                  {p.status === 'error' && (
                    <div className="proj-err">{String(p.error || '').slice(0, 140)}</div>
                  )}
                </div>
                <span className={`chip ${cls}`}>{label}</span>
                <div className="proj-actions">
                  <Link to={`/studio/${p.id}`} className="btn btn-sm">Buka Studio</Link>
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(p.id)}
                    aria-label={`Hapus project ${p.title}`}>Hapus</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
