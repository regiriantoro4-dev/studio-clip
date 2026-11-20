import { useState } from 'react'
import { api } from '../api.js'
import { clipWords } from '../presets.js'

export default function CaptionEditor({ clip, transcript, videoRef, onSave, onTitle, projectId, onReplace }) {
  const [editing, setEditing] = useState(null) // "si-wi"
  const [draft, setDraft] = useState('')
  const [fixing, setFixing] = useState(false)
  const [fixMsg, setFixMsg] = useState('')

  const runFix = async () => {
    setFixing(true)
    setFixMsg('')
    try {
      const { job_id } = await api(`/api/projects/${projectId}/fix-transcript`, { method: 'POST' })
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200))
        const j = await api(`/api/jobs/${job_id}`)
        if (j.status === 'done') {
          const t = await api(`/api/projects/${projectId}/transcript`)
          onReplace(t)
          setFixMsg({ ok: true, text: `Selesai, ${j.result?.changed ?? 0} kata diperbaiki.` })
          break
        }
        if (j.status === 'error') {
          setFixMsg({ ok: false, text: `Gagal: ${j.error}` })
          break
        }
      }
    } catch (e) {
      setFixMsg({ ok: false, text: `Gagal: ${e.message}` })
    } finally {
      setFixing(false)
    }
  }

  if (!transcript) return <p className="hint" aria-live="polite">Memuat transkrip…</p>
  const words = clipWords(transcript, clip)
  const now = videoRef.current?.currentTime ?? -1

  const commit = (si, wi) => {
    const text = draft.trim()
    setEditing(null)
    if (!text) return
    const copy = structuredClone(transcript)
    copy.segments[si].words[wi].w = text
    copy.segments[si].text = copy.segments[si].words.map((w) => w.w).join(' ')
    onSave(copy)
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="clip-title">Judul klip</label>
        <input id="clip-title" className="input" value={clip.title} onChange={(e) => onTitle(e.target.value)} />
      </div>

      <button className="btn btn-block" disabled={fixing} onClick={runFix} style={{ marginBottom: 8 }}>
        {fixing ? 'AI sedang mengoreksi…' : 'Perbaiki typo seluruh transkrip dengan AI'}
      </button>
      {fixMsg && <p className={`hint ${fixMsg.ok ? 'msg-ok' : 'msg-err'}`} style={{ marginBottom: 8 }} role="status">{fixMsg.text}</p>}

      <p className="hint" style={{ marginBottom: 10 }}>
        Klik kata untuk lompat ke posisinya. Klik dua kali, atau fokus lalu tekan E, untuk mengedit.
      </p>
      <div className="words-flow">
        {words.map((w) => {
          const key = `${w.si}-${w.wi}`
          const active = now >= w.s && now < w.e
          if (editing === key) {
            return (
              <span key={key} className="word-chip now">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(w.si, w.wi)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(w.si, w.wi)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  style={{ width: `${Math.max(4, draft.length + 1)}ch` }}
                />
              </span>
            )
          }
          return (
            <button
              type="button"
              key={key}
              className={`word-chip ${active ? 'now' : ''}`}
              title={`${w.s.toFixed(2)}s`}
              onClick={() => { if (videoRef.current) videoRef.current.currentTime = w.s }}
              onDoubleClick={() => { setEditing(key); setDraft(w.w) }}
              onKeyDown={(e) => { if (e.key === 'e' || e.key === 'E' || e.key === 'F2') { e.preventDefault(); setEditing(key); setDraft(w.w) } }}
            >
              {w.w}
            </button>
          )
        })}
        {words.length === 0 && <p className="hint">Tidak ada kata di rentang klip ini.</p>}
      </div>
    </div>
  )
}
