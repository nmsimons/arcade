import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { gaitPose, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { advanceFootwork, FOOT_CONTACT, footPoint, footRoll, soleContact, toeBend } from '../src/games/jumping/footwork.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
const worldFoot = (p, leg) => {
  const angle = leg.footAngle * leg.footFacing, facing = leg.footFacing * p.facing
  const x = p.x + leg.end[0] * p.facing, y = p.y + leg.end[1]
  return { planted: leg.planted, anchor: x - footRoll(angle)[0] * facing, ground: y + soleContact(angle, leg.toeAngle * leg.footFacing)[1], angle, facing }
}

test('braced pushing steps follow distance travelled and stop when blocked', () => {
  const terrain = [{ x: 0, y: 320, w: 2600, h: 780, profile: [[0,780],[2600,0]] }]
  const counts = []
  for (const speed of [2, 12, 60]) {
    const p = createPlayer(); p.x = 800; p.y = 1100 - p.x * .3; p.gait = gaitPose(speed)
    p.pushing = { wallX: p.x + 25.5, direction: 1, amount: 1, effort: 1 }
    let steps = 0, planted = [true,true]
    for (let frame=0;frame<1200;frame++) {
      const oldX=p.x; p.x+=speed*STEP; p.y=1100-p.x*.3; p.pushing.wallX=p.x+25.5
      advanceFootwork(p,STEP,oldX,terrain)
      const feet=p.footwork.feet
      steps+=feet.filter((foot,i)=>!foot.planted&&planted[i]).length
      assert.ok(feet.some(foot=>foot.planted),'at least one foot supports a slow push')
      planted=feet.map(foot=>foot.planted)
    }
    counts.push(steps)
    for(let frame=0;frame<120;frame++)advanceFootwork(p,STEP,p.x,terrain)
    const stopped=p.footwork.feet.map(foot=>[foot.x,foot.y])
    for(let frame=0;frame<240;frame++)advanceFootwork(p,STEP,p.x,terrain)
    assert.deepEqual(p.footwork.feet.map(foot=>[foot.x,foot.y]),stopped,'blocked pushing keeps the feet planted')
  }
  assert.ok(counts[0]<6,`a creeping push should not churn: ${counts}`)
  assert.ok(counts[1]>counts[0]*2 && counts[2]>counts[1]*2,`steps scale with travel: ${counts}`)
})

test('crouch walking uses a full pushing stride with low feet and grounded knees', () => {
  for (const direction of [-1, 1]) for (const speed of [50, 125]) for (const slope of [-.3, 0, .3]) {
    const surface = x => slope < 0 ? 1100 + x * slope : slope > 0 ? 320 + x * slope : 620
    const floor = { x: 0, y: 320, w: 2600, h: 780, profile: [[0, surface(0) - 320], [2600, surface(2600) - 320]] }
    const p = createPlayer(); p.x = 1300; p.y = surface(p.x)
    let steps = 0, planted = [true, true]
    for (let frame = 0; frame < 300; frame++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction * speed / 125, descend: true }, STEP, [floor])
      const feet = p.footwork.feet, pose = athletePose(p)
      steps += feet.filter((foot, i) => !foot.planted && planted[i]).length
      planted = feet.map(foot => foot.planted)
      if (p.crouch < 1) continue
      assert.ok(feet.some(foot => foot.planted), 'one foot supports the crouched body throughout each step')
      for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        assert.ok(feet[i].groundY - feet[i].y < 6, 'the ankle stays close to its local ground surface')
        assert.ok(Math.abs(leg.footAngle - feet[i].groundAngle * direction) < .4, 'the foot does not kick up behind the calf')
        assert.ok(p.y + leg.joint[1] < surface(p.x + leg.joint[0] * direction) - 1.5, 'bent knees stay above the floor')
        assert.ok(Math.abs(Math.hypot(leg.joint[0] - leg.root[0], leg.joint[1] - leg.root[1], leg.jointDepth ?? 0) - 15) < .01)
        assert.ok(Math.abs(Math.hypot(leg.joint[0] - leg.end[0], leg.joint[1] - leg.end[1], leg.jointDepth ?? 0) - 14.5) < .01)
        if (!slope) assert.ok(leg.end[1] > pose.hip[1], 'the ankle stays below the lowered hips')
      }
    }
    assert.ok(steps > 3, 'the check spans multiple alternating steps')
    assert.ok(Math.abs(p.x - 1300) / steps > 10, 'crouch steps cover ground instead of rapidly shuffling')
    for (let i = 0; i < 120; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, [floor])
    assert.ok(p.footwork.feet.every(foot => foot.planted))
    const stopped = athletePose(p)
    for (let i = 0; i < 60; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, [floor])
    assert.deepEqual(athletePose(p), stopped, 'stopping keeps the crouched feet still')
  }
})

test('expressive strides keep limb lengths, safe knee bends, and continuous poses', () => {
  for (const vx of [0, 70, 125, 240, 350]) {
    let previous
    for (let frame = 0; frame <= 1000; frame++) {
      const p = { ...createPlayer(), vx, stride: frame / 1000 * Math.PI * 2 }
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

test('rendered feet roll around a fixed footprint through speed changes, braking, turns', () => {
  const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
  for (const direction of [1, -1]) {
    const p = createPlayer(); p.x = 1300
    let previous, comparisons = 0, contacts = 0
    const sequence = [[.6, .35], [.8, 1], [.4, 1], [.8, 0], [.5, .5], [.6, -1], [.8, 0]]
    for (const [duration, move] of sequence) for (let t = 0; t < duration - STEP / 2; t += STEP) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: move * direction }, STEP, floor)
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

test('sliding keeps an upright torso, relaxed asymmetric arms, and both soles on the slope', () => {
  for (const facing of [-1, 1]) for (const degrees of [-70, -55, -25, 0, 25, 55, 70]) for (const speed of [-400, -15, 0, 15, 120, 400]) {
    const angle = degrees * Math.PI / 180, tx = Math.cos(angle), ty = Math.sin(angle)
    const p = { ...createPlayer(), x: 0, y: 0, vx: speed * tx, vy: speed * ty, facing, grounded: false,
      sliding: { angle, amount: 1, time: 1, active: true, x: 0, y: 0 } }
    const pose = athletePose(p)
    assert.ok(Math.abs(pose.shoulder[0] - pose.hip[0]) < 4 && pose.hip[1] - pose.shoulder[1] > 16)
    for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
      const leg = 'footAngle' in limb
      assert.ok(Math.abs(distance(limb.root, limb.joint) - (leg ? 15 : 10)) < 1e-6)
      assert.ok(Math.abs(distance(limb.joint, limb.end) - (leg ? 14.5 : 9)) < 1e-6)
      if (!leg) {
        assert.ok(limb.joint[1] > pose.shoulder[1] + 9, 'elbows stay down beside the torso')
        assert.ok(limb.end[1] > pose.hip[1] - 3, 'hands stay low instead of spreading at chest height')
      } else {
        const clearance = Math.min(...FOOT_CONTACT.map(point => {
          const sole = footPoint(point, limb.footAngle, limb.toeAngle)
          return (limb.end[0] + sole[0]) * facing * ty - (limb.end[1] + sole[1]) * tx
        }))
        assert.ok(clearance > -.01 && clearance < .01, 'each sliding sole stays against the supporting plane')
      }
    }
    assert.ok(distance(pose.frontArm.end, pose.backArm.end) > 2)
  }
})

test('the sliding pose stays continuous through slow reversals and is still at zero slip', () => {
  const p = { ...createPlayer(), x: 0, y: 0, grounded: false,
    sliding: { angle: .9, amount: 1, time: 1, active: true, x: 0, y: 0 } }
  let previous
  for (let speed = -5; speed <= 5; speed += .1) {
    p.vx = speed * Math.cos(.9); p.vy = speed * Math.sin(.9)
    const current = points(athletePose(p))
    if (previous) for (let i = 0; i < current.length; i++) assert.ok(distance(current[i], previous[i]) < .02)
    previous = current
  }
  p.vx = 0; p.vy = 0
  const stopped = athletePose(p)
  p.sliding.time += 1
  assert.deepEqual(athletePose(p), stopped)
})

test('brief sliding contacts blend the falling rig and foot clearance instead of switching them', () => {
  for (const facing of [-1, 1]) for (const braced of [false, true]) {
    const p = { ...createPlayer(), x: 0, y: 0, grounded: false, facing, vx: 20 * facing, vy: 70, gait: gaitPose(20, true),
      wallBrace: braced ? { wallX: 12 * facing, direction: facing, active: true, hands: [.6, .5], feet: [.7, .7] } : null }
    const free = athletePose(p)
    p.sliding = { angle: facing * 1.05, amount: 0, time: .4, active: true, x: -8 * facing, y: -5 }
    assert.deepEqual(athletePose(p), free, 'a zero-weight slide leaves the current pose intact, including a wall brace')
    p.sliding.amount = STEP / .12
    const touching = athletePose(p)
    p.sliding.active = false
    assert.deepEqual(athletePose(p), touching, 'the contact flag does not bypass the presentation blend')
    for (const [i, point] of points(touching).entries()) assert.ok(distance(point, points(free)[i]) < 1,
      'one tick of contact cannot snap the torso, hands or feet to a different rig')
  }
})
