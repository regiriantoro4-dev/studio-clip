import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { LLM_PROVIDERS } from '../presets.js'
import './NaskahHoror.css'

// Naskah horor: AI menulis cerita, Anda periksa dan edit, baru kemudian gambar/suara/video dibuat.
const POVS = [
  { id: 'kamu', label: 'Kamu — penonton jadi tokohnya' },
  { id: 'aku', label: 'Aku — pengalaman pribadi narator' },
]
const VOICES = [
  { id: 'omnivoice:narator_d', label: 'Narator D, pria muda (OmniVoice lokal, gratis)' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi, pria berat (Edge, gratis)' },
  { id: 'id-ID-GadisNeural', label: 'Gadis, wanita (Edge, gratis)' },
  { id: 'gemini:Charon', label: 'Charon, pria dalam (Gemini)' },
  { id: 'gemini:Enceladus', label: 'Enceladus, pria berbisik (Gemini)' },
  { id: 'gemini:Kore', label: 'Kore, wanita tenang (Gemini)' },
]
const STYLES = [
  { id: 'sinematik', label: 'Sinematik gelap (seperti film)' },
  { id: 'komik', label: 'Komik / manhwa horor' },
  { id: 'found', label: 'Found footage (kamera malam)' },
]
const SFX_LABEL = {
  none: 'tanpa', static: 'desis radio/TV', knock: 'ketukan', footsteps: 'langkah kaki', heartbeat: 'detak jantung',
  wind: 'angin malam', drip: 'tetesan air', breath: 'napas/bisikan', phone: 'telepon', creak: 'derit pintu',
}
const TOPIC_MAX = 1500
const count = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0)

export default function NaskahHoror() {
  const [form, setForm] = useState({ topic: '', pov: 'kamu', style: 'sinematik', voice: 'omnivoice:narator_d', llm: '' })
  const [drafts, setDrafts] = useState([])
  const [draft, setDraft] = useState(null) // naskah yang sedang dibuka (dari server)
  const [story, setStory] = useState(null) // salinan yang sedang diedit
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  const loadList = useCallback(() => { api('/api/horror/drafts').then(setDrafts).catch(() => {}) }, [])
  useEffect(() => { loadList() }, [loadList])

  const open = (d) => { setDraft(d); setStory(d.story); setDirty(false); setDone(null) }
  const run = async (label, fn) => {
    setBusy(label); setErr('')
    try { return await fn() } catch (e) { setErr(e.message); return null } finally { setBusy('') }
  }

  const write = () => run('Menulis naskah…', async () => {
    const d = await api('/api/horror/drafts', {
      method: 'POST',
      body: { topic: form.topic.trim(), pov: form.pov, style: form.style, voice: form.voice, llm_provider: form.llm },
    })
    open(d); loadList()
  })
  const openId = (id) => run('Membuka naskah…', async () => open(await api(`/api/horror/drafts/${id}`)))
  const save = () => run('Menyimpan…', async () => {
    const d = await api(`/api/horror/drafts/${draft.id}`, { method: 'PUT', body: { story, voice: draft.voice, style: draft.style } })
    open(d); loadList(); return d
  })
  const rewrite = () => {
    if (!window.confirm('Tulis ulang seluruh cerita dengan topik yang sama? Isi naskah sekarang akan diganti.')) return
    run('Menulis ulang…', async () => { open(await api(`/api/horror/drafts/${draft.id}/rewrite`, { method: 'POST' })); loadList() })
  }
  const remove = () => {
    if (!window.confirm('Hapus naskah ini?')) return
    run('Menghapus…', async () => {
      await api(`/api/horror/drafts/${draft.id}`, { method: 'DELETE' })
      setDraft(null); setStory(null); loadList()
    })
  }
  const produce = () => run('Memulai produksi…', async () => {
    if (dirty && !(await save())) return
    const r = await api(`/api/horror/drafts/${draft.id}/produce`, { method: 'POST' })
    setDone(r); loadList()
  })

  const edit = (patch) => { setStory((s) => ({ ...s, ...patch })); setDirty(true) }
  const editScene = (i, patch) => {
    setStory((s) => ({ ...s, scenes: s.scenes.map((sc, k) => (k === i ? { ...sc, ...patch } : sc)) }))
    setDirty(true)
  }
  const setTwist = (i) => {
    setStory((s) => ({ ...s, scenes: s.scenes.map((sc, k) => ({ ...sc, twist: k === i })) }))
    setDirty(true)
  }
  const move = (i, by) => {
    setStory((s) => {
      const sc = [...s.scenes]
      const j = i + by
      if (j < 0 || j >= sc.length) return s
      ;[sc[i], sc[j]] = [sc[j], sc[i]]
      return { ...s, scenes: sc }
    })
    setDirty(true)
  }
  const removeScene = (i) => { setStory((s) => ({ ...s, scenes: s.scenes.filter((_, k) => k !== i) })); setDirty(true) }
  const addScene = () => {
    setStory((s) => ({ ...s, scenes: [...s.scenes, { narration: '', prompt: '', prompt2: '', sfx: 'none', twist: false }] }))
    setDirty(true)
  }

  const words = story ? story.scenes.reduce((n, s) => n + count(s.narration), 0) : 0
  const sfxNames = draft?.sfx_names || ['none']

  return (
    <div className="page">
      <div className="page-head">
        <h1>Naskah horor</h1>
        <p>
          AI menulis ceritanya dulu. Anda periksa dan edit narasi, prompt gambar, judul, dan deskripsi.
          Gambar, suara, dan video baru dibuat setelah Anda menekan Produksi.
        </p>
      </div>

      {err && <div className="state-box" role="alert"><p>{err}</p></div>}

      <section className="card">
        <h2 className="card-title">Naskah baru</h2>
        <div className="field">
          <label htmlFor="nh-topic">Topik atau ringkasan cerita (opsional)</label>
          <textarea id="nh-topic" className="input" rows={4} maxLength={TOPIC_MAX} value={form.topic}
            placeholder="Kosong = AI memilih ide sendiri. Boleh menempel ringkasan panjang, misalnya blok Topik siap tempel dari riset."
            onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <span className="hint tnum">{form.topic.length}/{TOPIC_MAX} karakter</span>
        </div>
        <div className="nh-row">
          <div className="field">
            <label htmlFor="nh-pov">Gaya naskah</label>
            <select id="nh-pov" className="select" value={form.pov} onChange={(e) => setForm({ ...form, pov: e.target.value })}>
              {POVS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nh-style">Gaya visual</label>
            <select id="nh-style" className="select" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
              {STYLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nh-voice">Suara narator</label>
            <select id="nh-voice" className="select" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
              {VOICES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nh-llm">Penulis cerita (LLM)</label>
            <select id="nh-llm" className="select" value={form.llm} onChange={(e) => setForm({ ...form, llm: e.target.value })}>
              <option value="">Sesuai Pengaturan</option>
              {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={write}>
          {busy === 'Menulis naskah…' ? busy : 'Tulis naskah'}
        </button>
        <span className="hint nh-inline">Biasanya 10-60 detik. Belum ada gambar atau suara yang dibuat.</span>
      </section>

      {drafts.length > 0 && (
        <section className="card">
          <h2 className="card-title">Naskah tersimpan <small>{drafts.length}</small></h2>
          <ul className="nh-list">
            {drafts.map((d) => (
              <li key={d.id}>
                <button type="button" className={`nh-item ${draft?.id === d.id ? 'is-open' : ''}`} disabled={!!busy} onClick={() => openId(d.id)}>
                  <span className="nh-item-title">{d.title}</span>
                  <span className="hint tnum">{d.scenes} adegan · {d.pid ? 'sudah diproduksi' : 'belum diproduksi'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {busy && <p className="hint" role="status" aria-live="polite">{busy}</p>}

      {story && draft && (
        <>
          <section className="card">
            <h2 className="card-title">Periksa naskah <small className="tnum">{story.scenes.length} adegan · {words} kata</small></h2>

            {dirty ? (
              <p className="nh-note">Ada perubahan yang belum disimpan. Peringatan di bawah dihitung dari versi tersimpan.</p>
            ) : null}
            {draft.warnings.length > 0 ? (
              <ul className="nh-warn" aria-label="Yang perlu diperiksa">
                {draft.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            ) : (
              <p className="nh-ok">Struktur cerita lolos pemeriksaan: twist menjelang akhir, ajakan komentar di adegan terakhir.</p>
            )}

            <div className="nh-row">
              <div className="field">
                <label htmlFor="nh-title">Judul video</label>
                <input id="nh-title" className="input" value={story.title} maxLength={120} onChange={(e) => edit({ title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nh-hook">Teks hook di layar (maks 6 kata)</label>
                <input id="nh-hook" className="input" value={story.hook} maxLength={60} onChange={(e) => edit({ hook: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nh-cta">Teks penutup di layar</label>
                <input id="nh-cta" className="input" value={story.cta} maxLength={40} onChange={(e) => edit({ cta: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nh-thumb">Teks thumbnail</label>
                <input id="nh-thumb" className="input" value={story.thumbnail_text} maxLength={80} onChange={(e) => edit({ thumbnail_text: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="nh-desc">Deskripsi (masuk ke caption)</label>
              <textarea id="nh-desc" className="input" rows={2} maxLength={1000} value={story.description} onChange={(e) => edit({ description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="nh-tags">Hashtag (pisahkan dengan spasi)</label>
              <input id="nh-tags" className="input" value={story.hashtags.join(' ')}
                onChange={(e) => edit({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
            </div>
            <div className="field">
              <label htmlFor="nh-prot">Tokoh utama (bahasa Inggris, disalin ke prompt gambar)</label>
              <input id="nh-prot" className="input" value={story.protagonist} maxLength={200} onChange={(e) => edit({ protagonist: e.target.value })} />
              <span className="hint">Mengubah kolom ini tidak otomatis mengubah prompt adegan. Samakan sendiri di prompt yang memuat tokoh.</span>
            </div>
            <div className="nh-row">
              <div className="field">
                <label htmlFor="nh-dvoice">Suara narator</label>
                <select id="nh-dvoice" className="select" value={draft.voice} onChange={(e) => { setDraft({ ...draft, voice: e.target.value }); setDirty(true) }}>
                  {VOICES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nh-dstyle">Gaya visual</label>
                <select id="nh-dstyle" className="select" value={draft.style} onChange={(e) => { setDraft({ ...draft, style: e.target.value }); setDirty(true) }}>
                  {STYLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          <ol className="nh-scenes">
            {story.scenes.map((sc, i) => (
              <li className={`card nh-scene ${sc.twist ? 'is-twist' : ''}`} key={i}>
                <div className="nh-scene-head">
                  <b className="tnum">Adegan {i + 1}{sc.twist ? ' · twist' : ''}</b>
                  <span className="hint tnum">{count(sc.narration)} kata</span>
                  <span className="nh-scene-tools">
                    <button type="button" className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Naikkan adegan ${i + 1}`}>↑</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={i === story.scenes.length - 1} onClick={() => move(i, 1)} aria-label={`Turunkan adegan ${i + 1}`}>↓</button>
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={story.scenes.length <= 4} onClick={() => removeScene(i)}>Hapus</button>
                  </span>
                </div>
                <div className="field">
                  <label htmlFor={`nh-nar-${i}`}>Narasi (dibacakan narator)</label>
                  <textarea id={`nh-nar-${i}`} className="input" rows={2} maxLength={400} value={sc.narration} onChange={(e) => editScene(i, { narration: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`nh-p1-${i}`}>Prompt gambar (bahasa Inggris)</label>
                  <textarea id={`nh-p1-${i}`} className="input" rows={3} maxLength={600} value={sc.prompt} onChange={(e) => editScene(i, { prompt: e.target.value })} />
                </div>
                {!sc.twist && (
                  <div className="field">
                    <label htmlFor={`nh-p2-${i}`}>Prompt sudut kedua (opsional, dipakai kalau adegan 4 detik atau lebih)</label>
                    <textarea id={`nh-p2-${i}`} className="input" rows={2} maxLength={600} value={sc.prompt2} onChange={(e) => editScene(i, { prompt2: e.target.value })} />
                  </div>
                )}
                <div className="nh-scene-foot">
                  {!sc.twist && (
                    <div className="field">
                      <label htmlFor={`nh-sfx-${i}`}>Efek suara</label>
                      <select id={`nh-sfx-${i}`} className="select" value={sc.sfx} onChange={(e) => editScene(i, { sfx: e.target.value })}>
                        {sfxNames.map((n) => <option key={n} value={n}>{SFX_LABEL[n] || n}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="check-row">
                    <input type="radio" name="nh-twist" checked={sc.twist} onChange={() => setTwist(i)} />
                    Ini adegan twist (guncangan, kilat merah, dentuman otomatis)
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn" disabled={story.scenes.length >= 10} onClick={addScene}>Tambah adegan</button>

          <section className="card nh-actions">
            {done ? (
              <p className="nh-ok" role="status">
                Produksi "{done.title}" sudah dimulai. Pantau di <Link to="/projects">Riwayat</Link>;
                hasil masuk ke folder Siap Upload hari ini.
              </p>
            ) : (
              <>
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={produce}>
                  {draft.pid ? 'Produksi lagi dari naskah ini' : 'Produksi video dari naskah ini'}
                </button>
                <button type="button" className="btn" disabled={!!busy || !dirty} onClick={save}>Simpan perubahan</button>
                <button type="button" className="btn" disabled={!!busy} onClick={rewrite}>Tulis ulang oleh AI</button>
                <button type="button" className="btn btn-ghost btn-danger" disabled={!!busy} onClick={remove}>Hapus naskah</button>
                <span className="hint">Produksi memakan sekitar 5-8 menit dan memakai GPU. Jalankan satu per satu.</span>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
