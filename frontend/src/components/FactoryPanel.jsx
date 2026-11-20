import { useEffect, useState } from 'react'
import { api } from '../api.js'

const STATUS_LABEL = { pending: 'Antre', running: 'Diproduksi', done: 'Selesai', error: 'Gagal' }

function fmtDur(s) {
  if (!s) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h} j ${m} mnt` : `${m} mnt`
}

/** Pabrik konten: antrean video horor massal yang berjalan sendiri (tetap lanjut setelah restart). */
export default function FactoryPanel({ style, pov, voice, llm }) {
  const [q, setQ] = useState(null)
  const [count, setCount] = useState(20)
  const [topics, setTopics] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api('/api/factory').then(setQ).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const act = async (fn) => {
    setErr('')
    setBusy(true)
    try { setQ(await fn()) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const topicList = topics.split('\n').map((t) => t.trim()).filter(Boolean)
  const total = Math.max(Number(count) || 0, topicList.length)

  const addBatch = () => act(() => api('/api/factory/batch', {
    method: 'POST',
    body: { count: Number(count), topics: topicList, style, pov, voice, llm_provider: llm, start: true },
  }).then((r) => { setTopics(''); return r }))

  const c = q?.counts || {}
  const left = (c.pending || 0) + (c.running || 0)

  return (
    <section className="card" aria-labelledby="factory-title" style={{ marginTop: 16 }}>
      <h2 id="factory-title" className="card-title">
        Pabrik konten <small>antrean video horor otomatis</small>
      </h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Video dibuat satu per satu sampai antrean habis, lalu masuk ke <code>Siap Upload/&lt;tanggal&gt;</code>.
        Antrean tetap lanjut setelah backend restart. Video yang gagal dicoba sekali lagi, lalu dilewati.
        Gaya naskah, gaya visual, suara, dan LLM mengikuti pilihan di atas.
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="fac-count">Jumlah video</label>
          <input id="fac-count" type="number" min={1} max={200} className="input tnum"
            value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label htmlFor="fac-topics">Topik, satu per baris (opsional)</label>
          <textarea id="fac-topics" className="input" rows={4}
            placeholder={'Kosong = AI memilih ide baru untuk tiap video.\nKalau diisi, topik dipakai dulu, sisanya diisi AI.'}
            value={topics} onChange={(e) => setTopics(e.target.value)} />
          <span className="hint tnum">{topicList.length} topik · {Math.max(0, total - topicList.length)} ide dari AI</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy || total < 1} onClick={addBatch}>
          Tambah {total} video ke antrean
        </button>
        {q && (q.paused
          ? <button className="btn" disabled={busy || !left} onClick={() => act(() => api('/api/factory/start', { method: 'POST' }))}>Jalankan</button>
          : <button className="btn" disabled={busy} onClick={() => act(() => api('/api/factory/pause', { method: 'POST' }))}>Jeda setelah video ini</button>)}
        {c.done > 0 && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api('/api/factory/clear-done', { method: 'POST' }))}>
            Bersihkan yang selesai
          </button>
        )}
      </div>
      {err && <div className="error-text" role="alert">{err}</div>}

      {q && (
        <>
          <p className="hint tnum" role="status" style={{ marginTop: 14 }}>
            {q.paused ? 'Dijeda' : q.worker_alive ? 'Berjalan' : 'Menunggu'} · selesai {c.done || 0} · antre {c.pending || 0}
            {c.error ? ` · gagal ${c.error}` : ''} · rata-rata {fmtDur(q.avg_seconds)}/video
            {q.eta_seconds ? ` · sisa sekitar ${fmtDur(q.eta_seconds)}` : ''}
          </p>
          {q.current && (
            <div style={{ marginBottom: 12 }}>
              <div className="hint" style={{ marginBottom: 4 }}>{q.current.stage}</div>
              <div className="progress-outer"><div className="progress-inner" style={{ width: `${Math.round(q.current.progress * 100)}%` }} /></div>
            </div>
          )}
          {q.items.length > 0 && (
            <ul className="ready-list">
              {q.items.map((it, i) => (
                <li key={it.id}>
                  <span className="hint tnum" style={{ width: 28 }}>{i + 1}</span>
                  <span className="ready-name" title={it.error || it.topic}>
                    {it.title || it.topic || 'Ide dari AI'}
                    {it.status === 'error' && it.error ? ` — ${it.error}` : ''}
                  </span>
                  <span className="hint">{STATUS_LABEL[it.status] || it.status}</span>
                  {it.pid && <a className="btn btn-sm btn-ghost" href={`/studio/${it.pid}`}>Buka</a>}
                  {it.status === 'error' && (
                    <button className="btn btn-sm" disabled={busy}
                      onClick={() => act(() => api(`/api/factory/items/${it.id}/retry`, { method: 'POST' }))}>Ulangi</button>
                  )}
                  {(it.status === 'pending' || it.status === 'error') && (
                    <button type="button" className="photo-remove" aria-label="Hapus dari antrean" disabled={busy}
                      onClick={() => act(() => api(`/api/factory/items/${it.id}`, { method: 'DELETE' }))}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
