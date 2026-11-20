import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { LLM_PROVIDERS } from '../presets.js'

const KEY_LINKS = {
  groq: 'https://console.groq.com/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  moonshot: 'https://platform.moonshot.ai',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openrouter: 'https://openrouter.ai/settings/keys',
}

const NAMES = { groq: 'Groq', openai: 'OpenAI', gemini: 'Google Gemini', moonshot: 'Moonshot (Kimi)', anthropic: 'Claude (Anthropic)', openrouter: 'OpenRouter (gratis)' }

export default function SettingsModal({ onClose }) {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api('/api/settings').then(setS).catch((e) => setMsg(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setProvider = (name, field, value) => {
    setS((cur) => ({
      ...cur,
      providers: { ...cur.providers, [name]: { ...cur.providers[name], [field]: value } },
    }))
  }

  const wm = s?.watermark || {}
  const setWm = (patch) => setS((cur) => ({ ...cur, watermark: { ...(cur.watermark || {}), ...patch } }))

  const uploadWm = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api('/api/settings/watermark-image', { method: 'POST', body: fd })
      setWm({ image: r.image, type: 'image' })
      setMsg('Logo terunggah.')
    } catch (err) {
      setMsg(err.message)
    }
  }

  // --- Brand & border ---
  const brand = s?.brand || {}
  const setBrand = (patch) => setS((cur) => ({ ...cur, brand: { ...(cur.brand || {}), ...patch } }))
  const [brandFonts, setBrandFonts] = useState([])
  const [themes, setThemes] = useState({ podcast: 'Podcast' })
  const [pvRatio, setPvRatio] = useState('9:16')
  const [pv, setPv] = useState(null)
  const [gallery, setGallery] = useState({})

  const [frames, setFrames] = useState([])
  const [framesVer, setFramesVer] = useState(0)
  const [frameName, setFrameName] = useState('')
  const [frameBusy, setFrameBusy] = useState(false)

  useEffect(() => {
    api('/api/brand/fonts').then((r) => { setBrandFonts(r.fonts || []); setThemes(r.themes || {}) }).catch(() => {})
    api('/api/frames').then((r) => setFrames(r.frames || [])).catch(() => {})
  }, [framesVer])

  const uploadFrame = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setFrameBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('name', frameName)
      const r = await api('/api/frames', { method: 'POST', body: fd })
      setBrand({ theme: r.theme })
      setFrameName('')
      setFramesVer((v) => v + 1)
      setMsg(`Frame "${r.name}" ditambahkan dan dipilih. Klik Simpan untuk menjadikannya tema default.`)
    } catch (err) {
      setMsg(err.message)
    } finally {
      setFrameBusy(false)
    }
  }

  const removeFrame = async (fr) => {
    if (!window.confirm(`Hapus frame "${fr.name}"?`)) return
    try {
      await api(`/api/frames/${fr.id}`, { method: 'DELETE' })
      if (brand.theme === fr.theme) setBrand({ theme: 'podcast' })
      setFramesVer((v) => v + 1)
    } catch (err) {
      setMsg(err.message)
    }
  }

  // thumbnail semua tema (tidak perlu digambar ulang saat cuma ganti tema)
  const galleryKey = s ? JSON.stringify([{ ...s.brand, theme: '' }, pvRatio, framesVer]) : ''
  useEffect(() => {
    if (!galleryKey) return
    const t = setTimeout(() => {
      api('/api/brand/gallery', {
        method: 'POST',
        body: { brand: s.brand, ratio: pvRatio, title: 'Contoh judul klip: HP 2 juta terbaik bulan ini' },
      }).then(setGallery).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [galleryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const brandKey = s ? JSON.stringify([s.brand, pvRatio]) : ''
  useEffect(() => {
    if (!brandKey) return
    const t = setTimeout(() => {
      api('/api/brand/preview', {
        method: 'POST',
        body: { brand: s.brand, ratio: pvRatio, title: 'Contoh judul klip: HP 2 juta terbaik bulan ini', placeholder: true },
      }).then((r) => setPv(r.image)).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [brandKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const uploadLogo = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api('/api/settings/brand-logo', { method: 'POST', body: fd })
      setBrand({ logo: r.logo, _v: Date.now() })
      setMsg('Logo brand terunggah.')
    } catch (err) {
      setMsg(err.message)
    }
  }

  const [mascotUrl, setMascotUrl] = useState('')
  const [music, setMusic] = useState([])

  useEffect(() => {
    api('/api/settings/music').then((r) => setMusic(r.files || [])).catch(() => {})
  }, [])

  const uploadMascot = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api('/api/settings/mascot-image', { method: 'POST', body: fd })
      setMascotUrl(r.url)
      setMsg('Maskot terunggah.')
    } catch (err) {
      setMsg(err.message)
    }
  }

  const uploadMusic = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api('/api/settings/music', { method: 'POST', body: fd })
      setMusic(r.files || [])
      setMsg('Musik terunggah.')
    } catch (err) {
      setMsg(err.message)
    }
  }

  const removeMusic = async (name) => {
    try {
      const r = await api(`/api/settings/music/${encodeURIComponent(name)}`, { method: 'DELETE' })
      setMusic(r.files || [])
    } catch { /* abaikan */ }
  }

  const save = async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: s })
      window.dispatchEvent(new Event('autoclipper-settings-saved'))
      setMsg('Tersimpan.')
      setTimeout(onClose, 600)
    } catch (e) {
      setMsg(e.message)
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="settings-title">Pengaturan</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Tutup pengaturan" autoFocus>Tutup</button>
        </div>
        <div className="modal-body">
          {!s ? (
            <p className="hint">{msg || 'Memuat…'}</p>
          ) : (
            <>
              <div className="row">
                <div className="field">
                  <label>Default transkripsi</label>
                  <select className="select" value={s.transcribe_provider}
                    onChange={(e) => setS({ ...s, transcribe_provider: e.target.value })}>
                    <option value="groq">Groq Whisper</option>
                    <option value="openai">OpenAI Whisper</option>
                    <option value="local">Local Whisper</option>
                  </select>
                </div>
                <div className="field">
                  <label>Default LLM</label>
                  <select className="select" value={s.llm_provider}
                    onChange={(e) => setS({ ...s, llm_provider: e.target.value })}>
                    {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Model Whisper lokal</label>
                  <select className="select" value={s.whisper_local_model}
                    onChange={(e) => setS({ ...s, whisper_local_model: e.target.value })}>
                    {['tiny', 'base', 'small', 'medium', 'large-v3'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="provider-box">
                <h4>Brand dan border <span className="hint" style={{ fontWeight: 500 }}>bingkai bermerek di semua video export</span></h4>
                <label className="check-row">
                  <input type="checkbox" checked={brand.enabled === true}
                    onChange={(e) => setBrand({ enabled: e.target.checked })} />
                  Aktifkan border brand
                </label>
                <span className="lbl-sm">Tema default (bisa diganti per klip di tab Efek)</span>
                <div className="theme-gallery" role="radiogroup" aria-label="Tema border default">
                  {Object.entries(themes).map(([id, name]) => {
                    const on = (brand.theme || 'podcast') === id
                    return (
                      <button key={id} type="button" role="radio" aria-checked={on}
                        className={`theme-card${on ? ' is-on' : ''}`} onClick={() => setBrand({ theme: id })}>
                        {gallery[id] ? <img src={gallery[id]} alt="" /> : <span className="theme-ph" />}
                        <span>{name}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="frame-box">
                  <span className="lbl-sm">Frame sendiri</span>
                  <p className="hint" style={{ margin: '2px 0 8px' }}>
                    PNG dengan bagian tengah transparan, atau gambar dengan layar tengah satu warna polos (hitam atau hijau).
                    Ukuran terbaik 1080×1920. Nama, warna, dan font brand tidak berlaku untuk frame.
                  </p>
                  <div className="frame-upload">
                    <input className="input" placeholder="Nama frame, misal Arcade Pink" value={frameName} maxLength={40}
                      onChange={(e) => setFrameName(e.target.value)} />
                    <label className={`btn btn-sm ${frameBusy ? 'btn-ghost' : 'btn-primary'}`}>
                      {frameBusy ? 'Memproses…' : 'Upload frame'}
                      <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" disabled={frameBusy} onChange={uploadFrame} />
                    </label>
                  </div>
                  {frames.length > 0 && (
                    <ul className="frame-list">
                      {frames.map((fr) => (
                        <li key={fr.id}>
                          <span>{fr.name}</span>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeFrame(fr)}>Hapus</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="brand-preview">
                  <div className="field">
                    <label>Nama brand</label>
                    <input className="input" value={brand.name || ''} maxLength={40}
                      onChange={(e) => setBrand({ name: e.target.value })} />
                    <label style={{ marginTop: 10 }}>Handle</label>
                    <input className="input" placeholder="@akunmu" value={brand.handle || ''} maxLength={40}
                      onChange={(e) => setBrand({ handle: e.target.value })} />
                    <label style={{ marginTop: 10 }}>Label kecil di atas judul</label>
                    <input className="input" placeholder="Kosongkan untuk menyembunyikan" value={brand.label || ''} maxLength={30}
                      onChange={(e) => setBrand({ label: e.target.value })} />
                    <label style={{ marginTop: 10 }}>Font</label>
                    <select className="select" value={brand.font || 'Space Grotesk'}
                      onChange={(e) => setBrand({ font: e.target.value })}>
                      {(brandFonts.length ? brandFonts : [brand.font || 'Space Grotesk']).map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <div className="color-row" style={{ marginTop: 10 }}>
                      <label className="color-item">
                        Warna utama <input type="color" value={brand.color || '#111418'}
                          onChange={(e) => setBrand({ color: e.target.value })} />
                      </label>
                      <label className="color-item">
                        Aksen <input type="color" value={brand.accent || '#3BE8B0'}
                          onChange={(e) => setBrand({ accent: e.target.value })} />
                      </label>
                    </div>
                    <label style={{ marginTop: 10 }}>Logo (opsional, PNG transparan paling bagus)</label>
                    <input className="input" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadLogo} />
                    {brand.logo && (
                      <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 6 }}
                        onClick={() => setBrand({ logo: '' })}>
                        Pakai inisial, bukan logo
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="seg" role="group" aria-label="Rasio preview" style={{ marginBottom: 8 }}>
                      {['9:16', '1:1', '16:9'].map((r) => (
                        <button key={r} type="button" className={`btn btn-sm ${pvRatio === r ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setPvRatio(r)}>{r}</button>
                      ))}
                    </div>
                    {pv ? <img src={pv} alt="Preview border brand" /> : <p className="hint">Memuat preview…</p>}
                  </div>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Judul di bar atas diambil dari hook klip (atau judul klip kalau hook dimatikan). Border bisa dimatikan per klip di tab Efek.
                </p>
              </div>

              <div className="provider-box">
                <h4>Watermark <span className="hint" style={{ fontWeight: 500 }}>dipasang di semua video export</span></h4>
                <label className="check-row">
                  <input type="checkbox" checked={wm.enabled === true}
                    onChange={(e) => setWm({ enabled: e.target.checked })} />
                  Aktifkan watermark
                </label>
                <div className="row">
                  <div className="field">
                    <label>Jenis</label>
                    <select className="select" value={wm.type || 'text'}
                      onChange={(e) => setWm({ type: e.target.value })}>
                      <option value="text">Teks</option>
                      <option value="image">Gambar / logo</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Posisi</label>
                    <select className="select" value={wm.position || 'top-right'}
                      onChange={(e) => setWm({ position: e.target.value })}>
                      <option value="top-left">Kiri atas</option>
                      <option value="top-right">Kanan atas</option>
                      <option value="bottom-left">Kiri bawah</option>
                      <option value="bottom-right">Kanan bawah</option>
                      <option value="center">Tengah</option>
                    </select>
                  </div>
                </div>
                {(wm.type || 'text') === 'text' ? (
                  <div className="field">
                    <label>Teks watermark</label>
                    <input className="input" placeholder="@usernamekamu"
                      value={wm.text || ''} onChange={(e) => setWm({ text: e.target.value })} />
                  </div>
                ) : (
                  <div className="field">
                    <label>File logo (PNG transparan paling bagus)</label>
                    <input className="input" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadWm} />
                    {wm.image && (
                      <img src={`/media/${wm.image}?v=${wm.image}`} alt="watermark"
                        style={{ height: 40, alignSelf: 'flex-start', marginTop: 6, background: '#333', borderRadius: 6, padding: 4 }} />
                    )}
                  </div>
                )}
                <div className="slider-row">
                  <label>Kepekatan</label>
                  <input type="range" min="0.1" max="1" step="0.05" value={wm.opacity ?? 0.7}
                    onChange={(e) => setWm({ opacity: Number(e.target.value) })} />
                  <span className="val">{Math.round((wm.opacity ?? 0.7) * 100)}%</span>
                </div>
                <div className="slider-row">
                  <label>Ukuran</label>
                  <input type="range" min="0.5" max="2" step="0.05" value={wm.size ?? 1}
                    onChange={(e) => setWm({ size: Number(e.target.value) })} />
                  <span className="val">{(wm.size ?? 1).toFixed(2)}×</span>
                </div>
              </div>

              <div className="provider-box">
                <h4>Maskot dan musik latar</h4>
                <div className="field">
                  <label>Maskot atau logo channel untuk thumbnail (PNG transparan paling bagus)</label>
                  <input className="input" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadMascot} />
                  {mascotUrl && (
                    <img src={`${mascotUrl}?v=${Date.now()}`} alt="maskot"
                      style={{ height: 56, alignSelf: 'flex-start', marginTop: 6, background: '#333', borderRadius: 6, padding: 4 }} />
                  )}
                </div>
                <div className="field">
                  <label>Musik latar (MP3/WAV, dipilih per klip di tab Efek)</label>
                  <input className="input" type="file" accept=".mp3,.wav,.m4a,.ogg,.aac,.flac" onChange={uploadMusic} />
                </div>
                {music.length > 0 && music.map((m) => (
                  <div key={m} className="export-item">
                    <span>{m}</span>
                    <button className="btn btn-sm btn-ghost btn-danger" onClick={() => removeMusic(m)}>Hapus</button>
                  </div>
                ))}
                <p className="hint" style={{ marginTop: 8 }}>
                  Gunakan musik bebas royalti (mis. dari YouTube Audio Library) agar aman dari klaim hak cipta.
                </p>
              </div>

              {Object.keys(NAMES).map((name) => {
                const cfg = s.providers[name] || {}
                return (
                  <div className="provider-box" key={name}>
                    <h4>
                      {NAMES[name]}
                      <a href={KEY_LINKS[name]} target="_blank" rel="noreferrer">ambil API key ↗<span className="sr-only"> (tab baru)</span></a>
                    </h4>
                    <div className="field">
                      <label>API Key</label>
                      <input className="input" type="password" placeholder="sk-…"
                        value={cfg.api_key || ''}
                        onChange={(e) => setProvider(name, 'api_key', e.target.value)} />
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Model LLM</label>
                        <input className="input" value={cfg.llm_model || ''}
                          onChange={(e) => setProvider(name, 'llm_model', e.target.value)} />
                      </div>
                      {'stt_model' in cfg && (
                        <div className="field">
                          <label>Model transkripsi</label>
                          <input className="input" value={cfg.stt_model || ''}
                            onChange={(e) => setProvider(name, 'stt_model', e.target.value)} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <p className="hint" style={{ marginBottom: 12 }}>
                Semua key tersimpan lokal di <code>backend/data/settings.json</code> dan hanya dikirim
                ke provider yang bersangkutan.
              </p>
              <button className="btn btn-primary btn-block" onClick={save}>Simpan pengaturan</button>
              {msg && <p className="hint" style={{ marginTop: 8 }} role="status">{msg}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
