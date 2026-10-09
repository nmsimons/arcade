import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { athleteOutlinePoints } from './helpers/jumpingAthleteOutline.mjs'
import { proneDropLevel, proneDropInput } from './helpers/jumpingProneScenarios.mjs'

test('an ordinary airborne catch keeps its full bend plane around a genuinely moving gate lip', () => {
  for (const direction of [-1, 1]) {
    const authored = proneDropLevel('moving gate', direction)
    Object.assign(authored.mechanisms[0], { y: 950, h: 800, travel: 800 })
    const level = parseLevel(authored)
    assert.deepEqual(levelProblems(level), [])
    const run = createRun(level), p = run.player
    let caught = false, moved = 0, previousY, previous
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, proneDropInput(tick, direction))
      const pose = athletePose(p), context = `ordinary gate catch; direction=${direction}; tick=${tick}`
      if (p.hang && !caught) assert.ok(!(p.hang.caught.freeFall?.amount > 0), 'this catches before the prone transition starts')
      caught ||= !!p.hang
      if (previousY !== undefined) moved += Math.abs(run.mechanisms[0].y - previousY)
      previousY = run.mechanisms[0].y
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5, context + ': upper bone')
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5, context + ': lower bone')
      }
      const points = [pose.hip, pose.shoulder, pose.head, pose.frontArm.joint, pose.frontArm.end,
        pose.backArm.joint, pose.backArm.end].map(q => [p.x + q[0] * p.facing, p.y + q[1]])
      if (previous) for (const [i, q] of points.entries()) assert.ok(Math.hypot(q[0] - previous.points[i][0], q[1] - previous.points[i][1])
        < Math.hypot(p.x - previous.x, p.y - previous.y) + Math.abs(run.mechanisms[0].y - previous.gateY) + 6, context + ': joint continuity')
      previous = { x: p.x, y: p.y, points, gateY: run.mechanisms[0].y }
      if (tick % 4 === 0 || p.hang && p.hang.time < .18) {
        const before = structuredClone(p)
        for (const q of athleteOutlinePoints(p)) {
          const x = p.x + q[0] * p.facing, y = p.y + q[1]
          for (const solid of p.terrain) assert.ok(!pointInside(solid, x, y) || nearestBoundary(solid, x, y).distance <= .02, context + ': final skin')
        }
        assert.deepEqual(p, before, context + ': read-only presentation')
      }
    }
    assert.ok(caught && moved > 100, 'normal controls actually catch the moving gate')
    assert.equal(p.hang, null, 'X deliberately releases the grip')
  }
})
