import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { DEFAULT_FX, chunkParams, chunkWords, clipWords, fmtTime, wrapLines } from '../presets.js'

// Judul di bar border: hook (kalau aktif) atau judul klip — sama dengan border.clip_title di backend
export function borderTitle(clip) {
  const hook = (clip.hook || '').trim()
  if (hook && clip.hook_style?.enabled !== false) return hook
  return clip.title || ''
}

// Gambar border dari backend (renderer yang sama dengan export) + posisi jendela video
export function clipPart(clip) {
  const m = /\(Part\s*(\d+)\)/i.exec(clip.title || '')
  return m ? `PART ${m[1]}` : null
}

// Frame ornamen: papan bawah hanya berisi hook (kosong -> tagline brand) — sama dengan border.border_title
function frameBoardTitle(clip) {
  const own = (clip.fx?.frame_title || '').trim()
  if (own) return own
  const hook = (clip.hook || '').trim()
  return hook && clip.hook_style?.enabled !== false ? hook : ''
}

function useBorder(brand, clip, ratio) {
  const active = (!!brand?.enabled || !!clip.fx?.border_force) && clip.fx?.border !== false
  const part = clipPart(clip)
  const theme = clip.fx?.border_theme || brand?.theme || 'podcast'
  const title = theme.startsWith('frame:') ? frameBoardTitle(clip) : borderTitle(clip)
  const key = active ? JSON.stringify([brand, theme, title, part, ratio]) : ''
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!key) { setData(null); return }
    let alive = true
    const t = setTimeout(() => {
      api('/api/brand/preview', { method: 'POST', body: { brand: { ...brand, theme }, title, part, ratio } })
        .then((r) => { if (alive) setData(r) })
        .catch(() => { if (alive) setData(null) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return active ? data : null
}

function useElSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

// Mode "Rapatkan jeda": sama persis dengan renderer._tighten_cuts (40% sesudah kata, 60% sebelum
// kata berikutnya, 1,5x sesudah akhir kalimat).
function tightenRanges(words, start, end, gap, keep) {
  if (!words.length) return []
  const out = []
  if (words[0].s - start > gap) out.push([start, words[0].s - 0.6 * keep])
  let prevE = words[0].e
  let prevW = words[0]
  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    const g = w.s - prevE
    if (g > gap) {
      const k = Math.min(g, keep * (/[.!?…]$/.test(prevW.w || '') ? 1.5 : 1))
      const a = prevE + 0.4 * k
      const b = w.s - 0.6 * k
      if (b - a > 0.05) out.push([a, b])
    }
    if (w.e >= prevE) { prevE = w.e; prevW = w }
  }
  if (end - prevE > gap) out.push([prevE + 0.4 * keep, end])
  return out.filter(([a, b]) => b > a)
}

export default function Player({ project, clip, transcript, ratio, videoRef, watermark, brand }) {
  const wrapRef = useRef(null)
  const { w: boxW, h: boxH } = useElSize(wrapRef)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const clipRef = useRef(clip)
  clipRef.current = clip

  const fx = { ...DEFAULT_FX, ...(clip.fx || {}) }
  const preset = clip.style?.preset || 'beasty'
  const words = useMemo(
    () => (transcript ? clipWords(transcript, clip) : []),
    [transcript, clip.start, clip.end],
  )
  const chunks = useMemo(() => chunkWords(words, chunkParams(preset)), [words, preset])

  // Rentang jeda hening yang dilompati saat preview (meniru jump-cut hasil export)
  const skipRanges = useMemo(() => {
    if (!fx.cut_silence) return []
    if (fx.jeda_mode === 'rapat') return tightenRanges(words, clip.start, clip.end, fx.silence_gap, fx.jeda_sisa)
    const out = []
    for (let i = 1; i < words.length; i++) {
      if (words[i].s - words[i - 1].e > fx.silence_gap) {
        out.push([words[i - 1].e + 0.12, words[i].s - 0.12])
      }
    }
    return out
  }, [words, fx.cut_silence, fx.silence_gap, fx.jeda_mode, fx.jeda_sisa, clip.start, clip.end])
  const skipRef = useRef(skipRanges)
  skipRef.current = skipRanges

  // Loop pemutaran di dalam rentang klip + lompat jeda hening + sinkronisasi waktu
  useEffect(() => {
    let raf
    const tick = () => {
      const v = videoRef.current
      if (v) {
        setT(v.currentTime)
        setPlaying(!v.paused)
        const c = clipRef.current
        if (!v.paused && v.currentTime >= c.end) {
          v.currentTime = c.start
        } else if (!v.paused) {
          for (const [a, b] of skipRef.current) {
            if (v.currentTime >= a && v.currentTime < b) {
              v.currentTime = b
              break
            }
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoRef])

  // Zoom punch-in: bergantian tiap ganti kalimat (paritas index chunk aktif)
  let zoomScale = 1
  if (fx.zoom && chunks.length) {
    let passed = 0
    for (const c of chunks) {
      if (t >= c.start) passed++
    }
    const idx = Math.max(0, passed - 1)
    zoomScale = 1 + Number(fx.zoom_strength || 0.08) * (idx % 2)
  }

  const clipDur = Math.max(0.1, clip.end - clip.start)
  const pbPct = Math.min(1, Math.max(0, (t - clip.start) / clipDur))

  // Saat ganti klip, lompat ke awal klip
  useEffect(() => {
    const v = videoRef.current
    if (v && (v.currentTime < clip.start || v.currentTime > clip.end)) {
      v.currentTime = clip.start
    }
  }, [clip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < clip.start || v.currentTime >= clip.end) v.currentTime = clip.start
      v.play()
    } else {
      v.pause()
    }
  }

  const aspect = ratio === '9:16' ? '9 / 16' : ratio === '1:1' ? '1 / 1' : '16 / 9'

  // Border aktif: video masuk ke jendela, hook pindah ke bar judul, subtitle ke dalam jendela
  const bd = useBorder(brand, clip, ratio)
  let view = clip
  if (bd) {
    const hs = { ...(clip.hook_style || {}) }
    if (bd.title) hs.enabled = false
    else if (bd.hook_min && (hs.pos ?? 14) < bd.hook_min) hs.pos = bd.hook_min
    view = {
      ...clip,
      style: bd.sub_pos != null ? { ...(clip.style || {}), pos: bd.sub_pos } : clip.style,
      hook_style: hs,
    }
  }
  const bgRef = useRef(null)
  // Kartu Blur: video kedua (blur) di belakang, disinkronkan ke video utama
  useEffect(() => {
    if (!bd?.blur) return
    let raf
    const sync = () => {
      const v = videoRef.current, b = bgRef.current
      if (v && b) {
        if (Math.abs(b.currentTime - v.currentTime) > 0.3) b.currentTime = v.currentTime
        if (v.paused !== b.paused) (v.paused ? b.pause() : b.play().catch(() => {}))
      }
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [bd?.blur, videoRef])
  const videoBox = bd
    ? {
        inset: 'auto', left: `${bd.win[0] * 100}%`, top: `${bd.win[1] * 100}%`,
        width: `${bd.win[2] * 100}%`, height: `${bd.win[3] * 100}%`,
      }
    : {}
  const pbColor = bd && (fx.progress_color || '#7C5CFF').toUpperCase() === '#7C5CFF'
    ? brand.accent : (fx.progress_color || '#7C5CFF')

  return (
    <div>
      <div className="player-shell">
        <div
          className="player-wrap"
          ref={wrapRef}
          style={{ aspectRatio: aspect, width: ratio === '16:9' ? '100%' : undefined, height: ratio === '16:9' ? undefined : '62vh' }}
        >
          {bd?.blur && (
            <video ref={bgRef} className="player-blur-bg" src={project.media_url} muted playsInline aria-hidden="true" />
          )}
          <video
            ref={videoRef} src={project.media_url} onClick={toggle} playsInline
            style={{ ...videoBox, transform: `scale(${zoomScale})`, transition: 'transform 0.18s ease-out', transformOrigin: 'center' }}
          />
          {bd && <img className="player-border" src={bd.image} alt="" onClick={toggle} />}
          <HookOverlay clip={view} boxH={boxH} />
          <SubtitleOverlay transcript={transcript} clip={view} t={t} boxH={boxH} fx={fx} />
          <WatermarkOverlay wm={watermark} boxW={boxW} boxH={boxH} />
          {fx.progress_bar && (
            <div style={{
              position: 'absolute', left: 0, bottom: 0, zIndex: 7,
              height: '1.2%', width: `${pbPct * 100}%`,
              background: pbColor, pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>
      <div className="player-controls">
        <button className="btn btn-icon" onClick={toggle} aria-label={playing ? 'Jeda' : 'Putar'}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>
        <button className="btn btn-icon" title="Ke awal klip" aria-label="Ke awal klip"
          onClick={() => { if (videoRef.current) videoRef.current.currentTime = clip.start }}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2.5v14H6zM19 5v14l-9-7z" /></svg>
        </button>
        <input
          type="range" className="seek" aria-label="Posisi dalam klip"
          min={clip.start} max={clip.end} step={0.05}
          value={Math.min(Math.max(t, clip.start), clip.end)}
          onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value) }}
        />
        <span className="time">{fmtTime(Math.max(0, t - clip.start))} / {fmtTime(clip.end - clip.start)}</span>
      </div>
    </div>
  )
}

export function WatermarkOverlay({ wm, boxW, boxH }) {
  if (!wm?.enabled || !boxH) return null
  const pos = wm.position || 'top-right'
  const st = { position: 'absolute', zIndex: 6, pointerEvents: 'none', opacity: wm.opacity ?? 0.7 }
  if (pos === 'center') {
    st.top = '50%'; st.left = '50%'; st.transform = 'translate(-50%,-50%)'
  } else {
    if (pos.includes('top')) st.top = '3%'
    if (pos.includes('bottom')) st.bottom = '3%'
    if (pos.includes('left')) st.left = '3%'
    if (pos.includes('right')) st.right = '3%'
  }
  const size = wm.size || 1
  if ((wm.type || 'text') === 'image' && wm.image) {
    return <img src={`/media/${wm.image}`} alt="" style={{ ...st, width: boxW * 0.18 * size }} />
  }
  if (!wm.text?.trim()) return null
  return (
    <div style={{
      ...st, color: '#fff', fontWeight: 700, fontFamily: 'Arial, sans-serif',
      fontSize: boxH * 0.03 * size, textShadow: '0 1px 6px rgba(0,0,0,.6)',
    }}>
      {wm.text}
    </div>
  )
}

function strokeShadow(px, color = '#000') {
  const o = Math.max(1, px)
  return [
    `-${o}px -${o}px 0 ${color}`, `${o}px -${o}px 0 ${color}`,
    `-${o}px ${o}px 0 ${color}`, `${o}px ${o}px 0 ${color}`,
    `0 ${o * 1.6}px ${o * 2}px rgba(0,0,0,.55)`,
  ].join(', ')
}

export function SubtitleOverlay({ transcript, clip, t, boxH, fx = {} }) {
  const style = clip.style || {}
  const preset = style.preset || 'beasty'

  const words = useMemo(
    () => (transcript ? clipWords(transcript, clip) : []),
    [transcript, clip.start, clip.end],
  )
  const chunks = useMemo(() => chunkWords(words, chunkParams(preset)), [words, preset])

  if (!boxH || !chunks.length) return null
  const ci = chunks.findIndex((c) => t >= c.start && t < c.end)
  if (ci < 0) return null
  const chunk = chunks[ci]

  let ai = -1
  for (let i = 0; i < chunk.words.length; i++) if (t >= chunk.words[i].s) ai = i
  const activeShown = ai >= 0 && t < chunk.words[ai].showUntil

  const scale = style.size || 1
  const fs = boxH * 0.048 * scale
  const base = style.color || '#FFFFFF'
  const hi = style.highlight || '#FFD100'
  const upper = style.uppercase !== false
  const T = (w) => {
    let text = upper ? w.w.toUpperCase() : w.w
    if (fx.emoji !== false && w.em) text = `${text} ${w.em}`
    return text
  }
  const isHl = (w) => fx.keywords !== false && w.hl === true

  const wrapStyle = {
    top: `${style.pos ?? 74}%`,
    fontFamily: `'${style.font || 'Arial Black'}', sans-serif`,
    fontSize: fs,
    fontWeight: 900,
  }

  if (preset === 'beasty') {
    if (!activeShown) return null
    const w = chunk.words[ai]
    const anyHl = chunk.words.some(isHl)
    const longest = chunk.words.reduce((a, b) => (b.w.length > a.w.length ? b : a))
    const emphasized = anyHl ? isHl(w) : w === longest
    return (
      <div className="overlay-sub" style={{ ...wrapStyle, fontSize: fs * 1.25 }}>
        <span key={`${ci}-${ai}`} className="anim-pop"
          style={{ color: emphasized ? hi : base, textShadow: strokeShadow(fs * 0.06) }}>
          {T(w)}
        </span>
      </div>
    )
  }

  if (preset === 'boxy') {
    if (!activeShown) return null
    const w = chunk.words[ai]
    return (
      <div className="overlay-sub" style={wrapStyle}>
        <span key={`${ci}-${ai}`} className="anim-pop" style={{
          background: hi, color: base,
          padding: `${fs * 0.14}px ${fs * 0.3}px`,
          borderRadius: fs * 0.14,
        }}>
          {T(w)}
        </span>
      </div>
    )
  }

  if (preset === 'karaoke') {
    return (
      <div className="overlay-sub" style={{ ...wrapStyle, textShadow: strokeShadow(fs * 0.05) }}>
        {chunk.words.map((w, i) => (
          <span key={i} style={{ color: i <= ai ? hi : base }}>{T(w)} </span>
        ))}
      </div>
    )
  }

  if (preset === 'duo') {
    return (
      <div className="overlay-sub" style={{ ...wrapStyle, textShadow: strokeShadow(fs * 0.05) }}>
        {chunk.words.map((w, i) => (
          <span key={i} style={{ color: (i === ai && activeShown) || isHl(w) ? hi : base }}>{T(w)} </span>
        ))}
      </div>
    )
  }

  // clean
  return (
    <div className="overlay-sub" style={{ ...wrapStyle, fontWeight: 800, textShadow: strokeShadow(fs * 0.05) }}>
      {chunk.words.map((w, i) => (
        <span key={i} style={{ color: isHl(w) ? hi : base }}>{T(w)} </span>
      ))}
    </div>
  )
}

export function HookOverlay({ clip, boxH }) {
  const hs = clip.hook_style || {}
  if (!boxH || hs.enabled === false || !clip.hook?.trim()) return null

  const fs = boxH * 0.042 * (hs.size || 1)
  const lines = wrapLines(clip.hook, 22)
  const top = `${hs.pos ?? 14}%`
  const tpl = hs.template || 'classic'

  if (tpl === 'elegant') {
    return (
      <div className="overlay-hook" style={{
        top, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: fs,
        color: '#fff', letterSpacing: 1, textShadow: '0 2px 14px rgba(0,0,0,.85)',
      }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    )
  }

  if (tpl === 'box') {
    return (
      <div className="overlay-hook" style={{ top, fontSize: fs }}>
        <span style={{
          display: 'inline-block', background: 'rgba(0,0,0,.78)', color: '#fff',
          fontWeight: 700, fontFamily: 'Arial, sans-serif',
          padding: `${fs * 0.3}px ${fs * 0.55}px`, borderRadius: fs * 0.2, lineHeight: 1.4,
        }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </span>
      </div>
    )
  }

  if (tpl === 'boxies') {
    return (
      <div className="overlay-hook" style={{ top, fontSize: fs, fontFamily: "'Arial Black', sans-serif" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ marginBottom: fs * 0.18 }}>
            <span style={{
              display: 'inline-block', background: '#fff', color: '#111', fontWeight: 900,
              padding: `${fs * 0.16}px ${fs * 0.4}px`, borderRadius: fs * 0.12,
            }}>
              {l}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // classic
  return (
    <div className="overlay-hook" style={{
      top, fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: fs,
      color: '#fff', textShadow: strokeShadow(fs * 0.07),
    }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}
