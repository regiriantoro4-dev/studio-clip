import { expect, test } from 'vitest'
import { doorOf } from './geometry.js'
import { pathBetween } from './paths.js'

test('pathFromHorrorToBrainUsesCorridor', () => {
  const p = pathBetween('horror', 'brain')
  expect(p[0]).toEqual(doorOf('horror'))
  expect(p[p.length - 1]).toEqual(doorOf('brain'))
  expect(p.length).toBeGreaterThanOrEqual(4)
  for (const pt of p.slice(1, -1)) expect(pt[1]).toBe(0) // titik tengah selalu di lorong (z = 0)
})

test('sameRoomHasNoPath', () => {
  expect(pathBetween('render', 'render')).toEqual([])
})

test('pathLengthIsPositiveAndSymmetric', () => {
  const len = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0)
  expect(len(pathBetween('data', 'render'))).toBeCloseTo(len(pathBetween('render', 'data')), 6)
  expect(len(pathBetween('data', 'render'))).toBeGreaterThan(10)
})
