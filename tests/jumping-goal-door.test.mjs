import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { DOOR_CHEVRON_DELAY, DOOR_CHEVRON_PERIOD, drawDoorChevrons, goalBounds, goalDoor, GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS } from '../src/games/jumping/goal.ts'
import { doorChevrons, drawGoalDoor } from '../src/games/jumping/challengeRender.ts'
import { hubDoorBounds } from '../src/games/jumping/hub.ts'
import { exitChevrons } from '../src/games/jumping/exitGate.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

test('the closed door leaves the wall untouched, opens black, and has an editor-only outline', () => {
  const calls = [], ctx = { fillRect(...args) { calls.push([this.fillStyle, ...args]) }, save() {}, restore() {}, setLineDash() {}, strokeRect() { calls.push('guide') } }
  const goal = { x: 500, y: 920 }
  drawGoalDoor(ctx, goal, 0); assert.deepEqual(calls, [])
  drawGoalDoor(ctx, goal, 0, true); assert.deepEqual(calls, ['guide']); calls.length = 0
  drawGoalDoor(ctx, goal, 1)
  assert.deepEqual(calls.filter(call => call[0] === '#000000'), [['#000000', 580, 840, 40, 80]])
})

test('the mirrored goal footprint includes the door and requires its floor and headroom', () => {
  for (const flipX of [false, true]) {
    const level = blankTrial(); level.goal = { x: 700, y: 920, flipX }
    const door = goalDoor(level.goal), bounds = goalBounds(level.goal)
    assert.equal(door.x + door.w / 2, 700 + (flipX ? -100 : 100))
    assert.ok(door.x >= bounds.x && door.x + door.w <= bounds.x + bounds.w)
    assert.deepEqual(levelProblems(level), [])
    level.platforms = [{ x: door.x, y: door.y, w: door.w, h: 10 }]
    assert.ok(levelProblems(level).some(issue => issue.includes('doorway')))
    level.platforms = [{ x: 650, y: 700, w: 100, h: 220 }]; level.goal.y = 700
    assert.ok(levelProblems(level).some(issue => issue.includes('continuous flat')))
  }
})

test('a ball in front of the doorway cannot prevent entry or pull the player through the ball', () => {
  for (const direction of [-1, 1]) {
    const level = blankTrial(); level.goal = { x: 700, y: 920, flipX: direction < 0 }
    const door = goalDoor(level.goal), center = door.x + door.w / 2
    level.props = [{ kind: 'box', x: 700, y: 920, size: 40 }, { kind: 'ball', x: center + direction * 30, y: 920, size: 68 }]
    level.entrance.x = center - direction * 18
    const run = createRun(level), p = run.player; run.started = true
    for (let i = 0; i < 60 && !run.exit; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    assert.equal(run.goalLit, true); assert.equal(run.goalElapsed, GOAL_OPEN_SECONDS); assert.ok(run.exit)
    assert.ok(Math.abs(run.exit.toX - center) > 3, 'entry does not require a blocked center point')
    for (let i = 0; i < Math.ceil(GOAL_EXIT_SECONDS / STEP) + 1; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction, jump: true })
      assert.equal(bodyIntersects(p.x, p.y, ballShape(run.props[1])), false)
    }
    assert.equal(run.finished, true)
  }
})

test('the open exit is entered with Up, held or pressed, and walking past never enters it', () => {
  const level = blankTrial(); level.goal.x = 500; level.entrance.x = 450
  const passing = createRun(level)
  for (let i = 0; i < 240; i++) stepRun(passing, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(passing.exit, null); assert.ok(passing.player.x > goalDoor(level.goal).x + 100, 'the robot walks on past the doorway')
  // Holding Up on the way in enters on arrival, at the same moment walking in once did.
  const held = createRun(level)
  for (let i = 0; i < 240 && !held.exit; i++) stepRun(held, { ...NEUTRAL_INPUT, move: 1, climb: true })
  assert.ok(held.exit)
  // Standing in the doorway, a press enters too.
  const standing = createRun(level), door = goalDoor(level.goal)
  standing.started = true; Object.assign(standing.player, { x: door.x + door.w / 2, y: level.goal.y })
  for (let i = 0; i < 60; i++) stepRun(standing, NEUTRAL_INPUT)
  assert.equal(standing.exit, null)
  stepRun(standing, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(standing.exit)
})

test('in zero g, Up in an open doorway enters it rather than lifting the robot off the floor', () => {
  const weightless = { id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }
  /** Stand the robot at x on the floor, let weightlessness settle, then press Up once. */
  const pressUp = (run, x) => {
    run.started = true; Object.assign(run.player, { x, y: 920, vx: 0, vy: 0 })
    for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.player.grounded, true, 'a weightless robot stands still on the floor')
    stepRun(run, NEUTRAL_INPUT); stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    return run
  }
  const level = blankTrial(); level.goal.x = 500; level.gravityPlates = [weightless]
  const door = goalDoor(level.goal), exit = pressUp(createRun(level), door.x + door.w / 2)
  assert.ok(exit.exit, 'the exit is entered'); assert.equal(exit.player.grounded, true)
  // Away from a door, Up still lifts the robot off on its boots.
  const away = pressUp(createRun(level), 200)
  assert.equal(away.exit, null); assert.equal(away.player.grounded, false)
  // A facility area's open level door works the same way.
  const area = parseLevel({ ...blankTrial(), kind: 'hub', timing: 'untimed', goal: undefined, times: undefined, gravityPlates: [weightless],
    courseDoors: [{ id: 'one', x: 700, y: 920, course: 'c1' }], bulkheads: [], evaluationBoards: [] })
  const hub = createRun(area); hub.hub.open = new Set(['one']); hub.hub.climbHeld = false
  pressUp(hub, 700)
  assert.equal(hub.hub.departure?.door.id, 'one'); assert.ok(hub.exit)
})

test('the short exit preserves the walking rig and foot contacts instead of switching to a separate pose', () => {
  const level = blankTrial(); level.goal.x = 500; level.entrance.x = 450
  const run = createRun(level), p = run.player
  let previous = null, entered = false
  for (let i = 0; i < 240 && !run.finished; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1, climb: true })
    const pose = athletePose(p)
    if (run.exit) {
      entered = true; assert.ok(p.anim.footwork)
      if (previous) assert.ok(Math.hypot(p.x + pose.head[0] - previous.x, p.y + pose.head[1] - previous.y) < 7,
        'the head follows a continuous final step')
      assert.equal(pose.backView, undefined, 'entry keeps the familiar side-view silhouette')
    }
    previous = { x: p.x + pose.head[0], y: p.y + pose.head[1] }
  }
  assert.ok(entered && run.finished)
  assert.ok(GOAL_EXIT_SECONDS < 1)
})

test('open doors that Up goes through show chevrons; closed and blocked doors do not', () => {
  const run = createRun(blankTrial())
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  assert.deepEqual(doorChevrons(run), { walls: [goalDoor(run.level.goal)] }, 'the open exit')
  assert.deepEqual(doorChevrons(run, true).walls, [], 'the studio draws none')
  // The bus is boarded by walking into it, so it shows none.
  const bus = createRun({ ...blankTrial(), timing: 'untimed', times: undefined, goal: { kind: 'bus', x: 1500, y: 920 } })
  for (let i = 0; i < 60; i++) stepRun(bus, NEUTRAL_INPUT)
  assert.deepEqual(doorChevrons(bus).walls, [])
  // A switched exit shows its chevrons only once it opens.
  const switched = blankTrial(); switched.goal = { ...switched.goal, id: 'exit', power: 'switched' }
  const locked = createRun(switched)
  for (let i = 0; i < 60; i++) stepRun(locked, NEUTRAL_INPUT)
  assert.deepEqual(doorChevrons(locked).walls, [])
  // The chevrons leave as the robot goes through.
  const door = goalDoor(run.level.goal); run.player.x = door.x + door.w / 2
  stepRun(run, { ...NEUTRAL_INPUT, climb: true }); assert.ok(run.exit)
  assert.deepEqual(doorChevrons(run).walls, [])
  // In a facility area, only open level doors and bulkheads show one.
  const hub = createRun({ ...blankTrial(), kind: 'hub', timing: 'untimed', goal: undefined, times: undefined,
    courseDoors: [{ id: 'open', x: 600, y: 920, course: 'a' }, { id: 'locked', x: 900, y: 920, course: 'b' }],
    bulkheads: [{ id: 'bulk', x: 1200, y: 920, to: 'concourse' }], evaluationBoards: [], wallDoors: [{ x: 1400, y: 920, condition: 'jammed' }] })
  hub.hub.open.add('open'); hub.hub.open.add('bulk')
  assert.deepEqual(doorChevrons(hub).walls, [hubDoorBounds(hub.level.courseDoors[0]), hubDoorBounds(hub.level.bulkheads[0])])
  // The Exit's rise the height of its larger opening, in a level door's proportions.
  hub.level.courseDoors[1].dispatch = true; hub.hub.open.add('locked')
  const exit = doorChevrons(hub).walls[1], doorway = hubDoorBounds(hub.level.courseDoors[1])
  assert.deepEqual(exit, exitChevrons(hub.level.courseDoors[1]))
  assert.ok(exit.h > doorway.h * 1.5 && exit.w / exit.h === doorway.w / doorway.h && exit.y + exit.h === doorway.y + doorway.h, JSON.stringify(exit))
})

test('three faint chevrons stay inside the doorway while a glow runs up them', () => {
  const door = { x: 100, y: 200, w: 40, h: 80 }
  const draw = time => {
    const strokes = []
    let points = []
    const ctx = { globalAlpha: 1, save() {}, restore() {}, beginPath() { points = [] }, rect() {}, clip() {},
      moveTo(x, y) { points.push([x, y]) }, lineTo(x, y) { points.push([x, y]) }, stroke() { strokes.push({ alpha: this.globalAlpha, points, width: this.lineWidth }) } }
    drawDoorChevrons(ctx, door, time)
    return strokes
  }
  for (const time of [0, .3, .9, 1.5]) {
    const strokes = draw(time)
    assert.equal(strokes.length, 3)
    for (const { alpha, points, width } of strokes) {
      assert.ok(alpha > .05 && alpha <= .25, 'faint')
      assert.ok(points.every(([x, y]) => x - width / 2 > door.x && x + width / 2 < door.x + door.w && y - width / 2 > door.y && y + width / 2 < door.y + door.h))
    }
  }
  // The bottom chevron (drawn first) brightens before the top one.
  const early = draw(DOOR_CHEVRON_PERIOD * .2)
  assert.ok(early[0].alpha > early[2].alpha)
  const later = draw(DOOR_CHEVRON_PERIOD * .2 + DOOR_CHEVRON_DELAY * 2)
  assert.ok(later[2].alpha > later[0].alpha)
})
