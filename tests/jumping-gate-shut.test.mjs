import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { gateSeated } from '../src/games/jumping/mechanisms.ts'
import { effectiveWaterLevel } from '../src/games/jumping/waterLevel.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'
import { wallWireEnergized, wallWires } from '../src/games/jumping/wallWiring.ts'
import { deleteItem, duplicateItem, setSwitchTargets, setWallWiring } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

/** A 200-high gate on the floor at x 800, a lamp on its shut contact and a toggle that opens it. */
function doorway(patch = {}) {
  const level = blankTrial()
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 800, y: 720, w: 20, h: 200, travel: 200, shutTargets: ['lamp'], ...patch }]
  level.wallLights = [{ id: 'lamp', x: 600, y: 300 }]
  level.triggers = [{ x: 1500, y: 920, w: 100, mode: 'weight', behavior: 'toggle', startsOn: true, targets: ['gate'] }]
  level.props = [{ kind: 'ball', x: 300, y: 920, size: 60 }]
  return level
}
const steps = (run, frames, each = () => {}) => { for (let i = 0; i < frames; i++) { stepRun(run, NEUTRAL_INPUT); each(i) } }

test('gates parse an optional shut contact and reject it elsewhere', () => {
  const level = doorway()
  assert.deepEqual(parseLevel(level).mechanisms[0].shutTargets, ['lamp'])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), parseLevel(level))
  const horizontal = doorway({ orientation: 'horizontal', x: 700, y: 600, w: 200, h: 20 })
  assert.deepEqual(parseLevel(horizontal).mechanisms[0].shutTargets, ['lamp'])
  assert.equal('shutTargets' in parseLevel(doorway({ shutTargets: undefined })).mechanisms[0], false)
  for (const shutTargets of ['lamp', [7], ['lamp', 'lamp'], ['missing']]) assert.throws(() => parseLevel(doorway({ shutTargets })), undefined, JSON.stringify(shutTargets))
  assert.throws(() => parseLevel(doorway({ kind: 'lift', shutTargets: ['lamp'] })), undefined, 'only gates have a shut contact')
  assert.deepEqual(levelProblems(parseLevel(level)), [])
  // Every gate is a source, wired or not; its outputs edit the gate's own list.
  const bare = doorway({ shutTargets: undefined })
  assert.ok(switchSources(bare).some(s => s.kind === 'gate-shut' && s.index === 0))
  const wired = setSwitchTargets(bare, { kind: 'gate-shut', index: 0 }, ['lamp', 'gate', 'nothing'])
  assert.deepEqual(wired.mechanisms[0].shutTargets, ['lamp', 'gate'], 'a gate may command itself through its contact')
  assert.equal('shutTargets' in setSwitchTargets(wired, { kind: 'gate-shut', index: 0 }, []).mechanisms[0], false, 'empty lists are omitted')
  assert.equal('shutTargets' in deleteItem(level, { kind: 'wall-light', index: 0 }).mechanisms[0], false, 'deleting a target clears it')
})

test('the contact is on only while the powered gate is seated: off while closing and while a ball holds it open', () => {
  const run = createRun(parseLevel(doorway())), gate = run.mechanisms[0], contact = () => run.gateShut[0].active
  assert.equal(contact(), true, 'the gate starts closed'); assert.equal(run.switchStates.get('lamp'), true)
  steps(run, 1); assert.equal(contact(), false, 'it leaves its seat on the first frame it opens')
  steps(run, 240); assert.equal(gate.y, 520); assert.equal(contact(), false)
  // A ball parked in the gateway: the gate meets it, holds and reopens, and the contact never closes.
  run.props[0].x = 810; run.props[0].y = 920
  run.triggers[0].active = false
  steps(run, 120 * 6, () => { assert.equal(contact(), gateSeated(gate)); assert.equal(contact(), false) })
  // Clear the gateway: the contact closes on the frame the gate seats, and not before.
  run.props[0].x = 300
  let seated = -1
  steps(run, 120 * 6, i => {
    assert.equal(contact(), gate.x === gate.definition.x && gate.y === gate.definition.y, `frame ${i}`)
    assert.equal(run.switchStates.get('lamp'), contact())
    if (contact() && seated < 0) seated = i
  })
  assert.ok(seated > 0)
  // EMP opens the contact; it closes again with power.
  run.empRemaining = 1; steps(run, 1)
  assert.equal(contact(), false); assert.equal(gateSeated(gate), true)
  steps(run, 130); assert.equal(contact(), true); assert.equal(run.switchStates.get('lamp'), true)
})

test('previews show a closed gate shut, and the contact can show wires', () => {
  const level = setWallWiring(parseLevel(doorway({ shutTargets: undefined })), { kind: 'mechanism', index: 0 }, true)
  assert.equal(level.mechanisms[0].showWires, true, 'a gate that is not a relay can show its contact wires')
  const wired = setSwitchTargets(level, { kind: 'gate-shut', index: 0 }, ['lamp']), [wire] = wallWires(wired)
  assert.deepEqual(wire.source, { kind: 'gate-shut', index: 0 })
  assert.equal(wallWireEnergized(wired, wire, createPreviewRun(wired)), true)
  assert.equal(resolveSwitchStates(wired, [{ active: false }], [], undefined, [], [{ active: true }]).get('lamp'), true)
  assert.equal(resolveSwitchStates(wired, [{ active: false }]).get('lamp'), false)
})

test('copies remap shut contact connections', () => {
  const level = parseLevel(doorway())
  const copied = copyForEditing(level)
  assert.notEqual(copied.wallLights[0].id, 'lamp')
  assert.deepEqual(copied.mechanisms[0].shutTargets, [copied.wallLights[0].id])
  const pasted = pasteSelections(level, copySelections(level, [{ kind: 'mechanism', index: 0 }, { kind: 'wall-light', index: 0 }]), 0, 0).level
  assert.deepEqual(pasted.mechanisms[1].shutTargets, [pasted.wallLights[1].id])
  const duplicated = duplicateItem(level, { kind: 'mechanism', index: 0 }).level
  assert.deepEqual(duplicated.mechanisms[1].shutTargets, ['lamp'])
  assert.notEqual(duplicated.mechanisms[1].shutTargets, duplicated.mechanisms[0].shutTargets)
  for (const candidate of [copied, pasted, duplicated]) assert.deepEqual(parseLevel(candidate), candidate)
})

/**
 * Two 400-high pools either side of a 200-high gate, 36% low marks, 15% per second. The gate is
 * open only while both pools sit at 68% and no transfer is requested. Each transfer is ANDed with
 * the gate's shut contact and stops at its gauges: R levels the pools at 68%, R2 moves west to east.
 */
function lock() {
  const level = blankTrial()
  const pool = (id, x, waterLevel) => ({ id, x, y: 420, w: 400, h: 400, effect: 'water', gravity: -1, waterLevel, waterMinLevel: 36, waterRate: 15 })
  level.gravityPlates = [pool('west', 100, 100), pool('east', 520, 36)]
  const at68 = 820 - 400 * .68, empty = 820 - 400 * .36
  level.levelGauges = [
    { id: 'w-above', x: 140, y: at68, targets: ['level'] }, { id: 'w-below', x: 180, y: at68, activeWhen: 'below', targets: ['level', 'guard'] },
    { id: 'w-empty', x: 220, y: empty, activeWhen: 'below', targets: ['guard2'] },
    { id: 'e-above', x: 880, y: at68, targets: ['level', 'guard'] }, { id: 'e-below', x: 840, y: at68, activeWhen: 'below', targets: ['level'] },
    { id: 'e-full', x: 800, y: 420, targets: ['guard2'] },
  ]
  const relay = (id, i, targets, settings) => ({ id, x: 1200, y: 100 + i * 60, targets, ...settings })
  level.logicRelays = [
    relay('level', 0, ['gate'], { switchLogic: 'and' }),
    relay('idle', 1, ['gate'], { switchLogic: 'or', switchReversed: true }),
    relay('guard', 2, ['flow'], { switchLogic: 'or', switchReversed: true }),
    relay('guard2', 3, ['flow2'], { switchLogic: 'or', switchReversed: true }),
    relay('flow', 4, ['west:drain', 'east:fill'], { switchLogic: 'and' }),
    relay('flow2', 5, ['west:drain', 'east:fill'], { switchLogic: 'and' }),
  ]
  // The gate seats on a sill between the pools.
  level.platforms = [{ x: 440, y: 820, w: 140, h: 100 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 500, y: 620, w: 20, h: 200, travel: 200, switchLogic: 'and', shutTargets: ['flow', 'flow2'] }]
  level.triggers = [1300, 1500].map((x, i) => ({ x, y: 920, w: 100, mode: 'weight', behavior: 'toggle', targets: [i ? 'flow2' : 'flow', 'idle'] }))
  return parseLevel(level)
}

test('a lock moves water only behind a shut gate, and opens only on level water', () => {
  const run = createRun(lock()), gate = run.mechanisms[0], [west, east] = run.water.pools
  const total = effectiveWaterLevel(west) + effectiveWaterLevel(east)
  let opened = 0, transferred = 0
  const check = i => {
    const w = effectiveWaterLevel(west), e = effectiveWaterLevel(east)
    assert.equal(w + e, total, `frame ${i}: water is conserved`)
    if (!gateSeated(gate)) {
      assert.equal(w, e, `frame ${i}: an unsealed gate never stands between two levels`)
      assert.equal(west.level, east.level, `frame ${i}: drawn levels too`)
    }
  }
  steps(run, 10, check)
  assert.equal(gateSeated(gate), true); assert.equal(effectiveWaterLevel(west), 100)
  // Level the pools: the gate stays shut while the request stands, even once they are level.
  run.triggers[0].active = true
  steps(run, 120 * 4, check)
  assert.deepEqual([west.level, east.level], [68, 68]); assert.equal(gateSeated(gate), true)
  // Release the request: the gate opens on level water.
  run.triggers[0].active = false
  steps(run, 120 * 3, i => { check(i); if (!gateSeated(gate)) opened++ })
  assert.ok(opened > 0); assert.equal(gate.y, 420, 'fully open')
  // Request a transfer through the open gate: it closes first, and the water waits for the seal.
  run.triggers[1].active = true
  let sealedAt = -1
  steps(run, 120 * 8, i => {
    check(i)
    if (sealedAt < 0 && gateSeated(gate)) sealedAt = i
    if (sealedAt < 0) assert.deepEqual([effectiveWaterLevel(west), effectiveWaterLevel(east)], [68, 68], `frame ${i}: no flow before the gate seals`)
    else if (effectiveWaterLevel(west) !== 68) transferred++
  })
  assert.ok(sealedAt > 120 * 2, 'closing a 200-high gate takes about three seconds')
  assert.ok(transferred > 0)
  assert.deepEqual([west.level, east.level], [36, 100]); assert.equal(gateSeated(gate), true)
  // A ball parked in the open gateway holds the water: the gate cannot seal, so nothing flows.
  const held = createRun(lock()), [hw, he] = held.water.pools
  held.triggers[0].active = true; steps(held, 120 * 4)
  held.triggers[0].active = false; steps(held, 120 * 3)
  assert.equal(held.mechanisms[0].y, 420)
  held.props.push({ kind: 'ball', x: 510, y: 820, size: 60, vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: true })
  held.triggers[1].active = true
  steps(held, 120 * 8, () => {
    assert.equal(gateSeated(held.mechanisms[0]), false, 'the ball keeps the gate from sealing')
    assert.deepEqual([effectiveWaterLevel(hw), effectiveWaterLevel(he)], [68, 68])
  })
})
