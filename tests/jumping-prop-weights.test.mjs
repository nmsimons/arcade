import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun, setWaterEffectsEnabled } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, propGravity, propWaterStrength, propFloatDrag } from '../src/games/jumping/gravity.ts'
import { propWeightScale } from '../src/games/jumping/propWeight.ts'
import { duplicateItem, resizeItem } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'

const weights = ['light', 'normal', 'heavy']
const pool = effect => ({ id: 'pool', x: 200, y: 400, w: 1000, h: 520, gravity: -1, power: 'always', ...(effect ? { effect } : {}) })
const fieldFor = plates => {
  const field = createGravityField(); updateGravityField(field, plates, new Map(plates.map(p => [p.id, true])), true); return field
}
const advance = (run, seconds, dt = STEP, input = NEUTRAL_INPUT) => {
  run.started = true
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt)
}

for (const version of [1, 2]) test(`prop weight presets round trip without rewriting legacy defaults in version ${version}`, () => {
  const source = { ...blankTrial(), version, props: weights.map((weight, i) => ({ kind: i % 2 ? 'box' : 'ball', x: 500 + i * 200, y: 700, size: 60, weight })) }
  if (version === 2) source.lighting = { nightMode: false, ambient: 0, lights: [] }
  source.props.push({ kind: 'box', x: 1200, y: 920, size: 60 })
  const parsed = parseLevel(source)
  assert.deepEqual(parsed.props.map(p => p.weight), [...weights, undefined])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(parsed))), parsed)
  for (const weight of ['dense', 0, null, false]) assert.throws(() => parseLevel({ ...source, props: [{ ...source.props[0], weight }] }))
})

test('weight presets survive duplicate, clipboard, resizing and new editable copies', () => {
  const source = { ...blankTrial(), props: [{ kind: 'ball', x: 400, y: 920, size: 60, weight: 'light' }, { kind: 'box', x: 700, y: 920, size: 60, weight: 'heavy' }] }
  const selection = { kind: 'prop', index: 0 }
  assert.equal(duplicateItem(source, selection).level.props[2].weight, 'light')
  assert.equal(pasteSelections(source, copySelections(source, [selection]), 0, 0).level.props[2].weight, 'light')
  assert.equal(resizeItem(source, selection, 100, 100).props[0].weight, 'light')
  assert.deepEqual(copyForEditing(source).props.map(p => p.weight), ['light', 'heavy'])
  assert.equal(objectLabel(source, selection), 'Light Ball 1')
  assert.equal(objectLabel(source, { kind: 'prop', index: 1 }), 'Heavy Box 2')
})

for (const kind of ['ball', 'box']) test(`${kind} weight scales water and negative plate lift in one area pass`, () => {
  for (const weight of weights) {
    const b = { kind, weight, x: 500, y: 700, size: 80, angle: Math.PI / 4 }
    const scale = propWeightScale(b)
    assert.equal(propGravity(fieldFor([]), b), TUNING.gravity)
    for (const gravity of [-3, -1, 0, 1, 3]) {
      const field = fieldFor([{ ...pool(), gravity }])
      assert.ok(Math.abs(propGravity(field, b) - TUNING.gravity * (gravity < 0 ? gravity / scale : gravity)) < 1e-8)
      assert.equal(propFloatDrag(field, b), 0, 'uniform fields have no artificial float damping')
    }
    const water = fieldFor([pool('water')])
    assert.ok(Math.abs(propGravity(water, b) - TUNING.gravity * (1 - 2 / scale)) < 1e-8)
    assert.equal(propWaterStrength(water, b), 1, 'water resistance does not depend on weight')
    b.y = 440
    assert.ok(Math.abs(propGravity(water, b) - TUNING.gravity * (1 - 1 / scale)) < 1e-8)
    assert.ok(Math.abs(propWaterStrength(water, b) - .5) < 1e-8)
    const mixed = fieldFor([pool('water'), { ...pool(), id: 'lift' }]); b.y = 700
    assert.ok(Math.abs(propGravity(mixed, b) - TUNING.gravity * ((1 - 2 / scale) - 1 / scale) / 2) < 1e-8,
      'overlapping water and plate lift are averaged once')
    assert.ok(mixed.maxMultiplier + Math.abs(1 / scale - 1) * mixed.maxPropLift >= Math.abs(propGravity(mixed, b) / TUNING.gravity),
      'the cached motion bound includes the strongest weighted lift')
  }
})

for (const kind of ['ball', 'box']) for (const dt of [STEP, 1 / 30]) for (const effects of [true, false])
  test(`${kind} presets settle at different water depths or sink, dt=${dt}, effects=${effects}`, () => {
    const run = createRun({ ...blankTrial(), props: weights.map((weight, i) => ({ kind, weight, x: 450 + i * 250, y: 750, size: 80 })), gravityPlates: [pool('water')] })
    setWaterEffectsEnabled(run, effects); advance(run, 10, dt)
    for (let i = 0; i < 2; i++) {
      const b = run.props[i]
      assert.ok(Math.abs(propWaterStrength(run.gravityField, b) - [.25, .5][i]) < .03, `equilibrium immersion for ${b.weight}: ${b.y}`)
      assert.equal(b.grounded, false); assert.ok(Math.abs(b.vy) < 8)
    }
    assert.ok(run.props[0].y < run.props[1].y - 10)
    assert.ok(Math.abs(run.props[2].y - 920) < .5); assert.equal(run.props[2].grounded, true)
    assert.ok(run.props.every(b => Number.isFinite(b.y) && Math.abs(b.vy) < 8))
  })

for (const kind of ['ball', 'box']) for (const dt of [STEP, 1 / 30])
  test(`a gravity plate lifts a light ${kind} higher and a heavy one deeper, dt=${dt}`, () => {
    const run = createRun({ ...blankTrial(), props: weights.map((weight, i) => ({ kind, weight, x: 450 + i * 250, y: 750, size: 80 })), gravityPlates: [pool()] })
    advance(run, 12, dt)
    for (const b of run.props) {
      assert.equal(b.grounded, false); assert.ok(Math.abs(propGravity(run.gravityField, b)) < .05)
      assert.ok(Math.abs(b.vy) < .1)
    }
    assert.ok(run.props[0].y < run.props[1].y - 8)
    assert.ok(run.props[1].y < run.props[2].y - 8)
  })

for (const kind of ['ball', 'box']) test(`${kind} presets change solver mass and yield differently in a collision`, () => {
  const original = Matter.Engine.update, bodies = []
  Matter.Engine.update = (engine, dt) => {
    bodies.splice(0, bodies.length, ...Matter.Composite.allBodies(engine.world).filter(b => !b.isStatic))
    return original(engine, dt)
  }
  try {
    const masses = [], collisions = []
    for (const weight of weights) {
      const run = createRun({ ...blankTrial(), props: [{ kind, weight, x: 300, y: 700, size: 60 }],
        gravityPlates: [{ ...pool(), x: 0, y: 0, w: 1800, h: 920, gravity: 0 }] })
      advance(run, STEP)
      masses.push(bodies[0].mass)
      run.player.x = 300 - 30 - 12; run.player.y = 730; run.player.vx = 100; run.player.vy = 0
      run.player.grounded = false; run.player.coyote = 0
      advance(run, .15, STEP)
      collisions.push(run.props[0].vx)
    }
    assert.ok(Math.abs(masses[0] / masses[1] - .5) < 1e-8)
    assert.ok(Math.abs(masses[2] / masses[1] - 3) < 1e-8)
    assert.ok(collisions[0] > collisions[1] + 3 && collisions[1] > collisions[2] + 3, JSON.stringify(collisions))
  } finally { Matter.Engine.update = original }
})

for (const kind of ['ball', 'box']) test(`a short player shove accelerates a light ${kind} more than a heavy one`, () => {
  const distances = weights.map(weight => {
    const run = createRun({ ...blankTrial(), spawn: { x: 200, y: 920 }, props: [{ kind, weight, x: 250, y: 920, size: 60 }] })
    advance(run, .35, STEP, { ...NEUTRAL_INPUT, move: 1 })
    return run.props[0].x - 250
  })
  assert.ok(distances[0] > distances[1] + .5 && distances[1] > distances[2] + .5, JSON.stringify(distances))
})
