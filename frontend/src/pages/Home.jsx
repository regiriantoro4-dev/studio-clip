import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import BrandTextPanel from '../components/BrandTextPanel.jsx'
import BumperPanel from '../components/BumperPanel.jsx'
import FactoryPanel from '../components/FactoryPanel.jsx'
import VariasiPanel from '../components/VariasiPanel.jsx'
import { LLM_PROVIDERS, STT_PROVIDERS } from '../presets.js'

const DUR_PRESETS = [
  { id: '15-30', label: 'Pendek, 15-30 dtk' },
  { id: '20-45', label: 'Sedang, 20-45 dtk' },
  { id: '30-60', label: 'Panjang, 30-60 dtk' },
]

const VOICES = [
  { id: 'gemini:Puck', label: 'Puck, pria ceria (Gemini)' },
  { id: 'gemini:Fenrir', label: 'Fenrir, pria semangat (Gemini)' },
  { id: 'gemini:Leda', label: 'Leda, wanita muda (Gemini)' },
  { id: 'gemini:Zephyr', label: 'Zephyr, wanita cerah (Gemini)' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi, pria (Edge, gratis)' },
  { id: 'id-ID-GadisNeural', label: 'Gadis, wanita (Edge, gratis)' },
  { id: 'omnivoice:narator_d', label: 'Narator D, pria muda (OmniVoice lokal, gratis)' },
]

const HOR_POVS = [
  { id: 'kamu', label: 'Kamu — penonton jadi tokohnya' },
  { id: 'aku', label: 'Aku — pengalaman pribadi narator' },
  { id: 'acak', label: 'Campur — diundi tiap cerita' },
]

const HOR_VOICES = [
  { id: 'omnivoice:narator_d', label: 'Narator D, pria muda (OmniVoice lokal, gratis)' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi, pria berat (Edge, gratis)' },
  { id: 'id-ID-GadisNeural', label: 'Gadis, wanita (Edge, gratis)' },
  { id: 'gemini:Charon', label: 'Charon, pria dalam (Gemini)' },
  { id: 'gemini:Enceladus', label: 'Enceladus, pria berbisik (Gemini)' },
  { id: 'gemini:Kore', label: 'Kore, wanita tenang (Gemini)' },
]

const HOR_STYLES = [
  { id: 'sinematik', label: 'Sinematik gelap (seperti film)' },
  { id: 'komik', label: 'Komik / manhwa horor' },
  { id: 'found', label: 'Found footage (kamera malam)' },
]

export default function Home() {
  const nav = useNavigate()
  const fileRef = useRef()
  const [mode, setMode] = useState('upload')
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('id')
  const [nClips, setNClips] = useState(5)
  const [durasi, setDurasi] = useState('20-45')
  const [stt, setStt] = useState('groq')
  const [llm, setLlm] = useState('auto')
  const [fixTypos, setFixTypos] = useState(true)
  const [vocab, setVocab] = useState('')
  const [auto, setAuto] = useState(true)
  const [autoN, setAutoN] = useState(3)
  const [narasi, setNarasi] = useState(false)
  const [filmTitle, setFilmTitle] = useState('')
  const [filmContext, setFilmContext] = useState('')
  const [voice, setVoice] = useState('gemini:Puck')
  const photoRef = useRef()
  const [photos, setPhotos] = useState([])
  const [prodName, setProdName] = useState('')
  const [prodLink, setProdLink] = useState('')
  const [prodPrice, setProdPrice] = useState('')
  const [prodDesc, setProdDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const readyRef = useRef()
  const [readyFiles, setReadyFiles] = useState([])
  const [readyRatio, setReadyRatio] = useState('auto')
  const [readyTheme, setReadyTheme] = useState('')
  const [themes, setThemes] = useState({})
  const [defTheme, setDefTheme] = useState('podcast')
  const [readyFrameTitle, setReadyFrameTitle] = useState('')
  const [variasi, setVariasi] = useState({ on: false, n: 5, intro: true, outro: true })
  const [variasiKey, setVariasiKey] = useState(0)
  const [horTopic, setHorTopic] = useState('')
  const [horStyle, setHorStyle] = useState('sinematik')
  const [horPov, setHorPov] = useState('kamu')
  const [horVoice, setHorVoice] = useState('omnivoice:narator_d')
  const [horStatus, setHorStatus] = useState(null)
  const readyEff = readyTheme || defTheme
  const readyFrameId = readyEff.startsWith('frame:') ? readyEff.slice(6) : ''

  useEffect(() => {
    if (mode !== 'ready') return
    api('/api/brand/fonts').then((r) => setThemes(r.themes || {})).catch(() => {})
    api('/api/settings').then((s) => setDefTheme(s.brand?.theme || 'podcast')).catch(() => {})
  }, [mode])

  useEffect(() => {
    if (mode !== 'horror') return
    api('/api/horror/status').then(setHorStatus).catch(() => setHorStatus(null))
  }, [mode])

  const submitHorror = async () => {
    const project = await api('/api/projects/horror', {
      method: 'POST',
      body: { n: Number(autoN), voice: horVoice, topic: horTopic.trim(), style: horStyle, pov: horPov, llm_provider: llm },
    })
    nav(`/studio/${project.id}`)
  }

  const addReady = (list) => {
    const vids = Array.from(list || []).filter((f) => /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(f.name))
    setReadyFiles((prev) => [...prev, ...vids].slice(0, 20))
  }

  const submitReady = async () => {
    if (!readyFiles.length) throw new Error('Pilih minimal 1 video.')
    const fd = new FormData()
    readyFiles.forEach((f) => fd.append('files', f))
    if (variasi.on) {
      // produksi variasi: tetap di halaman ini, progres tampil di kotak "Batch variasi"
      fd.append('n', String(variasi.n))
      fd.append('intro', variasi.intro ? 'true' : 'false')
      fd.append('outro', variasi.outro ? 'true' : 'false')
      if (variasi.acak) fd.append('acak', 'true')  // tahap 4: Acak gaya
      await api('/api/projects/readymade-variasi', { method: 'POST', body: fd })
      setReadyFiles([])
      setVariasiKey((k) => k + 1)
      return
    }
    fd.append('ratio', readyRatio)
    fd.append('theme', readyTheme)
    if (readyFrameTitle.trim()) fd.append('frame_title', readyFrameTitle.trim())
    const r = await api('/api/projects/readymade', { method: 'POST', body: fd })
    nav(r.projects.length === 1 ? `/studio/${r.projects[0]}` : '/projects')
  }

  const photoUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos])
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls])

  const addPhotos = (list) => {
    const imgs = Array.from(list || []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name))
    setPhotos((prev) => [...prev, ...imgs].slice(0, 10))
  }

  const submitAffiliate = async () => {
    if (!prodName.trim()) throw new Error('Isi nama produk dulu.')
    if (!photos.length) throw new Error('Tambahkan minimal 1 foto produk.')
    if (prodLink.trim() && !/^https?:\/\//i.test(prodLink.trim())) {
      throw new Error('Link affiliate harus berupa URL, mis. https://s.shopee.co.id/...')
    }
    const fd = new FormData()
    photos.forEach((f) => fd.append('photos', f))
    fd.append('name', prodName)
    fd.append('link', prodLink)
    fd.append('price', prodPrice)
    fd.append('description', prodDesc)
    fd.append('n', String(autoN))
    fd.append('voice', voice)
    fd.append('llm_provider', llm)
    const project = await api('/api/projects/affiliate', { method: 'POST', body: fd })
    nav(`/studio/${project.id}`)
  }

  const submit = async () => {
    setErr('')
    try {
      setBusy(true)
      if (mode === 'affiliate') {
        await submitAffiliate()
        return
      }
      if (mode === 'ready') {
        await submitReady()
        return
      }
      if (mode === 'horror') {
        await submitHorror()
        return
      }
      let project
      if (mode === 'upload') {
        if (!file) throw new Error('Pilih file video dulu.')
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', title)
        project = await api('/api/projects/upload', { method: 'POST', body: fd })
      } else {
        if (!url.trim()) throw new Error('Masukkan link YouTube dulu.')
        project = await api('/api/projects/youtube', { method: 'POST', body: { url, title } })
      }
      const [minDur, maxDur] = durasi.split('-').map(Number)
      const options = {
        transcribe_provider: stt,
        llm_provider: llm,
        language,
        n_clips: Number(nClips),
        min_dur: minDur,
        max_dur: maxDur,
        fix_typos: fixTypos,
        vocab,
      }
      if (auto) {
        await api(`/api/projects/${project.id}/autoproduce`, {
          method: 'POST',
          body: { ...options, n: Number(autoN), ratio: '9:16' },
        })
      } else {
        await api(`/api/projects/${project.id}/process`, { method: 'POST', body: options })
      }
      nav(`/studio/${project.id}`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (mode === 'affiliate') addPhotos(e.dataTransfer.files)
    else if (mode === 'ready') addReady(e.dataTransfer.files)
    else if (f) setFile(f)
  }

  const isAff = mode === 'affiliate'
  const isReady = mode === 'ready'
  const isHor = mode === 'horror'

  return (
    <div className="page">
      <div className="page-head">
        <h1>Video panjang masuk, klip vertikal keluar.</h1>
        <p>
          Unggah file atau tempel link YouTube. Studio Clip mencari momen terkuat, memasang subtitle per kata
          dan hook, lalu menyiapkan klip 9:16, 1:1, atau 16:9.
        </p>
      </div>

      <div className="home-grid">
        <section className="card" aria-labelledby="src-title">
          <h2 id="src-title" className="card-title">Sumber video</h2>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
              Unggah file
            </button>
            <button role="tab" aria-selected={mode === 'youtube'} className={mode === 'youtube' ? 'active' : ''} onClick={() => setMode('youtube')}>
              Link YouTube
            </button>
            <button role="tab" aria-selected={isAff} className={isAff ? 'active' : ''} onClick={() => setMode('affiliate')}>
              Produk affiliate
            </button>
            <button role="tab" aria-selected={isReady} className={isReady ? 'active' : ''} onClick={() => setMode('ready')}>
              Video jadi
            </button>
            <button role="tab" aria-selected={isHor} className={isHor ? 'active' : ''} onClick={() => setMode('horror')}>
              Horor AI
            </button>
          </div>

          {isHor ? (
            <>
              <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
                Tanpa bahan apa pun. AI menulis cerita horor, ComfyUI melukis tiap adegan, narator membacakannya,
                lalu adegan dianimasikan dengan efek horor dan ambience.
              </p>
              <div className="field">
                <label htmlFor="hor-topic">Topik (opsional)</label>
                <textarea id="hor-topic" className="input" rows={3} maxLength={300}
                  placeholder="Kosong = AI memilih ide baru sendiri. Misal: penjaga sekolah yang mendengar bel jam dua malam"
                  value={horTopic} onChange={(e) => setHorTopic(e.target.value)} />
                <span className="hint">AI mengingat judul yang sudah dibuat supaya ide tidak berulang.</span>
              </div>
              <div className="field">
                <label htmlFor="hor-pov">Gaya naskah</label>
                <select id="hor-pov" className="select" value={horPov} onChange={(e) => setHorPov(e.target.value)}>
                  {HOR_POVS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <span className="hint">"Kamu" membuat penonton merasa dirinya yang mengalami.</span>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="hor-style">Gaya visual</label>
                <select id="hor-style" className="select" value={horStyle} onChange={(e) => setHorStyle(e.target.value)}>
                  {HOR_STYLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <p className="hint" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
                {horStatus == null
                  ? 'Memeriksa ComfyUI…'
                  : horStatus.comfy_up
                    ? `ComfyUI aktif · checkpoint ${horStatus.checkpoint || '?'}`
                    : 'ComfyUI belum jalan. Akan dinyalakan otomatis saat produksi (1-2 menit).'}
              </p>
            </>
          ) : isReady ? (
            <div
              role="button" tabIndex={0}
              aria-label="Tambah video jadi"
              className={`drop crop ${dragOver ? 'over is-sel' : ''} ${readyFiles.length ? 'has-file' : ''}`}
              style={{ padding: readyFiles.length ? '16px' : undefined }}
              onClick={() => readyRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); readyRef.current?.click() } }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {readyFiles.length ? (
                <>
                  <ul className="ready-list">
                    {readyFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <span className="ready-name">{f.name}</span>
                        <span className="hint tnum">{(f.size / 1e6).toFixed(1)} MB</span>
                        <button
                          type="button" className="photo-remove" aria-label={`Hapus ${f.name}`}
                          onClick={(e) => { e.stopPropagation(); setReadyFiles((prev) => prev.filter((_, j) => j !== i)) }}
                        >×</button>
                      </li>
                    ))}
                  </ul>
                  <span className="hint tnum">{readyFiles.length}/20 video · klik untuk menambah</span>
                </>
              ) : (
                <>
                  <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="1.5" /><rect x="7" y="7" width="10" height="10" />
                  </svg>
                  <b>Tarik video siap upload ke sini atau klik untuk memilih</b>
                  <span className="hint">Bisa beberapa sekaligus. MP4, MOV, MKV, WebM</span>
                </>
              )}
              <input
                ref={readyRef} type="file" hidden multiple
                accept=".mp4,.mov,.mkv,.webm,.m4v,.avi"
                onChange={(e) => { addReady(e.target.files); e.target.value = '' }}
              />
            </div>
          ) : isAff ? (
            <>
              <div
                role="button" tabIndex={0}
                aria-label="Tambah foto produk"
                className={`drop crop ${dragOver ? 'over is-sel' : ''} ${photos.length ? 'has-file' : ''}`}
                style={{ padding: photos.length ? '16px' : undefined }}
                onClick={() => photoRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoRef.current?.click() } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                {photos.length ? (
                  <>
                    <div className="photo-grid">
                      {photoUrls.map((u, i) => (
                        <div key={u} className="photo-item">
                          <img src={u} alt={`Foto produk ${i + 1}`} />
                          <button
                            type="button" className="photo-remove" aria-label={`Hapus foto ${i + 1}`}
                            onClick={(e) => { e.stopPropagation(); setPhotos((prev) => prev.filter((_, j) => j !== i)) }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                    <span className="hint tnum">{photos.length}/10 foto · klik untuk menambah · foto pertama jadi pembuka</span>
                  </>
                ) : (
                  <>
                    <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="15.5" cy="8.5" r="1.5" />
                    </svg>
                    <b>Tarik foto produk ke sini atau klik untuk memilih</b>
                    <span className="hint">3-6 foto dari halaman produk Shopee. JPG, PNG, WebP</span>
                  </>
                )}
                <input
                  ref={photoRef} type="file" hidden multiple
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="prod-name">Nama produk</label>
                <input id="prod-name" className="input" placeholder="Misal: Botol minum Tritan 1 liter"
                  value={prodName} onChange={(e) => setProdName(e.target.value)} />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="prod-link">Link affiliate</label>
                  <input id="prod-link" className="input" placeholder="https://s.shopee.co.id/..."
                    value={prodLink} onChange={(e) => setProdLink(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="prod-price">Harga (opsional)</label>
                  <input id="prod-price" className="input" placeholder="Rp39.000"
                    value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="prod-desc">Deskripsi produk</label>
                <textarea id="prod-desc" className="input" rows={5}
                  placeholder="Tempel deskripsi atau spesifikasi dari halaman Shopee. AI hanya memakai fakta dari sini."
                  value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} />
              </div>
            </>
          ) : mode === 'upload' ? (
            <div
              role="button" tabIndex={0}
              aria-label={file ? `File terpilih: ${file.name}. Tekan Enter untuk mengganti.` : 'Pilih file video'}
              className={`drop crop ${dragOver ? 'over is-sel' : ''} ${file ? 'has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
              {file ? (
                <><b>{file.name}</b><span className="hint tnum">{(file.size / 1e6).toFixed(1)} MB · klik untuk ganti</span></>
              ) : (
                <><b>Tarik video ke sini atau klik untuk memilih</b><span className="hint">MP4, MOV, MKV, WebM</span></>
              )}
              <input
                ref={fileRef} type="file" hidden
                accept=".mp4,.mov,.mkv,.webm,.m4v,.avi"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="yt-url">Link YouTube</label>
              <input id="yt-url" className="input" placeholder="https://www.youtube.com/watch?v=..."
                value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          )}

          {!isAff && !isReady && !isHor && (
            <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
              <label htmlFor="proj-title">Judul project (opsional)</label>
              <input id="proj-title" className="input" placeholder="Misal: Podcast eps. 12"
                value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="out-title">
          <h2 id="out-title" className="card-title">Hasil</h2>

          {isReady ? (
            <>
              <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
                Video tidak dipotong dan tidak diberi subtitle. Hanya border brand yang dipasang, lalu hasilnya
                disimpan ke <code>Siap Upload/&lt;tanggal&gt;</code>. Nama file jadi judul di border, bisa diganti di Studio.
              </p>
              <VariasiPanel value={variasi} onChange={setVariasi} fileCount={readyFiles.length} refreshKey={variasiKey} />
              {!variasi.on && (<>
              <div className="row">
                <div className="field">
                  <label htmlFor="ready-theme">Tema border</label>
                  <select id="ready-theme" className="select" value={readyTheme} onChange={(e) => setReadyTheme(e.target.value)}>
                    <option value="">Default ({themes[defTheme] || defTheme})</option>
                    {Object.entries(themes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  {readyFrameId && (
                    <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }}
                      onClick={() => nav(`/frame-studio?frame=${readyFrameId}`)}>
                      Edit frame ini (brand, judul, efek)
                    </button>
                  )}
                </div>
                {readyFrameId && (
                  <div className="field">
                    <label htmlFor="ready-frame-title">Judul di frame</label>
                    <input id="ready-frame-title" className="input" value={readyFrameTitle} maxLength={200}
                      placeholder="Kosong = tagline brand" onChange={(e) => setReadyFrameTitle(e.target.value)} />
                    <span className="hint">Dipakai untuk semua video di batch ini. Bisa diganti per video di Studio.</span>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="ready-ratio">Rasio hasil</label>
                  <select id="ready-ratio" className="select" value={readyRatio} onChange={(e) => setReadyRatio(e.target.value)}>
                    <option value="auto">Ikuti video asli</option>
                    <option value="9:16">9:16 vertikal</option>
                    <option value="1:1">1:1 kotak</option>
                    <option value="16:9">16:9 landscape</option>
                  </select>
                </div>
              </div>
              <BrandTextPanel theme={readyEff} title={readyFrameTitle} />
              <BumperPanel />
              <p className="hint" style={{ marginTop: 0 }}>
                Minimal dan Berita menampilkan video penuh. Tema lain memotong tepi video supaya pas di jendelanya.
              </p>
              </>)}
            </>
          ) : isHor ? (
            <>
              <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
                Tiap video 45-55 detik, 7-9 adegan, sekitar 5 menit proses per video. Hasil, thumbnail, dan
                caption (berisi catatan upload) masuk ke <code>Siap Upload/&lt;tanggal&gt;</code>.
              </p>
              <div className="row">
                <div className="field">
                  <label htmlFor="hor-n">Jumlah video</label>
                  <select id="hor-n" className="select" value={Math.min(3, autoN)} onChange={(e) => setAutoN(e.target.value)}>
                    {[1, 2, 3].map((x) => <option key={x} value={x}>{x} cerita berbeda</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="hor-voice">Suara narator</label>
                  <select id="hor-voice" className="select" value={horVoice} onChange={(e) => setHorVoice(e.target.value)}>
                    {HOR_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="hor-llm">Penulis cerita (LLM)</label>
                <select id="hor-llm" className="select" value={llm} onChange={(e) => setLlm(e.target.value)}>
                  {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </>
          ) : isAff ? (
            <>
              <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
                AI menulis naskah review, narator membacakannya, dan foto produk dirakit jadi video 9:16
                dengan subtitle. Link affiliate otomatis masuk ke <code>caption.txt</code> di folder{' '}
                <code>Siap Upload/&lt;tanggal&gt;</code>.
              </p>
              <div className="row">
                <div className="field">
                  <label htmlFor="aff-n">Jumlah video</label>
                  <select id="aff-n" className="select" value={autoN} onChange={(e) => setAutoN(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x} video, sudut beda</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="aff-voice">Suara narator</label>
                  <select id="aff-voice" className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="aff-llm">Penulis naskah (LLM)</label>
                <select id="aff-llm" className="select" value={llm} onChange={(e) => setLlm(e.target.value)}>
                  {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </>
          ) : (<>
          <div className="auto-box">
            <label className="check-row">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              <span>
                <b>Langsung siap upload</b>
                <span>Render, thumbnail, dan caption dibuat otomatis tanpa editing. Klip tetap bisa direvisi di Studio.</span>
              </span>
            </label>
            {auto && (
              <div className="field">
                <label htmlFor="auto-n">Jumlah video jadi</label>
                <select id="auto-n" className="select" value={autoN} onChange={(e) => setAutoN(e.target.value)}>
                  {[1, 2, 3].map((x) => <option key={x} value={x}>{x} video</option>)}
                </select>
                <span className="hint">Disimpan ke folder <code>Siap Upload/&lt;tanggal&gt;</code>.</span>
              </div>
            )}
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="n-clips">Kandidat klip</label>
              <select id="n-clips" className="select" value={nClips} onChange={(e) => setNClips(e.target.value)}>
                {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} klip</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="durasi">Durasi klip</label>
              <select id="durasi" className="select" value={durasi} onChange={(e) => setDurasi(e.target.value)}>
                {DUR_PRESETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <details className="advanced">
            <summary>Pengaturan lanjutan</summary>
            <div className="advanced-body">
              <div className="field">
                <label htmlFor="lang">Bahasa video</label>
                <select id="lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="id">Indonesia</option>
                  <option value="en">Inggris</option>
                  <option value="auto">Deteksi otomatis</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="stt">Transkripsi</label>
                <select id="stt" className="select" value={stt} onChange={(e) => setStt(e.target.value)}>
                  {STT_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="llm">Pencari momen (LLM)</label>
                <select id="llm" className="select" value={llm} onChange={(e) => setLlm(e.target.value)}>
                  {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vocab">Kosakata khusus</label>
                <input
                  id="vocab" className="input"
                  placeholder="Contoh: jijik, Bang Madun, ngab"
                  value={vocab} onChange={(e) => setVocab(e.target.value)}
                />
                <span className="hint">Nama, brand, atau slang yang sering salah tulis. Jadi panduan ejaan untuk Whisper dan koreksi AI.</span>
              </div>
              <label className="check-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={fixTypos} onChange={(e) => setFixTypos(e.target.checked)} />
                Koreksi typo transkrip dengan AI
              </label>
            </div>
          </details>
          </>)}

          <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
            {busy ? 'Menyiapkan…' : isReady && variasi.on ? `Produksi ${(readyFiles.length * variasi.n) || ''} video variasi`.replace('  ', ' ') : isReady ? `Pasang border di ${readyFiles.length || ''} video`.replace('  ', ' ') : isAff ? `Buat ${autoN} video review` : isHor ? `Buat ${Math.min(3, autoN)} video horor` : auto ? `Produksi ${autoN} video` : 'Cari momen & buka Studio'}
          </button>
          {err && <div className="error-text" role="alert">{err}</div>}
          <p className="hint" style={{ marginTop: 10 }}>
            API key provider diisi sekali lewat Pengaturan di kanan atas dan tersimpan lokal.
          </p>
        </section>
      </div>
      {isHor && <FactoryPanel style={horStyle} pov={horPov} voice={horVoice} llm={llm} />}
    </div>
  )
}
