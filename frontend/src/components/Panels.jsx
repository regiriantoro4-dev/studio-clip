import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { DEFAULT_FX, FONTS, FORMATS, HOOK_TEMPLATES, PRESETS, RATIOS } from '../presets.js'

function Msg({ msg, style }) {
  if (!msg) return null
  return <p className={`hint ${msg.ok ? 'msg-ok' : 'msg-err'}`} style={style} role="status">{msg.text}</p>
}

/* ---------- Panel Efek Viral ---------- */
export function FxPanel({ clip, onChange, projectId, onReplace }) {
  const fx = { ...DEFAULT_FX, ...(clip.fx || {}) }
  const set = (patch) => onChange({ fx: patch })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [music, setMusic] = useState([])

  const [themes, setThemes] = useState({})
  const [defTheme, setDefTheme] = useState('podcast')

  useEffect(() => {
    api('/api/settings/music').then((r) => setMusic(r.files || [])).catch(() => {})
    api('/api/brand/fonts').then((r) => setThemes(r.themes || {})).catch(() => {})
    const loadDef = () => api('/api/settings').then((s) => setDefTheme(s.brand?.theme || 'podcast')).catch(() => {})
    loadDef()
    window.addEventListener('autoclipper-settings-saved', loadDef)
    return () => window.removeEventListener('autoclipper-settings-saved', loadDef)
  }, [])

  const analyze = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { job_id } = await api(`/api/projects/${projectId}/annotate`, { method: 'POST' })
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200))
        const j = await api(`/api/jobs/${job_id}`)
        if (j.status === 'done') {
          const t = await api(`/api/projects/${projectId}/transcript`)
          onReplace(t)
          setMsg({ ok: true, text: `Selesai, ${j.result?.marked ?? 0} kata kunci dan emoji ditandai.` })
          break
        }
        if (j.status === 'error') {
          setMsg({ ok: false, text: `Gagal: ${j.error}` })
          break
        }
      }
    } catch (e) {
      setMsg({ ok: false, text: `Gagal: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="check-row">
        <input type="checkbox" checked={fx.border !== false} onChange={(e) => set({ border: e.target.checked })} />
        Border brand di klip ini
      </label>
      {fx.border !== false && Object.keys(themes).length > 1 && (
        <div className="field">
          <label htmlFor="fx-border-theme">Tema border</label>
          <select id="fx-border-theme" className="select" value={fx.border_theme || ''}
            onChange={(e) => set({ border_theme: e.target.value })}>
            <option value="">Ikuti default ({themes[defTheme] || defTheme})</option>
            {Object.entries(themes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
      {fx.border !== false && String(fx.border_theme || defTheme).startsWith('frame:') && (
        <div className="field">
          <label htmlFor="fx-frame-title">Judul di frame</label>
          <input id="fx-frame-title" className="input" value={fx.frame_title || ''} maxLength={200}
            placeholder="Kosong = pakai hook klip (atau tagline)"
            onChange={(e) => set({ frame_title: e.target.value })} />
          <span className="hint">
            Tampil di papan frame / layer {'{judul}'}.{' '}
            <a href={`/frame-studio?frame=${String(fx.border_theme || defTheme).slice(6)}`}>Edit tampilan frame ini</a>
          </span>
        </div>
      )}
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        Nama, warna, font, dan logo diatur di Pengaturan, bagian Brand dan border.
      </p>

      <label className="check-row">
        <input type="checkbox" checked={fx.zoom} onChange={(e) => set({ zoom: e.target.checked })} />
        Zoom punch-in tiap ganti kalimat
      </label>
      {fx.zoom && (
        <div className="slider-row">
          <label>Kekuatan zoom</label>
          <input type="range" min="0.04" max="0.15" step="0.01" value={fx.zoom_strength} aria-label="Kekuatan zoom"
            onChange={(e) => set({ zoom_strength: Number(e.target.value) })} />
          <span className="val">{Math.round(fx.zoom_strength * 100)}%</span>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={fx.cut_silence} onChange={(e) => set({ cut_silence: e.target.checked })} />
        Buang jeda hening (jump cut)
      </label>
      {fx.cut_silence && (
        <div className="slider-row">
          <label>Jeda minimal</label>
          <input type="range" min="0.4" max="1.5" step="0.1" value={fx.silence_gap} aria-label="Jeda minimal"
            onChange={(e) => set({ silence_gap: Number(e.target.value) })} />
          <span className="val">{fx.silence_gap.toFixed(1)}s</span>
        </div>
      )}
      {fx.cut_silence && (
        <div className="slider-row">
          <label>Cara</label>
          <select className="input" value={fx.jeda_mode || 'buang'} aria-label="Cara memotong jeda"
            onChange={(e) => set({ jeda_mode: e.target.value })}>
            <option value="buang">Buang habis (tegas, cepat)</option>
            <option value="rapat">Rapatkan (alami, napas tetap ada)</option>
          </select>
        </div>
      )}
      {fx.cut_silence && fx.jeda_mode === 'rapat' && (
        <div className="slider-row">
          <label>Sisa jeda</label>
          <input type="range" min="0.2" max="0.8" step="0.05" value={fx.jeda_sisa ?? 0.4} aria-label="Sisa jeda"
            onChange={(e) => set({ jeda_sisa: Number(e.target.value) })} />
          <span className="val">{Number(fx.jeda_sisa ?? 0.4).toFixed(2)}s</span>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={fx.progress_bar} onChange={(e) => set({ progress_bar: e.target.checked })} />
        Progress bar di bawah video
      </label>
      {fx.progress_bar && (
        <div className="color-row">
          <label className="color-item">
            Warna bar <input type="color" value={fx.progress_color}
              onChange={(e) => set({ progress_color: e.target.value })} />
          </label>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={fx.keywords} onChange={(e) => set({ keywords: e.target.checked })} />
        Sorot kata kunci (hasil AI)
      </label>
      <label className="check-row">
        <input type="checkbox" checked={fx.emoji} onChange={(e) => set({ emoji: e.target.checked })} />
        Emoji otomatis di subtitle (hasil AI)
      </label>

      <label className="check-row">
        <input type="checkbox" checked={fx.teaser !== false} onChange={(e) => set({ teaser: e.target.checked })} />
        Cold-open teaser: momen dramatis di detik pertama
      </label>
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        {clip.teaser
          ? `Teaser terdeteksi AI di detik ${Number(clip.teaser.start).toFixed(1)} sampai ${Number(clip.teaser.end).toFixed(1)}. Hanya tampil di hasil export.`
          : 'Belum ada momen teaser. Jalankan analisis AI di bawah.'}
      </p>

      <div className="field">
        <label htmlFor="bgm">Musik latar (volume turun otomatis saat ada suara)</label>
        <select id="bgm" className="select" value={fx.bgm || ''} onChange={(e) => set({ bgm: e.target.value })}>
          <option value="">Tanpa musik</option>
          {music.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="hint">
          {music.length === 0 ? 'Belum ada musik. Unggah file lewat Pengaturan.' : 'Tambah musik lewat Pengaturan.'} Hanya terdengar di hasil export.
        </span>
      </div>
      {fx.bgm && (
        <div className="slider-row">
          <label>Volume musik</label>
          <input type="range" min="0.04" max="0.4" step="0.02" value={fx.bgm_volume ?? 0.12} aria-label="Volume musik"
            onChange={(e) => set({ bgm_volume: Number(e.target.value) })} />
          <span className="val">{Math.round((fx.bgm_volume ?? 0.12) * 100)}%</span>
        </div>
      )}

      <button className="btn btn-block" disabled={busy} onClick={analyze} style={{ marginTop: 4 }}>
        {busy ? 'AI sedang menganalisis…' : 'Analisis kata kunci, emoji, dan teaser'}
      </button>
      <Msg msg={msg} style={{ marginTop: 8 }} />
      <p className="hint" style={{ marginTop: 10 }}>
        Project baru dianalisis otomatis saat diproses. Tombol di atas untuk project lama
        atau analisis ulang setelah mengedit teks. Emoji di hasil export dirender satu warna
        (keterbatasan render subtitle), di preview tetap berwarna.
      </p>
    </div>
  )
}

/* ---------- Panel Gaya Subtitle ---------- */
export function StylePanel({ clip, onChange }) {
  const s = clip.style || {}
  const set = (patch) => onChange(patch)

  return (
    <div>
      <div className="preset-grid">
        {PRESETS.map((p) => {
          const sel = s.preset === p.id
          return (
            <button
              type="button"
              key={p.id}
              className={`preset-card crop ${sel ? 'is-sel' : ''}`}
              aria-pressed={sel}
              onClick={() => set({ preset: p.id })}
            >
              <div className="pname">{p.name}</div>
              <div className="pdesc">{p.desc}</div>
            </button>
          )
        })}
      </div>

      <div className="field">
        <label htmlFor="sub-font">Font</label>
        <select id="sub-font" className="select" value={s.font || 'Arial Black'} onChange={(e) => set({ font: e.target.value })}>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="slider-row">
        <label>Ukuran</label>
        <input type="range" min="0.6" max="1.6" step="0.05" value={s.size ?? 1} aria-label="Ukuran subtitle"
          onChange={(e) => set({ size: Number(e.target.value) })} />
        <span className="val">{(s.size ?? 1).toFixed(2)}×</span>
      </div>

      <div className="slider-row">
        <label>Posisi vertikal</label>
        <input type="range" min="35" max="92" step="1" value={s.pos ?? 74} aria-label="Posisi vertikal subtitle"
          onChange={(e) => set({ pos: Number(e.target.value) })} />
        <span className="val">{s.pos ?? 74}%</span>
      </div>

      <div className="color-row">
        <label className="color-item">
          Teks <input type="color" value={s.color || '#FFFFFF'} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="color-item">
          Sorot <input type="color" value={s.highlight || '#FFD100'} onChange={(e) => set({ highlight: e.target.value })} />
        </label>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={s.uppercase !== false}
          onChange={(e) => set({ uppercase: e.target.checked })} />
        Huruf kapital semua
      </label>
      <p className="hint">Preview di player mendekati hasil akhir. Hasil export dirender presisi oleh ffmpeg.</p>
    </div>
  )
}

/* ---------- Panel Hook ---------- */
export function HookPanel({ clip, onChange, projectId }) {
  const hs = clip.hook_style || {}
  const setHs = (patch) => onChange({ hook_style: patch })
  const [hookBusy, setHookBusy] = useState(false)
  const [hookMsg, setHookMsg] = useState(null)

  const regenHooks = async () => {
    setHookBusy(true)
    setHookMsg(null)
    try {
      const r = await api(`/api/projects/${projectId}/clips/${clip.id}/hooks`, { method: 'POST' })
      onChange({ hooks: r.hooks })
      setHookMsg({ ok: true, text: '3 variasi baru siap. Klik salah satu untuk memakainya.' })
    } catch (e) {
      setHookMsg({ ok: false, text: `Gagal: ${e.message}` })
    } finally {
      setHookBusy(false)
    }
  }

  return (
    <div>
      <label className="check-row">
        <input type="checkbox" checked={hs.enabled !== false}
          onChange={(e) => setHs({ enabled: e.target.checked })} />
        Tampilkan hook di awal video
      </label>

      <div className="field">
        <label htmlFor="hook-text">Teks hook</label>
        <textarea
          id="hook-text"
          className="input" rows={3}
          placeholder="Kalimat yang bikin penonton berhenti scroll…"
          value={clip.hook || ''}
          onChange={(e) => onChange({ hook: e.target.value })}
        />
      </div>

      {(clip.hooks || []).length > 0 && (
        <div className="field">
          <span className="field-label">Variasi dari AI, klik untuk memakai</span>
          {clip.hooks.map((h, i) => {
            const sel = clip.hook === h
            return (
              <button
                type="button"
                key={i}
                className={`hook-option crop ${sel ? 'is-sel' : ''}`}
                aria-pressed={sel}
                onClick={() => onChange({ hook: h })}
              >
                {h}
              </button>
            )
          })}
        </div>
      )}
      <button className="btn btn-block" disabled={hookBusy} onClick={regenHooks} style={{ marginBottom: 10 }}>
        {hookBusy ? 'AI membuat hook…' : 'Buat 3 variasi hook dengan AI'}
      </button>
      <Msg msg={hookMsg} style={{ marginBottom: 10 }} />

      <div className="section-label">Gaya hook</div>
      <div className="preset-grid">
        {HOOK_TEMPLATES.map((t) => {
          const sel = (hs.template || 'classic') === t.id
          return (
            <button
              type="button"
              key={t.id}
              className={`preset-card crop ${sel ? 'is-sel' : ''}`}
              aria-pressed={sel}
              onClick={() => setHs({ template: t.id })}
            >
              <div className="pname">{t.name}</div>
              <div className="pdesc">{t.desc}</div>
            </button>
          )
        })}
      </div>

      <div className="slider-row">
        <label>Posisi vertikal</label>
        <input type="range" min="5" max="60" step="1" value={hs.pos ?? 14} aria-label="Posisi vertikal hook"
          onChange={(e) => setHs({ pos: Number(e.target.value) })} />
        <span className="val">{hs.pos ?? 14}%</span>
      </div>

      <div className="slider-row">
        <label>Ukuran</label>
        <input type="range" min="0.6" max="1.6" step="0.05" value={hs.size ?? 1} aria-label="Ukuran hook"
          onChange={(e) => setHs({ size: Number(e.target.value) })} />
        <span className="val">{(hs.size ?? 1).toFixed(2)}×</span>
      </div>
    </div>
  )
}

/* ---------- Panel Export ---------- */
const SHAPES = { '9:16': [14, 26], '1:1': [22, 22], '16:9': [30, 17] }

export function ExportPanel({ projectId, clip, ratio, setRatio, onDone, videoRef }) {
  const [fmt, setFmt] = useState('mp4')
  const [job, setJob] = useState(null)
  const [err, setErr] = useState('')
  const pollRef = useRef(null)

  const [thumbText, setThumbText] = useState('')
  const [thumbArrow, setThumbArrow] = useState(true)
  const [thumbMascot, setThumbMascot] = useState(true)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbMsg, setThumbMsg] = useState(null)

  const [meta, setMeta] = useState(null)
  const [metaBusy, setMetaBusy] = useState(false)
  const [metaMsg, setMetaMsg] = useState(null)
  const [copied, setCopied] = useState('')

  useEffect(() => () => clearInterval(pollRef.current), [])

  useEffect(() => {
    setThumbText(clip.meta?.thumbnail_text || clip.hook || '')
    setMeta(clip.meta || null)
    setThumbMsg(null)
    setMetaMsg(null)
  }, [clip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeThumb = async () => {
    setThumbBusy(true)
    setThumbMsg(null)
    try {
      const t = videoRef?.current?.currentTime ?? clip.start
      await api(`/api/projects/${projectId}/clips/${clip.id}/thumbnail`, {
        method: 'POST',
        body: { time: t, text: thumbText, ratio, arrow: thumbArrow, mascot: thumbMascot },
      })
      onDone()
      setThumbMsg({ ok: true, text: 'Thumbnail dibuat dari frame di posisi player.' })
    } catch (e) {
      setThumbMsg({ ok: false, text: `Gagal: ${e.message}` })
    } finally {
      setThumbBusy(false)
    }
  }

  const genMeta = async () => {
    setMetaBusy(true)
    setMetaMsg(null)
    try {
      const m = await api(`/api/projects/${projectId}/clips/${clip.id}/metadata`, { method: 'POST' })
      setMeta(m)
      if (!thumbText && m.thumbnail_text) setThumbText(m.thumbnail_text)
      onDone()
    } catch (e) {
      setMetaMsg({ ok: false, text: `Gagal: ${e.message}` })
    } finally {
      setMetaBusy(false)
    }
  }

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* clipboard tidak tersedia */ }
  }

  const doExport = async () => {
    setErr('')
    try {
      const { job_id } = await api(`/api/projects/${projectId}/clips/${clip.id}/render`, {
        method: 'POST',
        body: { ratio, format: fmt },
      })
      setJob({ status: 'running', progress: 0 })
      pollRef.current = setInterval(async () => {
        try {
          const j = await api(`/api/jobs/${job_id}`)
          setJob(j)
          if (j.status !== 'running') {
            clearInterval(pollRef.current)
            if (j.status === 'error') setErr(j.error)
            else onDone()
          }
        } catch {
          clearInterval(pollRef.current)
        }
      }, 900)
    } catch (e) {
      setErr(e.message)
      setJob(null)
    }
  }

  const busy = job?.status === 'running'

  return (
    <div>
      <div className="section-label">Video</div>
      <div className="ratio-row" role="group" aria-label="Aspect ratio">
        {RATIOS.map((r) => {
          const [w, h] = SHAPES[r]
          const sel = ratio === r
          return (
            <button key={r} type="button" className={`ratio-btn crop ${sel ? 'is-sel' : ''}`} aria-pressed={sel} onClick={() => setRatio(r)}>
              <span className="ratio-shape" style={{ width: w, height: h }} />
              {r}
            </button>
          )
        })}
      </div>

      <div className="field">
        <label htmlFor="fmt">Format file</label>
        <select id="fmt" className="select" value={fmt} onChange={(e) => setFmt(e.target.value)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}{f === 'gif' ? ' (tanpa audio)' : ''}</option>)}
        </select>
      </div>

      <button className="btn btn-primary btn-block" disabled={busy} onClick={doExport}>
        {busy ? `Merender… ${Math.round((job.progress || 0) * 100)}%` : `Export ${fmt.toUpperCase()} ${ratio}`}
      </button>
      {busy && (
        <div className="progress-outer" style={{ marginTop: 10 }}>
          <div className="progress-inner" style={{ width: `${(job.progress || 0) * 100}%` }} />
        </div>
      )}
      {err && <div className="error-text" role="alert">{err}</div>}

      {(clip.exports || []).length > 0 && (
        <div style={{ marginTop: 8 }}>
          {[...clip.exports].reverse().map((e, i) => (
            <div className="export-item" key={i}>
              <span className="tnum">{e.format.toUpperCase()} · {e.ratio}</span>
              <a href={e.url} download>Unduh</a>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Thumbnail ---------- */}
      <div className="section-label">Thumbnail</div>
      <div className="field">
        <label htmlFor="thumb-text">Teks besar di thumbnail</label>
        <textarea id="thumb-text" className="input" rows={2} placeholder="Teks besar di thumbnail…"
          value={thumbText} onChange={(e) => setThumbText(e.target.value)} />
      </div>
      <div className="check-inline">
        <label className="check-row">
          <input type="checkbox" checked={thumbArrow} onChange={(e) => setThumbArrow(e.target.checked)} />
          Panah merah
        </label>
        <label className="check-row">
          <input type="checkbox" checked={thumbMascot} onChange={(e) => setThumbMascot(e.target.checked)} />
          Maskot
        </label>
      </div>
      <button className="btn btn-block" disabled={thumbBusy} onClick={makeThumb}>
        {thumbBusy ? 'Membuat…' : 'Buat thumbnail dari frame ini'}
      </button>
      <Msg msg={thumbMsg} style={{ marginTop: 6 }} />
      {clip.thumbnail?.url && (
        <div className="thumb-preview">
          <img src={`${clip.thumbnail.url}?v=${clip.thumbnail.ts}`} alt={`Thumbnail klip ${clip.title}`} />
          <a href={clip.thumbnail.url} download style={{ fontSize: 13, fontWeight: 700 }}>Unduh thumbnail</a>
        </div>
      )}

      {/* ---------- Metadata posting ---------- */}
      <div className="section-label">Judul, deskripsi, hashtag</div>
      <button className="btn btn-block" disabled={metaBusy} onClick={genMeta}>
        {metaBusy ? 'AI menyusun…' : meta ? 'Susun ulang dengan AI' : 'Susun dengan AI'}
      </button>
      <Msg msg={metaMsg} style={{ marginTop: 6 }} />
      {meta && (
        <div style={{ marginTop: 10 }}>
          {[
            ['Judul', meta.title],
            ['Teks thumbnail', meta.thumbnail_text],
            ['Deskripsi', meta.description],
            ['Hashtag', (meta.hashtags || []).join(' ')],
          ].map(([label, value]) => (
            <div key={label} className="meta-box">
              <div className="meta-box-head">
                <span>{label}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => copy(label, value)} aria-label={`Salin ${label}`}>
                  {copied === label ? 'Tersalin' : 'Salin'}
                </button>
              </div>
              <div className="meta-box-body">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
