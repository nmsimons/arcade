import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, newLevel, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, duplicateItem, moveItem, resizeItem, resizeLevelHeight, setCrateBranding, setWallTextRotation } from '../src/games/jumping/editor.ts'
import { defaultObjectLabel } from '../src/games/jumping/objectLabels.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

test('crate branding is opt-in, reversible, and survives editing and JSON round trips', () => {
  const source = blankTrial(), point = { x: 500, y: 850 }
  const plain = addItem(source, 'box', point, point)
  assert.equal(plain.level.props[0].branded, undefined)
  const branded = addItem(source, 'branded-box', point, point)
  assert.deepEqual(branded.level.props[0], { ...plain.level.props[0], branded: true })
  assert.equal(defaultObjectLabel(branded.level, branded.selection), 'L.A.B. crate 1')
  const toggled = setCrateBranding(plain.level, 0, true)
  assert.deepEqual(toggled.props, branded.level.props)
  assert.deepEqual(setCrateBranding(toggled, 0, false), plain.level)
  branded.level.props[0].weight = 'heavy'
  const duplicated = duplicateItem(branded.level, branded.selection)
  const moved = moveItem(duplicated.level, duplicated.selection, 150, -100)
  const resized = resizeItem(moved, duplicated.selection, 120, 120)
  const loaded = parseLevel(JSON.parse(JSON.stringify(resized)))
  assert.equal(loaded.props.length, 2)
  assert.equal(loaded.props[1].branded, true)
  assert.equal(loaded.props[1].weight, 'heavy')
  assert.deepEqual(levelProblems(loaded), [])
  const ball = addItem(source, 'ball', point, point).level
  assert.equal(setCrateBranding(ball, 0, true), ball)
  for (const branded of ['yes', 1, null, {}]) assert.throws(() => parseLevel({ ...plain.level, props: [{ ...plain.level.props[0], branded }] }))
  assert.throws(() => parseLevel({ ...ball, props: [{ ...ball.props[0], branded: true }] }))
  assert.equal(parseLevel({ ...plain.level, props: [{ ...plain.level.props[0], branded: false }] }).props[0].branded, false)
})

test('wall stamps use the complete wall-object editing lifecycle in trials and playgrounds', () => {
  for (const source of [blankTrial(), newLevel()]) {
    const point = { x: 450, y: 300 }
    const added = addItem(source, 'lab-stamp', point, point)
    assert.equal(added.selection.kind, 'text')
    assert.equal(added.level.texts[0].style, 'lab-stamp')
    assert.equal(defaultObjectLabel(added.level, added.selection), 'L.A.B. wall stamp 1')
    let level = setWallTextRotation(added.level, 0, -15)
    const copy = duplicateItem(level, added.selection)
    level = resizeItem(moveItem(copy.level, copy.selection, 300, 100), copy.selection, 300, 140)
    level = resizeLevelHeight(level, 1300)
    assert.equal(level.texts[1].style, 'lab-stamp')
    assert.equal(level.texts[1].rotation, -15)
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
    assert.deepEqual(levelProblems(level), [])
    assert.throws(() => addItem({ ...source, texts: Array(80).fill(added.level.texts[0]) }, 'lab-stamp', point, point))
  }
})

test('stamping walls and branding crates never changes player or loose-object motion', () => {
  const plain = blankTrial()
  plain.props = [{ kind: 'box', x: 440, y: 920, size: 80 }, { kind: 'ball', x: 650, y: 920, size: 60 }]
  const decorated = addItem(setCrateBranding(plain, 0, true), 'lab-stamp', { x: 100, y: 600 }, { x: 100, y: 600 }).level
  const a = createRun(plain), b = createRun(decorated)
  // Contact snapshots reference authored props; omit only their visual flag.
  const motion = state => JSON.parse(JSON.stringify(state, (key, value) => key === 'branded' ? undefined : value))
  for (let frame = 0; frame < 360; frame++) {
    const input = { ...NEUTRAL_INPUT, move: 1, jump: frame >= 100 && frame < 130 }
    stepRun(a, input); stepRun(b, input)
    assert.deepEqual(motion(b.player), motion(a.player))
    for (let i = 0; i < a.props.length; i++) for (const key of ['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity', 'grounded']) {
      assert.equal(b.props[i][key], a.props[i][key], `prop ${i}: ${key}`)
    }
  }
})
