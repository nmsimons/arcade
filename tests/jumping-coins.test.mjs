import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial, levelProblems, parseLevel, triggerTargets } from '../src/games/jumping/level.ts'
import { addItem, allSelections, deleteItem, duplicateItem, hitItem, itemBounds, moveItem, resizeItem, resizeLevelHeight, setCoinThreshold, setCoinSwitchOrientation, setCoinSwitchDisplay, setTriggerTargets } from '../src/games/jumping/editor.ts'
import { canPlaceOnSurface, placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { PICKUP_ANIMATION_SECONDS } from '../src/games/jumping/pickups.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { formatCoinCount } from '../src/games/jumping/coins.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'

const coin = (x, y = 888) => ({ kind: 'coin', x, y })
const switch_ = (threshold = 2, targets = ['gate']) => ({ mode: 'coins', x: 420, y: 740, w: 200, threshold, targets })
const step = (run, frames = 1, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const puzzle = () => ({ ...blankTrial(), pickups: [coin(160), coin(320), coin(480)],
  triggers: [switch_()], mechanisms: [{ id: 'gate', kind: 'gate', x: 1000, y: 740, w: 20, h: 180, travel: 180 }] })

test('coins collect once, activate on the threshold step, and stay active until restart', () => {
  const level = puzzle(), original = structuredClone(level), run = createRun(level)
  step(run)
  assert.equal(run.coinsCollected, 1); assert.equal(run.triggers[0].active, false)
  assert.equal(run.elapsed, 0); assert.equal(run.timeStopRemaining, 0)
  const time = run.pickupTime
  step(run, 120)
  assert.ok(run.pickupTime > time, 'coins spin before the first movement')
  assert.equal(run.coinsCollected, 1); assert.equal(run.pickups[0].collectedAge, PICKUP_ANIMATION_SECONDS)
  run.player.x = 320; step(run)
  assert.equal(run.coinsCollected, 2); assert.equal(run.triggers[0].active, true); assert.equal(run.mechanisms[0].active, true)
  run.player.x = 480; step(run, 240, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.coinsCollected, 3); assert.equal(run.mechanisms[0].y, 560)
  run.player.x = 700; step(run, 120)
  assert.equal(run.mechanisms[0].active, true); assert.deepEqual(level, original)
  const reset = createRun(level)
  assert.equal(reset.coinsCollected, 0); assert.equal(reset.pickupTime, 0)
  assert.equal(reset.triggers[0].active, false); assert.equal(reset.mechanisms[0].y, 740)
  assert.ok(reset.pickups.every(p => p.collectedAge === null))
})

test('switches share unspent coins, have independent thresholds, and combine with ordinary plates', () => {
  const level = puzzle()
  level.mechanisms.push({ id: 'lift', kind: 'lift', x: 1200, y: 900, w: 140, h: 20, travel: 220 })
  level.triggers = [switch_(2, ['gate', 'lift']), { ...switch_(3, ['lift']), x: 680 }, { x: 120, y: 920, w: 100, mode: 'weight', targets: ['gate'] }]
  const run = createRun(level)
  step(run, 30, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.coinsCollected, 1); assert.equal(run.mechanisms[0].active, true); assert.equal(run.mechanisms[1].active, false)
  run.player.x = 260; step(run)
  assert.equal(run.mechanisms[0].active, false, 'releasing an ordinary plate still releases the gate')
  run.player.x = 320; step(run)
  assert.deepEqual(run.triggers.map(t => t.active), [true, false, false])
  assert.ok(run.mechanisms.every(m => m.active))
  step(run, 30); assert.ok(run.mechanisms[1].y < 900, 'the coin switch moves elevators')
  run.player.x = 480; step(run)
  assert.deepEqual(run.triggers.map(t => t.active), [true, true, false])
  assert.equal(run.coinsCollected, 3, 'activating another switch never spends coins')
})

test('coins ignore props and switches ignore weight; coin contact has no stopwatch crown', () => {
  const level = puzzle()
  level.pickups = [coin(160, 840), coin(196), coin(700, 880)]
  level.props = [{ kind: 'ball', x: 700, y: 920, size: 80 }]
  level.triggers = [{ ...switch_(1), x: 650, y: 920 }]
  const run = createRun(level); step(run, 120, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.coinsCollected, 1, 'only the coin within the player body radius collects')
  assert.deepEqual(run.pickups.map(p => p.collectedAge !== null), [true, false, false])
  const empty = createRun({ ...level, pickups: [] }); step(empty, 120, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(empty.triggers[0].active, false)
})

test('coin collection preserves physics and the clock, coexists with stopwatches, and chimes once', () => {
  const level = blankTrial(), plain = createRun(level), bonus = createRun({ ...level,
    pickups: [coin(320), coin(480)], triggers: [switch_(1, [])] })
  const audio = new JumpingAudioState(); audio.reset(bonus.player, bonus)
  let chimes = 0
  for (let i = 0; i < 150; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1 }
    stepRun(plain, input); stepRun(bonus, input); audio.step(bonus.player, bonus, STEP)
    chimes += audio.drain().cues.filter(c => c.kind === 'coin').length
    assert.deepEqual(bonus.player, plain.player); assert.deepEqual(bonus.platforms, plain.platforms)
    assert.equal(bonus.elapsed, plain.elapsed); assert.equal(bonus.timeStopRemaining, 0)
  }
  assert.equal(chimes, 2); assert.equal(bonus.coinsCollected, 2)
  const mixed = createRun({ ...level, pickups: [coin(160), { kind: 'stopwatch', x: 160, y: 888 }] })
  step(mixed); assert.equal(mixed.coinsCollected, 1); assert.equal(mixed.timeStopRemaining, 10)
})

test('coins remain collectible after lighting the goal but stop collecting on exit', () => {
  const level = blankTrial(); level.pickups = [coin(level.goal.x)]
  const run = createRun(level); run.started = true; Object.assign(run.player, level.goal); step(run)
  assert.equal(run.goalLit, true); assert.equal(run.coinsCollected, 1)
  run.pickups.push({ definition: coin(level.goal.x), collectedAge: null }); step(run)
  assert.equal(run.coinsCollected, 2)
  step(run, 120); const door = goalDoor(level.goal); run.player.x = door.x + door.w / 2; step(run)
  assert.ok(run.exit)
  run.pickups.push({ definition: coin(run.player.x), collectedAge: null }); step(run, 240)
  assert.equal(run.coinsCollected, 2); assert.equal(run.pickups.at(-1).collectedAge, null)
})

test('coin and wall-switch authoring preserves geometry, thresholds and connections through editing and JSON', () => {
  const start = puzzle(); start.pickups = []; start.triggers = []
  const added = addItem(start, 'coin', { x: 300, y: 800 }, { x: 300, y: 800 })
  assert.deepEqual(itemBounds(added.level, added.selection), { x: 300, y: 800, w: 40, h: 40 })
  const clone = duplicateItem(added.level, added.selection), moved = moveItem(clone.level, clone.selection, 80, -40)
  assert.deepEqual(moved.pickups[1], coin(440, 780))
  assert.deepEqual(hitItem(moved, 440, 780, 0), clone.selection)
  const addedSwitch = addItem(moved, 'coin-switch', { x: 500, y: 800 }, { x: 500, y: 800 })
  const selection = addedSwitch.selection
  assert.equal(canPlaceOnSurface(selection, addedSwitch.level), false)
  assert.equal(placeOnSurface(addedSwitch.level, selection), addedSwitch.level)
  assert.equal(itemBounds(addedSwitch.level, selection).h, 40)
  let edited = setCoinThreshold(addedSwitch.level, 0, 2)
  edited = setTriggerTargets(edited, 0, ['gate', 'gate', 'missing'])
  assert.equal(edited.triggers[0].threshold, 2); assert.deepEqual(triggerTargets(edited.triggers[0]), ['gate'])
  edited = resizeItem(edited, selection, 160, 999)
  edited = moveItem(edited, selection, 10000, 10000)
  assert.deepEqual(itemBounds(edited, selection), { x: 1680, y: 880, w: 120, h: 40 })
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(edited))), edited)
  assert.deepEqual(levelProblems(edited), [])
  assert.ok(allSelections(edited).some(s => s.kind === 'trigger'))
  const taller = resizeLevelHeight(edited, 1200)
  assert.equal(taller.triggers[0].y, 1160); assert.equal(taller.pickups[0].y, edited.pickups[0].y + 280)
  const copiedSwitch = duplicateItem(taller, selection)
  assert.equal(copiedSwitch.level.triggers[1].threshold, 2)
  assert.equal(deleteItem(copiedSwitch.level, copiedSwitch.selection).triggers.length, 1)
  assert.deepEqual(triggerTargets(deleteItem(edited, { kind: 'mechanism', index: 0 }).triggers[0]), [])
  assert.equal(setCoinThreshold(edited, 0, 2.7).triggers[0].threshold, 3)
  assert.equal(setCoinThreshold(edited, 0, 0).triggers[0].threshold, 1)
})

test('coin switch imports reject invalid thresholds and wall bounds, and the editor flags too few coins', () => {
  const level = puzzle()
  assert.deepEqual(parseLevel(level), level)
  for (const threshold of [undefined, null, '2', 0, -1, 1.5, 81, NaN, Infinity]) {
    assert.throws(() => parseLevel({ ...level, triggers: [{ ...switch_(), threshold }] }), `threshold ${threshold}`)
  }
  for (const changes of [{ y: -1 }, { y: 901 }, { x: -1 }, { w: 119 }, { w: 241 }]) assert.throws(() => parseLevel({ ...level, triggers: [{ ...switch_(), ...changes }] }))
  for (const pickup of [coin(19), coin(1781), coin(80, 19), coin(80, 901)]) assert.throws(() => parseLevel({ ...level, pickups: [pickup] }))
  assert.deepEqual(levelProblems(level), [])
  assert.match(levelProblems({ ...level, triggers: [switch_(4)] }).join(), /enough coins/)
  assert.deepEqual(parseLevel({ ...level, triggers: [{ ...switch_(), targets: undefined, target: 'gate' }] }).triggers[0].target, 'gate')
})

test('vertical coin switches preserve connections and center, resize vertically, and remain inside the room', () => {
  const level = puzzle(), selection = { kind: 'trigger', index: 0 }
  level.triggers[0].name = 'Upper gate'
  const vertical = setCoinSwitchOrientation(level, 0, 'vertical')
  assert.deepEqual(itemBounds(vertical, selection), { x: 510, y: 650, w: 20, h: 200 })
  assert.deepEqual(hitItem(vertical, 520, 840, 0), selection)
  assert.equal(canPlaceOnSurface(selection, vertical), false)
  assert.deepEqual(setCoinSwitchOrientation(vertical, 0, 'horizontal'), level)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(vertical))), vertical)
  const connected = setTriggerTargets(vertical, 0, ['gate'])
  assert.deepEqual(connected.triggers[0], vertical.triggers[0])
  const fromTop = resizeItem(vertical, selection, 500, 160, 'top')
  assert.deepEqual(itemBounds(fromTop, selection), { x: 510, y: 690, w: 20, h: 160 })
  const fromBottom = resizeItem(fromTop, selection, 500, 180, 'bottom')
  assert.deepEqual(itemBounds(fromBottom, selection), { x: 510, y: 690, w: 20, h: 180 })
  assert.equal(resizeItem(vertical, selection, 0, 10).triggers[0].h, 120)
  assert.equal(resizeItem(vertical, selection, 0, 10000).triggers[0].h, 240)
  const bottomRight = moveItem(vertical, selection, 10000, 10000)
  assert.deepEqual(itemBounds(bottomRight, selection), { x: 1780, y: 720, w: 20, h: 200 })
  const horizontal = setCoinSwitchOrientation(bottomRight, 0, 'horizontal')
  assert.deepEqual(levelProblems(horizontal), [])
  assert.deepEqual(parseLevel(horizontal), horizontal)
  assert.deepEqual(itemBounds(moveItem(vertical, selection, -10000, -10000), selection), { x: 0, y: 0, w: 20, h: 200 })
  const taller = resizeLevelHeight(vertical, 1200)
  assert.equal(taller.triggers[0].y, 930); assert.equal(taller.triggers[0].h, 200)
  const copy = duplicateItem(taller, selection)
  assert.equal(copy.level.triggers[1].orientation, 'vertical')
  assert.equal(copy.level.triggers[1].h, 200); assert.equal(copy.level.triggers[1].threshold, 2)
  assert.equal(copy.level.triggers[1].name, 'Upper gate')
})

test('vertical switch file validation bounds its height and requires its fixed width', () => {
  const level = setCoinSwitchOrientation(puzzle(), 0, 'vertical')
  for (const change of [{ h: undefined }, { h: 119 }, { h: 241 }, { h: NaN }, { w: 19 }, { w: 21 },
    { y: 721 }, { x: 1781 }, { orientation: 'sideways' }, { orientation: null }]) {
    assert.throws(() => parseLevel({ ...level, triggers: [{ ...level.triggers[0], ...change }] }), JSON.stringify(change))
  }
  const legacy = parseLevel({ ...level, triggers: [{ ...level.triggers[0], w: 60 }] })
  assert.equal(legacy.triggers[0].w, 20); assert.equal(legacy.triggers[0].x, level.triggers[0].x + 20)
  const run = createRun(level); step(run); run.player.x = 320; step(run)
  assert.equal(run.triggers[0].active, true); assert.equal(run.mechanisms[0].active, true)
  assert.equal(createRun(level).triggers[0].active, false)
})


test('numeric faces show the actual count beyond the goal and retain two-digit formatting', () => {
  assert.equal(formatCoinCount(0, 3), '00/03')
  assert.equal(formatCoinCount(4, 3), '04/03')
  assert.equal(formatCoinCount(99, 99), '99/99')
})

test('legacy bars convert to bounded numeric faces without changing wiring, names, or gameplay', () => {
  const original = setCoinSwitchOrientation(puzzle(), 0, 'vertical')
  original.triggers[0].name = 'Upper gate'
  const before = structuredClone(original), selection = { kind: 'trigger', index: 0 }
  const numeric = setCoinSwitchDisplay(original, 0, 'digital')
  assert.deepEqual(original, before, 'conversion leaves the undo state untouched')
  assert.deepEqual(itemBounds(numeric, selection), { x: 460, y: 730, w: 120, h: 40 })
  assert.equal(numeric.triggers[0].name, 'Upper gate')
  assert.deepEqual(triggerTargets(numeric.triggers[0]), ['gate'])
  assert.equal(numeric.triggers[0].threshold, 2)
  assert.deepEqual(parseLevel(numeric), numeric)
  assert.equal(resizeItem(numeric, selection, 240, 200), numeric)
  assert.equal(setCoinSwitchOrientation(numeric, 0, 'vertical'), numeric)
  assert.deepEqual(hitItem(numeric, 579, 769, 0), selection)
  const edge = setCoinSwitchDisplay(moveItem(original, selection, 10000, 10000), 0, 'digital')
  assert.deepEqual(levelProblems(edge), [])
  assert.deepEqual(parseLevel(edge), edge)
  const legacyConnection = { ...original, triggers: [{ ...original.triggers[0], targets: undefined, target: 'gate' }] }
  assert.equal(setCoinSwitchDisplay(legacyConnection, 0, 'digital').triggers[0].target, 'gate')
  assert.equal(setCoinSwitchDisplay(numeric, 0, 'bar').triggers[0].display, undefined)
  const bars = createRun(original), digits = createRun(numeric)
  for (let i = 0; i < 150; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1 }
    stepRun(bars, input); stepRun(digits, input)
    assert.deepEqual(digits.player, bars.player)
    assert.equal(digits.coinsCollected, bars.coinsCollected)
    assert.deepEqual(digits.triggers.map(t => t.active), bars.triggers.map(t => t.active))
    assert.deepEqual(digits.mechanisms, bars.mechanisms)
    assert.equal(digits.elapsed, bars.elapsed)
  }
})

test('numeric switch files validate their fixed footprint and exclude legacy orientation fields', () => {
  const numeric = setCoinSwitchDisplay(puzzle(), 0, 'digital')
  for (const change of [{ display: 'numbers' }, { display: null }, { w: 200 }, { h: 40 },
    { orientation: 'vertical' }, { x: 1681 }, { y: 881 }]) {
    assert.throws(() => parseLevel({ ...numeric, triggers: [{ ...numeric.triggers[0], ...change }] }), JSON.stringify(change))
  }
})
