import { describe, expect, test } from 'vitest'
import idle from './fixtures/cc-idle.json'
import { ROOMS, roomFor } from './layout.js'
import { MAX_TRIPS, STALE_MS, deriveScene, targetFps } from './sceneModel.js'

const NOW = 1_800_000_000_000 // ms
const sec = (msAgo) => (NOW - msAgo) / 1000
const agent = (id, extra = {}) => ({ id, name: id, health: 'idle', scene_health: 'idle', running: 0, ...extra })
const data = (over = {}) => ({ agents: [], running: [], inflight: [], log: [], ...over })
const charOf = (scene, id) => scene.characters.find((c) => c.agentId === id)

describe('deriveScene', () => {
  test('everyKnownAgentPlacedPerSpec', () => {
    const s = deriveScene(idle, null, NOW)
    const expected = {
      'job:process': 'analis', 'job:annotate': 'analis', 'job:fix-transcript': 'analis', 'job:autoproduce': 'analis',
      downloader: 'data', transcriber: 'data', 'job:horror': 'horror', tts: 'suara', 'job:narrate': 'suara',
      renderer: 'render', thumbnail: 'render', bumper: 'render', 'job:affiliate': 'render', 'job:readymade': 'render',
      'llm:groq': 'brain', 'llm:gemini': 'brain', 'llm:openai': 'brain', 'llm:moonshot': 'brain',
    }
    for (const [id, room] of Object.entries(expected)) expect(charOf(s, id)?.roomId, id).toBe(room)
    expect(s.rooms.map((r) => r.id).sort()).toEqual(ROOMS.map((r) => r.id).sort())
  })

  test('runningAgentTypes', () => {
    const s = deriveScene(data({
      agents: [agent('job:horror', { running: 1, scene_health: 'running' }), agent('tts', { running: 1 })],
      running: [{ id: 'j1', agent: 'job:horror', stage: 'Melukis gambar 3/15', progress: 0.4, elapsed: 30 }],
      inflight: [{ agent: 'tts', task: 'Suara narator_d', job: 'j1', job_kind: 'horror', since: sec(1000) }],
    }), null, NOW)
    expect(charOf(s, 'job:horror')).toMatchObject({ state: 'typing', stage: 'Melukis gambar 3/15', progress: 0.4 })
    expect(charOf(s, 'tts')).toMatchObject({ state: 'typing', stage: 'Suara narator_d' })
    expect(s.rooms.find((r) => r.id === 'horror').activeCount).toBe(1)
  })

  test('sceneHealthErrorLightsRoom', () => {
    const s = deriveScene(data({
      agents: [agent('renderer', { health: 'error', scene_health: 'error' }), agent('tts', { health: 'error', scene_health: 'ok' })],
    }), null, NOW)
    expect(s.rooms.find((r) => r.id === 'render').alert).toBe('error')
    expect(s.rooms.find((r) => r.id === 'suara').alert).toBe(null)
    expect(charOf(s, 'renderer').state).toBe('alert')
  })

  test('llmInflightWithJobMakesTrip', () => {
    const s = deriveScene(data({
      agents: [agent('job:horror', { running: 1 })],
      running: [{ id: 'j1', agent: 'job:horror', stage: 'AI menulis cerita', progress: 0.03 }],
      inflight: [{ agent: 'llm:groq', task: 'Chat', job: 'j1', job_kind: 'horror', since: sec(800) }],
    }), null, NOW)
    expect(s.trips).toHaveLength(1)
    expect(s.trips[0]).toMatchObject({ agentId: 'job:horror', from: 'horror', to: 'brain', kind: 'ask-ai' })
    expect(s.brainPulse).toBeGreaterThan(0)
  })

  test('llmInflightWithoutJobOnlyPulses', () => {
    const s = deriveScene(data({ inflight: [{ agent: 'llm:gemini', task: 'Chat', job: '', job_kind: '', since: sec(500) }] }), null, NOW)
    expect(s.trips).toHaveLength(0)
    expect(s.brainPulse).toBeGreaterThan(0)
  })

  test('handoffAcrossRooms', () => {
    const s = deriveScene(data({
      running: [{ id: 'j2', agent: 'job:process', stage: 'AI memilih momen', progress: 0.5 }],
      log: [{ agent: 'transcriber', job: 'j2', status: 'done', end: sec(2000), task: 'Transkrip' }],
    }), null, NOW)
    expect(s.trips).toEqual([expect.objectContaining({ agentId: 'transcriber', from: 'data', to: 'analis', kind: 'handoff' })])
  })

  test('noHandoffWithinSameRoom', () => {
    const s = deriveScene(data({
      running: [{ id: 'j3', agent: 'job:affiliate', stage: 'Render', progress: 0.8 }],
      log: [{ agent: 'renderer', job: 'j3', status: 'done', end: sec(1000), task: 'Render MP4' }],
    }), null, NOW)
    expect(s.trips).toHaveLength(0)
  })

  test('unknownAgentGoesToDefaultRoom', () => {
    expect(roomFor('job:podcast')).toBe('analis')
    expect(roomFor('llm:openrouter')).toBe('brain')
    const s = deriveScene(data({ agents: [agent('job:podcast'), agent('llm:openrouter')] }), null, NOW)
    expect(charOf(s, 'job:podcast').roomId).toBe('analis')
    expect(charOf(s, 'llm:openrouter').roomId).toBe('brain')
  })

  test('tripsAreCapped', () => {
    const kinds = ['horror', 'process', 'autoproduce', 'affiliate', 'narrate', 'annotate', 'readymade', 'fix-transcript', 'podcast']
    const s = deriveScene(data({
      inflight: kinds.map((k, i) => ({ agent: 'llm:groq', task: 'Chat', job: `j${i}`, job_kind: k, since: sec(500 + i) })),
    }), null, NOW)
    expect(s.trips.length).toBe(MAX_TRIPS)
    expect(MAX_TRIPS).toBe(4)
    expect(s.brainPulse).toBeGreaterThan(0)
  })

  test('staleEventsIgnored', () => {
    const s = deriveScene(data({
      running: [{ id: 'j2', agent: 'job:process', stage: '', progress: 0 }],
      inflight: [{ agent: 'llm:groq', task: 'Chat', job: 'j2', job_kind: 'process', since: sec(STALE_MS + 5000) }],
      log: [{ agent: 'transcriber', job: 'j2', status: 'done', end: sec(STALE_MS + 9000), task: 'Transkrip' }],
    }), null, NOW)
    expect(STALE_MS).toBe(15000)
    expect(s.trips).toHaveLength(0)
  })

  test('samePollTwiceDoesNotDuplicateTrips', () => {
    const d = data({
      running: [{ id: 'j1', agent: 'job:horror', stage: '', progress: 0 }],
      inflight: [{ agent: 'llm:groq', task: 'Chat', job: 'j1', job_kind: 'horror', since: sec(800) }],
    })
    const first = deriveScene(d, null, NOW)
    const second = deriveScene(d, first, NOW + 5000)
    expect(second.trips).toHaveLength(1)
    expect(second.trips[0].key).toBe(first.trips[0].key)
  })

  test('finishedTripsAreDropped', () => {
    const d = data({ inflight: [{ agent: 'llm:groq', task: 'Chat', job: 'j1', job_kind: 'horror', since: sec(800) }] })
    const first = deriveScene(d, null, NOW)
    const later = deriveScene(data(), first, NOW + 60000)
    expect(later.trips).toHaveLength(0)
  })

  test('emptyDataDoesNotThrow', () => {
    const s = deriveScene(data(), null, NOW)
    expect(s.rooms).toHaveLength(6)
    expect(s.characters.every((c) => c.roomId === 'brain')).toBe(true) // hanya 4 AI yang selalu ada
    expect(s.trips).toEqual([])
    expect(deriveScene(null, null, NOW).rooms).toHaveLength(6)
  })

  test('shortLlmCallFromLogMakesTrip', () => {
    // panggilan Groq 1-2 dtk sering selesai di antara dua poll: tetap harus memicu perjalanan & denyut
    const s = deriveScene(data({
      running: [{ id: 'j1', agent: 'job:horror', stage: 'AI menulis cerita', progress: 0.03 }],
      log: [{ agent: 'llm:groq', job: 'j1', status: 'done', start: sec(3000), end: sec(1500), task: 'Chat' }],
    }), null, NOW)
    expect(s.trips).toEqual([expect.objectContaining({ agentId: 'job:horror', from: 'horror', to: 'brain', kind: 'ask-ai' })])
    expect(s.brainPulse).toBeGreaterThan(0)
  })

  test('llmSeenInflightThenLogIsOneTrip', () => {
    const run = [{ id: 'j1', agent: 'job:horror', stage: '', progress: 0 }]
    const first = deriveScene(data({ running: run, inflight: [{ agent: 'llm:groq', task: 'Chat', job: 'j1', job_kind: 'horror', since: sec(3000) }] }), null, NOW)
    const second = deriveScene(data({ running: run, log: [{ agent: 'llm:groq', job: 'j1', status: 'done', start: sec(3000), end: sec(1000), task: 'Chat' }] }), first, NOW + 2000)
    expect(second.trips).toHaveLength(1)
    expect(second.trips[0].key).toBe(first.trips[0].key)
  })
})

describe('targetFps', () => {
  test('idleSceneRendersSlowly', () => {
    expect(targetFps(deriveScene(data(), null, NOW))).toBe(6)
  })
  test('activitySpeedsUp', () => {
    const typing = deriveScene(data({ agents: [agent('tts', { running: 1 })] }), null, NOW)
    const alert = deriveScene(data({ agents: [agent('renderer', { scene_health: 'error' })] }), null, NOW)
    const walking = deriveScene(data({ inflight: [{ agent: 'llm:groq', task: 'C', job: 'j', job_kind: 'horror', since: sec(500) }] }), null, NOW)
    for (const s of [typing, alert, walking]) expect(targetFps(s)).toBe(30)
    expect(targetFps(null)).toBe(6)
  })
})
