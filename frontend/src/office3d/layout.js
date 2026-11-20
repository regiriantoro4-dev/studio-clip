// Tata letak kantor 3D (spec §5): satu lantai, grid 2 baris × 3 ruangan, lorong di tengah.

export const ROOMS = [
  { id: 'data', name: 'Unduh & Data', color: '#2fa45a', accent: '#8ff0b0', col: 0, row: 0 },
  { id: 'analis', name: 'Analis Klip', color: '#3b6fd8', accent: '#a9c8ff', col: 1, row: 0 },
  { id: 'horror', name: 'Studio Horor', color: '#d89b2b', accent: '#ffd98a', col: 2, row: 0 },
  { id: 'suara', name: 'Ruang Suara', color: '#c94fc0', accent: '#f6b3ef', col: 0, row: 1 },
  { id: 'brain', name: 'Otak AI', color: '#1b2a4a', accent: '#7fd3ff', col: 1, row: 1 },
  { id: 'render', name: 'Render + Affiliate', color: '#1f9e8f', accent: '#8ef3e6', col: 2, row: 1 },
]

export const ROOM_OF = {
  downloader: 'data', transcriber: 'data',
  'job:process': 'analis', 'job:annotate': 'analis', 'job:fix-transcript': 'analis', 'job:autoproduce': 'analis',
  'job:horror': 'horror',
  tts: 'suara', 'job:narrate': 'suara',
  'llm:groq': 'brain', 'llm:gemini': 'brain', 'llm:openai': 'brain', 'llm:moonshot': 'brain',
  renderer: 'render', thumbnail: 'render', bumper: 'render', 'job:affiliate': 'render', 'job:readymade': 'render',
}

// 4 model AI selalu duduk di Otak AI walau belum pernah dipanggil (telemetri baru memuatnya setelah dipakai)
export const ALWAYS_PRESENT = ['llm:groq', 'llm:gemini', 'llm:openai', 'llm:moonshot']

export const PERSONA = {
  'job:process': 'Raka', 'job:readymade': 'Sari', 'job:autoproduce': 'Bima', 'job:affiliate': 'Nadia',
  'job:narrate': 'Dewi', 'job:fix-transcript': 'Tono', 'job:annotate': 'Lina', 'job:horror': 'Studio Horor',
  downloader: 'Udin', transcriber: 'Wulan', renderer: 'Joko', thumbnail: 'Ayu', tts: 'Rina', bumper: 'Kiki',
  'llm:groq': 'Gilang', 'llm:gemini': 'Maya', 'llm:openai': 'Arif', 'llm:moonshot': 'Putri',
}

export function roomFor(agentId) {
  if (ROOM_OF[agentId]) return ROOM_OF[agentId]
  return String(agentId).startsWith('llm:') ? 'brain' : 'analis'
}
