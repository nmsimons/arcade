import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial, levelProblems } from '../src/games/jumping/level.ts'
import { goalBounds, goalDoor, GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS } from '../src/games/jumping/goal.ts'
import { drawGoalDoor } from '../src/games/jumping/challengeRender.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

test('the closed door leaves the wall untouched, opens black, and has an editor-only outline', () => {
  const calls = [], ctx = { fillRect(...args) { calls.push([this.fillStyle, ...args]) }, save() {}, restore() {}, setLineDash() {}, strokeRect() { calls.push('guide') } }
  const goal = { x: 500, y: 920 }
  drawGoalDoor(ctx, goal, 0); assert.deepEqual(calls, [])
  drawGoalDoor(ctx, goal, 0, true); assert.deepEqual(calls, ['guide']); calls.length = 0
  drawGoalDoor(ctx, goal, 1); assert.deepEqual(calls, [['#000000', 580, 840, 40, 80]])
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
    level.spawn.x = center - direction * 18
    const run = createRun(level), p = run.player; run.started = true
    for (let i = 0; i < 60 && !run.exit; i++) stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.goalLit, true); assert.equal(run.goalElapsed, GOAL_OPEN_SECONDS); assert.ok(run.exit)
    assert.ok(Math.abs(run.exit.toX - center) > 3, 'entry does not require a blocked center point')
    for (let i = 0; i < Math.ceil(GOAL_EXIT_SECONDS / STEP) + 1; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction, jump: true })
      assert.equal(bodyIntersects(p.x, p.y, ballShape(run.props[1])), false)
    }
    assert.equal(run.finished, true)
  }
})

test('the short exit preserves the walking rig and foot contacts instead of switching to a separate pose', () => {
  const level = blankTrial(); level.goal.x = 500; level.spawn.x = 450
  const run = createRun(level), p = run.player
  let previous = null, entered = false
  for (let i = 0; i < 240 && !run.finished; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const pose = athletePose(p)
    if (run.exit) {
      entered = true; assert.ok(p.footwork)
      if (previous) assert.ok(Math.hypot(p.x + pose.head[0] - previous.x, p.y + pose.head[1] - previous.y) < 7,
        'the head follows a continuous final step')
      assert.equal(pose.backView, undefined, 'entry keeps the familiar side-view silhouette')
    }
    previous = { x: p.x + pose.head[0], y: p.y + pose.head[1] }
  }
  assert.ok(entered && run.finished)
  assert.ok(GOAL_EXIT_SECONDS < 1)
})
