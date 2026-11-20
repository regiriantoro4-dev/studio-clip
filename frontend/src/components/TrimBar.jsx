import { useRef } from 'react'
import { fmtTime } from '../presets.js'

export default function TrimBar({ clip, duration, videoRef, onChange, onSplit, splitBusy }) {
  const barRef = useRef(null)
  const dur = Math.max(duration || clip.end, 1)

  const pctOf = (clientX) => {
    const rect = barRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const dragHandle = (which) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const move = (ev) => {
      const v = pctOf(ev.clientX) * dur
      if (which === 'start') onChange({ start: Math.min(v, clip.end - 1) })
      else onChange({ end: Math.max(v, clip.start + 1) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const seek = (e) => {
    const v = pctOf(e.clientX) * dur
    if (videoRef.current) videoRef.current.currentTime = v
  }

  const setFromPlayer = (which) => {
    const t = videoRef.current?.currentTime ?? 0
    if (which === 'start') onChange({ start: Math.min(t, clip.end - 1) })
    else onChange({ end: Math.max(t, clip.start + 1) })
  }

  const playT = videoRef.current?.currentTime ?? 0
  const left = (clip.start / dur) * 100
  const width = ((clip.end - clip.start) / dur) * 100

  return (
    <div className="trimwrap card" style={{ padding: 14 }}>
      <div className="trimline" ref={barRef} onClick={seek}>
        <div className="trim-range" style={{ left: `${left}%`, width: `${width}%` }} />
        <div className="trim-playhead" style={{ left: `${(playT / dur) * 100}%` }} />
        <div className="trim-handle" style={{ left: `calc(${left}% - 6px)` }} onPointerDown={dragHandle('start')} />
        <div className="trim-handle" style={{ left: `calc(${left + width}% - 6px)` }} onPointerDown={dragHandle('end')} />
      </div>

      <div className="trim-nums">
        <div className="field">
          <label>Mulai (dtk)</label>
          <input
            className="input" type="number" step="0.1" min="0"
            value={Number(clip.start).toFixed(1)}
            onChange={(e) => onChange({ start: Math.min(Number(e.target.value) || 0, clip.end - 1) })}
          />
        </div>
        <button className="btn btn-sm" onClick={() => setFromPlayer('start')}>Set mulai di sini</button>
        <div className="field">
          <label>Selesai (dtk)</label>
          <input
            className="input" type="number" step="0.1" min="0"
            value={Number(clip.end).toFixed(1)}
            onChange={(e) => onChange({ end: Math.max(Number(e.target.value) || 0, clip.start + 1) })}
          />
        </div>
        <button className="btn btn-sm" onClick={() => setFromPlayer('end')}>Set selesai di sini</button>
        {onSplit && (
          <button className="btn btn-sm" disabled={splitBusy} onClick={onSplit}
            title="AI memilih titik cliffhanger, klip dipecah jadi Part 1 dan Part 2">
            {splitBusy ? 'Memecah…' : 'Pecah jadi Part 1/2'}
          </button>
        )}
        <span className="trim-len">
          Durasi <b>{fmtTime(clip.end - clip.start)}</b>
        </span>
      </div>
    </div>
  )
}
