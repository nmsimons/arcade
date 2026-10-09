import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { actionFeedbackText, playerActionFeedback } from '../src/games/jumping/actionFeedback.ts'
import { waterBindingLevel, waterBindings } from './helpers/jumpingWaterBindings.mjs'

for (const device of ['controller', 'touch']) test(`${device} exposes the complete water actions through its production bindings`, () => {
  for (const direction of [-1, 1]) {
    function scenario(kind) {
      const level = parseLevel(waterBindingLevel(kind, direction))
      assert.deepEqual(levelProblems(level), [])
      const run = createRun(level), input = waterBindings(device), p = run.player
      let catches = 0, pulls = 0, pushes = 0
      const advance = (seconds, intent = {}) => {
        input.set(intent)
        for (let i = 0; i < Math.round(seconds / STEP); i++) {
          stepRun(run, input.sample())
          catches += Number(!!p.hang); pulls += Number(!!p.mantle); pushes += Number((p.pushing?.amount ?? 0) > .5)
          const pose = athletePose(p)
          for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
            const leg = 'footAngle' in limb
            assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, k) => v - limb.root[k]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < .001)
            assert.ok(Math.abs(Math.hypot(...limb.end.map((v, k) => v - limb.joint[k]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < .001)
          }
        }
      }
      advance(1, { vertical: -1 })
      assert.ok(p.grounded && p.crouching, 'ordinary Down includes crouch on the underwater floor')
      assert.equal(playerActionFeedback(p).kind, 'water-bottom')
      advance(8)
      assert.ok(!p.grounded && !p.crouching && p.y < 460, 'release permits passive rise all the way to the surface')
      return { run, p, advance, counts: () => ({ catches, pulls, pushes }) }
    }

    const passive = scenario('clear'), upright = scenario('clear')
    passive.advance(1, { vertical: -1 }); upright.advance(1, { vertical: -1 })
    assert.ok(passive.p.y > 510 && passive.p.vy > 90, 'Down really dives, rather than selecting only a pose')
    passive.advance(1); upright.advance(1, { vertical: 1 })
    assert.deepEqual([upright.p.x, upright.p.y, upright.p.vx, upright.p.vy], [passive.p.x, passive.p.y, passive.p.vx, passive.p.vy], 'Up and release produce identical passive ascent')
    assert.ok(upright.p.vy < -60 && upright.p.vy >= -TUNING.swimSpeed - .01)
    assert.match(actionFeedbackText(playerActionFeedback(upright.p), device), /turn upright and float/)
    upright.advance(4)
    const surface = upright.p.y
    upright.advance(STEP, { jump: true }); upright.advance(.12)
    assert.ok(upright.p.y < surface - 30 && upright.p.vy < -150, 'a new surface jump actually leaves the water')

    const floating = scenario('float'), originalX = floating.run.props[0].x
    floating.advance(2, { move: direction })
    assert.ok((floating.run.props[0].x - originalX) * direction > 12 && floating.counts().pushes > 20, 'swimming moves the real float with sustained working palms')
    assert.equal(floating.counts().catches, 0, 'ordinary swimming never auto-grabs a loose float')
    assert.equal(playerActionFeedback(floating.p).grippable, false)
    assert.match(actionFeedbackText(playerActionFeedback(floating.p), device), /turn upright and float/)
    assert.doesNotMatch(actionFeedbackText(playerActionFeedback(floating.p), device), /grip/)
    floating.advance(1, { move: direction, vertical: 1 })
    assert.equal(floating.counts().catches, 0, 'Up never invents a grip on an unsupported unstable float')

    const grip = scenario('grip')
    // Face the nearer lip without moving out of its catch window.
    grip.advance(STEP, { move: direction }); grip.advance(.5)
    grip.advance(STEP, { jump: true }); grip.advance(3, { vertical: 1 })
    assert.ok(grip.counts().catches > 0 && grip.counts().pulls > 0, 'a deliberate surface jump and Up catch and pull onto the stable crate')
    assert.ok(grip.p.grounded && Math.abs(grip.p.y - 350) < .01 && (grip.p.x - (direction > 0 ? 530 : 1270)) * direction > 0)

    const bank = scenario('bank')
    bank.advance(2, { move: direction, vertical: 1 }); bank.advance(1, { vertical: 1 })
    assert.ok(bank.counts().catches > 0 && bank.counts().pulls > 0, 'a normal terrain-bank catch remains available')
    assert.ok(bank.p.grounded && Math.abs(bank.p.y - 380) < .01 && (bank.p.x - (direction > 0 ? 640 : 1160)) * direction > 0, 'ordinary input escapes onto the bank')
  }
})
