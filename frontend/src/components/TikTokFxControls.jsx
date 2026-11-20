import { useState } from 'react'
import { HL_AUTO, hasTikTokFx } from '../studio/model.js'

// Pengaturan efek konten TikTok (Frame Studio tahap 2): kotak per baris, sorot kata, stabilo,
// bayangan panjang, lengkung. Num & ColorField dipinjam dari inspector agar tampilannya seragam.
export default function TikTokFxControls({ l, set, Num, ColorField }) {
  const [open, setOpen] = useState(false)
  const on = hasTikTokFx(l)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  return (
    <div className="fs-fx">
      <button type="button" className="btn btn-sm btn-ghost fs-fx-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Efek konten: kotak caption, sorot kata, stabilo, lengkung{on && !open ? ' (aktif)' : ''}
      </button>
      {open && (
        <>
          <div className="fs-fx-real">
            <b>Kotak per baris (caption TikTok)</b>
            <div className="fs-checks">
              <label><input type="checkbox" checked={!!l.lineBox} onChange={(e) => set({ lineBox: e.target.checked ? 'box' : '' })} /> Pakai kotak di belakang tiap baris</label>
            </div>
            {l.lineBox && (
              <>
                <ColorField label="Warna kotak" value={l.lineBoxColor || '#FFFFFF'} onChange={(lineBoxColor) => set({ lineBoxColor })} />
                <div className="fs-grid2">
                  <Num label="Jarak tepi %" value={l.lineBoxPad ?? 30} min={0} max={100} onChange={(v) => set({ lineBoxPad: clamp(v, 0, 100) })} />
                  <Num label="Sudut bulat %" value={l.lineBoxRadius ?? 30} min={0} max={100} onChange={(v) => set({ lineBoxRadius: clamp(v, 0, 100) })} />
                </div>
                <Num label="Kepekatan kotak %" value={l.lineBoxOpacity ?? 100} min={0} max={100} onChange={(v) => set({ lineBoxOpacity: clamp(v, 0, 100) })} />
              </>
            )}
          </div>

          <div className="fs-fx-real">
            <b>Sorot kata</b>
            <label className="fs-num">
              <span>Kata yang disorot (pisahkan dengan koma)</span>
              <input className="input" value={l.hlWords || ''} placeholder="mis. gratis, rahasia" onChange={(e) => set({ hlWords: e.target.value })} />
            </label>
            <label className="fs-num">
              <span>Sorot otomatis</span>
              <select className="select" value={l.hlAuto || ''} onChange={(e) => set({ hlAuto: e.target.value })}>
                {HL_AUTO.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <ColorField label="Warna kata sorot" value={l.hlColor} allowNone onChange={(hlColor) => set({ hlColor })} />
            <ColorField label="Label di belakang kata" value={l.hlBg} allowNone onChange={(hlBg) => set({ hlBg })} />
            <span className="hint">Untuk {'{judul}'} yang berubah tiap video, pakai sorot otomatis.</span>
          </div>

          <div className="fs-fx-real">
            <b>Stabilo</b>
            <ColorField label="Warna coretan stabilo" value={l.marker} allowNone onChange={(marker) => set({ marker })} />
          </div>

          <div className="fs-fx-real">
            <b>Bayangan panjang</b>
            <div className="fs-grid2">
              <Num label="Panjang (px, 0 = mati)" value={l.longShadow || 0} min={0} max={800} onChange={(v) => set({ longShadow: clamp(v, 0, 800) })} />
              <Num label="Arah (°)" value={l.longAngle ?? 45} min={0} max={359} onChange={(v) => set({ longAngle: ((v % 360) + 360) % 360 })} />
            </div>
            {l.longShadow > 0 && (
              <>
                <ColorField label="Warna bayangan panjang" value={l.longColor || '#000000'} onChange={(longColor) => set({ longColor })} />
                <div className="fs-checks"><label><input type="checkbox" checked={!!l.longFade} onChange={(e) => set({ longFade: e.target.checked })} /> Memudar ke ujung</label></div>
              </>
            )}
            <span className="hint">Arah 45° = ke kanan bawah, 135° = ke kiri bawah.</span>
          </div>

          <div className="fs-fx-real">
            <b>Lengkung</b>
            <label className="fs-num">
              <span>Lengkung: {l.curve || 0} (+ pelangi, − senyum)</span>
              <input type="range" min={-100} max={100} step={5} value={l.curve || 0} onChange={(e) => set({ curve: Number(e.target.value) })} aria-label="Lengkung teks" />
            </label>
            {l.curve ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ curve: 0 })}>Luruskan</button> : null}
            {l.curve && (l.animIn === 'type' || l.animIn === 'letters' || l.animIn === 'assemble' || l.animIn === 'words' || l.anim === 'wave' || l.anim === 'bounce' || l.anim === 'jitter')
              ? <span className="hint">Animasi per huruf (gelombang, lompat, ketik, huruf bergiliran, pecah) tidak jalan pada teks melengkung. Pakai animasi seluruh teks.</span> : null}
          </div>
        </>
      )}
    </div>
  )
}
