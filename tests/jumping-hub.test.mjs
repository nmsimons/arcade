import test from 'node:test'
import assert from 'node:assert/strict'
import { isHubLevel, isPuzzleLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'

const hubFile = overrides => ({
  version: 1, id: 'test-wing', name: 'Test wing', kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
  entrance: { x: 160, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] },
  props: [], mechanisms: [], triggers: [], robots: [],
  courseDoors: [{ id: 'door-one', x: 600, y: 920, course: 'one' }, { id: 'door-two', x: 900, y: 920, course: 'two' }],
  bulkheads: [{ id: 'to-concourse', x: 1300, y: 920, to: 'concourse' }],
  chargingBays: [{ id: 'bay', x: 1550, y: 920 }],
  evaluationBoards: [{ id: 'board', x: 200, y: 500, w: 300, h: 160 }],
  ...overrides,
})
const hubRun = (open = ['door-one', 'to-concourse'], overrides) => {
  const run = createRun(parseLevel(hubFile(overrides)))
  for (const id of open) run.hub.open.add(id)
  return run
}
const steps = (run, input, count) => { for (let i = 0; i < count && !run.finished; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
const standAt = (run, x) => { translatePlayer(run.player, x - run.player.x, 0); steps(run, {}, 30) }
const pressUp = run => { steps(run, {}, 2); steps(run, { climb: true }, 2) }

test('hub levels parse with doors and bays but no goal or grade times', () => {
  const level = parseLevel(hubFile())
  assert.equal(isHubLevel(level), true)
  assert.equal(isPuzzleLevel(level), false)
  assert.deepEqual(level.courseDoors.map(door => door.course), ['one', 'two'])
  assert.deepEqual(level.bulkheads[0], { id: 'to-concourse', x: 1300, y: 920, to: 'concourse' })
  assert.deepEqual(level.chargingBays[0], { id: 'bay', x: 1550, y: 920 })
  assert.deepEqual(level.evaluationBoards[0], { id: 'board', x: 200, y: 500, w: 300, h: 160 })
  assert.deepEqual(levelProblems(level), [])
  const minimal = parseLevel(hubFile({ courseDoors: undefined, bulkheads: undefined, chargingBays: undefined, evaluationBoards: undefined }))
  assert.deepEqual([minimal.courseDoors, minimal.bulkheads, minimal.chargingBays, minimal.evaluationBoards], [[], [], [], []])
})

test('hub structure is rejected outside hubs and in malformed hubs', () => {
  const course = { ...hubFile(), kind: undefined, timing: undefined, courseDoors: undefined, bulkheads: undefined, chargingBays: undefined, evaluationBoards: undefined,
    goal: { x: 1620, y: 920 }, times: { a: 10, b: 20, c: 40, d: 60 } }
  assert.equal(isPuzzleLevel(parseLevel(course)), true)
  for (const broken of [
    { ...course, courseDoors: [] },
    { ...course, chargingBays: [] },
    { ...course, evaluationBoards: [] },
    hubFile({ evaluationBoards: [{ id: 'board', x: 1700, y: 500, w: 300, h: 160 }] }),
    hubFile({ evaluationBoards: [{ id: 'bay', x: 200, y: 500, w: 300, h: 160 }] }),
    hubFile({ kind: 'wing' }),
    hubFile({ timing: undefined }),
    hubFile({ goal: { x: 1620, y: 920 } }),
    hubFile({ times: { a: 10, b: 20, c: 40, d: 60 } }),
    hubFile({ bulkheads: [{ id: 'to-concourse', x: 1300, y: 920, to: 'The Concourse' }] }),
    hubFile({ courseDoors: [{ id: 'door-one', x: 600, y: 920 }] }),
    hubFile({ chargingBays: [{ id: 'door-one', x: 1550, y: 920 }] }),
  ]) assert.throws(() => parseLevel(broken), /not a valid jumping level/)
})

test('hub problems cover door placement, duplicate courses and course equipment', () => {
  const level = parseLevel(hubFile({
    courseDoors: [{ id: 'door-one', x: 600, y: 920, course: 'one' }, { id: 'door-high', x: 900, y: 700, course: 'one', name: 'High door' }],
    pickups: [{ kind: 'coin', x: 400, y: 880 }, { kind: 'stopwatch', x: 450, y: 880 }],
    timers: [{ x: 300, y: 600 }],
    triggers: [{ x: 1000, y: 700, w: 120, mode: 'coins', threshold: 1, target: '' }],
  }))
  assert.deepEqual(levelProblems(level), [
    'Place course door “High door” on a continuous flat surface, with a clear doorway inside the level.',
    'Two course doors lead to “one”. Give each course one door.',
    'Remove the coins, coin switches, wall clocks, time pickups and EMP charges. Course equipment stays in the courses.',
  ])
})

test('a fresh Up press in an open doorway enters it and finishes the hub run', () => {
  const run = hubRun()
  standAt(run, 600)
  assert.equal(run.hub.departure, null)
  pressUp(run)
  assert.deepEqual(run.hub.departure, { kind: 'course', door: run.level.courseDoors[0] })
  assert.ok(run.exit)
  steps(run, {}, 240)
  assert.equal(run.finished, true)
  assert.equal(run.grade, null)
  assert.ok(Math.abs(run.player.x - 600) < 1)
})

test('locked doors ignore Up, and bulkheads enter like course doors', () => {
  const locked = hubRun()
  standAt(locked, 900); pressUp(locked); steps(locked, {}, 120)
  assert.equal(locked.hub.departure, null)
  assert.equal(locked.finished, false)
  const bulkhead = hubRun()
  standAt(bulkhead, 1300); pressUp(bulkhead)
  assert.equal(bulkhead.hub.departure?.kind, 'bulkhead')
  assert.equal(bulkhead.hub.departure?.door.to, 'concourse')
})

test('running past doors with Up held never enters one, and passing a bay records it', () => {
  const run = hubRun(['door-one', 'door-two', 'to-concourse'])
  for (let i = 0; i < 2400 && run.player.x < 1600; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1, climb: true })
  assert.ok(run.player.x >= 1600, `reached x ${run.player.x}`)
  assert.equal(run.hub.departure, null)
  assert.equal(run.exit, null)
  assert.equal(run.hub.bay, 'bay')
  // Up already held on arrival must be released and pressed again.
  const held = hubRun()
  steps(held, { climb: true }, 5)
  translatePlayer(held.player, 600 - held.player.x, 0); steps(held, { climb: true }, 30)
  assert.equal(held.hub.departure, null)
})
