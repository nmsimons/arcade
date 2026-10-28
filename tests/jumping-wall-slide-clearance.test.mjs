import test from 'node:test'
import assert from 'node:assert/strict'
import { columnSlideLevel } from './helpers/jumpingWallSlide.mjs'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects, nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { athleteSkin } from './helpers/jumpingSkin.mjs'
import { levelProblems } from '../src/games/jumping/level.ts'

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) {
  test(`sliding down Exit's column keeps the head and torso outside, side ${side}, ${1 / dt} Hz`, () => {
    const level = columnSlideLevel(side), p = createPlayer(level.entrance)
    assert.deepEqual(levelProblems(level), [])
    p.facing = -side
    let contacts = 0, descent = 0
    for (let tick = 0; tick < 2 / dt; tick++) {
      const time = tick * dt
      stepPlayer(p, { ...NEUTRAL_INPUT, move: time < .1 ? -side : side, jump: time < .15 }, dt, level.platforms)
      assert.ok(level.platforms.every(b => !bodyIntersects(p.x, p.y, b)), 'the collision body stays outside')
      const pose = athletePose(p)
      if (p.sliding?.active && p.wallBrace?.active) {
        contacts++; descent = Math.max(descent, p.vy)
      }
      const samples = [[pose.head, 6.2]]
      for (const [a, b] of [[pose.hip, pose.waist], [pose.waist, pose.shoulder]]) for (let i = 0; i <= 4; i++) {
        samples.push([a.map((v, axis) => v + (b[axis] - v) * i / 4), 2.8])
      }
      for (const [point, radius] of samples) {
        const x = p.x + point[0] * p.facing, y = p.y + point[1]
        for (const solid of level.platforms) {
          const edge = nearestBoundary(solid, x, y)
          const depth = radius + (pointInside(solid, x, y) ? edge.distance : -edge.distance)
          assert.ok(depth < .1, `the rendered body clips ${depth} into the column at tick ${tick}`)
        }
      }
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-6)
      }
      for (const shape of athleteSkin(p).filter(shape => ['torso', 'neck', 'head'].includes(shape.name))) {
        for (const [x, y] of shape.points) for (const solid of level.platforms) {
          assert.ok(!pointInside(solid, x, y) || nearestBoundary(solid, x, y).distance < .1,
            `${shape.name} skin stays outside at tick ${tick}`)
        }
      }
    }
    assert.ok(contacts >= .15 / dt, 'the route exercises the combined wall/slide pose')
    assert.ok(descent > 500, 'the player continues falling down the face')
  })
}
