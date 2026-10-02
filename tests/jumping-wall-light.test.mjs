import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { drawWallLight, wallLightBounds } from '../src/games/jumping/wallLight.ts'
import { drawGoal } from '../src/games/jumping/challengeRender.ts'
import { addItem, allSelections, duplicateItem, deleteItem, hitItem, itemBounds, moveItem, renameItem, resizeLevelHeight, setObjectRelay, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

test('wall light face matches the goal exactly, with the post color forming its rim', () => {
  for (const active of [false, true]) {
    const shapes = [], ctx = { fillStyle: '', beginPath() {}, arc(x, y, radius) { shapes.push({ type: 'circle', x, y, radius, color: this.fillStyle }) },
      fill() {}, fillRect(x, y, w, h) { shapes.push({ type: 'rect', x, y, w, h, color: this.fillStyle }) } }
    drawGoal(ctx, { x: 100, y: 400 }, active)
    const [post, face] = shapes.splice(0)
    drawWallLight(ctx, { x: face.x, y: face.y }, active)
    assert.deepEqual(shapes[1], face)
    assert.equal(shapes[0].type, 'circle'); assert.equal(shapes[0].color, post.color); assert.equal(shapes[0].radius, 14)
    assert.deepEqual(wallLightBounds({ x: 100, y: 200 }), { x: 86, y: 186, w: 28, h: 28 })
  }
})

test('wall lights switch and relay without affecting collisions, and preserve editor lifecycle and files', () => {
  const placed = addItem(blankTrial(), 'wall-light', { x: 400, y: 300 }, { x: 400, y: 300 })
  assert.equal(placed.level.version, 1); assert.equal(placed.level.lighting, undefined)
  assert.equal(placed.selection.kind, 'wall-light')
  assert.ok(allSelections(placed.level).some(s => s.kind === 'wall-light'))
  assert.deepEqual(hitItem(placed.level, 400, 300, 2), placed.selection)
  let level = renameItem(placed.level, placed.selection, 'Ready')
  level = setObjectRelay(level, placed.selection, true)
  level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  level = setSwitchTargets(level, placed.selection, ['exit'])
  const id = level.wallLights[0].id
  level.triggers = [{ mode: 'weight', x: 120, y: 920, w: 100, targets: [id] }]
  const run = createRun(parseLevel(level)); run.started = true
  assert.equal(run.switchStates.get(id), false); assert.equal(run.goalLit, false)
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.switchStates.get(id), true); assert.equal(run.goalLit, true)
  assert.equal(run.platforms.some(b => b.x === 386 && b.y === 286), false, 'wall indicator has no collider')
  run.player.x = 300; stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.switchStates.get(id), false); assert.equal(run.goalLit, false)
  const copy = duplicateItem(level, placed.selection)
  assert.notEqual(copy.level.wallLights[1].id, id); assert.equal(copy.level.wallLights[1].name, 'Ready')
  assert.deepEqual(copy.level.wallLights[1].targets, ['exit'])
  const shifted = moveItem(level, placed.selection, 40, 60)
  assert.deepEqual(itemBounds(shifted, placed.selection), { x: 426, y: 346, w: 28, h: 28 })
  assert.equal(resizeLevelHeight(level, 1020).wallLights[0].y, 400)
  const template = copyForEditing(level)
  assert.equal(template.triggers[0].targets[0], template.wallLights[0].id)
  assert.equal(template.wallLights[0].targets[0], template.goal.id)
  for (const candidate of [level, copy.level, shifted, template]) {
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(candidate))), candidate)
    assert.deepEqual(levelProblems(candidate), [])
  }
  const removed = deleteItem(level, placed.selection)
  assert.deepEqual(removed.triggers[0].targets, []); assert.deepEqual(levelProblems(removed), [])
})

test('wall light imports enforce bounds, count limits, unique IDs and switch field types', () => {
  for (const patch of [{ id: '' }, { x: 0 }, { y: 920 }, { switchLogic: 'bad' }, { switchReversed: 'true' }, { relay: 1 }]) {
    const level = blankTrial(); level.wallLights = [{ id: 'wall', x: 400, y: 300, ...patch }]
    assert.throws(() => parseLevel(level))
  }
  const level = blankTrial(); level.wallLights = Array.from({ length: 41 }, (_, i) => ({ id: `wall-${i}`, x: 400, y: 300 }))
  assert.throws(() => parseLevel(level))
  level.wallLights = [{ id: 'same', x: 400, y: 300 }, { id: 'same', x: 600, y: 300 }]
  assert.throws(() => parseLevel(level)); assert.match(levelProblems(level).join(), /unique IDs/)
})
