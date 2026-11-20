import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import './VariasiGaleri.css'

// Unsur resep yang bisa diblokir ("jangan pakai lagi"), urut seperti tampil di kartu.
const ROWS = [
  { kind: 'theme', label: 'Tema border', get: (r) => r.theme },
  { kind: 'font', label: 'Font teks brand', get: (r) => r.font },
  { kind: 'gaya', label: 'Gaya teks', get: (r) => r.gaya },
  { kind: 'anim', label: 'Animasi jalan', get: (r) => r.anim },
  { kind: 'anim_in', label: 'Animasi masuk', get: (r) => r.anim_in },
  { kind: 'intro', label: 'Intro', get: (r) => r.intro },
]
const KIND_LABEL = Object.fromEntries(ROWS.map((r) => [r.kind, r.label]))

const batchLabel = (id) => `${id.slice(6, 8)}/${id.slice(4, 6)}/${id.slice(0, 4)} ${id.slice(9, 11)}.${id.slice(11, 13)}`

export default function VariasiGaleri() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [batch, setBatch] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)

  const load = useCallback(() => {
    api('/api/variasi/gallery')
      .then((d) => { setData(d); setErr('') })
      .catch((e) => setErr(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const names = data?.names || {}
  const prefs = data?.prefs || { blocked: {}, favorites: [] }
  const nameOf = (kind, value) => (value ? (names[kind]?.[value] || value) : 'tanpa')
  const isBlocked = (kind, value) => (prefs.blocked[kind] || []).includes(value)
  const activeBatch = batch || data?.batches?.[0] || ''

  const items = useMemo(
    () => (data?.items || []).filter((i) => i.batch === activeBatch && (!onlyFav || i.favorite)),
    [data, activeBatch, onlyFav],
  )
  const blockedList = ROWS.flatMap((r) => (prefs.blocked[r.kind] || []).map((v) => ({ kind: r.kind, value: v })))

  const toggleBlock = async (kind, value, on) => {
    try {
      const p = await api('/api/variasi/prefs/block', { method: 'POST', body: { kind, value, on } })
      setData((d) => ({ ...d, prefs: p }))
    } catch (e) { setErr(e.message) }
  }

  const toggleFav = async (item) => {
    try {
      const p = await api('/api/variasi/prefs/favorite', { method: 'POST', body: { pid: item.pid, clip: item.clip, on: !item.favorite } })
      const keys = new Set(p.favorites.map((f) => f.key))
      setData((d) => ({ ...d, prefs: p, items: d.items.map((i) => ({ ...i, favorite: keys.has(i.key) })) }))
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Galeri variasi</h1>
        <p>
          Semua video hasil produksi variasi beserta resepnya. Tandai resep yang bagus supaya dipakai lagi,
          dan blokir tema, font, gaya, atau animasi yang tidak Anda suka supaya tidak muncul di batch berikutnya.
        </p>
      </div>

      {err && <div className="state-box" role="alert"><p>{err}</p><button className="btn" onClick={load}>Coba lagi</button></div>}
      {!data && !err && <div className="state-box" aria-live="polite"><p>Memuat galeri…</p></div>}

      {data && data.items.length === 0 && (
        <div className="state-box">
          <p>Belum ada video variasi. Buat dulu lewat tab Video jadi dengan mencentang Produksi variasi otomatis.</p>
          <Link to="/" className="btn btn-primary">Buka Video jadi</Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <section className="card vg-bar">
            <div className="field">
              <label htmlFor="vg-batch">Batch</label>
              <select id="vg-batch" className="select" value={activeBatch} onChange={(e) => setBatch(e.target.value)}>
                {data.batches.map((b) => (
                  <option key={b} value={b}>
                    {batchLabel(b)} · {data.items.filter((i) => i.batch === b).length} video
                  </option>
                ))}
              </select>
              <span className="hint">{data.folders[activeBatch]}</span>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
              Hanya resep yang dipakai lagi ({prefs.favorites.length})
            </label>
          </section>

          <section className="card" aria-labelledby="vg-pref">
            <h2 id="vg-pref" className="card-title">Tidak dipakai lagi <small>{blockedList.length} unsur</small></h2>
            {blockedList.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Belum ada yang diblokir. Tekan "Jangan pakai lagi" di samping unsur resep pada kartu video.
              </p>
            ) : (
              <div className="vg-tags">
                {blockedList.map((b) => (
                  <button key={`${b.kind}:${b.value}`} type="button" className="vg-tag"
                    onClick={() => toggleBlock(b.kind, b.value, false)}
                    title="Izinkan lagi">
                    {KIND_LABEL[b.kind]}: {nameOf(b.kind, b.value)} <span aria-hidden="true">×</span>
                    <span className="vg-sr">, izinkan lagi</span>
                  </button>
                ))}
              </div>
            )}
            <p className="hint" style={{ marginBottom: 0 }}>
              Resep yang ditandai "dipakai lagi" mengisi paling banyak separuh variasi tiap video di batch berikutnya.
              Sisanya tetap resep baru.
            </p>
          </section>

          {items.length === 0 && <div className="state-box"><p>Tidak ada video untuk saringan ini.</p></div>}

          <div className="vg-grid">
            {items.map((it) => {
              const r = it.recipe
              return (
                <article className={`card vg-card ${it.favorite ? 'is-fav' : ''}`} key={`${it.pid}:${it.clip}`}>
                  {it.url
                    ? <video className="vg-video" src={it.url} controls preload="metadata" playsInline />
                    : <div className="vg-video vg-missing">Pratinjau tidak tersedia</div>}
                  <div className="vg-body">
                    <div className="vg-name" title={it.file}>{it.file}</div>
                    <div className="hint">
                      {it.aset}{r.favorit ? ' · resep pakai ulang' : ''}{it.exists ? '' : ' · file di folder Siap Upload sudah dipindah/dihapus'}
                    </div>
                    <dl className="vg-recipe">
                      {ROWS.map((row) => {
                        const value = row.get(r)
                        const blocked = value && isBlocked(row.kind, value)
                        return (
                          <div className="vg-row" key={row.kind}>
                            <dt>{row.label}</dt>
                            <dd className={blocked ? 'is-blocked' : ''}>{nameOf(row.kind, value)}</dd>
                            {value ? (
                              <button type="button" className="btn btn-sm btn-ghost vg-block"
                                aria-pressed={!!blocked}
                                onClick={() => toggleBlock(row.kind, value, !blocked)}>
                                {blocked ? 'Izinkan lagi' : 'Jangan pakai lagi'}
                              </button>
                            ) : <span />}
                          </div>
                        )
                      })}
                      <div className="vg-row">
                        <dt>Teks papan</dt>
                        <dd>{r.tagline} · {r.board_font}</dd><span />
                      </div>
                      <div className="vg-row">
                        <dt>Posisi & ukuran</dt>
                        <dd className="tnum">{nameOf('pos', r.pos)} · {r.size} · lebar {r.width}%</dd><span />
                      </div>
                      <div className="vg-row">
                        <dt>Outro</dt>
                        <dd>{r.outro ? `ajakan follow · ${r.outro_pos} · lonceng ${r.bell}` : 'tanpa'}</dd><span />
                      </div>
                    </dl>
                    <button type="button" className={`btn btn-block ${it.favorite ? 'btn-primary' : ''}`}
                      aria-pressed={it.favorite} onClick={() => toggleFav(it)}>
                      {it.favorite ? 'Resep ini dipakai lagi ✓' : 'Pakai lagi resep ini'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
