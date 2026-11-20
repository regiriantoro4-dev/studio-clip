import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { LLM_PROVIDERS } from '../presets.js'
import './PromptFlow.css'

// Prompt Flow: AI menulis satu cerita horor utuh, dipecah jadi shot ±8 detik yang tinggal disalin ke Google Flow.
// Hanya teks — tidak membuat gambar, suara, atau video.
const POVS = [
  { id: 'kamu', label: 'Kamu — penonton jadi tokohnya' },
  { id: 'aku', label: 'Aku — pengalaman pribadi narator' },
]
const VISUAL_LABEL = { sinematik: 'Sinematik gelap (seperti film)', found: 'Found footage (kamera malam)', komik: 'Animasi manhwa horor' }
const TOPIC_MAX = 1500

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function CopyBtn({ text, label = 'Salin', primary = false }) {
  const [state, setState] = useState('')
  const go = async () => { setState((await copyText(text)) ? 'Tersalin' : 'Gagal menyalin'); setTimeout(() => setState(''), 1600) }
  return (
    <button type="button" className={`btn btn-sm ${primary ? 'btn-primary' : ''}`} onClick={go} aria-live="polite">
      {state || label}
    </button>
  )
}

function Field({ id, label, value, onChange, rows = 0, max = 400, hint }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {rows ? (
        <textarea id={id} className="input" rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export default function PromptFlow() {
  const [opts, setOpts] = useState(null)
  const [form, setForm] = useState({ source: 'baru', draft_id: '', topic: '', pov: 'kamu', durasi: 'pendek', visual: 'sinematik', audio: 'suasana', llm: '' })
  const [list, setList] = useState([])
  const [pack, setPack] = useState(null) // dari server (berisi prompt rakitan)
  const [pkg, setPkg] = useState(null) // salinan yang sedang diedit
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const loadList = useCallback(() => { api('/api/flow/packages').then(setList).catch(() => {}) }, [])
  useEffect(() => {
    api('/api/flow/options').then(setOpts).catch((e) => setErr(e.message))
    loadList()
  }, [loadList])

  const open = (p) => { setPack(p); setPkg(p.pkg); setDirty(false) }
  const run = async (label, fn) => {
    setBusy(label); setErr('')
    try { return await fn() } catch (e) { setErr(e.message); return null } finally { setBusy('') }
  }

  const write = () => run('Menulis paket…', async () => {
    if (form.source === 'naskah' && !form.draft_id) throw new Error('Pilih naskah horor sumbernya dulu.')
    const p = await api('/api/flow/packages', {
      method: 'POST',
      body: {
        topic: form.source === 'baru' ? form.topic.trim() : '', draft_id: form.source === 'naskah' ? form.draft_id : '',
        pov: form.pov, durasi: form.durasi, visual: form.visual, audio: form.audio, llm_provider: form.llm,
      },
    })
    open(p); loadList()
  })
  const openId = (id) => run('Membuka paket…', async () => open(await api(`/api/flow/packages/${id}`)))
  const save = () => run('Menyimpan…', async () => {
    open(await api(`/api/flow/packages/${pack.id}`, { method: 'PUT', body: { pkg, visual: pack.visual, audio: pack.audio } }))
    loadList()
  })
  const remove = () => {
    if (!window.confirm('Hapus paket prompt ini?')) return
    run('Menghapus…', async () => {
      await api(`/api/flow/packages/${pack.id}`, { method: 'DELETE' })
      setPack(null); setPkg(null); loadList()
    })
  }

  const edit = (patch) => { setPkg((p) => ({ ...p, ...patch })); setDirty(true) }
  const editLatar = (patch) => edit({ latar: { ...pkg.latar, ...patch } })
  const editTokoh = (i, patch) => edit({ tokoh: pkg.tokoh.map((t, k) => (k === i ? { ...t, ...patch } : t)) })
  const editShot = (i, patch) => edit({ shots: pkg.shots.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const setVA = (patch) => { setPack((p) => ({ ...p, ...patch })); setDirty(true) }

  const built = pack?.built
  const nameOf = (id) => pkg?.tokoh.find((t) => t.id === id)?.nama || id

  return (
    <div className="page">
      <div className="page-head">
        <h1>Prompt Flow</h1>
        <p>
          AI menulis satu cerita horor utuh lalu memecahnya jadi shot 8 detik. Tiap shot jadi prompt siap salin ke
          Google Flow; klipnya disambung jadi satu video. Halaman ini hanya membuat teks.
        </p>
      </div>

      {err && <div className="state-box" role="alert"><p>{err}</p></div>}

      <section className="card">
        <h2 className="card-title">Paket baru</h2>
        <div className="pf-row">
          <div className="field">
            <label htmlFor="pf-src">Sumber cerita</label>
            <select id="pf-src" className="select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="baru">Cerita baru dari topik</option>
              <option value="naskah">Dari naskah horor tersimpan</option>
            </select>
          </div>
          {form.source === 'naskah' && (
            <div className="field">
              <label htmlFor="pf-draft">Naskah horor</label>
              <select id="pf-draft" className="select" value={form.draft_id} onChange={(e) => setForm({ ...form, draft_id: e.target.value })}>
                <option value="">Pilih naskah…</option>
                {(opts?.drafts || []).map((d) => <option key={d.id} value={d.id}>{d.title} ({d.scenes} adegan)</option>)}
              </select>
            </div>
          )}
        </div>
        {form.source === 'baru' && (
          <div className="field">
            <label htmlFor="pf-topic">Topik atau ringkasan cerita (opsional)</label>
            <textarea id="pf-topic" className="input" rows={3} maxLength={TOPIC_MAX} value={form.topic}
              placeholder="Kosong = AI memilih ide sendiri."
              onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            <span className="hint tnum">{form.topic.length}/{TOPIC_MAX} karakter</span>
          </div>
        )}
        <div className="pf-row">
          {form.source === 'baru' && (
            <>
              <div className="field">
                <label htmlFor="pf-pov">Sudut pandang narasi</label>
                <select id="pf-pov" className="select" value={form.pov} onChange={(e) => setForm({ ...form, pov: e.target.value })}>
                  {POVS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-dur">Durasi</label>
                <select id="pf-dur" className="select" value={form.durasi} onChange={(e) => setForm({ ...form, durasi: e.target.value })}>
                  {(opts?.durasi || []).map((x) => <option key={x.id} value={x.id}>{x.label} · {x.shots} klip</option>)}
                </select>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="pf-vis">Gaya visual</label>
            <select id="pf-vis" className="select" value={form.visual} onChange={(e) => setForm({ ...form, visual: e.target.value })}>
              {(opts?.visual || []).map((v) => <option key={v} value={v}>{VISUAL_LABEL[v] || v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pf-aud">Suara di dalam klip</label>
            <select id="pf-aud" className="select" value={form.audio} onChange={(e) => setForm({ ...form, audio: e.target.value })}>
              {(opts?.audio || []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pf-llm">Penulis cerita (LLM)</label>
            <select id="pf-llm" className="select" value={form.llm} onChange={(e) => setForm({ ...form, llm: e.target.value })}>
              <option value="">Sesuai Pengaturan</option>
              {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={write}>
          {busy === 'Menulis paket…' ? busy : 'Buat paket prompt'}
        </button>
        <span className="hint pf-inline">Biasanya 1-3 menit; bisa sampai 7 menit kalau otak AI utama sedang sibuk.</span>
      </section>

      {list.length > 0 && (
        <section className="card">
          <h2 className="card-title">Paket tersimpan <small>{list.length}</small></h2>
          <ul className="pf-list">
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" className={`pf-item ${pack?.id === p.id ? 'is-open' : ''}`} disabled={!!busy} onClick={() => openId(p.id)}>
                  <span className="pf-item-title">{p.title}</span>
                  <span className="hint tnum">{p.shots} klip · ±{p.shots * 8} detik</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {busy && <p className="hint" role="status" aria-live="polite">{busy}</p>}

      {pack && pkg && (
        <>
          <section className="card">
            <h2 className="card-title">{pkg.judul} <small className="tnum">{pkg.shots.length} klip · ±{pkg.shots.length * 8} detik</small></h2>
            {pkg.logline && <p className="pf-logline">{pkg.logline}</p>}
            {pack.warnings.length > 0 ? (
              <ul className="pf-warn" aria-label="Yang perlu diperiksa">{pack.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            ) : (
              <p className="pf-ok">Struktur lolos: twist menjelang akhir, ajakan komentar di shot terakhir, semua tokoh punya deskripsi.</p>
            )}
            <ol className="pf-steps">
              <li>Di Flow, buat gambar tiap tokoh dari blok <b>Tokoh (Ingredients)</b> lalu simpan sebagai Ingredient.</li>
              <li>Pilih rasio 9:16. Tempel prompt Shot 1, generate, pilih hasil terbaik. Lanjut shot berikutnya.</li>
              <li>Susun klip berurutan di Scene builder, lalu unduh sebagai satu video.</li>
              <li>Narasi: rekam atau buat dengan narator dari <b>Naskah narator</b> (ada arahan cara baca per shot).</li>
            </ol>
            <div className="pf-actions">
              <CopyBtn text={built.semua} label="Salin semua prompt shot" primary />
              <CopyBtn text={built.naskah} label="Salin naskah narator" />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Latar & tokoh</h2>
            <div className="pf-row">
              <Field id="pf-l-tempat" label="Tempat" value={pkg.latar.tempat} max={200} onChange={(v) => editLatar({ tempat: v })} />
              <Field id="pf-l-waktu" label="Waktu / era" value={pkg.latar.waktu} max={120} onChange={(v) => editLatar({ waktu: v })} />
            </div>
            <Field id="pf-l-aturan" label="Aturan horornya" value={pkg.latar.aturan} rows={2} max={300} onChange={(v) => editLatar({ aturan: v })} />
            <Field id="pf-narr" label="Gaya narator" value={pkg.gaya_narator} max={200} onChange={(v) => edit({ gaya_narator: v })} />
            <div className="pf-tokoh">
              {pkg.tokoh.map((t, i) => (
                <div className="pf-tokoh-card" key={t.id}>
                  <div className="pf-shot-head">
                    <b>{t.id} · {t.nama}</b><span className="hint">{t.peran}</span>
                    {built.ingredients[i] && <span className="pf-tools"><CopyBtn text={built.ingredients[i].prompt} label="Salin prompt Ingredient" /></span>}
                  </div>
                  <Field id={`pf-t-fisik-${i}`} label="Penampilan (bahasa Inggris, disalin persis ke setiap shot)" value={t.fisik_en} rows={2}
                    onChange={(v) => editTokoh(i, { fisik_en: v })} />
                  <div className="pf-row">
                    <Field id={`pf-t-watak-${i}`} label="Watak" value={t.watak} max={200} onChange={(v) => editTokoh(i, { watak: v })} />
                    <Field id={`pf-t-bicara-${i}`} label="Cara bicara" value={t.cara_bicara} max={200} onChange={(v) => editTokoh(i, { cara_bicara: v })} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pf-row">
              <div className="field">
                <label htmlFor="pf-dvis">Gaya visual</label>
                <select id="pf-dvis" className="select" value={pack.visual} onChange={(e) => setVA({ visual: e.target.value })}>
                  {(opts?.visual || []).map((v) => <option key={v} value={v}>{VISUAL_LABEL[v] || v}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-daud">Suara di dalam klip</label>
                <select id="pf-daud" className="select" value={pack.audio} onChange={(e) => setVA({ audio: e.target.value })}>
                  {(opts?.audio || []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          {dirty && <p className="pf-note" role="status">Ada perubahan yang belum disimpan. Prompt di bawah diperbarui setelah Anda menekan Simpan.</p>}

          <ol className="pf-shots">
            {pkg.shots.map((s, i) => (
              <li className={`card pf-shot ${s.twist ? 'is-twist' : ''}`} key={i}>
                <div className="pf-shot-head">
                  <b className="tnum">Shot {i + 1}{s.twist ? ' · twist' : ''}</b>
                  {s.tokoh.length > 0 && <span className="hint">{s.tokoh.map(nameOf).join(', ')}</span>}
                  {built.prompts[i] && <span className="pf-tools"><CopyBtn text={built.prompts[i]} label="Salin prompt" primary /></span>}
                </div>
                {built.prompts[i] && <pre className="pf-prompt">{built.prompts[i]}</pre>}
                <Field id={`pf-s-nar-${i}`} label="Narasi (dibacakan narator)" value={s.narasi} rows={2} onChange={(v) => editShot(i, { narasi: v })} />
                <div className="pf-row">
                  <Field id={`pf-s-sit-${i}`} label="Situasi" value={s.situasi} rows={2} max={300} onChange={(v) => editShot(i, { situasi: v })} />
                  <Field id={`pf-s-baca-${i}`} label="Cara baca" value={s.cara_baca} max={120} onChange={(v) => editShot(i, { cara_baca: v })} />
                </div>
                <details className="pf-details">
                  <summary>Ubah bahan prompt (bahasa Inggris)</summary>
                  <Field id={`pf-s-aksi-${i}`} label="Aksi" value={s.aksi_en} rows={2} onChange={(v) => editShot(i, { aksi_en: v })} />
                  <div className="pf-row">
                    <Field id={`pf-s-lok-${i}`} label="Lokasi" value={s.lokasi_en} max={300} onChange={(v) => editShot(i, { lokasi_en: v })} />
                    <Field id={`pf-s-kam-${i}`} label="Kamera" value={s.kamera_en} max={160} onChange={(v) => editShot(i, { kamera_en: v })} />
                    <Field id={`pf-s-cah-${i}`} label="Cahaya & mood" value={s.cahaya_en} max={160} onChange={(v) => editShot(i, { cahaya_en: v })} />
                    <Field id={`pf-s-sua-${i}`} label="Suara suasana" value={s.suara_en} max={240} onChange={(v) => editShot(i, { suara_en: v })} />
                  </div>
                  {pack.audio === 'dialog' && (
                    <div className="pf-row">
                      <Field id={`pf-s-dia-${i}`} label="Dialog di klip (bahasa Indonesia)" value={s.dialog} max={160} onChange={(v) => editShot(i, { dialog: v })} />
                      <div className="field">
                        <label htmlFor={`pf-s-spk-${i}`}>Pembicara</label>
                        <select id={`pf-s-spk-${i}`} className="select" value={s.pembicara} onChange={(e) => editShot(i, { pembicara: e.target.value })}>
                          <option value="">—</option>
                          {pkg.tokoh.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ol>

          <section className="card pf-actions">
            <button type="button" className="btn btn-primary" disabled={!!busy || !dirty} onClick={save}>Simpan & perbarui prompt</button>
            <CopyBtn text={built.semua} label="Salin semua prompt shot" />
            <button type="button" className="btn btn-ghost btn-danger" disabled={!!busy} onClick={remove}>Hapus paket</button>
          </section>
        </>
      )}
    </div>
  )
}
