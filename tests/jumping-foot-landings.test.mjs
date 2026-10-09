import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'
import { pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { movingStepPropFixture } from './helpers/jumpingStepProps.mjs'

test('leaving a real moving ball steps down to the lower floor without instantly loading a distant shoe', () => {
  for (const side of [-1,1]) {
    const { level } = movingStepPropFixture(side, 'ball', 30), run = createRun(level)
    run.props[0].vx = side*480
    let previous, sawBall = false, sawLanding = false, sawFloor = false
    for (let tick = 0; tick < 180; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: tick < 38 ? side : tick < 150 ? -side : 0 })
      const p = run.player, pose = athletePose(p)
      const core = [pose.hip,pose.waist,pose.shoulder,pose.head].map(point => [p.x+point[0]*p.facing,p.y+point[1]])
      // The earlier climb interruption has its own open acceptance. This
      // regression covers the complete later ball-to-floor support transfer.
      if (tick >= 61) {
        if (previous) core.forEach((point,i) => assert.ok(Math.hypot(...point.map((v,j) => v-previous[i][j])) < 8,
          `${side}/${tick}/${i}: support transfer rejects the original 25-unit body drop`))
        sawBall ||= p.contacts.support?.collider.prop === run.props[0]
        sawLanding ||= !!p.footwork?.feet.some(foot => foot.release?.landing && !foot.planted && foot.groundY-foot.y > 8)
        for (const [i, leg] of [pose.frontLeg,pose.backLeg].entries()) {
          assert.ok(Math.abs(Math.hypot(...leg.joint.map((v,j) => v-leg.root[j]),leg.jointDepth??0)-15) < 1e-5)
          assert.ok(Math.abs(Math.hypot(...leg.end.map((v,j) => v-leg.joint[j]),(leg.endDepth??0)-(leg.jointDepth??0))-14.5) < 1e-5)
          const foot = p.footwork?.feet[i]
          if (!leg.planted) continue
          assert.ok(foot?.planted, 'the drawing cannot manufacture support')
          assert.ok(Math.hypot(p.x+leg.end[0]*p.facing-foot.x,p.y+leg.end[1]-foot.y) < 1e-5, 'the drawn ankle retains the real foot motor')
          const ground = groundAt(run.platforms,foot.anchorX,foot.anchorY,.2)
          assert.ok(ground && Math.abs(ground.y-foot.anchorY) < .2, 'the planted anchor lies on current geometry')
          sawFloor ||= Math.abs(foot.anchorY-level.floor) < .1
          for (const point of FOOT_CONTACT) {
            const sole = footPoint(point,leg.footAngle*leg.footFacing,leg.toeAngle*leg.footFacing)
            const x=p.x+(leg.end[0]+sole[0]*leg.footFacing)*p.facing,y=p.y+leg.end[1]+sole[1]
            assert.ok(run.platforms.every(solid => !pointInside(solid,x,y) || nearestBoundary(solid,x,y).distance < .1), 'the loaded shoe outline stays outside real solids')
          }
        }
      }
      previous = core
    }
    assert.ok(sawBall && sawLanding && sawFloor, 'the fixture witnesses curved support, an unloaded descending shoe and the real floor landing')
    assert.equal(run.player.grounded,true)
    assert.equal(run.player.y,level.floor)
    stepRun(run,{...NEUTRAL_INPUT,jump:true})
    assert.ok(!run.player.grounded && run.player.vy < 0, 'the presentation handoff preserves fresh jump response')
  }
})
