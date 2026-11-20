import { fmtTime } from '../presets.js'

export default function ClipList({ clips, activeId, onSelect, onAdd, onDelete }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Klip <small className="tnum">{clips.length}</small></span>
        <button className="btn btn-sm" onClick={onAdd} title="Buat klip 30 detik mulai dari posisi player">+ Tambah</button>
      </div>
      <div className="panel-body" style={{ maxHeight: '74vh', overflowY: 'auto' }}>
        {clips.map((c) => {
          const sel = c.id === activeId
          return (
            <div key={c.id} className={`clip-card crop ${sel ? 'is-sel' : ''}`}>
              <button className="clip-pick" onClick={() => onSelect(c.id)} aria-pressed={sel}>
                <span className={`score ${c.score >= 80 ? 'hot' : c.score >= 60 ? 'warm' : ''}`}
                  title="Skor potensi dari AI (0-100)">
                  {c.score || '-'}
                </span>
                <h4>{c.title}</h4>
                <div className="meta">
                  <span className="tc">{fmtTime(c.start)} → {fmtTime(c.end)}</span>
                  {' · '}{Math.round(c.end - c.start)} dtk
                  {c.exports?.length > 0 && <> · {c.exports.length} export</>}
                </div>
                {c.hook && <div className="hook-preview">"{c.hook}"</div>}
              </button>
              <div className="clip-foot">
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onDelete(c.id)}
                  aria-label={`Hapus klip ${c.title}`}>
                  Hapus
                </button>
              </div>
            </div>
          )
        })}
        {clips.length === 0 && <p className="hint">Belum ada klip. Tombol "Tambah" membuat klip 30 detik dari posisi player.</p>}
      </div>
    </div>
  )
}
