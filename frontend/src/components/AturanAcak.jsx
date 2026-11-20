import { useEffect, useState } from 'react'
import { api } from '../api.js'
import './AcakGaya.css'

// Tahap 4B: rentang acakan. Disimpan di backend, dipakai bersama oleh tombol Acak gaya di
// Frame Studio dan mode Acak gaya di produksi variasi batch.
export default function AturanAcak({ batch = false }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api('/api/acakgaya/aturan').then(setData).catch((e) => setErr(e.message)) }, [])

  const save = async (patch) => {
    setErr('')
    setData((d) => ({ ...d, aturan: { ...d.aturan, ...patch } }))
    try {
      setData(await api('/api/acakgaya/aturan', { method: 'POST', body: patch }))
    } catch (e) {
      setErr(e.message)
    }
  }

  if (!data) return <div className="ag-rules">{err ? <span className="ag-err">{err}</span> : <span className="hint">Memuat aturan…</span>}</div>
  const a = data.aturan
  const toggle = (key, id) => {
    const cur = a[key]
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    if (next.length) save({ [key]: next })
  }

  return (
    <div className="ag-rules">
      <div className="ag-rule-row">
        <span className="ag-lbl">Kelompok font</span>
        <div className="ag-chips">
          {data.pilihan.font_kategori.filter((c) => c.jumlah > 0).map((c) => (
            <button key={c.id} type="button" className={`ag-chip ${a.font_kategori.includes(c.id) ? 'is-on' : ''}`}
              aria-pressed={a.font_kategori.includes(c.id)} onClick={() => toggle('font_kategori', c.id)}>
              {c.label} <small>{c.jumlah}</small>
            </button>
          ))}
        </div>
        {batch && <span className="hint">Font script tidak dipakai di batch karena teks brand selalu huruf besar.</span>}
      </div>
      <div className="ag-rule-row">
        <span className="ag-lbl">Kelompok gaya teks</span>
        <div className="ag-chips">
          {data.pilihan.gaya_grup.map((g) => (
            <button key={g.id} type="button" className={`ag-chip ${a.gaya_grup.includes(g.id) ? 'is-on' : ''}`}
              aria-pressed={a.gaya_grup.includes(g.id)} onClick={() => toggle('gaya_grup', g.id)}>
              {g.label} <small>{g.jumlah}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="ag-rule-row ag-checks">
        <label><input type="checkbox" checked={a.animasi_muncul} onChange={(e) => save({ animasi_muncul: e.target.checked })} /> Animasi muncul</label>
        <label><input type="checkbox" checked={a.gerakan} onChange={(e) => save({ gerakan: e.target.checked })} /> Animasi gerakan</label>
        {!batch && <label><input type="checkbox" checked={a.bingkai} onChange={(e) => save({ bingkai: e.target.checked })} /> Gaya bingkai video</label>}
        <label title="Hanya gaya yang memakai warna brand atau hitam/putih">
          <input type="checkbox" checked={a.warna_brand} onChange={(e) => save({ warna_brand: e.target.checked })} /> Warna brand saja
        </label>
      </div>
      <div className="ag-rule-row ag-checks">
        <label className="ag-num">
          Jangan ulangi kombinasi dari
          <input className="input" type="number" min={0} max={500} value={a.anti_kembar}
            onChange={(e) => save({ anti_kembar: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} />
          pemakaian terakhir
        </label>
      </div>
      <span className="hint tnum">± {Number(data.jumlah).toLocaleString('id-ID')} kombinasi di Frame Studio dengan aturan ini. Aturan yang sama dipakai tombol Acak gaya di Frame Studio dan mode Acak gaya di produksi variasi.</span>
      {err && <span className="ag-err">{err}</span>}
    </div>
  )
}
