import test from 'node:test'
import assert from 'node:assert/strict'
import { createBuilderControllerReader, moveBuilderCursor } from '../src/games/jumping/builderController.ts'

const pad = () => ({ index: 0, id: 'Studio controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) })
const button = (pad, index, value) => { pad.buttons[index] = { pressed: value >= .5, value } }

test('studio input arms sticks, buttons and analog zoom separately on each surface', () => {
  const reader = createBuilderControllerReader(), controller = pad()
  button(controller, 0, 1); button(controller, 7, .3); controller.axes = [1, 0, 1, 1]
  let result = reader.sample([controller], 'controls', 0)
  assert.deepEqual(result.held, []); assert.deepEqual(result.direction, { x: 0, y: 0 })
  assert.deepEqual(result.right, { x: 0, y: 0 }); assert.equal(result.zoom, 0)
  controller.axes = [0, 0, 0, 0]; button(controller, 0, 0); button(controller, 7, 0)
  reader.sample([controller], 'controls', 16)
  controller.axes = [1, 0, 1, 1]; button(controller, 0, 1); button(controller, 7, .3)
  result = reader.sample([controller], 'controls', 32)
  assert.deepEqual(result.pressed, [0, 7]); assert.deepEqual(result.right, { x: 1, y: 1 }); assert.ok(result.zoom > 0)
  result = reader.sample([controller], 'canvas', 48)
  assert.deepEqual(result.held, []); assert.deepEqual(result.right, { x: 0, y: 0 }); assert.equal(result.zoom, 0)
  controller.axes = [0, 0, 0, 0]; button(controller, 0, 0); button(controller, 7, 0)
  reader.sample([controller], 'canvas', 64)
  button(controller, 0, 1); result = reader.sample([controller], 'canvas', 80)
  assert.deepEqual(result.pressed, [0])
  reader.sample([controller], 'canvas', 96, false)
  assert.deepEqual(reader.sample([controller], 'canvas', 112).held, [])
  assert.equal(reader.sample([], 'canvas', 128).disconnected, true)
  assert.deepEqual(reader.sample([controller], 'canvas', 144).held, [])
})

test('studio cursor uses a bounded frame step, fine movement and constant diagonal speed', () => {
  const size = { width: 800, height: 600 }, start = { x: 100, y: 100 }
  assert.deepEqual(moveBuilderCursor(start, { x: 1, y: 0 }, .05, size), { x: 116, y: 100 })
  assert.deepEqual(moveBuilderCursor(start, { x: 1, y: 0 }, .05, size, true), { x: 104, y: 100 })
  const diagonal = moveBuilderCursor(start, { x: 1, y: 1 }, .05, size)
  assert.ok(Math.abs(Math.hypot(diagonal.x - start.x, diagonal.y - start.y) - 16) < 1e-8)
  assert.deepEqual(moveBuilderCursor({ x: 799, y: 0 }, { x: 1, y: -1 }, 10, size), { x: 799, y: 0 })
  const controller = pad(); controller.mapping = ''
  assert.equal(createBuilderControllerReader().sample([controller], 'canvas', 0).connected, false)
})
