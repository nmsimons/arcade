import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { bodyIntersects, bodyPolygon, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'
import { robotHulls, robotPlatforms } from '../src/games/jumping/robotPhysics.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

function clear(run) {
  const p = run.player, barriers = [...run.terrain, ...run.mechanisms.map(mechanismShape)]
  const hull = bodyPolygon(p.x, p.y, p.crouching ? TUNING.crouchHeight : TUNING.height)
  for (const barrier of barriers) assert.equal(bodyIntersects(p.x, p.y, barrier), false, 'the player stays outside solid barriers')
  for (const prop of run.props) {
    const shape = prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)
    assert.equal(polygonIntersects(hull, shape, .002), false, 'the prop and player separate')
    for (const barrier of barriers) assert.equal(polygonIntersects(polygonPoints(shape), barrier, .05), false, 'the blocked prop stays outside terrain')
  }
}

for (const size of [80, 120, 160]) for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
  test(`pushing toward a ${size}-unit box from a ball keeps a reachable stance (${direction}, ${dt})`, () => {
    const level = blankTrial(), x = n => direction > 0 ? n : level.width - n
    level.spawn = { x: x(480), y: 840 }
    level.props = [{ kind: 'ball', x: x(480), y: 920, size: 80 },
      { kind: 'box', x: x(520 + size / 2), y: 920, size }]
    const run = createRun(level), p = run.player
    run.started = true; p.facing = direction
    for (let t = 0; t < 1; t += dt) stepRun(run, NEUTRAL_INPUT, dt)
    assert.equal(p.contacts.support.collider.prop.kind, 'ball', 'the player starts standing on the actual curved support')
    let supported = 0, loaded = 0
    for (let t = 0; t < 2; t += dt) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction }, dt)
      if (p.contacts?.support?.collider.prop?.kind !== 'ball') continue
      supported++
      const pose = athletePose(p)
      assert.ok(pose.shoulder[1] < pose.waist[1] - 1, 'the chest cannot fold below the waist to reach a low box face')
      assert.ok(Math.atan2(pose.shoulder[0] - pose.hip[0], pose.hip[1] - pose.shoulder[1]) < 1,
        'the supported torso retains a natural forward lean')
      if (p.pushing) assert.ok(p.pushing.height >= 20, 'an approach cannot reach down below the working hand band')
      if (p.contacts.push?.effort) {
        loaded++
        for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
          const palm = p.pushing.palms[i]
          assert.ok(Math.hypot(p.x + arm.hand[0] * p.facing - palm.x - palm.nx * 1.6,
            p.y + arm.hand[1] - palm.y - palm.ny * 1.6) < .5, 'a reachable tall box still receives the real working palms')
        }
      }
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
      }
    }
    assert.ok(supported > 3, 'held input actually exercises balance on the ball')
    if (size === 80) assert.equal(loaded, 0, 'a box top level with the footing is not a pushing face')
    if (size === 160) assert.ok(loaded > 3, 'curved support does not disable a legitimate push')
  })
}

for (const kind of ['ball', 'box']) for (const slope of [0, .3]) {
  test(`an incoming ${kind} cannot push the player through a gate on ${slope ? 'a slope' : 'flat ground'}`, () => {
    for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
      const level = blankTrial(), wall = 900, start = wall - direction * 30
      const surface = x => slope ? 700 + direction * slope * (x - 700) : 920
      if (slope) level.platforms = [{ x: 200, y: 400, w: 1200, h: 520,
        polygon: [[0, surface(200) - 400], [1200, surface(1400) - 400], [1200, 520], [0, 520]] }]
      level.mechanisms = [{ id: 'gate', kind: 'gate', x: wall - (direction < 0 ? 20 : 0), y: 350, w: 20, h: 570, travel: 570 }]
      level.spawn = { x: start, y: surface(start) }
      level.props = [{ kind, x: wall - direction * 190, y: surface(wall - direction * 190), size: 100 }]
      const run = createRun(level); run.started = true; run.props[0].vx = direction * 900
      let displaced = false
      for (let i = 0; i < Math.ceil(3 / dt); i++) {
        stepRun(run, NEUTRAL_INPUT, dt); clear(run)
        assert.ok((run.player.x - wall) * direction <= -12 + .001, 'the player remains on the original side of the closed gate')
        assert.equal(run.mechanisms[0].y, 350, 'the collision does not bypass the gate by opening it')
        displaced ||= (run.player.x - start) * direction > 2
      }
      assert.ok(displaced, 'the prop actually hits and moves the player before the gate stops them')
    }
  })
}

for (const kind of ['ball', 'box']) test(`a rising ${kind} cannot carry the player through a horizontal gate`, () => {
  const level = blankTrial()
  level.props = [{ kind, x: 740, y: 920, size: 80 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', orientation: 'horizontal', x: 650, y: 740, w: 180, h: 20, travel: 180 }]
  level.spawn = { x: 740, y: 840 }
  const run = createRun(level); run.started = true; run.player.grounded = true
  run.props[0].vy = -500
  let rose = false
  for (let i = 0; i < 180; i++) {
    stepRun(run, NEUTRAL_INPUT); clear(run)
    rose ||= run.player.y < 835
    assert.ok(run.player.y >= 760 + TUNING.height - .001, 'the rider stays beneath the closed gate')
  }
  assert.ok(rose, 'the support carries the player up before the ceiling blocks them')
})

test('a ball still pushes a player through open space', () => {
  const level = blankTrial(); level.spawn = { x: 800, y: 920 }
  level.props = [{ kind: 'ball', x: 650, y: 920, size: 100 }]
  const run = createRun(level); run.started = true; run.props[0].vx = 400
  for (let i = 0; i < 120; i++) { stepRun(run, NEUTRAL_INPUT); clear(run) }
  assert.ok(run.player.x > 900, 'an unobstructed impact still displaces the player')
})

test('moving toward a short box while a bot presses a ball behind the player keeps the torso continuous', () => {
  for (const direction of [-1, 1]) for (const reverse of [false, true]) {
    const x = value => direction === -1 ? value : 1200 - value
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 500,
      spawn: { x: x(650), y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: direction === -1 ? 400 : 600, y: 200, w: 200, h: 300 }],
      props: [{ kind: 'box', x: x(615), y: 500, size: 30 }, { kind: 'ball', x: x(668), y: 500, size: 30 }],
      robots: [{ x: x(710), y: 500, left: 300, right: 1000 }] }
    if (reverse) level.props.reverse()
    const run = createRun(level), p = run.player
    run.started = true; run.robots[0].facing = direction
    let previous, sliding = 0, bracing = 0
    // Settle under pressure, then hold toward the box, release, and try again.
    for (let i = 0; i < 660; i++) {
      const move = i >= 120 && i < 420 || i >= 480 ? direction : 0
      stepRun(run, { ...NEUTRAL_INPUT, move })
      const pose = athletePose(p), torso = [pose.hip, pose.shoulder, pose.head].map(point => [p.x + point[0] * p.facing, p.y + point[1]])
      if (i > 132 && previous) for (const [j, point] of torso.entries()) {
        assert.ok(Math.hypot(point[0] - previous[j][0], point[1] - previous[j][1]) < 3,
          `the drawn torso cannot hop between the box and ball: direction ${direction}, reverse ${reverse}, frame ${i}`)
      }
      if (p.sliding?.active) {
        sliding++
        assert.ok(p.sliding.angle * direction > .5, 'the slide follows the ball, never the box top')
      }
      bracing += Number(!!p.wallBrace?.active)
      assert.ok(Math.abs(p.x - x(642)) < 10, 'the player remains in the original gap')
      previous = torso
    }
    assert.ok(sliding > 120 && bracing > 120, 'both opposing contacts participate in the regression')
  }
})

for (const pinned of [false, true]) test(`a bot pushing a box cannot squeeze the player into ${pinned ? 'wall-blocked' : 'free'} balls`, () => {
  for (const direction of [-1, 1]) for (const reverse of [false, true]) {
    const level = blankTrial(), x = n => direction === 1 ? n : level.width - n
    level.spawn = { x: x(650), y: 920 }
    const wall = pinned ? 744 : 880
    level.platforms = [{ x: direction === 1 ? wall : x(wall) - 20, y: 600, w: 20, h: 320 }]
    level.robots = [{ x: x(450), y: 920, left: 200, right: 1600 }]
    level.props = [
      { kind: 'box', x: x(520), y: 920, size: 80 },
      { kind: 'ball', x: x(594), y: 920, size: 68 },
      { kind: 'ball', x: x(710), y: 920, size: 68 },
    ]
    if (reverse) level.props.reverse()
    const run = createRun(level); run.started = true; run.robots[0].facing = direction
    let lastX = run.player.x, lateTravel = 0
    const check = () => {
      clear(run)
      const hull = bodyPolygon(run.player.x, run.player.y, run.player.crouching ? TUNING.crouchHeight : TUNING.height)
      const shapes = run.props.map(b => b.kind === 'ball' ? ballShape(b) : boxShape(b))
      for (const [i, shape] of shapes.entries()) {
        for (const other of shapes.slice(i + 1)) assert.equal(polygonIntersects(polygonPoints(shape), other, .03), false, 'the shove keeps every prop separate')
        for (const botHull of robotHulls(run.robots[0])) assert.equal(polygonIntersects(botHull, shape, .03), false, 'the box cannot retreat inside the bot')
      }
      for (const shape of robotPlatforms(run.robots[0])) assert.equal(polygonIntersects(hull, shape, .002), false)
    }
    for (let i = 0; i < 360; i++) {
      stepRun(run, NEUTRAL_INPUT); check()
      if (i > 240) lateTravel += Math.abs(run.player.x - lastX)
      lastX = run.player.x
    }
    assert.ok((run.player.x - x(650)) * direction > 10, 'the incoming ball actually displaces the player before the gap fills')
    assert.ok(lateTravel < .01, `sustained pressure holds a stable position: ${lateTravel}`)
    assert.equal(run.player.grounded, true)
    // Collision resistance does not trap the controls. A normal jump press
    // can rise out of the gap while the bot is still pressing from behind.
    for (let i = 0; i < 24; i++) { stepRun(run, { ...NEUTRAL_INPUT, jump: true }); check() }
    let highest = run.player.y
    for (let i = 0; i < 72; i++) { stepRun(run, NEUTRAL_INPUT); check(); highest = Math.min(highest, run.player.y) }
    assert.ok(highest < level.floor - 68, 'the player can jump clear of the balls')
  }
})
