import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'

// Kartu judul horor 9:16: lampu berkedip, huruf muncul satu per satu dengan getar,
// glitch RGB sesekali, label merah, lalu memudar ke hitam.
const MERAH = '#c4101c'

const kedip = (f) => {
  // pola kedip lampu yang tidak beraturan tapi deterministik (sama tiap render)
  if (f < 8) return random(`a${f}`) > 0.5 ? 1 : 0.15
  if (f > 70 && f < 76) return random(`b${f}`) > 0.4 ? 1 : 0.2
  return 1
}

export const JudulHoror = ({ judul, label }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const kata = judul.split(' ')

  const fadeOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const glitch = (frame > 40 && frame < 44) || (frame > 88 && frame < 91)
  const gx = glitch ? (random(`g${frame}`) - 0.5) * 30 : 0
  const labelIn = spring({ frame: frame - 6, fps, config: { damping: 12 } })
  const garis = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const teks = (warna, dx) => (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      alignContent: 'center', gap: '0 28px', padding: '0 80px', transform: `translateX(${dx}px)`,
      mixBlendMode: warna === 'white' ? 'normal' : 'screen',
    }}>
      {kata.map((k, i) => {
        const muncul = spring({ frame: frame - 14 - i * 5, fps, config: { damping: 14, mass: 0.6 } })
        const getar = (random(`s${i}-${Math.floor(frame / 2)}`) - 0.5) * 6
        return (
          <span key={i} style={{
            fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: 118,
            lineHeight: 1.12, color: warna, opacity: muncul, letterSpacing: 2,
            transform: `translateY(${(1 - muncul) * 40 + getar}px) scale(${0.9 + muncul * 0.1})`,
            textShadow: warna === 'white' ? '0 0 30px rgba(196,16,28,.55), 0 6px 18px #000' : 'none',
          }}>{k}</span>
        )
      })}
    </div>
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505', opacity: fadeOut }}>
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 50% 45%, #2a0d10 0%, #0b0606 55%, #000 100%)',
        opacity: kedip(frame),
      }} />
      {/* label */}
      <div style={{
        position: 'absolute', top: 560, width: '100%', textAlign: 'center',
        transform: `scale(${labelIn})`, opacity: labelIn * kedip(frame),
      }}>
        <span style={{
          fontFamily: 'Arial Black, Arial, sans-serif', fontSize: 40, letterSpacing: 14, color: '#fff',
          background: MERAH, padding: '12px 30px',
        }}>{label}</span>
      </div>
      {glitch && teks('#ff0033', gx)}
      {glitch && teks('#00e5ff', -gx)}
      <div style={{ opacity: kedip(frame) }}>{teks('white', 0)}</div>
      {/* garis merah bawah */}
      <div style={{
        position: 'absolute', top: 1340, left: '50%', height: 6, width: 700 * garis,
        transform: 'translateX(-50%)', background: MERAH, boxShadow: `0 0 24px ${MERAH}`,
      }} />
      {/* grain */}
      <AbsoluteFill style={{
        opacity: 0.12,
        backgroundImage: `repeating-radial-gradient(circle at ${random(`n${frame}`) * 100}% ${random(`m${frame}`) * 100}%, #fff 0 1px, transparent 1px 3px)`,
      }} />
    </AbsoluteFill>
  )
}
