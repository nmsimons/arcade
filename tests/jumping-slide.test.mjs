import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { athleteCasters } from '../src/games/jumping/athleteShadow.ts'
import { nearestBoundary, pointInside, polygonPoints } from '../src/games/jumping/geometry.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { slideLevel } from './helpers/jumping-slide.mjs'

function trace(level, entry, steer, observe, jumpAt) {
  const run = createRun(level)
  let started = false, contact = -1, seen = 0, fast = 0
  for (let i = 0; i < 550; i++) {
    const p = run.player
    started ||= !level.gravityPlates || p.inverted && p.grounded
    const direction = level.spawn.x < level.width / 2 ? 1 : -1
    const move = !started ? 0 : contact < 0 ? direction * (entry === 'walk' ? 125 / 350 : 1)
      : steer === 'uphill' ? -direction : steer === 'downhill' ? direction : 0
    const jump = jumpAt !== undefined && contact >= 0 && i >= contact + jumpAt && i < contact + jumpAt + 3
    stepRun(run, { ...NEUTRAL_INPUT, move, climb: !started || i === 0, jump })
    if (p.sliding?.active && contact < 0) contact = i
    if (p.sliding?.active) {
      seen++
      if (Math.hypot(p.vx, p.vy) > 900) fast++
    }
    if (observe?.(p, i, run) === false) break
    if (contact >= 0 && !p.sliding && p.grounded) break
  }
  return { seen, fast }
}

test('a fresh jump responds during slide entry and automatic turning in both gravity frames', () => {
  for (const entry of ['walk', 'run']) for (const direction of [-1, 1]) for (const inverted of [false, true]) for (const jumpAt of [1, 20]) {
    let contact = -1, jumped = false
    trace(slideLevel(70, direction, inverted), entry, 'neutral', (p, i) => {
      if (p.sliding?.active && contact < 0) contact = i
      if (contact < 0 || i < contact + jumpAt) return
      if (i === contact + jumpAt) {
        assert.equal(p.grounded, false)
        assert.ok(p.vy * (inverted ? -1 : 1) < -200, 'fresh press launches on this physical tick')
        assert.equal(p.sliding?.active ?? false, false)
        jumped = true
      }
      if (i >= contact + jumpAt + 24) return false
    }, jumpAt)
    assert.ok(jumped, 'the normal entry actually receives a fresh jump during its presentation handoff')
  }
})

function rigPoints(p, pose) {
  return [...['hip', 'waist', 'shoulder', 'head'].map(name => [...pose[name], 0]),
    ...['frontArm', 'backArm', 'frontLeg', 'backLeg'].flatMap(name => [
      [...pose[name].joint, pose[name].jointDepth ?? 0], [...pose[name].end, pose[name].endDepth ?? 0],
    ])].map(([x, y, z]) => [x * p.facing, y * (p.inverted ? -1 : 1), z])
}

for (const degrees of [46.5, 55, 70]) for (const entry of ['walk', 'run']) {
  test(`${entry} entry and automatic ${degrees}° brace turn transfer the actual outgoing rig smoothly`, () => {
    for (const direction of [-1, 1]) for (const inverted of [false, true]) for (const steer of ['neutral', 'uphill', 'downhill']) {
      const level = slideLevel(degrees, direction, inverted)
      let previous, contact = -1, samples = 0, handoff = false
      trace(level, entry, steer, (p, i) => {
        const pose = athletePose(p), points = rigPoints(p, pose)
        if (p.sliding?.active && contact < 0) contact = i
        if (contact >= 0) {
          if (i > contact + 50) return false
          const max = Math.max(...points.map((point, k) => Math.hypot(...point.map((v, axis) => v - previous[k][axis]))))
          assert.ok(max <= 5, `${degrees}° ${entry} ${direction} ${inverted} ${steer}: rig changed ${max} units at ${i}`)
          handoff ||= !!p.slideEntry
          if (i % 2 === 0) for (const shape of athleteCasters(p)) for (const [x, y] of polygonPoints(shape)) {
            if (pointInside(level.platforms[0], x, y)) assert.ok(nearestBoundary(level.platforms[0], x, y).distance <= .2,
              `outgoing native skin must remain clear at ${i}, (${x},${y})`)
          }
          for (const name of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) {
            const limb = pose[name], leg = name.endsWith('Leg'), jointZ = limb.jointDepth ?? 0, endZ = limb.endDepth ?? 0
            assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], jointZ) - (leg ? 15 : 10)) < 1e-6)
            assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], endZ - jointZ) - (leg ? 14.5 : 9)) < 1e-6)
            if (leg) {
              const dot = (limb.root[0] - limb.joint[0]) * (limb.end[0] - limb.joint[0])
                + (limb.root[1] - limb.joint[1]) * (limb.end[1] - limb.joint[1]) - jointZ * (endZ - jointZ)
              assert.ok(Math.acos(Math.max(-1, Math.min(1, dot / (15 * 14.5)))) >= Math.PI / 4 - 1e-6,
                'unloading and turning retain safe knee opening')
            }
          }
          samples++
        }
        previous = points
      })
      assert.ok(handoff && samples > 40, 'normal controls must witness both entry and the complete turn window')
    }
  })
}

for (const degrees of [46.5, 55, 70]) for (const direction of [-1, 1]) for (const inverted of [false, true]) {
  test(`normal ${degrees}° slide preserves bones, soles and visible terrain clearance (${direction}, ${inverted ? 'inverted' : 'down'})`, () => {
    const level = slideLevel(degrees, direction, inverted)
    let depth = false, contactSamples = 0
    const { seen, fast } = trace(level, 'run', 'neutral', (p, i) => {
      if (!p.sliding) return
      const before = i % 10 === 0 ? structuredClone(p) : null, pose = athletePose(p)
      for (const name of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) {
        const limb = pose[name], leg = name.endsWith('Leg'), jointZ = limb.jointDepth ?? 0, endZ = limb.endDepth ?? 0
        const upper = Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], jointZ)
        const lower = Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], endZ - jointZ)
        assert.ok(Math.abs(upper - (leg ? 15 : 10)) < 1e-6, `${name} upper length at ${i}`)
        assert.ok(Math.abs(lower - (leg ? 14.5 : 9)) < 1e-6, `${name} lower length at ${i}`)
        depth ||= leg && jointZ > 1
      }
      if (i % 2 === 0) for (const shape of athleteCasters(p)) for (const [x, y] of polygonPoints(shape)) {
        if (pointInside(level.platforms[0], x, y)) assert.ok(nearestBoundary(level.platforms[0], x, y).distance <= .2,
          `native silhouette enters ${degrees}° terrain at frame ${i}, (${x},${y})`)
      }
      // Examine the real straight face, away from the plateau/landing corners.
      const x = direction > 0 ? p.x : level.width - p.x
      if (p.sliding.amount === 1 && x > 380 && x < 900) {
        for (const leg of [pose.frontLeg, pose.backLeg]) {
          const gaps = FOOT_CONTACT.map(point => {
            const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
            return nearestBoundary(level.platforms[0], p.x + (leg.end[0] + sole[0] * leg.footFacing) * p.facing,
              p.y + (leg.end[1] + sole[1]) * (inverted ? -1 : 1)).distance
          })
          assert.ok(Math.min(...gaps) < .06, `sliding sole must retain its real slope contact at ${i}`)
        }
        contactSamples++
      }
      if (before) assert.deepEqual(p, before, 'drawing and clearance queries remain read-only, including reflection')
    })
    assert.ok(seen > 100 && fast > 10 && contactSamples > 30, 'the normal run spans the complete fast slide')
    if (degrees === 70) assert.ok(depth, 'the uphill knee folds through depth instead of entering the face')
  })
}

test('near-limit grippable walking stays supported in both directions and gravity frames', () => {
  for (const direction of [-1, 1]) for (const inverted of [false, true]) {
    let slope = 0
    const { seen } = trace(slideLevel(46.3, direction, inverted), 'walk', 'downhill', p => {
      const x = direction > 0 ? p.x : 1800 - p.x
      if (x > 380 && x < 900) { assert.ok(p.grounded && !p.sliding?.active); slope++ }
    })
    assert.equal(seen, 0); assert.ok(slope > 100)
  }
})

test('slide presentation is read-only during uphill and downhill intent at walking and running entries', () => {
  for (const steer of ['uphill', 'downhill']) for (const entry of ['walk', 'run']) for (const direction of [-1, 1]) {
    const level = slideLevel(55, direction), actual = [], expected = []
    const outcome = trace(level, entry, steer, p => {
      if (p.sliding) { athletePose(p); athleteCasters(p) }
      actual.push([p.x, p.y, p.vx, p.vy, p.grounded, p.sliding?.angle, p.sliding?.amount])
    })
    trace(level, entry, steer, p => expected.push([p.x, p.y, p.vx, p.vy, p.grounded, p.sliding?.angle, p.sliding?.amount]))
    assert.deepEqual(actual, expected, 'additional render/debug queries cannot alter the movement trace')
    assert.ok(outcome.seen > 100 && outcome.fast > 10)
  }
})

test('abrupt physical braking at a landing corner unloads the slide arms gradually', () => {
  for (const inverted of [false, true]) {
    let previous, previousPose, checked = false
    trace(slideLevel(70, 1, inverted), 'run', 'neutral', p => {
      const speed = Math.hypot(p.vx, p.vy), pose = athletePose(p)
      if (previous?.speed > 900 && speed < 200 && p.sliding?.active) {
        assert.ok(Math.abs(p.sliding.balanceSpeed) > 900, 'presentation retains load through the collision instead of following the velocity discontinuity')
        assert.ok(Math.abs(p.sliding.balanceSpeed) < previous.balanceSpeed, 'the balance response begins unloading immediately')
        const a = previousPose.frontArm, b = pose.frontArm
        assert.ok(Math.hypot(...b.end.map((v, i) => (v - b.root[i]) - (a.end[i] - a.root[i]))) < 4,
          'the raised forearm cannot snap back to a hanging arm relative to its moving shoulder')
        checked = true
      }
      previous = { speed, balanceSpeed: Math.abs(p.sliding?.balanceSpeed ?? 0) }; previousPose = pose
    })
    assert.ok(checked, 'normal controls reach the abrupt landing-corner brake')
  }
})
