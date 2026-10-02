import test from 'node:test'
import assert from 'node:assert/strict'
import { directionalNeighbor } from '../src/games/jumping/builderNavigation.ts'

const rect = (x, y, width = 80, height = 44) => ({ x, y, width, height })
const item = (name, ...args) => ({ item: name, rect: rect(...args) })

test('directional focus follows rows and columns even when DOM order differs', () => {
  const from = rect(100, 100)
  const items = [item('down', 100, 160), item('left', 0, 100), item('up', 100, 40), item('right', 200, 100)]
  for (const direction of ['up', 'down', 'left', 'right']) assert.equal(directionalNeighbor(from, items, direction), direction)
  assert.equal(directionalNeighbor(from, items.toReversed(), 'down'), 'down')
})

test('focus favors a column over diagonal shortcuts and accepts staggered rows', () => {
  const from = rect(100, 100)
  assert.equal(directionalNeighbor(from, [item('diagonal', 195, 150), item('column', 100, 210)], 'down'), 'column')
  assert.equal(directionalNeighbor(from, [item('staggered', 150, 160)], 'down'), 'staggered')
  assert.equal(directionalNeighbor(rect(100, 100, 240), [item('left field', 100, 160), item('right field', 260, 160)], 'down'), 'left field')
})

test('edges do not wrap or jump to controls outside the requested direction', () => {
  const from = rect(100, 100)
  assert.equal(directionalNeighbor(from, [item('right', 200, 100), item('below', 100, 160)], 'left'), undefined)
  assert.equal(directionalNeighbor(from, [item('nearly horizontal', 600, 110)], 'down'), undefined)
  assert.equal(directionalNeighbor(rect(1136, 198, 144, 52), [item('above, barely to the right', 1170, 146, 100, 44)], 'right'), undefined)
  const tabs = [item('Level', 100, 40, 120), { ...item('Object', 220, 40, 120), preferred: true }]
  assert.equal(directionalNeighbor(rect(100, 100, 240), tabs, 'up'), 'Object')
  assert.equal(directionalNeighbor(from, [], 'up'), undefined)
})
