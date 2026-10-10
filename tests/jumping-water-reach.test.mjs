import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

function pool(side, top) {
  const edge = side > 0 ? 850 : 450
  const run = createRun({ ...blankTrial(), spawn: { x: edge - side * 80, y: 450.34 },
    platforms: [{ x: side > 0 ? edge : 0, y: top, w: side > 0 ? 950 : 450, h: 920 - top }],
    gravityPlates: [{ id: 'water', x: 450, y: 400, w: 400, h: 520, effect: 'water', gravity: -1 }],
    goal: { id: 'closed', x: 1600, y: 920, power: 'switched' } })
  run.started = true; run.player.grounded = false; run.player.coyote = 0; run.player.facing = side
  return { run, edge }
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const top of [340, 375, 390, 400]) {
  test(`swimming hands wait for a nearby usable lip: top=${top}, side=${side}, dt=${dt}`, () => {
    const { run, edge } = pool(side, top), p = run.player
    let farFrames = 0, closeFrames = 0, reachFrames = 0, caught = false, previous
    for (let i = 0; i < Math.round(3 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side }, dt)
      if (p.hang) { caught = true; break }
      const gap = (edge - p.x) * side, pose = athletePose(p)
      const free = athletePose({ ...p, ledgeReach: null, waterMotion: { ...p.waterMotion, wall: undefined } })
      if (gap > 32) {
        farFrames++
        assert.equal(p.ledgeReach, null, 'distant terrain leaves the arms in their free stroke')
        assert.deepEqual(pose.frontArm, free.frontArm, 'a distant wall cannot replace the free front arm')
        assert.deepEqual(pose.backArm, free.backArm, 'a distant wall cannot replace the free back arm')
      }
      if (gap < 32) closeFrames++
      if (top <= 375) assert.equal(p.ledgeReach, null, 'the high lip cannot attract an overhead reach from neck depth')
      if (p.ledgeReach?.amount > .01) {
        reachFrames++
        const root = free.frontArm.root
        assert.ok(Math.hypot(gap - .3 - root[0], top - p.y - root[1]) < 26.1, 'preparation starts within a short hand approach')
      }
      const points = [pose.head, pose.shoulder, pose.frontArm.joint, pose.frontArm.end, pose.backArm.joint, pose.backArm.end]
        .map(([x, y]) => [p.x + x * p.facing, p.y + y])
      assert.ok(points.flat().every(Number.isFinite))
      if (previous && gap < 32) for (const [i, point] of points.entries()) {
        assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < dt * 500 + .1, 'the delayed reach remains continuous')
      }
      previous = points
    }
    assert.ok(farFrames > .3 / dt && closeFrames > 0, 'the route covers preparation and close approach')
    if (top >= 390) {
      assert.ok(reachFrames > 0, 'reachable lips still receive a hand preparation')
      assert.ok(caught, 'the ordinary bank catch remains available')
    }
    if (top === 340) {
      assert.equal(caught, false, 'the tall bank requires a surface jump')
      assert.ok(p.waterMotion.wall?.amount > .99)
      const pose = athletePose(p)
      for (const arm of [pose.frontArm, pose.backArm]) {
        assert.ok(arm.end[1] > pose.head[1] + 5, 'close contact braces the wall instead of reaching for its distant top')
      }
      for (let i = 0; i < Math.round(3 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, move: side, climb: true, jump: i === 0 }, dt)
      assert.ok(p.grounded && Math.abs(p.y - top) < .01, 'a deliberate jump and Up still escape the tall bank')
    }
  })
}
