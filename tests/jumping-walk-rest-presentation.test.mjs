import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, gaitPose, STEP, TUNING } from '../src/games/jumping/model.ts'
import { footPoint, FOOT_BALL, FOOT_CONTACT, strideProfile } from '../src/games/jumping/footwork.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const elbowBend = arm => Math.acos(Math.max(-1, Math.min(1,
  ((arm.joint[0] - arm.root[0]) * (arm.end[0] - arm.joint[0])
    + (arm.joint[1] - arm.root[1]) * (arm.end[1] - arm.joint[1]))
    / (distance(arm.root, arm.joint) * distance(arm.joint, arm.end)))))

test('precision walking stays a walk and rising analog speed promptly becomes a jog', () => {
  assert.equal(gaitPose(TUNING.walkSpeed).run, 0)
  assert.ok(strideProfile(gaitPose(150).run).duty > .5, 'brisk walking retains overlapping foot support')
  assert.ok(strideProfile(gaitPose(180).run).duty < .5, 'a slow jog introduces a brief flight phase')
  assert.ok(gaitPose(240).run > .7, 'most of the middle analog range no longer uses a walking stride')
  assert.equal(gaitPose(TUNING.runSpeed).run, 1)
})

test('resolved jogging travel lengthens steps while preserving the full-speed running stride', () => {
  const floor = [{ x: -4000, y: 900, w: 8000, h: 100 }]
  for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) for (const speed of [180, 210, 240, TUNING.runSpeed]) {
    const p = createPlayer({ x: 0, y: 900 }), input = { ...NEUTRAL_INPUT, move: direction * speed / TUNING.runSpeed }
    for (let time = 0; time < 1 - dt / 2; time += dt) stepPlayer(p, input, dt, floor)
    let previous = p.footwork.feet.map(foot => foot.planted), landings = 0, flight = 0, separation = 0, samples = 0
    const startX = p.x
    for (let time = 0; time < 4 - dt / 2; time += dt) {
      stepPlayer(p, input, dt, floor)
      const pose = athletePose(p), feet = p.footwork.feet
      landings += feet.filter((foot, i) => foot.planted && !previous[i]).length
      flight += Number(feet.every(foot => !foot.planted)); samples++
      separation = Math.max(separation, Math.abs(pose.frontLeg.end[0] - pose.backLeg.end[0]))
      previous = feet.map(foot => foot.planted)
    }
    const context = `${speed} units/s, ${direction}, ${Math.round(1 / dt)} Hz`
    if (speed === TUNING.runSpeed) {
      assert.ok(landings >= 30 && landings <= 33, `${context}: preserve the established running cadence, got ${landings / 4}`)
      assert.ok(separation > 38 && separation < 42, `${context}: preserve the established full-speed reach`)
    } else {
      assert.ok(landings >= 10 && landings <= 23, `${context}: a jog stays below six steps per second, got ${landings / 4}`)
      assert.ok(separation > 28, `${context}: the drawn legs open into a longer stride`)
      assert.ok(separation < 42, `${context}: jogging stays within the original running reach`)
    }
    assert.ok(Math.abs(p.x - startX - direction * speed * 4) < .01, `${context}: stride changes preserve motor travel`)
    assert.ok(flight / samples > .08, `${context}: both feet visibly leave support between steps`)
  }
})

test('walking and running arms reach behind the torso while the opposite arm folds forward', () => {
  for (const speed of [125, 410]) {
    const run = createRun({ ...blankTrial(), width: 4000, height: 1000, floor: 900,
      entrance: { x: 1500, y: 900 }, goal: { x: 3900, y: 900 } })
    let rearReach = 0, frontReach = 0
    for (let tick = 0; tick < 360; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: speed / TUNING.runSpeed })
      if (tick < 120) continue
      const pose = athletePose(run.player)
      for (const arm of [pose.frontArm, pose.backArm]) {
        rearReach = Math.max(rearReach, arm.root[0] - arm.end[0])
        frontReach = Math.max(frontReach, arm.end[0] - arm.root[0])
      }
    }
    assert.ok(rearReach > (speed === 125 ? 8 : 14), 'the free rearward swing is readable in both gaits')
    assert.ok(frontReach > (speed === 125 ? 9 : 8), 'the opposite arm still travels forward')
  }
})

test('slow walking carries the chest forward and settles into soft elbows with fixed feet', () => {
  for (const direction of [-1, 1]) for (const gravity of [-1, 1]) {
    const level = { ...blankTrial(), width: 2400, height: 1000, floor: 900,
      entrance: { x: 1200, y: gravity === 1 ? 900 : 100 }, goal: { x: 2300, y: 900 },
      platforms: gravity === 1 ? [] : [{ x: 0, y: 0, w: 2400, h: 100 }],
      gravityPlates: gravity === 1 ? [] : [{ id: 'ceiling', x: 0, y: 0, w: 2400, h: 1000, gravity: -1, power: 'always' }] }
    const run = createRun(level), p = run.player
    // Use the real partial movement command that selects the precision walk.
    for (let tick = 0; tick < 240; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction * 125 / 410 })
      if (tick < 120) continue
      const pose = athletePose(p)
      assert.ok(p.grounded && p.footwork.feet.some(foot => foot.planted))
      assert.ok(pose.shoulder[0] - pose.hip[0] > 1.5, 'every walking phase has a modest forward chest pitch')
      assert.ok(pose.shoulder[0] - pose.hip[0] < 3, 'precision walking does not borrow the sprint lean')
    }
    for (let tick = 0; tick < 360; tick++) stepRun(run, NEUTRAL_INPUT)
    const settled = athletePose(p), anchors = p.footwork.feet.map(foot => [foot.x, foot.y])
    for (const arm of [settled.frontArm, settled.backArm]) {
      assert.ok(elbowBend(arm) > .2 && elbowBend(arm) < .4, 'idle elbows bend softly, without a held working pose')
      assert.ok(Math.abs(distance(arm.root, arm.joint) - 10) < 1e-6)
      assert.ok(Math.abs(distance(arm.joint, arm.end) - 9) < 1e-6)
    }
    assert.ok(distance(settled.frontArm.end, settled.backArm.end) > 6, 'quiet hands remain separate')
    assert.ok(Math.abs(settled.shoulder[0] - settled.hip[0]) < .01, 'the walk lean relaxes at rest')
    for (let tick = 0; tick < 240; tick++) stepRun(run, NEUTRAL_INPUT)
    assert.deepEqual(p.footwork.feet.map(foot => [foot.x, foot.y]), anchors)
    assert.deepEqual(athletePose(p), settled, 'softening the arms adds no idle shuffling')
  }
})

test('walking toe-off visibly lifts each heel while the loaded forefoot stays on its footprint', () => {
  for (const direction of [-1, 1]) for (const speed of [35, 80, 125]) {
    const run = createRun({ ...blankTrial(), width: 3000, height: 1000, floor: 900,
      entrance: { x: 1500, y: 900 }, goal: { x: 2900, y: 900 } })
    const lifted = [0, 0]
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction * speed / 410 })
      if (tick < 120) continue
      const p = run.player, pose = athletePose(p)
      for (const [index, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        if (!leg.planted || leg.footAngle < .42) continue
        lifted[index]++
        const angle = leg.footAngle * leg.footFacing, bend = leg.toeAngle * leg.footFacing
        const heel = footPoint([-1.8, 2.8], angle, bend), ball = footPoint(FOOT_BALL, angle, bend)
        const toe = footPoint([4.5, 2.8], angle, bend)
        assert.ok(ball[1] - heel[1] > 1.6, 'heel rise is separate from the grounded forefoot')
        assert.ok(Math.abs(toe[1] - ball[1]) < 1e-6, 'the loaded toe counter-rotates and stays flat')
        const foot = p.footwork.feet[index]
        assert.ok(Math.abs(p.x + (leg.end[0] + ball[0] * leg.footFacing) * p.facing
          - foot.anchorX - FOOT_BALL[0] * p.facing) < 1e-6, 'the ball of the foot does not skid')
        assert.ok(Math.abs(p.y + leg.end[1] + toe[1] - run.level.floor) < 1e-6)
      }
    }
    assert.ok(lifted.every(frames => frames > 8), 'both walking feet show repeated supported heel lift')
  }
})

test('the free walking toes dip toward the ground and straighten before landing', () => {
  const floor = [{ x: -4000, y: 900, w: 8000, h: 100 }]
  for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 0, y: 900 }), input = { ...NEUTRAL_INPUT, move: direction * TUNING.walkSpeed / TUNING.runSpeed }
    for (let time = 0; time < 1 - dt / 2; time += dt) stepPlayer(p, input, dt, floor)
    const dips = [0, 0], forwardDip = [false, false], relaxed = [0, 0]
    for (let time = 0; time < 2 - dt / 2; time += dt) {
      stepPlayer(p, input, dt, floor)
      const pose = athletePose(p)
      for (const [index, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        assert.ok(leg.footAngle < .65, 'toe flex does not add a larger ankle roll')
        if (leg.planted) continue
        const clearance = -leg.end[1] - 2.8
        if (clearance > 6) dips[index] = Math.max(dips[index], leg.toeAngle)
        const ball = footPoint(FOOT_BALL, leg.footAngle, leg.toeAngle), tip = footPoint([4.5, 2.8], leg.footAngle, leg.toeAngle)
        if (leg.end[0] > 0 && leg.end[0] < 9 && leg.footAngle > .1 && tip[1] - ball[1] > .35) forwardDip[index] = true
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle, leg.toeAngle)
          assert.ok(p.y + leg.end[1] + sole[1] <= 900 + .02, 'the dipping free toe stays above the floor')
        }
        if (leg.end[0] > 9 && leg.footAngle < -.05) {
          relaxed[index]++
          assert.ok(Math.abs(leg.toeAngle) < .04, 'the toe tip straightens as the shoe reaches forward')
        }
        const foot = p.footwork.feet[index]
        assert.ok(distance([p.x + leg.end[0] * direction, p.y + leg.end[1]], [foot.x, foot.y]) < .01,
          'toe flex retains the original ankle trajectory')
      }
    }
    assert.ok(dips.every(dip => dip > .15 && dip < .35), 'both free toe tips curl down during the forward swing')
    assert.ok(forwardDip.every(Boolean), 'the whole front shoe tips down while it travels ahead of the hips')
    assert.ok(relaxed.every(frames => frames > 1), 'both toes repeatedly relax before contact')
  }
})

test('precision walking visibly transfers weight through the body without a larger step', () => {
  const floor = [{ x: -4000, y: 900, w: 8000, h: 100 }]
  for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 0, y: 900 }), input = { ...NEUTRAL_INPUT, move: direction * TUNING.walkSpeed / TUNING.runSpeed }
    for (let time = 0; time < 1 - dt / 2; time += dt) stepPlayer(p, input, dt, floor)
    const startX = p.x, hips = [], heads = [], recovered = [], elbows = []
    let previous = p.footwork.feet.map(foot => foot.planted), landings = 0, lift = 0
    for (let time = 0; time < 4 - dt / 2; time += dt) {
      stepPlayer(p, input, dt, floor)
      const pose = athletePose(p), feet = p.footwork.feet
      assert.ok(feet.some(foot => foot.planted), 'the walk always has real support')
      hips.push(pose.hip[1]); heads.push(pose.head[1])
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const clearance = -leg.end[1] - 2.8
        lift = Math.max(lift, clearance)
        if (!leg.planted && clearance > 6.5) recovered.push(leg.footAngle)
      }
      for (const arm of [pose.frontArm, pose.backArm]) elbows.push(elbowBend(arm))
      landings += feet.filter((foot, i) => foot.planted && !previous[i]).length
      previous = feet.map(foot => foot.planted)
    }
    const hipTravel = Math.max(...hips) - Math.min(...hips), headTravel = Math.max(...heads) - Math.min(...heads)
    assert.ok(hipTravel > 2.5 && hipTravel < 4, 'the supporting knee visibly compresses and extends without a large bounce')
    assert.ok(headTravel > 3 && headTravel < 4, 'the head rise and fall survives scaling to the gameplay view')
    assert.ok(Math.abs(headTravel - hipTravel) < .5, 'the head follows the weight transfer through the body')
    assert.ok(recovered.length > 10 && Math.max(...recovered) < .6, 'the recovering shin does not force the shoe to point steeply down')
    assert.ok(lift > 6.5 && lift < 8, 'the original low foot swing is preserved')
    assert.ok(Math.max(...elbows) - Math.min(...elbows) > .2 && Math.max(...elbows) < .55, 'the elbows soften slightly through the swing')
    assert.equal(landings, 25, 'the established walking cadence is preserved')
    assert.ok(Math.abs(p.x - startX - direction * TUNING.walkSpeed * 4) < .01, 'walking speed is unchanged')
  }
})

test('the walking head follows the supporting knee from recoil to the high point', () => {
  for (const direction of [-1, 1]) {
    const poses = [0, .125, .25, .375].map(phase => athletePose({ ...createPlayer({ x: 0, y: 900 }),
      grounded: true, vx: direction * TUNING.walkSpeed, facing: direction, gait: gaitPose(TUNING.walkSpeed),
      stride: direction * phase * Math.PI * 2 }))
    const [contact, recoil, passing, highPoint] = poses
    assert.ok(recoil.hip[1] > contact.hip[1] + .4, 'the body absorbs weight after heel contact')
    assert.ok(passing.hip[1] < recoil.hip[1] - .4, 'the body rises as the free foot passes underneath')
    assert.ok(highPoint.hip[1] < passing.hip[1] - .4, 'late support has the highest pelvis')
    assert.ok(recoil.head[1] > contact.head[1] + 1, 'the head visibly lowers with the knee after contact')
    assert.ok(highPoint.head[1] < passing.head[1] - 1, 'the head visibly rises as the supporting leg extends')
    const supportReach = pose => distance(pose.frontLeg.root, pose.frontLeg.end)
    assert.ok(supportReach(passing) > supportReach(recoil) + 1, 'the rise corresponds to extension of the real supporting knee')
    assert.ok(contact.frontLeg.planted && contact.frontLeg.footAngle < -.15, 'the leading shoe receives weight on its heel')
    assert.ok(contact.backLeg.planted && contact.backLeg.footAngle > .45, 'the trailing heel peels up over the toes')
    assert.ok(contact.hip[1] - highPoint.hip[1] < 2, 'the rise remains restrained')
  }
})
