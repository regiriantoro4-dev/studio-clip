import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

// Intro/outro animasi (HyperFrames). Teks, warna, font bebas; disimpan di settings.brand.bumper.
// Pratinjau = file yang sama persis dengan yang ditempel ke video (di-cache per isi).

function Side({ kind, label, templates, cfg, fonts, onChange }) {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  // template sejenis di atas, yang lain tetap bisa dipilih
  const list = [...templates.filter((t) => t.kind === kind), ...templates.filter((t) => t.kind !== kind)]
  const tpl = templates.find((t) => t.id === cfg.template) || list[0]
  const vars = cfg.vars || {}
  const setVar = (id, v) => onChange({ vars: { ...vars, [id]: v } })

  const preview = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api('/api/bumper/preview', { method: 'POST', body: { template: tpl.id, vars, font: cfg.font, tag_font: cfg.tag_font } })
      setUrl(`${r.url}?t=${Date.now()}`)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="bp-side">
      <label className="check-row">
        <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <b>{label}</b>
      </label>
      <div className="field">
        <label htmlFor={`bp-${kind}-tpl`}>Template</label>
        <select id={`bp-${kind}-tpl`} className="select" value={tpl?.id || ''} onChange={(e) => { setUrl(''); onChange({ template: e.target.value }) }}>
          {list.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.duration} dtk</option>)}
        </select>
        {tpl && <span className="hint">{tpl.desc}</span>}
      </div>
      {tpl?.variables.filter((v) => v.type === 'string' && !v.options).map((v) => (
        <div className="field" key={v.id}>
          <label htmlFor={`bp-${kind}-${v.id}`}>{v.label}</label>
          <input id={`bp-${kind}-${v.id}`} className="input" maxLength={40} value={vars[v.id] ?? v.default}
            onChange={(e) => setVar(v.id, e.target.value)} />
        </div>
      ))}
      {tpl?.variables.some((v) => v.options) && (
        <div className="bp-layout">
          {tpl.variables.filter((v) => v.options).map((v) => (
            <label key={v.id} className="fs-num">
              <span>{v.label}</span>
              <select className="select" value={vars[v.id] ?? v.default} onChange={(e) => setVar(v.id, e.target.value)}>
                {v.options.map(([val, name]) => <option key={val} value={val}>{name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      <span className="hint"><code>{'{brand}'}</code> nama brand, <code>{'{handle}'}</code> akun, <code>{'{tagline}'}</code> tagline dari Pengaturan.</span>
      <div className="row">
        <div className="field">
          <label htmlFor={`bp-${kind}-font`}>Font teks utama</label>
          <select id={`bp-${kind}-font`} className="select" value={cfg.font} onChange={(e) => onChange({ font: e.target.value })} style={{ fontFamily: `"${cfg.font}"` }}>
            {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`bp-${kind}-tfont`}>Font tagline</label>
          <select id={`bp-${kind}-tfont`} className="select" value={cfg.tag_font} onChange={(e) => onChange({ tag_font: e.target.value })} style={{ fontFamily: `"${cfg.tag_font}"` }}>
            {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
          </select>
        </div>
      </div>
      <div className="bp-colors">
        {tpl?.variables.filter((v) => v.type === 'color').map((v) => (
          <label key={v.id} className="bp-color">
            <input type="color" value={vars[v.id] || v.default} onChange={(e) => setVar(v.id, e.target.value)} aria-label={v.label} />
            <span>{v.label}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-sm" onClick={preview} disabled={busy || !tpl}>
        {busy ? 'Merender pratinjau… (±20 dtk pertama kali)' : 'Lihat pratinjau'}
      </button>
      {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}
      {url && (
        <div className="bp-preview">
          <video src={url} autoPlay loop muted playsInline aria-label={`Pratinjau ${label}`} />
        </div>
      )}
    </div>
  )
}

export default function BumperPanel() {
  const [data, setData] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [fonts, setFonts] = useState([])
  const [status, setStatus] = useState('')
  const dirty = useRef(false)

  useEffect(() => {
    api('/api/bumper/templates').then((d) => { setData(d); setCfg(d.settings) }).catch((e) => setStatus(e.message))
    api('/api/studio/fonts').then((m) => setFonts(Object.keys(m))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cfg || !dirty.current) return
    setStatus('Menyimpan…')
    const t = setTimeout(() => {
      api('/api/settings', { method: 'PUT', body: { brand: { bumper: cfg } } })
        .then(() => setStatus('Tersimpan. Dipasang otomatis di setiap video yang dirender.'))
        .catch((e) => setStatus(`Gagal menyimpan: ${e.message}`))
    }, 700)
    return () => clearTimeout(t)
  }, [cfg])

  if (!data || !cfg) return status ? <p className="hint">{status}</p> : null
  const change = (kind) => (patch) => { dirty.current = true; setCfg((c) => ({ ...c, [kind]: { ...c[kind], ...patch } })) }

  return (
    <details className="bt-panel bp-panel">
      <summary>
        <b>Intro &amp; outro animasi</b>
        <span className="hint"> · teks bebas, dirender sekali lalu dipakai di semua video</span>
      </summary>
      <div className="bp-body">
        <Side kind="intro" label="Pasang intro di awal video" templates={data.templates} cfg={cfg.intro} fonts={fonts} onChange={change('intro')} />
        <Side kind="outro" label="Pasang outro di akhir video" templates={data.templates} cfg={cfg.outro} fonts={fonts} onChange={change('outro')} />
      </div>
      <p className="hint" aria-live="polite">{status}</p>
    </details>
  )
}
