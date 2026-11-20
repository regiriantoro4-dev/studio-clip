import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AturanAcak from './AturanAcak.jsx'

// Produksi variasi Video jadi: tiap video -> N versi dengan tema, font, gaya, animasi, intro/outro berbeda.
// Juga menampilkan batch yang sedang berjalan / terhenti, dengan tombol Lanjutkan.
export default function VariasiPanel({ value, onChange, fileCount, refreshKey }) {
  const [batches, setBatches] = useState([])
  const [err, setErr] = useState('')
  const set = (patch) => onChange({ ...value, ...patch })

  const load = useCallback(() => {
    api('/api/variasi/batches').then(setBatches).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load, refreshKey])
  const running = batches.some((b) => b.running)
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [running, load])

  const resume = async (id) => {
    setErr('')
    try {
      await api(`/api/variasi/batches/${id}/resume`, { method: 'POST' })
      load()
    } catch (e) {
      setErr(e.message)
    }
  }

  const total = (fileCount || 0) * Number(value.n || 0)
  const shown = batches.filter((b) => b.running || !b.finished).concat(batches.filter((b) => !b.running && b.finished).slice(0, 2))

  return (
    <>
      <div className="auto-box">
        <label className="check-row">
          <input type="checkbox" checked={value.on} onChange={(e) => set({ on: e.target.checked })} />
          <span>
            <b>Produksi variasi otomatis</b>
            <span>
              Tiap video dibuat jadi beberapa versi. Tema border, tagline, font, gaya teks brand, animasi,
              dan intro/outro diacak supaya tidak ada dua versi yang sama.
            </span>
          </span>
        </label>
        {value.on && (
          <>
            <div className="field">
              <label htmlFor="variasi-n">Jumlah variasi per video</label>
              <input id="variasi-n" className="input" type="number" min={1} max={20} value={value.n}
                onChange={(e) => set({ n: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
              <span className="hint tnum">
                {fileCount ? `${fileCount} video × ${value.n} variasi = ${total} video jadi.` : 'Pilih video dulu di sebelah kiri.'}
                {' '}Hasil masuk ke folder <code>Siap Upload/&lt;tanggal&gt; Variasi &lt;jam&gt;</code>.
              </span>
            </div>
            <div className="field">
              <label className="check-row">
                <input type="checkbox" checked={value.intro} onChange={(e) => set({ intro: e.target.checked })} />
                Pasang intro animasi (template diacak)
              </label>
              <label className="check-row">
                <input type="checkbox" checked={value.outro} onChange={(e) => set({ outro: e.target.checked })} />
                Pasang outro ajakan follow (posisi dan lonceng diacak)
              </label>
            </div>
            {/* tahap 4: Acak gaya (default mati -> resep variasi lama apa adanya) */}
            <div className="field">
              <label className="check-row">
                <input type="checkbox" checked={!!value.acak} onChange={(e) => set({ acak: e.target.checked })} />
                <span>
                  <b>Acak gaya (koleksi baru)</b>
                  <span>
                    Font, gaya teks brand, dan animasi diambil dari koleksi Frame Studio (font baru, gaya TikTok,
                    animasi baru), merata dalam batch dan tidak mengulang kombinasi video sebelumnya.
                  </span>
                </span>
              </label>
              {value.acak && <AturanAcak batch />}
            </div>
            <span className="hint">
              Pengaturan tema, teks brand, dan intro/outro di Pengaturan tidak dipakai dan tidak diubah oleh mode ini.
            </span>
          </>
        )}
      </div>

      {shown.length > 0 && (
        <div className="auto-box" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <b style={{ fontSize: 14 }}>Batch variasi</b>
            <Link to="/variasi" className="btn btn-sm btn-ghost">Buka galeri</Link>
          </div>
          {shown.map((b) => {
            const pct = b.total ? Math.round((b.done / b.total) * 100) : 0
            const stopped = !b.running && !b.finished
            return (
              <div key={b.id} className="field">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <span className="tnum" style={{ fontSize: 13.5 }}>
                    {b.done}/{b.total} video · {b.assets} aset · {b.running ? 'sedang berjalan' : b.finished ? 'selesai' : 'terhenti'}
                  </span>
                  {stopped && (
                    <button type="button" className="btn btn-sm" onClick={() => resume(b.id)}>
                      Lanjutkan ({b.total - b.done} lagi)
                    </button>
                  )}
                </div>
                <div className="progress-outer" style={{ marginTop: 6 }}>
                  <div className="progress-inner" style={{ width: `${pct}%` }} />
                </div>
                <span className="hint">{b.running ? b.stage : b.folder}</span>
                {stopped && b.errors[0] && <span className="hint">Catatan: {b.errors[0]}</span>}
              </div>
            )
          })}
          {err && <div className="error-text" role="alert">{err}</div>}
        </div>
      )}
    </>
  )
}
