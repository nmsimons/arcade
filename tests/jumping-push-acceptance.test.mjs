import test from 'node:test'
import assert from 'node:assert/strict'
import { PUSH_SCENARIOS, pushScenario } from './helpers/jumpingPushScenarios.mjs'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'

function fixedLimbs(pose) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
  }
}

function clearUpperBody(run, pose) {
  const p = run.player, solids = [...run.terrain, ...run.mechanisms.map(mechanismShape),
    ...run.props.filter(prop => prop.kind === 'box').map(boxShape)]
  const clear = (point, radius) => {
    const x = p.x + point[0] * p.facing, y = p.y + point[1]
    for (const solid of solids) {
      assert.equal(pointInside(solid, x, y), false, 'final upper-body points stay outside visible solids')
      assert.ok(nearestBoundary(solid, x, y).distance >= radius - .02, 'final upper-body outlines retain clearance')
    }
    for (const ball of run.props.filter(prop => prop.kind === 'ball')) assert.ok(
      Math.hypot(x - ball.x, y - ball.y + ball.size / 2) >= ball.size / 2 + radius - .02,
      'the outline clears the actual drawn circle')
  }
  clear(pose.head, 6.2)
  for (const arm of [pose.frontArm, pose.backArm]) clear(arm.joint, 1.5)
  for (const [a, b] of [[pose.hip, pose.waist], [pose.waist, pose.shoulder]])
    for (let i = 0; i <= 10; i++) clear(a.map((value, axis) => value + (b[axis] - value) * i / 10), 2.8)
}

test('actual push cadence and load follow opposed travel, slopes and carrier-relative support', () => {
  const results = []
  for (const facing of [-1, 1]) for (const config of PUSH_SCENARIOS) {
    const run = pushScenario(config, facing), p = run.player
    let previous = [true, true], steps = 0, peakSpeed = 0
    const movers = new Set(), start = [p.x, p.y], carrier = run.mechanisms[0]
    const carrierStart = carrier && [carrier.x, carrier.y]
    for (let tick = 0; tick < 480; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: facing * (config.effort ?? 1), crouch: !!config.crouch })
      const pose = athletePose(p)
      fixedLimbs(pose)
      if (tick % 4 === 0) clearUpperBody(run, pose)
      assert.ok(p.grounded && p.pushing?.effort, config.name + ': the fixture retains a real loaded push')
      assert.ok(p.footwork.feet.some(foot => foot.planted), config.name + ': a real leg supports every working step')
      for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        const foot = p.footwork.feet[i]
        if (!foot.planted && previous[i]) { steps++; movers.add(i) }
        if (foot.planted) {
          assert.ok(Math.hypot(p.x + leg.end[0] * p.facing - foot.x, p.y + leg.end[1] - foot.y) < 1e-6,
            config.name + ': the final loaded shoe preserves its actual ankle')
          const ground = groundAt(p.terrain, foot.anchorX, p.y)
          assert.ok(ground && Math.abs(ground.y - foot.anchorY) < .02, config.name + ': the anchor is on real support')
        }
      }
      previous = p.footwork.feet.map(foot => foot.planted)
      for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
        const palm = p.pushing.palms[i]
        assert.ok(Math.hypot(p.x + arm.hand[0] * p.facing - palm.x - palm.nx * 1.6,
          p.y + arm.hand[1] - palm.y - palm.ny * 1.6) < .5, config.name + ': visible contact supplies the shove')
      }
      peakSpeed = Math.max(peakSpeed, p.contacts.motion.speed)
    }
    if (!config.blocked && config.effort !== .02) assert.equal(movers.size, 2, config.name + ': both legs advance')
    if (config.effort === .02) assert.ok(steps < 4, 'creep does not churn after the initial stance')
    if (config.name === '90-speed ball') assert.ok(Math.abs(peakSpeed - 90) < .001, 'the sample really includes the established ball motor speed')
    if (carrier) assert.ok(Math.hypot(carrier.x - carrierStart[0], carrier.y - carrierStart[1]) > 100,
      'a moving support really moves; its motion is not erased to manufacture a stationary case')
    if (config.blocked) {
      assert.ok(Math.abs(p.x - start[0]) < .001, config.name + ': the real obstruction actually blocks locomotion')
      const anchors = p.footwork.feet.map(foot => [foot.anchorX, foot.anchorY]), origin = carrier && [carrier.x, carrier.y]
      for (let tick = 0; tick < 1200; tick++) {
        stepRun(run, { ...NEUTRAL_INPUT, move: facing * (config.effort ?? 1) })
        const shift = carrier ? [carrier.x - origin[0], carrier.y - origin[1]] : [0, 0]
        assert.ok(p.footwork.feet.every(foot => foot.planted), 'ten seconds of blocked effort cannot restart stance steps')
        for (const [i, foot] of p.footwork.feet.entries()) assert.ok(Math.hypot(
          foot.anchorX - anchors[i][0] - shift[0], foot.anchorY - anchors[i][1] - shift[1]) < 1e-6)
        assert.ok(p.footwork.pushBalance.every(point => Math.hypot(...point) < .001), 'carrier transport alone cannot cycle voluntary weight transfer')
      }
    }
    results.push({ name: config.name, facing, steps, load: p.pushing.load, pose: athletePose(p) })
    stepRun(run, { ...NEUTRAL_INPUT, jump: true })
    assert.ok(!p.grounded && p.vy < 0, config.name + ': fresh jump remains immediate')
  }
  for (const facing of [-1, 1]) {
    const sample = name => results.find(r => r.name === name && r.facing === facing)
    const light = sample('light blocked crate'), full = sample('blocked crate'), moving = sample('ordinary crate')
    assert.ok(full.pose.hip[1] - light.pose.hip[1] > 1, 'full blocked effort lowers the hips visibly more than partial effort')
    assert.ok(full.pose.shoulder[0] - light.pose.shoulder[0] > .5, 'stronger opposition is visible in the chest')
    assert.ok(light.load < moving.load && moving.load < full.load, 'load distinguishes partial, moving and opposed effort')
    assert.ok(sample('90-speed ball').steps > sample('ordinary crate').steps, 'faster resolved ball movement increases cadence')
  }
})

test('passive incoming balls, robots and carrier travel cannot load a voluntary shove', () => {
  for (const source of ['ball', 'robot', 'carrier']) for (const facing of [-1, 1]) {
    const level = { ...blankTrial(), spawn: { x: 800, y: 920 } }
    if (source === 'ball') level.props = [{ kind: 'ball', x: 800 - facing * 140, y: 920, size: 100 }]
    if (source === 'robot') level.robots = [{ x: 800 - facing * 100, y: 920, left: 200, right: 1400 }]
    if (source === 'carrier') {
      level.height = 1200; level.floor = 1100; level.goal.y = 1100
      level.mechanisms = [{ id: 'carrier', kind: 'lift', x: 300, y: 920, w: 1100,
        h: 20, travel: 180, power: 'always', orientation: 'horizontal' }]
    }
    const run = createRun(level), p = run.player
    // Start the actual world with Up, then release; no horizontal exertion.
    stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    if (source === 'ball') run.props[0].vx = facing * 400
    if (source === 'robot') run.robots[0].facing = facing
    let displaced = 0
    for (let tick = 0; tick < 360; tick++) {
      stepRun(run, NEUTRAL_INPUT)
      displaced = Math.max(displaced, Math.abs(p.x - 800))
      assert.equal(p.pushing?.effort ?? 0, 0)
      assert.ok((p.pushing?.load ?? 0) < .001, source + ': passive movement does not claim voluntary force')
      fixedLimbs(athletePose(p))
    }
    assert.ok(displaced > 20, source + ': the incoming object/support really displaces the body')
  }
})
