import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { footPoint, footRoll, soleContact, toeBend } from '../src/games/jumping/footwork.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
const worldFoot = (p, leg) => {
  const angle = leg.footAngle * leg.footFacing, facing = leg.footFacing * p.facing
  const x = p.x + leg.end[0] * p.facing, y = p.y + leg.end[1]
  return { planted: leg.planted, anchor: x - footRoll(angle)[0] * facing, ground: y + soleContact(angle, leg.toeAngle * leg.footFacing)[1], angle, facing }
}

test('expressive strides keep limb lengths, safe knee bends, and continuous poses', () => {
  for (const vx of [0, 70, 125, 240, 350]) for (const charging of [false, true]) {
    let previous
    for (let frame = 0; frame <= 1000; frame++) {
      const p = { ...createPlayer(), vx, charging, charge: 1, stride: frame / 1000 * Math.PI * 2 }
      const pose = athletePose(p)
      for (const limb of [pose.frontLeg, pose.backLeg, pose.frontArm, pose.backArm]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(distance(limb.root, limb.joint) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(distance(limb.joint, limb.end) - (leg ? 14.5 : 9)) < 1e-6)
        if (leg) {
          const a = [limb.root[0] - limb.joint[0], limb.root[1] - limb.joint[1]]
          const b = [limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1]]
          const opening = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (15 * 14.5)))
          assert.ok(opening >= Math.PI / 4, 'the knee must not fold into the foot')
        }
      }
      const current = points(pose)
      if (previous) for (let i = 0; i < current.length; i++) {
        assert.ok(distance(current[i], previous[i]) < .8, `pose discontinuity at speed ${vx}, frame ${frame}`)
      }
      previous = current
    }
  }
})

test('jump legs gather by the apex and remain gathered throughout descent', () => {
  for (const vx of [0, 125, 350]) {
    let previous
    for (let vy = -30; vy <= 800; vy += 5) {
      const pose = athletePose({ ...createPlayer(), grounded: false, vx, vy })
      if (vy >= 0) {
        assert.ok(Math.abs(pose.frontLeg.end[0] - pose.backLeg.end[0]) <= 5)
        assert.ok(Math.abs(pose.frontLeg.end[1] - pose.backLeg.end[1]) <= 2)
      }
      const current = points(pose)
      if (previous) for (let i = 0; i < current.length; i++) assert.ok(distance(current[i], previous[i]) < .5)
      previous = current
    }
  }
})

test('both jump arms reach forward through takeoff, the apex, and descent in either direction', () => {
  for (const facing of [-1, 1]) for (const vx of [0, 125, 350]) for (const vy of [-800, -560, -455, -180, 0, 400, 1000]) {
    const pose = athletePose({ ...createPlayer(), grounded: false, facing, vx: vx * facing, vy })
    for (const arm of [pose.frontArm, pose.backArm]) {
      assert.ok(arm.joint[0] > pose.shoulder[0] + 3, 'both elbows stay in front of the torso')
      assert.ok(arm.end[0] > pose.shoulder[0] + 10, 'both hands reach ahead of the figure')
    }
    assert.ok(distance(pose.frontArm.end, pose.backArm.end) > 3, 'the arms remain visibly separate')
  }
})

test('the same local animation plays in either direction', () => {
  for (let frame = 0; frame < 40; frame++) {
    const stride = frame / 40 * Math.PI * 2
    const right = athletePose({ ...createPlayer(), vx: 350, stride })
    const left = athletePose({ ...createPlayer(), vx: -350, facing: -1, stride: -stride })
    assert.deepEqual(left, right)
  }
})

test('rendered feet roll around a fixed footprint through speed changes, braking, turns and charge', () => {
  const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (const direction of [1, -1]) {
    const p = createPlayer(); p.x = 1300
    let previous, comparisons = 0, contacts = 0
    const sequence = [[.6, .35, false], [.8, 1, false], [.4, 1, true], [.8, 0, true], [.5, .5, true], [.6, -1, true], [.8, 0, true]]
    for (const [duration, move, jump] of sequence) for (let t = 0; t < duration - STEP / 2; t += STEP) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: move * direction, jump }, STEP, floor)
      const pose = athletePose(p)
      const feet = [pose.frontLeg, pose.backLeg].map(leg => worldFoot(p, leg))
      for (let i = 0; i < 2; i++) if (feet[i].planted) {
        contacts++
        assert.ok(Math.abs(feet[i].ground - 620) < 1e-6, 'the rolling contact must meet the ground')
        if (previous?.[i].planted) {
          comparisons++
          assert.ok(Math.abs(feet[i].anchor - previous[i].anchor) < 1e-6, 'the footprint slid')
          assert.equal(feet[i].facing, previous[i].facing, 'turning must not flip an anchored foot')
        }
      }
      previous = feet
    }
    assert.ok(comparisons > 300 && contacts > 400, 'the check must cover sustained ground contacts')
    assert.ok(p.footwork.feet.every(foot => foot.planted), 'both feet settle into a standing position')
  }
})

test('jumping releases foot anchors, and landing establishes new contacts', () => {
  const p = createPlayer(), floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (let i = 0; i < 50; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1, jump: true }, STEP, floor)
  stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, floor)
  assert.equal(p.footwork, null)
  let previous, contacts = 0
  for (let i = 0; i < 190; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: i < 140 ? 1 : 0 }, STEP, floor)
    const pose = athletePose(p), legs = [pose.frontLeg, pose.backLeg]
    if (!p.grounded) assert.ok(legs.every(leg => !leg.planted))
    const feet = legs.map(leg => worldFoot(p, leg))
    for (let j = 0; j < 2; j++) if (feet[j].planted && previous?.[j].planted) {
      assert.ok(Math.abs(feet[j].anchor - previous[j].anchor) < 1e-6)
      contacts++
    }
    previous = feet
  }
  assert.ok(contacts > 50)
})

test('higher falls produce deeper knee flex and longer recovery with fixed feet and smooth poses', () => {
  const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (const facing of [-1, 1]) {
    const results = []
    for (const height of [24, 140, 360]) {
      const p = createPlayer(); Object.assign(p, { y: 620 - height, grounded: false, facing })
      for (let i = 0; i < 180 && !p.grounded; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
      assert.equal(p.grounded, true)
      let previous = athletePose(p), deepest = previous.hip[1], knee = Math.PI, recovery = 0
      const anchors = [previous.frontLeg, previous.backLeg].map(leg => worldFoot(p, leg).anchor)
      for (let i = 1; i < 80; i++) {
        stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
        const pose = athletePose(p), legs = [pose.frontLeg, pose.backLeg]
        deepest = Math.max(deepest, pose.hip[1])
        for (const [j, leg] of legs.entries()) {
          const foot = worldFoot(p, leg)
          assert.ok(foot.planted && Math.abs(foot.ground - 620) < 1e-6)
          assert.ok(Math.abs(foot.anchor - anchors[j]) < 1e-6, 'impact absorption must not drag the feet')
          assert.ok(Math.abs(distance(leg.root, leg.joint) - 15) < 1e-6)
          assert.ok(Math.abs(distance(leg.joint, leg.end) - 14.5) < 1e-6)
          knee = Math.min(knee, Math.acos((15 ** 2 + 14.5 ** 2 - distance(leg.root, leg.end) ** 2) / (2 * 15 * 14.5)))
        }
        const before = points(previous), after = points(pose)
        for (let j = 0; j < after.length; j++) assert.ok(distance(before[j], after[j]) < 3, 'compression and recovery must not snap')
        if (!recovery && !p.landing) recovery = i * STEP
        previous = pose
      }
      assert.ok(knee >= Math.PI / 4, 'the knees must not collapse into the feet')
      const resting = athletePose(p)
      for (let i = 0; i < 20; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
      assert.deepEqual(athletePose(p), resting)
      results.push({ deepest, knee, recovery })
    }
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i].deepest > results[i - 1].deepest + 4)
      assert.ok(results[i].knee < results[i - 1].knee - .25)
      assert.ok(results[i].recovery > results[i - 1].recovery + .06)
    }
  }
})

test('heel and toe rotation leaves the material at the contact point stationary', () => {
  for (let angle = -.15; angle < .65; angle += .002) {
    const before = footRoll(angle), after = footRoll(angle + .002), contact = soleContact(angle)
    const localX = contact[0] * Math.cos(angle) + contact[1] * Math.sin(angle)
    const localY = -contact[0] * Math.sin(angle) + contact[1] * Math.cos(angle)
    const beforeX = before[0] + contact[0]
    const afterX = after[0] + localX * Math.cos(angle + .002) - localY * Math.sin(angle + .002)
    assert.ok(Math.abs(afterX - beforeX) < .001, 'rolling must not drag the contacting surface')
  }
})

test('the forefoot stays flat and planted as the heel lifts, then relaxes in the air', () => {
  for (let angle = 0; angle <= .65; angle += .01) {
    const ankle = footRoll(angle), bend = toeBend(angle)
    assert.ok(Math.abs(angle + bend) < 1e-9, 'the forefoot counter-rotates at the ball of the foot')
    for (const point of [[2.2, 2.8], [4.5, 2.8], [6, 1.5]]) {
      const toe = footPoint(point, angle, bend, true)
      assert.ok(Math.abs(ankle[0] + toe[0] - point[0]) < 1e-9, 'the planted toes must not slide')
      assert.ok(Math.abs(ankle[1] + toe[1] - (point[1] - 2.8)) < 1e-9)
    }
    const heel = footPoint([-1.8, 2.8], angle, bend, false)
    if (angle > .1) assert.ok(ankle[1] + heel[1] < -.3, 'the heel can rise independently of the toes')
  }
  assert.ok(Math.abs(toeBend(.65, 0)) < Math.abs(toeBend(.65, 1)) * .25)
  assert.ok(toeBend(0) === 0)
})

test('stopping at different stride phases settles both feet into the same natural stance', () => {
  const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (const direction of [-1, 1]) for (const speed of [35, 125, 240, 350]) for (let phase = 0; phase < 24; phase++) {
    const p = createPlayer(); p.x = 1000
    for (let i = 0; i < 60 + phase * 3; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction * speed / 350 }, STEP, floor)
    while (p.vx) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    const stoppedX = p.x
    let previous = points(athletePose(p))
    for (let i = 0; i < 100; i++) {
      stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
      assert.equal(p.x, stoppedX, 'settling is animation, not additional player travel')
      const current = points(athletePose(p))
      for (let j = 0; j < current.length; j++) assert.ok(distance(previous[j], current[j]) < 3, 'rest pose must not snap')
      previous = current
    }
    for (const [i, foot] of p.footwork.feet.entries()) {
      assert.ok(foot.planted && foot.settle === null)
      assert.ok(Math.abs((foot.x - p.x) * direction - (i ? -2 : 2)) < .16, `wide final stance at speed ${speed}, phase ${phase}`)
      assert.equal(foot.angle, 0); assert.equal(foot.facing, direction)
    }
    const settled = athletePose(p)
    for (let i = 0; i < 30; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    assert.deepEqual(athletePose(p), settled, 'the resting figure must not keep shuffling')
  }
})

test('resuming movement interrupts a recovery step without teleporting the feet', () => {
  const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (const direction of [-1, 1]) for (const pause of [2, 7, 15, 25]) {
    const p = createPlayer(); p.x = 1000
    for (let i = 0; i < 91; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, floor)
    while (p.vx) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    for (let i = 0; i < pause; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    const before = athletePose(p)
    stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, floor)
    const after = athletePose(p)
    assert.ok(p.vx * direction > 0)
    for (const name of ['frontLeg', 'backLeg']) assert.ok(distance(before[name].end, after[name].end) < 2)
  }
})

test('resting near a platform edge keeps both recovery steps on the platform', () => {
  const floor = [{ x: 0, y: 620, w: 300, h: 400 }]
  for (const facing of [-1, 1]) {
    const p = createPlayer(); Object.assign(p, { x: 299, facing })
    for (let i = 0; i < 100; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    assert.ok(p.footwork.feet.every(foot => foot.planted && foot.x >= 0 && foot.x <= 300))
  }
})
