import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { hitItem, hitItems } from '../src/games/jumping/editor.ts'

const pick = (kind, index = 0) => ({ kind, index })
const sign = { x: 300, y: 180, w: 250, h: 160, text: 'Under water', fontSize: 24, align: 'left' }

test('overlap hits include every water layer and back-wall object in existing picking order', () => {
  const level = { ...blankTrial(),
    gravityPlates: [0, 1].map(i => ({ id: `water-${i}`, effect: 'water', x: 200, y: 100, w: 700, h: 500, gravity: -1 })),
    wallLights: [{ id: 'indicator', x: 400, y: 220 }],
    lighting: { ambient: 0, lights: [{ id: 'spotlight', x: 400, y: 220, direction: 0, spread: 60, intensity: 1, power: 'always' }] },
    timers: [{ x: 350, y: 200 }], texts: [{ ...sign }, { ...sign, style: 'terminal' }] }
  const hits = [...hitItems(level, 400, 220, 0)]
  assert.deepEqual(hits, [pick('gravity-plate', 1), pick('gravity-plate'), pick('wall-light'), pick('light'), pick('timer'), pick('text', 1), pick('text')])
  assert.deepEqual(hitItem(level, 400, 220, 0), hits[0], 'first-hit callers keep their priority')
  assert.deepEqual([...hitItems(level, 1200, 100, 0)], [])
  assert.equal(hitItem(level, 1200, 100, 0), null)
})

test('overlap picking respects terrain order, polygon holes in its bounds, and gravity-field interiors', () => {
  const level = { ...blankTrial(), platforms: [
    { x: 300, y: 180, w: 250, h: 160, zIndex: 2 },
    { x: 300, y: 180, w: 250, h: 160, zIndex: 1 },
    { x: 300, y: 180, w: 250, h: 160, zIndex: 3, polygon: [[0, 160], [250, 0], [250, 160]] },
  ], gravityPlates: [{ id: 'gravity', x: 200, y: 100, w: 700, h: 500, gravity: -1 }], texts: [{ ...sign }] }
  assert.deepEqual([...hitItems(level, 400, 220, 0)], [pick('platform'), pick('platform', 1), pick('text')])
  assert.deepEqual([...hitItems(level, 500, 300, 0)], [pick('platform', 2), pick('platform'), pick('platform', 1), pick('text')])
})

test('an elevator is offered once even where its platform and suspension rope both hit', () => {
  const level = { ...blankTrial(), mechanisms: [{ id: 'lift', kind: 'lift', x: 350, y: 300, w: 100, h: 20, travel: 150 }], texts: [{ ...sign }] }
  for (const y of [220, 300]) assert.deepEqual([...hitItems(level, 400, y, 0)], [pick('mechanism'), pick('text')])
})
