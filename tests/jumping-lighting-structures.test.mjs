import test from 'node:test'
import assert from 'node:assert/strict'
import { MechanismLighting } from '../src/games/jumping/lightingStructures.ts'
import { exposureAt, groupTerrain } from '../src/games/jumping/lightingModel.ts'

const lamp = (x, y, direction = 0) => ({ id: 'test', x, y, direction, spread: 100, fade: 1, intensity: 100, power: 'always' })
const mechanism = shape => Object.assign([shape], { mechanism: true })
const groups = state => [...state.fixed, ...state.moving]

test('a partial structural contact joins its shared segment without removing the rest of the wall shadow', () => {
  const terrain = groupTerrain([{ x: 100, y: 100, w: 100, h: 200 }]), lighting = new MechanismLighting()
  const source = lamp(50, 200)
  for (const gap of [0, .01, 15, -15, 0]) {
    const state = lighting.update(terrain, [mechanism({ x: 200 + gap, y: 180, w: 60, h: 40 })])
    assert.equal(exposureAt(0, [source], groups(state), 230, 200), gap > 0 ? .35 : 1)
    assert.equal(exposureAt(0, [source], groups(state), 250, 130), .35, 'unjoined part of the wall still blocks')
    assert.equal(exposureAt(0, [source], groups(state), 320, 200), .35, 'joined structure still casts beyond its far edge')
  }
})

test('joining one leg of a concave structure never exempts the mechanism from the opposite leg shadow', () => {
  const arch = { x: 50, y: 0, w: 100, h: 100, polygon: [[0, 0], [100, 0], [100, 100], [80, 100], [80, 20], [20, 20], [20, 100], [0, 100]] }
  const state = new MechanismLighting().update(groupTerrain([arch]), [mechanism({ x: 70, y: 50, w: 20, h: 20 })])
  assert.equal(exposureAt(0, [lamp(0, 60)], groups(state), 80, 60), 1)
  assert.equal(exposureAt(0, [lamp(0, 60)], groups(state), 140, 60), .35)
  assert.equal(exposureAt(0, [lamp(200, 60, 180)], groups(state), 80, 60), .35)
})

test('overlapping polygon bounds do not join surfaces separated by air', () => {
  const terrain = groupTerrain([{ x: 100, y: 100, w: 100, h: 100, polygon: [[0, 0], [100, 0], [0, 100]] }])
  const state = new MechanismLighting().update(terrain, [mechanism({ x: 180, y: 180, w: 20, h: 20 })])
  assert.equal(exposureAt(0, [lamp(190, 50, 90)], groups(state), 190, 190), .35)
})

test('mechanisms can join each other while props remain independent shadow casters', () => {
  const terrain = groupTerrain([{ x: 100, y: 100, w: 100, h: 40 }])
  const state = new MechanismLighting().update(terrain, [mechanism({ x: 200, y: 100, w: 40, h: 40 }), mechanism({ x: 240, y: 100, w: 40, h: 40 })])
  const source = lamp(50, 120)
  assert.equal(exposureAt(0, [source], groups(state), 260, 120), 1)
  const crate = [{ x: 75, y: 110, w: 25, h: 20 }]
  assert.equal(exposureAt(0, [source], [...groups(state), crate], 260, 120), .35, 'touching crate still shades the structural surface')
})

test('moving along a terrain edge retains the stationary field cache; gaps, resizing, terrain edits and removal invalidate it', () => {
  const terrain = groupTerrain([{ x: 100, y: 0, w: 100, h: 300 }]), lighting = new MechanismLighting()
  const pose = (x = 200, y = 100, w = 50) => [mechanism({ x, y, w, h: 20 })]
  const initial = lighting.update(terrain, pose())
  assert.equal(lighting.update(terrain, pose()), initial, 'unchanged pose reuses the geometry result')
  const shifted = lighting.update(terrain, pose(200, 120))
  assert.equal(shifted.fixed, initial.fixed, 'unaffected shadow fields survive sliding contact')
  assert.notEqual(shifted.moving, initial.moving)
  const gap = lighting.update(terrain, pose(201, 120))
  assert.notEqual(gap.fixed, shifted.fixed)
  assert.equal(gap.fixed, terrain, 'unmodified prepared terrain is restored')
  const resized = lighting.update(terrain, pose(201, 120, 100))
  assert.notEqual(resized, gap)
  const editedTerrain = groupTerrain([{ x: 100, y: 0, w: 101, h: 300 }])
  const edited = lighting.update(editedTerrain, pose(201, 120, 100))
  assert.notEqual(edited.fixed, resized.fixed)
  assert.equal(exposureAt(0, [lamp(50, 130)], groups(edited), 250, 130), 1)
  const removed = lighting.update(editedTerrain, [])
  assert.equal(removed.fixed, editedTerrain); assert.equal(removed.moving.length, 0)
  lighting.reset()
  assert.equal(lighting.update(terrain, []).fixed, terrain)
})

test('only structural contact corners lose their rounding, and a gap restores it', async () => {
  const { mechanismCornerRadii } = await import('../src/games/jumping/mechanismAppearance.ts')
  const world = { terrain: [{ x: 100, y: 0, w: 20, h: 100 }], mechanisms: [{ x: 100, y: 100, definition: { w: 20, h: 100 } }] }
  const original = JSON.stringify(world)
  assert.deepEqual(mechanismCornerRadii(world), [[0, 0, 2, 2]])
  assert.equal(JSON.stringify(world), original, 'artwork preparation does not change any collision geometry')
  world.mechanisms[0].y += .01
  assert.deepEqual(mechanismCornerRadii(world), [[2, 2, 2, 2]])
  world.mechanisms[0].y = 99
  assert.deepEqual(mechanismCornerRadii(world), [[0, 0, 2, 2]])
  world.mechanisms[0].y = 100; world.mechanisms[0].x = 120
  assert.deepEqual(mechanismCornerRadii(world), [[2, 2, 2, 2]], 'a single touching point does not square either corner')
  world.terrain = []; world.mechanisms[0].x = 100
  world.mechanisms.push({ x: 100, y: 80, definition: { w: 20, h: 20 } })
  assert.deepEqual(mechanismCornerRadii(world), [[0, 0, 2, 2], [2, 2, 0, 0]])
  assert.deepEqual(mechanismCornerRadii({ mechanisms: [] }), [], 'playground rendering needs no terrain or mechanisms')
})
