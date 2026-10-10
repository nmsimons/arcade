import test from 'node:test'
import assert from 'node:assert/strict'
import { createGravityField, updateGravityField, gravityPlateActive, playerSwimStrength, propWaterStrength } from '../src/games/jumping/gravity.ts'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createPlayer } from '../src/games/jumping/model.ts'
import { setGravityPlateEffect, setObjectPower, setObjectRelay, setObjectSwitchLogic } from '../src/games/jumping/editor.ts'
import { switchedItems, switchSources, switchWiringProblems } from '../src/games/jumping/switchPower.ts'

const pool = { id: 'pool', x: 400, y: 400, w: 800, h: 520, effect: 'water', gravity: -1 }
for (const power of [undefined, 'switched', 'always']) for (const powered of [false, true]) {
  test(`water is present regardless of legacy power=${power} and EMP power=${powered}`, () => {
    const water = { ...pool, power, switchReversed: true }, field = createGravityField(), p = createPlayer({ x: 600, y: 700 })
    updateGravityField(field, [water], new Map(), powered)
    assert.equal(gravityPlateActive(water, new Map(), powered), true)
    assert.equal(playerSwimStrength(field, p), 1)
    assert.equal(propWaterStrength(field, { kind: 'box', size: 60, x: 800, y: 700, angle: 0 }), 1)
    assert.equal(field.mask, 1)
    const revision = field.revision
    updateGravityField(field, [water], new Map([['pool', true]]), !powered)
    assert.equal(field.revision, revision, 'water does not rebuild when circuit power changes')
  })
}

test('EMP still disables gravity devices while leaving water in the same compiled field', () => {
  const plates = [pool, { ...pool, id: 'gravity', effect: undefined, power: 'always', gravity: 0 }], field = createGravityField()
  updateGravityField(field, plates, new Map(), true)
  assert.equal(field.mask, 3)
  updateGravityField(field, plates, new Map(), false)
  assert.equal(field.mask, 1)
  assert.equal(playerSwimStrength(field, createPlayer({ x: 600, y: 700 })), 1)
})

for (const version of [1, 2]) test(`legacy water wiring loads as a passive region in version ${version}`, () => {
  const source = { ...blankTrial(), version,
    ...(version === 2 ? { lighting: { nightMode: false, ambient: 0, lights: [] } } : {}),
    gravityPlates: [{ ...pool, power: 'switched', switchLogic: 'and', switchReversed: true, ceiling: true, relay: true, targets: ['gate'] }],
    mechanisms: [{ id: 'gate', kind: 'gate', x: 1000, y: 600, w: 20, h: 320, travel: 320 }],
    triggers: [{ x: 200, y: 920, w: 80, mode: 'weight', targets: ['pool', 'gate'] }],
    logicRelays: [{ id: 'relay', x: 300, y: 700, targets: ['pool', 'gate'] }],
  }
  const parsed = parseLevel(source)
  assert.deepEqual(parsed.gravityPlates, [pool])
  assert.deepEqual(parsed.triggers[0].targets, ['gate'])
  assert.deepEqual(parsed.logicRelays[0].targets, ['gate'])
  assert.equal(switchedItems(parsed).some(t => t.id === 'pool'), false)
  assert.equal(switchSources(parsed).some(t => t.definition.id === 'pool'), false)
  assert.deepEqual(switchWiringProblems(parsed), [])
  assert.deepEqual(source.triggers[0].targets, ['pool', 'gate'], 'loading never mutates the source document')
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(parsed))), parsed)
})

test('converting a wired gravity device to water removes its circuit; undo source and other outputs stay intact', () => {
  const source = { ...blankTrial(), gravityPlates: [{ ...pool, effect: undefined, power: 'switched', relay: true, targets: ['gate'], switchReversed: true }],
    triggers: [{ x: 200, y: 920, w: 80, mode: 'weight', targets: ['pool', 'gate'] }],
    mechanisms: [{ id: 'gate', kind: 'gate', x: 1000, y: 600, w: 20, h: 320, travel: 320 }] }
  const water = setGravityPlateEffect(source, 0, 'water'), selection = { kind: 'gravity-plate', index: 0 }
  assert.deepEqual(water.gravityPlates, [pool])
  assert.deepEqual(water.triggers[0].targets, ['gate'])
  assert.deepEqual(source.triggers[0].targets, ['pool', 'gate'])
  assert.equal(setObjectPower(water, selection, 'switched'), water)
  assert.equal(setObjectRelay(water, selection, true), water)
  assert.equal(setObjectSwitchLogic(water, selection, 'and'), water)
  const gravity = setGravityPlateEffect(water, 0, 'gravity')
  assert.equal(gravity.gravityPlates[0].effect, undefined)
  assert.equal(gravity.gravityPlates[0].power, 'always')
  const switched = setObjectPower(gravity, selection, 'switched')
  assert.equal(switchedItems(switched).some(t => t.id === 'pool'), true, 'ordinary gravity devices still support wiring')
})
