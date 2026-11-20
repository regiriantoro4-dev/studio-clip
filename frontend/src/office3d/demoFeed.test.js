import { expect, test } from 'vitest'
import { CYCLE_MS, demoFeed } from './demoFeed.js'
import { deriveScene } from './sceneModel.js'

const T0 = 1_800_000_000_000

test('demoFeedHasApiShape', () => {
  const d = demoFeed(T0)
  for (const k of ['agents', 'running', 'inflight', 'log', 'alerts', 'summary', 'now']) expect(d).toHaveProperty(k)
  expect(d.demo).toBe(true)
  expect(d.agents.find((a) => a.id === 'job:horror')).toBeTruthy()
})

test('oneCycleShowsAskAiHandoffAndError', () => {
  let prev = null
  const kinds = new Set()
  let sawError = false
  let sawTyping = false
  for (let t = 0; t <= CYCLE_MS; t += 1000) {
    const s = deriveScene(demoFeed(T0 + t), prev, T0 + t)
    s.trips.forEach((tr) => kinds.add(tr.kind))
    sawError ||= s.rooms.some((r) => r.alert === 'error')
    sawTyping ||= s.characters.some((c) => c.state === 'typing')
    prev = s
  }
  expect([...kinds].sort()).toEqual(['ask-ai', 'handoff'])
  expect(sawError).toBe(true)
  expect(sawTyping).toBe(true)
})

test('demoIsDeterministic', () => {
  expect(demoFeed(T0 + 12345)).toEqual(demoFeed(T0 + 12345))
})
