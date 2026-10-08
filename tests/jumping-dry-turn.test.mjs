import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING, respawn, gaitPose } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'
import { footPoint, FOOT_CONTACT } from '../src/games/jumping/footwork.ts'
import { LEDGE_CATCH_TIME } from '../src/games/jumping/ledge.ts'

const worldPoint = (p, a) => [p.x + a[0] * p.facing, p.y + a[1] * (p.inverted ? -1 : 1)]
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
function bones(pose) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
  }
}
function soles(p, pose) {
  if (!p.footwork) return
  for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) {
    if (!leg.planted) continue
    const foot = p.footwork.feet[i]
    assert.ok(foot.planted, 'visible support belongs to an actual contact')
    assert.ok(distance(worldPoint(p, leg.end), [foot.x, foot.y]) < 1e-5, `turn retains the actual ankle: ${JSON.stringify({root:leg.root,end:leg.end,foot,turn:p.dryTurn&&{time:p.dryTurn.time,target:p.dryTurn.target}})}`)
    // Compare every drawn material point against the unchanged contact motor,
    // including heel roll, toe bend and the original shoe facing.
    for (const point of FOOT_CONTACT) {
      const actual = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
      const expected = footPoint(point, foot.angle, leg.toeAngle * leg.footFacing)
      const drawn = worldPoint(p, [leg.end[0] + actual[0] * leg.footFacing, leg.end[1] + actual[1]])
      assert.ok(distance(drawn, [foot.x + expected[0] * foot.facing, foot.y + expected[1]]) < 1e-5, 'shoe material stays in the contact frame')
    }
  }
}

test('a full-speed reverse responds immediately while its head continues through a supported brake', () => {
  for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 500, y: 1400 }), floor = [{ x: -2000, y: 1400, w: 10000, h: 100 }]
    for (let i = 0; i < 90; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, floor)
    const before = worldPoint(p, athletePose(p).head)
    stepPlayer(p, { ...NEUTRAL_INPUT, move: -direction }, STEP, floor)
    assert.equal(p.facing, -direction, 'grip/contact intent changes immediately')
    assert.ok(Math.abs(p.vx - direction * (410 - 2000 * STEP)) < 1e-6, 'the original steering acceleration starts on this tick')
    assert.ok(distance(before, worldPoint(p, athletePose(p).head)) < 6, 'world head motion rejects the baseline 16-unit mirror')
    assert.equal(p.dryTurn.target, direction, 'visible orientation initially follows outgoing momentum')
    let previous = worldPoint(p, athletePose(p).head)
    for (let i = 0; i < 90; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: -direction }, STEP, floor)
      const pose = athletePose(p), head = worldPoint(p, pose.head)
      assert.ok(distance(previous, head) < 8, 'turn continuity includes ordinary root travel')
      bones(pose); soles(p, pose); previous = head
    }
    assert.equal(p.dryTurn, null, 'the rig returns to the ordinary contact gait')
    assert.equal(p.vx, -direction * 410)
  }
})

test('walking, partial input, repeated reversals and stop-turns retain their contacts on slopes and inverted support', () => {
  for (const direction of [-1, 1]) for (const slope of [-.3, 0, .3]) for (const speed of [.3, .6, 1]) for (const inverted of [false, true]) {
    const terrain = [{ x: -2000, y: 600, w: 6000, h: 1800, profile: [[0, 900 - 3000 * slope], [6000, 900 + 3000 * slope]] }]
    const p = createPlayer({ x: 1000, y: 1500 })
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    const floor = inverted ? terrain.map(mirrorPlatform) : terrain
    const step = move => stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, floor, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
    for (let i = 0; i < 120; i++) step(direction * speed)
    let previous = worldPoint(p, athletePose(p).head)
    for (const [frames, move] of [[60, -direction * speed], [2, direction], [2, -direction], [2, direction], [120, 0], [40, -direction]]) {
      for (let i = 0; i < frames; i++) {
        step(move)
        const pose = athletePose(p), head = worldPoint(p, pose.head)
        assert.ok(distance(previous, head) < 8, `head continuity at slope ${slope}, speed ${speed}, inverted ${inverted}: ${distance(previous, head)}`)
        bones(pose)
        if (!inverted) soles(p, pose)
        previous = head
      }
    }
  }
})

test('air reversals stay unsupported and a restart discards the preceding turn', () => {
  const p = createPlayer({ x: 500, y: 1400 }), floor = [{ x: -2000, y: 1400, w: 10000, h: 100 }]
  for (let i = 0; i < 90; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, floor)
  stepPlayer(p, { ...NEUTRAL_INPUT, move: 1, jump: true }, STEP, floor)
  for (let i = 0; i < 35; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: i < 12 ? -1 : 1 }, STEP, floor)
    const pose = athletePose(p)
    assert.equal(p.grounded, false)
    assert.equal(pose.frontLeg.planted || pose.backLeg.planted, false, 'air turning never creates a support')
    bones(pose)
  }
  respawn(p); assert.equal(p.dryTurn, null)
})

test('a ledge jump transfers out of the real grip while retaining outward impulse and fresh-press semantics', () => {
  for (const side of [-1, 1]) for (const inverted of [false, true]) {
    const p = createPlayer({ x: 400 - side * 14, y: 274 })
    Object.assign(p, { facing: side, grounded: false, coyote: 0, jumpHeld: true,
      hang: { edgeX: 400, edgeY: 200, side, time: LEDGE_CATCH_TIME, braced: true, caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, gait: null, ledgeReach: null } } })
    const terrain = [{ x: side === 1 ? 400 : 200, y: 200, w: 200, h: 400 }]
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    const floor = inverted ? terrain.map(mirrorPlatform) : terrain
    const step = jump => stepPlayer(p, { ...NEUTRAL_INPUT, move: side, jump }, STEP, floor, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
    step(true); assert.ok(p.hang, 'the held catch press is consumed')
    step(false); const before = worldPoint(p, athletePose(p).head)
    step(true)
    assert.equal(p.hang, null); assert.equal(p.vx, -side * 260)
    assert.ok(p.dryTurn?.departure); assert.equal(p.dryTurn.target, -side)
    assert.ok(distance(before, worldPoint(p, athletePose(p).head)) < 8, 'release starts from the hanging rig')
    const pose = athletePose(p); bones(pose)
    assert.equal(pose.frontLeg.planted || pose.backLeg.planted, false)
    for (let i = 0; i < 30; i++) {
      const rig = athletePose(p)
      const points = [[rig.head,6.2], ...[rig.hip,rig.waist,rig.shoulder].map(a => [a,2.8]),
        ...[rig.frontArm,rig.backArm].flatMap(arm => handOutline(arm).map(a => [a,0]))]
      for (const [a,radius] of points) {
        const [x,y] = worldPoint(p,a)
        assert.equal(pointInside(floor[0],x,y),false,'the release clears the real lip')
        assert.ok(nearestBoundary(floor[0],x,y).distance >= radius - .02)
      }
      bones(rig); step(i < 3)
    }
  }
})

test('turning into a real prop contact retains first-force palms and fixed support legs', () => {
  for (const side of [-1,1]) for (const kind of ['box','ball']) for (const size of [30,80]) {
    const level = blankTrial(); level.spawn = {x:540-side*(size/2+25.5),y:920}
    level.props = [{kind,x:540,y:920,size}]
    const run = createRun(level)
    Object.assign(run.player,{facing:-side,vx:-side*410,gait:gaitPose(-side*410)})
    let touched = 0
    for (let i=0;i<60;i++) {
      stepRun(run,{...NEUTRAL_INPUT,move:side})
      const p = run.player, pose = athletePose(p)
      bones(pose); soles(p,pose)
      if (!p.contacts.push?.collider.prop) continue
      touched++
      for (const [j,arm] of [pose.frontArm,pose.backArm].entries()) {
        const palm = p.pushing.palms[j]
        assert.ok(arm.hand,'the palm is present on the first force-bearing tick')
        assert.ok(distance(worldPoint(p,arm.hand),[palm.x+palm.nx*1.6,palm.y+palm.ny*1.6])<.001,JSON.stringify({side,kind,size,i,j,hand:worldPoint(p,arm.hand),palm,turn:!!p.dryTurn,shoulder:pose.shoulder}))
      }
      const head = worldPoint(p,pose.head)
      for (const solid of run.platforms) assert.ok(!pointInside(solid,...head) && nearestBoundary(solid,...head).distance >= 6.18, JSON.stringify({side,kind,size,i,head,solid,distance:nearestBoundary(solid,...head).distance,turn:!!p.dryTurn}))
    }
    assert.ok(touched>20,'the encounter actually applies the shove')
  }
})
