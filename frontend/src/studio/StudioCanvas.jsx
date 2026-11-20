import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva'
import { api } from '../api.js'
import { H, SAFE_ZONES, TITLE_SAMPLE, TITLE_TOKEN, W, initials, needsServerFx, resolveColor, resolveText } from './model.js'

// --- pemuat gambar sederhana (cache per URL) ---
const imgCache = new Map()
function useImg(src) {
  const [img, setImg] = useState(() => (src && imgCache.get(src)) || null)
  useEffect(() => {
    if (!src) { setImg(null); return }
    if (imgCache.has(src)) { setImg(imgCache.get(src)); return }
    const im = new window.Image()
    im.onload = () => { imgCache.set(src, im); setImg(im) }
    im.onerror = () => setImg(null)
    im.src = src
  }, [src])
  return img
}

function contain(img, w, h) {
  if (!img) return { x: 0, y: 0, width: w, height: h }
  const s = Math.min(w / img.width, h / img.height)
  return { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s }
}

function coverCrop(iw, ih, w, h) {
  // potongan sumber agar menutupi w x h dari tengah (sama dengan renderer ffmpeg)
  const s = Math.max(w / iw, h / ih)
  const cw = w / s, ch = h / s
  return { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch }
}

function gradientPoints(angle) {
  const a = ((angle || 0) - 90) * Math.PI / 180
  const cx = W / 2, cy = H / 2
  const len = Math.abs(W * Math.cos(a)) / 2 + Math.abs(H * Math.sin(a)) / 2
  return {
    start: { x: cx - Math.cos(a) * len, y: cy - Math.sin(a) * len },
    end: { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len },
  }
}

function fontOf(l, preset) {
  return l.font === '@brand' || !l.font ? (preset?.font || 'Space Grotesk') : l.font
}

// ---------------------------------------------------------------- efek teks dari server
// Bevel, tekstur, kilap & sisi 3D bergradasi digambar renderer export (Pillow) lalu
// ditampilkan di kanvas, supaya editor = hasil video. Hasil di-cache per spesifikasi.

const FX_COLORS = ['color', 'fill2', 'fill3', 'stroke', 'bg', 'depthColor', 'depthColor2', 'shadowColor', 'glow', 'outline2',
  'lineBoxColor', 'marker', 'hlColor', 'hlBg', 'longColor'] // baris 2: efek TikTok (tahap 2)
const FX_SKIP = new Set(['id', 'name', 'x', 'y', 'rotation', 'opacity', 'visible', 'locked', 'section', 'sample', 'fallback', 'autoFit', 'anim', 'animIn', 'animSpeed', 'animAmount'])
const fxCache = new Map()
const fxPending = new Set()

// dipanggil sebelum export PNG: tunggu semua render efek selesai (maks ~8 dtk)
export async function waitTextFx() {
  for (let i = 0; i < 80 && fxPending.size; i++) await new Promise((r) => setTimeout(r, 100))
}

function fxSpec(l, preset, text) {
  const spec = {}
  for (const [k, v] of Object.entries(l)) if (!FX_SKIP.has(k)) spec[k] = v
  for (const k of FX_COLORS) spec[k] = l[k] ? resolveColor(l[k], preset) : ''
  spec.font = fontOf(l, preset)
  return { spec, text }
}

function useServerFx(body) {
  const key = body ? JSON.stringify(body) : ''
  const [res, setRes] = useState(() => (key && fxCache.get(key)) || null)
  useEffect(() => {
    if (!key) return
    if (fxCache.has(key)) { setRes(fxCache.get(key)); return }
    let alive = true
    const token = {}
    fxPending.add(token)
    const t = setTimeout(async () => {
      try {
        const r = await api('/api/studio/textfx', { method: 'POST', body })
        let out = { img: null, x: 0, y: 0 }
        if (r.image) {
          const im = new window.Image()
          await new Promise((ok, bad) => { im.onload = ok; im.onerror = bad; im.src = r.image })
          out = { img: im, x: r.x, y: r.y }
        }
        if (fxCache.size > 80) fxCache.delete(fxCache.keys().next().value)
        fxCache.set(key, out)
        if (alive) setRes(out)
      } catch { /* tetap pakai tampilan Konva */ } finally { fxPending.delete(token) }
    }, 140)
    return () => { alive = false; clearTimeout(t); fxPending.delete(token) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return key ? res : null
}

// ---------------------------------------------------------------- node per layer

function common(l, sel, onSelect, onChange) {
  return {
    id: l.id, x: l.x, y: l.y, rotation: l.rotation || 0, opacity: l.opacity ?? 1,
    draggable: !l.locked, visible: l.visible !== false, listening: !l.locked || sel,
    onMouseDown: (e) => { if (!l.locked) { e.cancelBubble = true; onSelect(l.id) } },
    onTap: (e) => { if (!l.locked) { e.cancelBubble = true; onSelect(l.id) } },
    onDragEnd: (e) => onChange({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) }),
  }
}

// Efek teks berlapis (belakang -> depan): glow, ekstrusi 3D (+ bayangan di lapisan terdalam),
// garis tepi luar, lalu teks utama (warna/gradasi + garis tepi). Semua digambar Konva,
// jadi ikut persis ke PNG frame yang dipublish.
function TextNode({ l, preset, ...rest }) {
  const txt = resolveText(String(l.text ?? '').split(TITLE_TOKEN).join(l.sample || TITLE_SAMPLE), preset)
  const fx = useServerFx(needsServerFx(l) ? fxSpec(l, preset, txt) : null)
  if (fx) {
    // gambar dari server; kotak transparan seukuran layer untuk klik/geser/transformer
    return (
      <Group {...rest}>
        <Rect width={l.w} height={l.h} fill="rgba(0,0,0,0)" />
        {fx.img && <Shape width={l.w} height={l.h} listening={false} sceneFunc={(ctx) => ctx.drawImage(fx.img, fx.x, fx.y)} />}
      </Group>
    )
  }
  const bg = l.bg ? resolveColor(l.bg, preset) : null
  const style = `${l.italic ? 'italic ' : ''}${l.bold ? 'bold' : 'normal'}`
  const col = (c) => resolveColor(c, preset)
  const base = {
    width: l.w, height: l.h, padding: l.padding || 0,
    text: l.uppercase ? txt.toUpperCase() : txt,
    fontFamily: fontOf(l, preset), fontSize: l.size, fontStyle: style,
    align: l.align || 'center', verticalAlign: 'middle',
    letterSpacing: l.letterSpacing || 0, lineHeight: l.lineHeight || 1.1, wrap: 'word', ellipsis: true,
    lineJoin: 'round', fillAfterStrokeEnabled: true, listening: false,
  }
  const sw = l.stroke ? l.strokeWidth || 0 : 0
  const ow = l.outline2 ? l.outline2Width || 0 : 0
  const silhouette = sw + ow * 2  // lebar garis siluet untuk lapisan belakang

  // gradasi vertikal hanya selebar tinggi teks (bukan seluruh kotak)
  let fill = { fill: col(l.color) }
  if (l.fill2) {
    const lines = String(base.text).split('\n').length
    const th = l.size * (l.lineHeight || 1.1) * lines
    const y0 = (l.h - th) / 2, y1 = (l.h + th) / 2
    const c1 = col(l.color), c2 = col(l.fill2)
    fill = {
      fillLinearGradientStartPoint: { x: 0, y: y0 },
      fillLinearGradientEndPoint: { x: 0, y: y1 },
      fillLinearGradientColorStops: l.shine
        ? [0, c2, 0.42, c1, 0.5, '#ffffff', 0.56, c2, 1, c1]
        : [0, c1, 1, c2],
    }
  }

  const depth = Math.max(0, Math.min(80, Math.round(l.depth || 0)))
  const ang = ((l.depthAngle ?? 45) * Math.PI) / 180
  const dx = Math.cos(ang), dy = Math.sin(ang)
  const shadow = l.shadowColor
    ? { shadowColor: col(l.shadowColor), shadowBlur: l.shadowBlur ?? 20, shadowOffsetX: l.shadowX ?? 0, shadowOffsetY: l.shadowY ?? 8, shadowOpacity: 1, shadowForStrokeEnabled: true }
    : {}

  const back = []
  if (l.glow) {
    const g = col(l.glow)
    for (let i = 0; i < 2; i++) {
      back.push(<Text key={`g${i}`} {...base} fill={g} stroke={g} strokeWidth={silhouette}
        shadowColor={g} shadowBlur={l.glowSize ?? 30} shadowOpacity={1} shadowForStrokeEnabled />)
    }
  }
  if (depth > 0) {
    const dc = col(l.depthColor || '#000000')
    for (let k = depth; k >= 1; k--) {
      back.push(<Text key={`d${k}`} {...base} x={dx * k} y={dy * k} fill={dc}
        stroke={silhouette ? dc : undefined} strokeWidth={silhouette} {...(k === depth ? shadow : {})} />)
    }
  }
  if (ow > 0) {
    back.push(<Text key="o" {...base} fill={col(l.outline2)} stroke={col(l.outline2)} strokeWidth={silhouette}
      {...(depth === 0 ? shadow : {})} />)
  }
  const mainShadow = depth === 0 && ow === 0 ? shadow : {}

  return (
    <Group {...rest}>
      {bg && <Rect width={l.w} height={l.h} fill={bg} opacity={l.bgOpacity ?? 1} cornerRadius={Math.min(l.radius || 0, l.h / 2, l.w / 2)} />}
      {back}
      <Text {...base} {...fill} {...mainShadow} listening
        stroke={sw ? col(l.stroke) : undefined} strokeWidth={sw} />
    </Group>
  )
}

function LogoNode({ l, preset, ...rest }) {
  const img = useImg(preset?.logo || '')
  const r = Math.min(l.w, l.h) / 2
  const clip = (ctx) => {
    if (l.shape === 'circle') ctx.arc(l.w / 2, l.h / 2, r, 0, Math.PI * 2)
    else if (l.shape === 'rounded') {
      const rr = Math.min(l.w, l.h) * 0.22
      ctx.roundRect ? ctx.roundRect(0, 0, l.w, l.h, rr) : ctx.rect(0, 0, l.w, l.h)
    } else ctx.rect(0, 0, l.w, l.h)
  }
  const ring = l.ringWidth > 0 ? resolveColor(l.ring, preset) : null
  return (
    <Group {...rest}>
      <Group clipFunc={clip}>
        {img ? (
          <KImage image={img} {...(l.shape === 'none' ? contain(img, l.w, l.h) : { width: l.w, height: l.h, crop: coverCrop(img.width, img.height, l.w, l.h) })} />
        ) : (
          <>
            <Rect width={l.w} height={l.h} fill={resolveColor(l.fallbackBg, preset)} />
            <Text width={l.w} height={l.h} align="center" verticalAlign="middle" text={initials(preset?.brand)}
              fontFamily={preset?.font || 'Space Grotesk'} fontStyle="bold" fontSize={Math.min(l.w, l.h) * 0.42}
              fill={resolveColor(l.fallbackText, preset)} />
          </>
        )}
      </Group>
      {ring && (l.shape === 'circle'
        ? <Circle x={l.w / 2} y={l.h / 2} radius={r - l.ringWidth / 2} stroke={ring} strokeWidth={l.ringWidth} />
        : <Rect width={l.w} height={l.h} stroke={ring} strokeWidth={l.ringWidth} cornerRadius={l.shape === 'rounded' ? Math.min(l.w, l.h) * 0.22 : 0} />)}
    </Group>
  )
}

function ShapeNode({ l, preset, ...rest }) {
  const fill = l.fill ? resolveColor(l.fill, preset) : undefined
  const stroke = l.stroke && l.strokeWidth ? resolveColor(l.stroke, preset) : undefined
  // isi gradasi vertikal: fill -> fill2 (mode logam: fill -> fill2 -> fill, kesan mengkilap)
  const grad = fill && l.fill2 ? {
    fill: undefined,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: l.h },
    fillLinearGradientColorStops: l.metal
      ? [0, fill, 0.5, resolveColor(l.fill2, preset), 1, fill]
      : [0, fill, 1, resolveColor(l.fill2, preset)],
  } : { fill }
  const sw = l.strokeWidth || 0
  return (
    <Group {...rest}>
      {l.shape === 'circle' ? (
        <Ellipse x={l.w / 2} y={l.h / 2} radiusX={l.w / 2} radiusY={l.h / 2} {...grad} stroke={stroke} strokeWidth={sw} />
      ) : l.shape === 'diamond' ? (
        <Line points={[l.w / 2, 0, l.w, l.h / 2, l.w / 2, l.h, 0, l.h / 2]} closed {...grad} stroke={stroke} strokeWidth={sw} lineJoin="round" />
      ) : (
        <Rect width={l.w} height={l.h} {...grad} stroke={stroke} strokeWidth={sw}
          cornerRadius={Math.min(l.radius || 0, l.w / 2, l.h / 2)} />
      )}
    </Group>
  )
}

function hexRgb(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '')
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Warnai ulang gambar: kecerahan dipertahankan (bayangan & kilap tetap), rona ikut warna tint
function tintFilter(rgb) {
  return function (imageData) {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255
      const k = lum * 1.55
      d[i] = Math.min(255, rgb[0] * k)
      d[i + 1] = Math.min(255, rgb[1] * k)
      d[i + 2] = Math.min(255, rgb[2] * k)
    }
  }
}

function ImageNode({ l, preset, ...rest }) {
  const img = useImg(l.src)
  const ref = useRef()
  const tint = l.tint ? resolveColor(l.tint, preset) : ''
  const r = contain(img, l.w, l.h)
  useEffect(() => {
    const n = ref.current
    if (!n || !img) return
    // pixelRatio 2: tetap tajam saat export di ukuran penuh 1080x1920
    if (tint) { n.cache({ pixelRatio: 2 }); n.filters([tintFilter(hexRgb(tint))]) } else { n.filters([]); n.clearCache() }
    n.getLayer()?.batchDraw()
  }, [img, tint, l.w, l.h, l.flipX, l.flipY])
  return (
    <Group {...rest}>
      {img ? (
        <KImage ref={ref} image={img} width={r.width} height={r.height}
          x={l.flipX ? r.x + r.width : r.x} y={l.flipY ? r.y + r.height : r.y}
          scaleX={l.flipX ? -1 : 1} scaleY={l.flipY ? -1 : 1} />
      ) : <Rect width={l.w} height={l.h} stroke="#888" dash={[16, 10]} strokeWidth={4} />}
    </Group>
  )
}

const NODES = { text: TextNode, logo: LogoNode, shape: ShapeNode, image: ImageNode }

// ---------------------------------------------------------------- gaya bingkai video (tahap 3, 17 Nov)
// Dipakai hanya bila video.borderStyle diisi; bingkai polos lama tetap digambar kode aslinya.

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// Cincin kertas di sekeliling jendela (luar dikurangi dalam, aturan evenodd)
function ringShape(outer, inner, fill, shadow) {
  return (ctx) => {
    const c = ctx._context
    c.save()
    c.beginPath()
    outer(c)
    c.moveTo(inner.x, inner.y)
    c.rect(inner.x, inner.y, inner.w, inner.h)
    c.fillStyle = fill
    if (shadow) { c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 28; c.shadowOffsetY = 10 }
    c.fill('evenodd')
    c.restore()
  }
}

function VideoBorder({ v, preset }) {
  const style = v.borderStyle
  const col = resolveColor(v.borderColor || '@accent', preset)
  const col2 = v.borderColor2 ? resolveColor(v.borderColor2, preset) : ''
  const bw = Math.max(0, v.borderWidth || 0)
  const vr = Math.min(v.radius || 0, v.w / 2, v.h / 2)
  const glow = v.glow ? { shadowColor: col, shadowBlur: v.glow, shadowOpacity: 1 } : {}
  const box = { x: v.x, y: v.y, width: v.w, height: v.h, cornerRadius: vr, listening: false }
  const s = Math.max(2, bw)
  const inner = { x: v.x, y: v.y, w: v.w, h: v.h }

  if (style === 'dashed') return <Rect {...box} stroke={col} strokeWidth={s} dash={[s * 3, s * 2]} {...glow} />
  if (style === 'dotted') return <Rect {...box} stroke={col} strokeWidth={s} dash={[0.01, s * 2.2]} lineCap="round" {...glow} />
  if (style === 'double') {
    const t = Math.max(2, s / 2)
    return (
      <Group listening={false}>
        <Rect {...box} stroke={col} strokeWidth={t} {...glow} />
        <Rect x={v.x - s * 1.4} y={v.y - s * 1.4} width={v.w + s * 2.8} height={v.h + s * 2.8}
          cornerRadius={vr ? vr + s * 1.4 : 0} stroke={col2 || col} strokeWidth={t} {...glow} />
      </Group>
    )
  }
  if (style === 'gradient') {
    return <Rect {...box} strokeWidth={s} strokeLinearGradientStartPoint={{ x: 0, y: 0 }}
      strokeLinearGradientEndPoint={{ x: v.w, y: v.h }} strokeLinearGradientColorStops={[0, col, 1, col2 || '#FFFFFF']}
      x={v.x} y={v.y} {...glow} />
  }
  if (style === 'neon2') {
    return (
      <Group listening={false}>
        <Rect {...box} stroke={col} strokeWidth={s} shadowColor={col} shadowBlur={v.glow || 40} shadowOpacity={1} />
        <Rect {...box} stroke={col} strokeWidth={s} shadowColor={col} shadowBlur={(v.glow || 40) / 2} shadowOpacity={1} />
        <Rect {...box} stroke={col2 || '#FFFFFF'} strokeWidth={Math.max(1.5, s / 3)} />
      </Group>
    )
  }
  if (style === 'corners') {  // sudut bidik kamera
    const L = Math.min(v.w, v.h) * 0.12
    const o = s / 2
    const pts = [
      [v.x - o, v.y - o + L, v.x - o, v.y - o, v.x - o + L, v.y - o],
      [v.x + v.w + o - L, v.y - o, v.x + v.w + o, v.y - o, v.x + v.w + o, v.y - o + L],
      [v.x - o, v.y + v.h + o - L, v.x - o, v.y + v.h + o, v.x - o + L, v.y + v.h + o],
      [v.x + v.w + o - L, v.y + v.h + o, v.x + v.w + o, v.y + v.h + o, v.x + v.w + o, v.y + v.h + o - L],
    ]
    return <Group listening={false}>{pts.map((p, i) => <Line key={i} points={p} stroke={col} strokeWidth={s} lineCap="square" lineJoin="miter" {...glow} />)}</Group>
  }
  if (style === 'film') {  // pita film: pita gelap berlubang di kiri & kanan
    const band = Math.max(44, s * 6)
    const hole = { w: band * 0.42, h: band * 0.3 }
    const gap = hole.h * 2.1
    const n = Math.floor((v.h - gap * 0.3) / gap)
    const top = v.y + (v.h - n * gap) / 2 + (gap - hole.h) / 2
    const dark = col2 || '#111111'
    const holes = []
    for (const bx of [v.x - band, v.x + v.w]) {
      for (let i = 0; i < n; i++) {
        holes.push(<Rect key={`${bx}-${i}`} x={bx + (band - hole.w) / 2} y={top + i * gap} width={hole.w} height={hole.h}
          cornerRadius={hole.h * 0.25} fill={col} />)
      }
    }
    return (
      <Group listening={false}>
        <Rect x={v.x - band} y={v.y - s} width={band} height={v.h + 2 * s} fill={dark} />
        <Rect x={v.x + v.w} y={v.y - s} width={band} height={v.h + 2 * s} fill={dark} />
        <Rect x={v.x - band} y={v.y - s} width={v.w + 2 * band} height={s} fill={dark} />
        <Rect x={v.x - band} y={v.y + v.h} width={v.w + 2 * band} height={s} fill={dark} />
        {holes}
      </Group>
    )
  }
  if (style === 'polaroid') {
    const m = Math.max(24, bw)
    const mb = m * 3.2
    const outer = (c) => c.rect(v.x - m, v.y - m, v.w + 2 * m, v.h + m + mb)
    return <Shape listening={false} sceneFunc={ringShape(outer, inner, col, true)} />
  }
  if (style === 'torn') {  // kertas sobek: tepi luar bergerigi acak (tetap sama tiap render)
    const m = Math.max(22, bw) * 1.6
    const r = rng(v.w * 7 + v.h * 13)
    const x0 = v.x - m, y0 = v.y - m, x1 = v.x + v.w + m, y1 = v.y + v.h + m
    const step = 26
    const j = () => (r() - 0.5) * m * 0.55
    const outer = (c) => {
      c.moveTo(x0, y0)
      for (let x = x0 + step; x < x1; x += step) c.lineTo(x, y0 + j())
      c.lineTo(x1, y0)
      for (let y = y0 + step; y < y1; y += step) c.lineTo(x1 + j(), y)
      c.lineTo(x1, y1)
      for (let x = x1 - step; x > x0; x -= step) c.lineTo(x, y1 + j())
      c.lineTo(x0, y1)
      for (let y = y1 - step; y > y0; y -= step) c.lineTo(x0 + j(), y)
      c.closePath()
    }
    return <Shape listening={false} sceneFunc={ringShape(outer, inner, col, true)} />
  }
  if (style === 'tape') {  // garis tipis + selotip di dua sudut atas
    const tape = col2 || 'rgba(245,230,168,0.85)'
    const tw = Math.min(220, v.w * 0.28), th = tw * 0.27
    return (
      <Group listening={false}>
        {bw > 0 && <Rect {...box} stroke={col} strokeWidth={bw} {...glow} />}
        <Rect x={v.x} y={v.y} offsetX={tw / 2} offsetY={th / 2} width={tw} height={th} rotation={-38} fill={tape} opacity={0.88}
          shadowColor="#000" shadowBlur={6} shadowOpacity={0.25} />
        <Rect x={v.x + v.w} y={v.y} offsetX={tw / 2} offsetY={th / 2} width={tw} height={th} rotation={38} fill={tape} opacity={0.88}
          shadowColor="#000" shadowBlur={6} shadowOpacity={0.25} />
      </Group>
    )
  }
  return bw > 0 ? <Rect {...box} stroke={col} strokeWidth={bw} {...glow} /> : null
}

// ---------------------------------------------------------------- kanvas

const StudioCanvas = forwardRef(function StudioCanvas(
  { design, preset, selected, onSelect, onChangeLayer, onChangeVideo, videoEl, showGuides, showSafe, displayH, fontsVersion },
  ref,
) {
  const stageRef = useRef()
  const layerRef = useRef()
  const trRef = useRef()
  const guidesRef = useRef()
  const videoRef = useRef()
  const scale = displayH / H
  const bgImg = useImg(design.background?.type === 'image' ? design.background.image : '')
  const v = design.video

  // gambar ulang saat font selesai dimuat
  useEffect(() => { layerRef.current?.batchDraw() }, [fontsVersion])

  // video preview berjalan -> redraw tiap frame
  useEffect(() => {
    if (!videoEl) return
    let raf
    const tick = () => { layerRef.current?.batchDraw(); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoEl])

  // pasang transformer ke node terpilih
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selected ? stageRef.current?.findOne('#' + selected) : null
    const layer = design.layers.find((l) => l.id === selected)
    if (node && !(layer?.locked)) {
      tr.nodes([node])
      tr.keepRatio(layer?.type === 'logo')
      tr.rotateEnabled(selected !== 'video')
    } else tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [selected, design])

  // Render ulang di skala 1 (ukuran asli 1080x1920) supaya hasil pas piksel
  const snapshot = (hideVideo, pixelRatio, hideIds = []) => {
    const st = stageRef.current
    const tr = trRef.current
    const keep = tr.nodes()
    tr.nodes([])
    guidesRef.current?.hide()
    if (hideVideo) videoRef.current?.hide()
    const hidden = hideIds.map((id) => st.findOne('#' + id)).filter((n) => n && n.visible())
    hidden.forEach((n) => n.hide())
    st.size({ width: W, height: H }); st.scale({ x: 1, y: 1 })
    layerRef.current.draw()
    const url = st.toDataURL({ pixelRatio, mimeType: 'image/png' })
    st.size({ width: W * scale, height: H * scale }); st.scale({ x: scale, y: scale })
    guidesRef.current?.show()
    videoRef.current?.show()
    hidden.forEach((n) => n.show())
    tr.nodes(keep)
    layerRef.current.draw()
    return url
  }

  useImperativeHandle(ref, () => ({
    // PNG frame 1080x1920: jendela video transparan, tanpa garis bantu/seleksi
    // hideIds: layer dinamis ({judul}) yang dirender server per video, jadi tidak ikut di PNG
    exportFrame: (hideIds) => snapshot(true, 1, hideIds),
    thumb: () => snapshot(false, 270 / W),
  }), [scale]) // eslint-disable-line react-hooks/exhaustive-deps

  const bg = design.background || {}
  const c1 = resolveColor(bg.color1, preset)
  const c2 = resolveColor(bg.color2, preset)
  const gp = gradientPoints(bg.angle)
  const vr = Math.min(v.radius || 0, v.w / 2, v.h / 2)
  const holeClip = (ctx) => { ctx.roundRect ? ctx.roundRect(v.x, v.y, v.w, v.h, vr) : ctx.rect(v.x, v.y, v.w, v.h) }
  const accent = resolveColor(v.borderColor, preset)

  const transformEnd = (id) => (e) => {
    const n = e.target
    const sx = n.scaleX(), sy = n.scaleY()
    n.scaleX(1); n.scaleY(1)
    const patch = { x: Math.round(n.x()), y: Math.round(n.y()), rotation: Math.round(n.rotation() * 10) / 10 }
    if (id === 'video') {
      onChangeVideo({ x: patch.x, y: patch.y, w: Math.max(80, Math.round(v.w * sx)), h: Math.max(80, Math.round(v.h * sy)) })
      return
    }
    const l = design.layers.find((x) => x.id === id)
    onChangeLayer(id, { ...patch, w: Math.max(10, Math.round(l.w * sx)), h: Math.max(4, Math.round(l.h * sy)) })
  }

  let vcrop = null
  if (videoEl && videoEl.videoWidth) vcrop = coverCrop(videoEl.videoWidth, videoEl.videoHeight, v.w, v.h)

  return (
    <Stage ref={stageRef} width={W * scale} height={H * scale} scaleX={scale} scaleY={scale}
      onMouseDown={(e) => { if (e.target === e.target.getStage()) onSelect(null) }}>
      <Layer ref={layerRef}>
        {/* latar */}
        {bg.type === 'image' && bgImg ? (
          <KImage image={bgImg} width={W} height={H} crop={coverCrop(bgImg.width, bgImg.height, W, H)} listening={false} />
        ) : bg.type === 'gradient' ? (
          <Rect width={W} height={H} listening={false} fillLinearGradientStartPoint={gp.start} fillLinearGradientEndPoint={gp.end}
            fillLinearGradientColorStops={[0, c1, 1, c2]} />
        ) : (
          <Rect width={W} height={H} fill={c1} listening={false} />
        )}

        {/* lubang jendela video (menghapus latar) */}
        <Rect x={v.x} y={v.y} width={v.w} height={v.h} cornerRadius={vr} fill="#000" globalCompositeOperation="destination-out" listening={false} />

        {/* isi jendela: video preview / placeholder (disembunyikan saat export) */}
        <Group ref={videoRef} clipFunc={holeClip} listening={false}>
          {videoEl && vcrop ? (
            <KImage image={videoEl} x={v.x} y={v.y} width={v.w} height={v.h} crop={vcrop} />
          ) : (
            <>
              <Rect x={v.x} y={v.y} width={v.w} height={v.h} fill="#30323a" />
              <Text x={v.x} y={v.y} width={v.w} height={v.h} align="center" verticalAlign="middle"
                text={'AREA VIDEO\n' + v.w + ' x ' + v.h} fontSize={44} fontStyle="bold" fill="#8a8c96" fontFamily="Space Grotesk" lineHeight={1.4} />
            </>
          )}
        </Group>

        {/* bingkai video + glow */}
        {v.borderStyle && <VideoBorder v={v} preset={preset} />}
        {!v.borderStyle && v.borderWidth > 0 && (
          <Rect x={v.x} y={v.y} width={v.w} height={v.h} cornerRadius={vr} stroke={accent} strokeWidth={v.borderWidth}
            shadowColor={accent} shadowBlur={v.glow || 0} shadowOpacity={v.glow ? 1 : 0} listening={false} />
        )}

        {/* pegangan jendela video (tak terlihat, untuk geser/ubah ukuran) */}
        <Rect id="video" x={v.x} y={v.y} width={v.w} height={v.h} fill="rgba(0,0,0,0)"
          draggable={selected === 'video' && !v.locked}
          onMouseDown={(e) => { e.cancelBubble = true; onSelect('video') }}
          onTap={(e) => { e.cancelBubble = true; onSelect('video') }}
          onDragEnd={(e) => onChangeVideo({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
          onTransformEnd={transformEnd('video')} />

        {/* layer desain */}
        {design.layers.map((l) => {
          const N = NODES[l.type]
          if (!N) return null
          return <N key={l.id} l={l} preset={preset}
            {...common(l, selected === l.id, onSelect, (p) => onChangeLayer(l.id, p))}
            onTransformEnd={transformEnd(l.id)} />
        })}

        {/* garis bantu: batas section & safe area */}
        <Group ref={guidesRef} listening={false}>
          {showGuides && (
            <>
              {[['HEADER', design.sections.header], ['FOOTER', design.sections.footer]].map(([lbl, y]) => (
                <Group key={lbl}>
                  <Line points={[0, y, W, y]} stroke="#FFD100" strokeWidth={3} dash={[18, 12]} />
                  <Text x={12} y={lbl === 'HEADER' ? y - 40 : y + 10} text={lbl === 'HEADER' ? 'batas header' : 'batas footer'}
                    fontSize={26} fill="#FFD100" fontFamily="Space Grotesk" />
                </Group>
              ))}
            </>
          )}
          {showSafe && SAFE_ZONES.map((z) => (
            <Group key={z.label}>
              <Rect x={z.x} y={z.y} width={z.w} height={z.h} fill="rgba(255,60,60,0.22)" stroke="rgba(255,90,90,0.9)" strokeWidth={3} dash={[10, 8]} />
              <Text x={z.x + 10} y={z.y + 10} width={z.w - 20} text={z.label} fontSize={24} fill="#fff" fontFamily="Space Grotesk" />
            </Group>
          ))}
        </Group>

        <Transformer ref={trRef} rotateEnabled flipEnabled={false} anchorSize={14} borderStroke="#FFD100" anchorStroke="#FFD100"
          anchorFill="#141100" ignoreStroke boundBoxFunc={(o, n) => (n.width < 8 || n.height < 4 ? o : n)} />
      </Layer>
    </Stage>
  )
})

export default StudioCanvas
