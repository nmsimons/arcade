import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { movingStepPropFixture } from './helpers/jumpingStepProps.mjs'

test('actual moving crates and balls interrupt returning terrain steps and retain normal jump escape', () => {
  for (const side of [-1,1]) for (const kind of ['box','ball']) for (const size of [30,80]) {
    const { level, initial } = movingStepPropFixture(side, kind, size)
    const run = createRun(level)
    // Supply incoming momentum once. Matter advances and collides the actual
    // loose object thereafter; no collider is inserted and no player is moved.
    run.props[0].vx = side*480
    let entered = false, returned = false, interrupted = false, contacted = false, source
    const context = `${side}/${kind}/${size}`
    for (let tick = 0; tick < 180; tick++) {
      const p = run.player, old = [p.x,p.y], oldTime = p.mantle?.time, wasReturning = p.mantle?.returning
      stepRun(run, { ...NEUTRAL_INPUT, move: tick < 38 ? side : tick < 150 ? -side : 0 })
      if (p.mantle?.step && !entered) {
        entered = true; source = [p.mantle.step.caught.x,p.mantle.step.caught.y]
      }
      returned ||= !!p.mantle?.returning
      contacted ||= p.contacts.push?.collider.prop === run.props[0]
        || p.contacts.body.some(contact => contact.collider.prop === run.props[0])
      assert.ok(run.platforms.every(solid => !bodyIntersects(p.x,p.y,solid)), `${context}: the current terrain and prop hulls remain solid`)
      assert.ok(Math.hypot(p.x-old[0],p.y-old[1]) < 9, `${context}: the moving contact cannot teleport the root`)
      if (wasReturning && oldTime > STEP+1e-8 && !p.mantle) {
        interrupted = true
        assert.ok(Math.abs(run.props[0].x-initial) > 40, `${context}: the obstacle really travelled into the return`)
        assert.ok(Math.abs(run.props[0].vx) > 5, `${context}: the interrupting prop is still moving`)
        assert.ok(Math.hypot(p.x-source[0],p.y-source[1]) > .1, `${context}: a blocked return cannot jump to its captured source`)
        assert.ok(p.grabCooldown > 0, `${context}: interruption retains the ordinary catch cooldown`)
      }
    }
    assert.ok(entered && returned && interrupted && contacted, `${context}: the fixture must witness the entire real interruption`)
    assert.equal(run.player.mantle, null, context)
    assert.equal(run.player.grounded, true, `${context}: ordinary movement recovers footing`)
    stepRun(run, { ...NEUTRAL_INPUT, jump: true })
    assert.ok(run.player.vy < 0 && !run.player.grounded, `${context}: a fresh jump departs immediately`)
    assert.ok(run.player.jumpLift, `${context}: departure retains the tap/hold motor`)
  }
})
