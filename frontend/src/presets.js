// Preset gaya subtitle & helper — logika chunking HARUS sama dengan backend/app/services/subtitles.py

export const PRESETS = [
  { id: 'beasty', name: 'Beasty', desc: 'Satu kata besar, pop tegas' },
  { id: 'karaoke', name: 'Karaoke', desc: 'Kalimat terisi warna per kata' },
  { id: 'boxy', name: 'Boxy', desc: 'Kata aktif dalam kotak warna' },
  { id: 'duo', name: 'Duo', desc: 'Frasa pendek, kata aktif disorot' },
  { id: 'clean', name: 'Clean', desc: 'Simpel & bersih tanpa animasi' },
]

export const HOOK_TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Bold + outline hitam' },
  { id: 'elegant', name: 'Elegant', desc: 'Serif italic lembut' },
  { id: 'boxies', name: 'Boxies', desc: 'Kotak putih per baris' },
  { id: 'box', name: 'Box', desc: 'Satu kotak gelap' },
]

export const RATIOS = ['9:16', '1:1', '16:9']
export const FORMATS = ['mp4', 'webm', 'gif']
export const FONTS = ['Arial Black', 'Impact', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Comic Sans MS']

export const STT_PROVIDERS = [
  { id: 'groq', name: 'Groq Whisper (cloud, cepat)' },
  { id: 'openai', name: 'OpenAI Whisper' },
  { id: 'local', name: 'Local Whisper (offline)' },
]

// Claude (anthropic) sengaja tidak ada di sini: berbayar, hanya dipakai sebagai cadangan terakhir combo.
export const LLM_PROVIDERS = [
  { id: 'auto', name: 'Combo: Groq → Gemini → OpenRouter → OpenAI → Claude' },
  { id: 'groq', name: 'Groq (Llama)' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'moonshot', name: 'Moonshot (Kimi)' },
  { id: 'openrouter', name: 'OpenRouter (gratis)' },
]

export const DEFAULT_FX = {
  zoom: true,
  zoom_strength: 0.08,
  cut_silence: true,
  silence_gap: 0.7,
  jeda_mode: 'buang', // 'buang' (lama: jeda dibuang habis) | 'rapat' (jeda disisakan jeda_sisa detik)
  jeda_sisa: 0.4,
  keywords: true,
  emoji: true,
  progress_bar: true,
  progress_color: '#7C5CFF',
  teaser: true,
  bgm: '',
  bgm_volume: 0.12,
  border: true,
  border_theme: '',
}

export function clipWords(transcript, clip) {
  const out = []
  if (!transcript?.segments) return out
  transcript.segments.forEach((seg, si) => {
    ;(seg.words || []).forEach((w, wi) => {
      const mid = (w.s + w.e) / 2
      if (mid >= clip.start && mid <= clip.end) out.push({ ...w, si, wi })
    })
  })
  return out
}

export function chunkParams(preset) {
  return preset === 'clean' ? { maxWords: 7, maxDur: 5.0 } : { maxWords: 4, maxDur: 3.5 }
}

export function chunkWords(words, { maxWords = 4, maxDur = 3.5, maxGap = 0.8 } = {}) {
  const chunks = []
  let cur = []
  for (const w of words) {
    if (
      cur.length &&
      (cur.length >= maxWords ||
        w.s - cur[cur.length - 1].e > maxGap ||
        w.e - cur[0].s > maxDur ||
        /[.!?…]$/.test(cur[cur.length - 1].w))
    ) {
      chunks.push(cur)
      cur = []
    }
    cur.push(w)
  }
  if (cur.length) chunks.push(cur)

  return chunks.map((ws) => {
    const items = ws.map((w, i) => ({
      ...w,
      showUntil: i + 1 < ws.length ? Math.min(ws[i + 1].s, w.e + 0.8) : w.e + 0.15,
    }))
    return { words: items, start: ws[0].s, end: items[items.length - 1].showUntil }
  })
}

export function wrapLines(text, max = 22) {
  const out = []
  for (const raw of String(text || '').split('\n')) {
    let line = ''
    for (const word of raw.trim().split(/\s+/)) {
      if (!word) continue
      if (line && (line + ' ' + word).length > max) {
        out.push(line)
        line = word
      } else {
        line = line ? line + ' ' + word : word
      }
    }
    if (line) out.push(line)
  }
  return out
}

export function fmtTime(t) {
  if (!isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const d = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${d}`
}

export function fmtDate(ts) {
  try {
    return new Date(ts * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}
