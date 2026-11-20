import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import CaptionEditor from '../components/CaptionEditor.jsx'
import ClipList from '../components/ClipList.jsx'
import { ExportPanel, FxPanel, HookPanel, StylePanel } from '../components/Panels.jsx'
import Player from '../components/Player.jsx'
import TrimBar from '../components/TrimBar.jsx'

export default function Studio() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [job, setJob] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState('style')
  const [ratio, setRatio] = useState('9:16')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [watermark, setWatermark] = useState(null)
  const [brand, setBrand] = useState(null)
  const videoRef = useRef(null)
  const pending = useRef({})
  const timers = useRef({})
  const tTimer = useRef(null)

  const loadProject = useCallback(async () => {
    try {
      const p = await api(`/api/projects/${id}`)
      setProject(p)
      if (p.status === 'ready') {
        setActiveId((cur) => cur || p.clips[0]?.id || null)
      }
      if (p.job_id && p.status === 'processing') {
        api(`/api/jobs/${p.job_id}`).then(setJob).catch(() => {})
      }
      return p
    } catch (e) {
      setErr(e.message)
      return null
    }
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])

  // Watermark global untuk preview (ikut ter-refresh saat Pengaturan disimpan)
  useEffect(() => {
    const loadWm = () => api('/api/settings').then((s) => { setWatermark(s.watermark); setBrand(s.brand) }).catch(() => {})
    loadWm()
    window.addEventListener('autoclipper-settings-saved', loadWm)
    return () => window.removeEventListener('autoclipper-settings-saved', loadWm)
  }, [])

  // Polling saat masih diproses
  useEffect(() => {
    if (project?.status !== 'processing') return
    const t = setInterval(loadProject, 1500)
    return () => clearInterval(t)
  }, [project?.status, loadProject])

  // Ambil transkrip saat siap
  useEffect(() => {
    if (project?.status === 'ready' && !transcript) {
      api(`/api/projects/${id}/transcript`).then(setTranscript).catch(() => {})
    }
  }, [project?.status, transcript, id])

  const updateClip = (cid, patch) => {
    setProject((p) => ({
      ...p,
      clips: p.clips.map((c) => {
        if (c.id !== cid) return c
        const merged = { ...c, ...patch }
        if (patch.style) merged.style = { ...c.style, ...patch.style }
        if (patch.hook_style) merged.hook_style = { ...c.hook_style, ...patch.hook_style }
        if (patch.fx) merged.fx = { ...c.fx, ...patch.fx }
        return merged
      }),
    }))
    pending.current[cid] = deepMergePatch(pending.current[cid] || {}, patch)
    clearTimeout(timers.current[cid])
    timers.current[cid] = setTimeout(async () => {
      const body = pending.current[cid]
      pending.current[cid] = {}
      try {
        setSaving(true)
        await api(`/api/projects/${id}/clips/${cid}`, { method: 'PUT', body })
      } catch { /* perubahan lokal tetap ada */ } finally {
        setSaving(false)
      }
    }, 600)
  }

  const saveTranscript = (t) => {
    setTranscript(t)
    clearTimeout(tTimer.current)
    tTimer.current = setTimeout(async () => {
      try {
        setSaving(true)
        await api(`/api/projects/${id}/transcript`, { method: 'PUT', body: t })
      } catch { /* abaikan */ } finally {
        setSaving(false)
      }
    }, 800)
  }

  const addManualClip = async () => {
    const t = videoRef.current?.currentTime || 0
    const clip = await api(`/api/projects/${id}/clips`, {
      method: 'POST',
      body: { start: t, end: Math.min(t + 30, project.duration || t + 30) },
    })
    setProject((p) => ({ ...p, clips: [...p.clips, clip] }))
    setActiveId(clip.id)
  }

  const deleteClip = async (cid) => {
    if (!confirm('Hapus klip ini?')) return
    await api(`/api/projects/${id}/clips/${cid}`, { method: 'DELETE' })
    setProject((p) => {
      const clips = p.clips.filter((c) => c.id !== cid)
      if (activeId === cid) setActiveId(clips[0]?.id || null)
      return { ...p, clips }
    })
  }

  const retry = async () => {
    setErr('')
    await api(`/api/projects/${id}/process`, { method: 'POST', body: {} })
    loadProject()
  }

  const [splitBusy, setSplitBusy] = useState(false)
  const splitClip = async (cid) => {
    if (!confirm('Pecah klip ini jadi Part 1 (berakhir di cliffhanger) + Part 2? Klip asli tetap ada.')) return
    setSplitBusy(true)
    try {
      const r = await api(`/api/projects/${id}/clips/${cid}/split`, { method: 'POST' })
      await loadProject()
      setActiveId(r.parts[0].id)
    } catch (e) {
      alert(e.message)
    } finally {
      setSplitBusy(false)
    }
  }

  if (err && !project) {
    return (
      <div className="page">
        <div className="card processing-card">
          <h2>Project tidak bisa dibuka</h2>
          <p className="hint" style={{ margin: '8px 0 16px' }}>{err}</p>
          <Link to="/projects" className="btn">Kembali ke Riwayat</Link>
        </div>
      </div>
    )
  }
  if (!project) return <div className="page"><div className="card processing-card" aria-live="polite"><div className="spinner" /><h2>Memuat project…</h2></div></div>

  if (project.status === 'processing' || project.status === 'new') {
    const pr = Math.round((job?.progress || 0) * 100)
    return (
      <div className="page">
        <div className="card processing-card" aria-live="polite">
          <div className="spinner" />
          <h2>Memproses {project.title}</h2>
          <div className="stage">{job?.stage || 'Menyiapkan'} · {pr}%</div>
          <div className="progress-outer"><div className="progress-inner" style={{ width: `${pr}%` }} /></div>
          <p className="hint" style={{ marginTop: 14 }}>
            Studio terbuka otomatis saat selesai. Halaman ini aman ditinggal, progres tetap tersimpan.
          </p>
        </div>
      </div>
    )
  }

  if (project.status === 'error') {
    return (
      <div className="page">
        <div className="card processing-card" role="alert">
          <h2>Proses gagal</h2>
          <p style={{ color: 'var(--danger)', margin: '12px 0' }}>{project.error}</p>
          <p className="hint" style={{ marginBottom: 18 }}>Kalau errornya soal provider, cek API key di Pengaturan, lalu proses ulang.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={retry}>Proses ulang</button>
            <Link to="/projects" className="btn">Ke Riwayat</Link>
          </div>
        </div>
      </div>
    )
  }

  const clip = project.clips.find((c) => c.id === activeId)

  const runAutoProduce = async () => {
    if (!confirm('Render klip skor tertinggi + thumbnail + caption ke folder Siap Upload?')) return
    await api(`/api/projects/${id}/autoproduce`, { method: 'POST', body: { n: 3, ratio: '9:16' } })
    loadProject()
  }

  return (
    <div className="page-wide">
      <div className="studio-head">
        <Link to="/projects" className="back">Riwayat /</Link>
        <h1>{project.title}</h1>
        <span className="saving-dot" aria-live="polite">{saving ? 'Menyimpan…' : ''}</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={runAutoProduce}>Auto-produce 3 klip terbaik</button>
      </div>

      {project.auto_output && (
        <div className="done-box">
          <b>{project.auto_output.files.length} video siap upload</b> di <code>{project.auto_output.folder}</code>
          <ul>
            {project.auto_output.files.map((f) => (
              <li key={f}>{f}, beserta thumbnail dan caption.txt</li>
            ))}
          </ul>
        </div>
      )}
      <div className="studio">
        <ClipList
          clips={project.clips}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={addManualClip}
          onDelete={deleteClip}
        />

        <div>
          {clip ? (
            <>
              <Player
                project={project}
                clip={clip}
                transcript={transcript}
                ratio={ratio}
                videoRef={videoRef}
                watermark={watermark}
                brand={brand}
              />
              <TrimBar
                clip={clip}
                duration={project.duration}
                videoRef={videoRef}
                onChange={(patch) => updateClip(clip.id, patch)}
                onSplit={() => splitClip(clip.id)}
                splitBusy={splitBusy}
              />
            </>
          ) : (
            <div className="state-box">
              <h2>Belum ada klip di project ini</h2>
              <p>Pakai tombol "Tambah" di panel kiri untuk membuat klip manual 30 detik dari posisi player.</p>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="side-tabs" role="tablist">
            {[['style', 'Subtitle'], ['fx', 'Efek'], ['hook', 'Hook'], ['text', 'Teks'], ['export', 'Export']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <div className="panel-body">
            {!clip && <p className="hint">Pilih klip di panel kiri untuk mengatur subtitle, efek, hook, dan export.</p>}
            {clip && tab === 'style' && (
              <StylePanel clip={clip} onChange={(s) => updateClip(clip.id, { style: s })} />
            )}
            {clip && tab === 'fx' && (
              <FxPanel
                clip={clip}
                onChange={(patch) => updateClip(clip.id, patch)}
                projectId={project.id}
                onReplace={setTranscript}
              />
            )}
            {clip && tab === 'hook' && (
              <HookPanel clip={clip} onChange={(patch) => updateClip(clip.id, patch)} projectId={project.id} />
            )}
            {clip && tab === 'text' && (
              <CaptionEditor
                clip={clip}
                transcript={transcript}
                videoRef={videoRef}
                onSave={saveTranscript}
                onTitle={(title) => updateClip(clip.id, { title })}
                projectId={project.id}
                onReplace={setTranscript}
              />
            )}
            {clip && tab === 'export' && (
              <ExportPanel
                projectId={project.id}
                clip={clip}
                ratio={ratio}
                setRatio={setRatio}
                onDone={loadProject}
                videoRef={videoRef}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function deepMergePatch(a, b) {
  const out = { ...a, ...b }
  if (a.style || b.style) out.style = { ...(a.style || {}), ...(b.style || {}) }
  if (a.hook_style || b.hook_style) out.hook_style = { ...(a.hook_style || {}), ...(b.hook_style || {}) }
  if (a.fx || b.fx) out.fx = { ...(a.fx || {}), ...(b.fx || {}) }
  return out
}
