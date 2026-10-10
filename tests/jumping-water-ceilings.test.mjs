import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

const water = { id: 'w', x: 0, y: 300, w: 1800, h: 700, effect: 'water', power: 'always' }
const points = s => [s.hip, s.waist, s.shoulder, s.head,
  ...[s.frontArm, s.backArm, s.frontLeg, s.backLeg].flatMap(a => [a.root, a.joint, a.end])]
const fixture = kind => {
  const shelf = { x: 400, y: 500, w: 600, h: kind === 'concave' ? 400 : kind === 'slope' ? 100 : 50 }
  if (kind === 'concave') shelf.polygon = [[0, 0], [600, 0], [600, 50], [20, 50], [20, 400], [0, 400]]
  if (kind === 'slope') shelf.polygon = [[0, 0], [600, 0], [600, 100], [0, 50]]
  const prop = kind === 'box' || kind.startsWith('ball')
  const size = kind === 'ball40' ? 40 : kind === 'ball120' ? 120 : 80
  const run = createRun({ ...blankTrial(), spawn: { x: 700, y: 750 },
    platforms: prop ? [] : [shelf], props: prop ? [{ kind: kind.startsWith('ball') ? 'ball' : 'box', x: 700, y: 300 + size / 2, size }] : [],
    gravityPlates: [water], goal: { id: 'closed', x: 1500, y: 920, power: 'switched' } })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  return run
}

test('the loaded underside reach draws identically in the reflected gravity frame', () => {
  const run = fixture('shelf'), p = run.player
  for (let time = 0; time < 4.5; time += STEP) stepRun(run, { ...NEUTRAL_INPUT, climb: true }, STEP)
  assert.ok(p.waterMotion.ceiling.amount > .95)
  const pose = athletePose(p), original = structuredClone(p)
  mirrorPlayerState(p); p.inverted = true
  const reflected = structuredClone(p)
  assert.deepEqual(athletePose(p), pose, 'reflected world-space palms and normals return to the same local rig')
  assert.deepEqual(p, reflected, 'drawing does not change the underside contact')
  mirrorPlayerState(p); p.inverted = false
  assert.deepEqual(p, original)
})

for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) for (const kind of ['shelf', 'concave', 'slope', 'box', 'ball40', 'ball120']) {
  test(`ascending under ${kind} reaches with the hands and steers away continuously (${direction}, ${dt})`, () => {
    const run = fixture(kind), p = run.player; p.facing = direction
    let previous, braceFrames = 0, leadingTouch = false, releaseTime = Infinity
    const stages = [[4.5, { climb: true }], [.5, { climb: true, move: direction }],
      [.5, { climb: true, move: -direction }], [1.8, { climb: true, move: direction }], [.8, { move: direction }], [.5, { descend: true }]]
    for (const [seconds, intent] of stages) for (let time = 0; time < seconds; time += dt) {
      stepRun(run, { ...NEUTRAL_INPUT, ...intent }, dt)
      const pose = athletePose(p), current = points(pose).map(([x, y]) => [p.x + x * p.facing, p.y + y])
      releaseTime = p.waterMotion?.ceiling ? 0 : releaseTime + dt
      // Follow the approach, contact, and handoff into the next free stroke.
      // A floating prop can subsequently leave this interaction at the surface.
      if (previous && releaseTime < .35) for (const [i, point] of current.entries()) {
        const travel = Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1])
        assert.ok(travel < 600 * dt + .5, `joint ${i} stays continuous (${travel.toFixed(2)}, ${JSON.stringify(intent)})`)
      }
      previous = current
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
      }
      for (const b of p.terrain) {
        const x = p.x + pose.head[0] * p.facing, y = p.y + pose.head[1]
        assert.equal(pointInside(b, x, y), false)
        assert.ok(nearestBoundary(b, x, y).distance > 6.1, 'the head stays clear of the underside')
        for (const arm of [pose.frontArm, pose.backArm]) for (const point of handOutline(arm)) {
          const hx = p.x + point[0] * p.facing, hy = p.y + point[1]
          assert.equal(pointInside(b, hx, hy), false, 'the drawn palm stays outside solids')
        }
      }
      if (p.waterMotion?.ceiling?.amount > .8) {
        braceFrames++
        const collider = p.waterMotion.ceiling.collider, b = p.contacts.body.find(c => c.collider.id === collider)?.collider.platform
          ?? p.terrain.find(platform => platform.x === 400)
        if (b) for (const arm of [pose.frontArm, pose.backArm]) {
          const distance = Math.min(...handOutline(arm).map(([x, y]) => nearestBoundary(b, p.x + x * p.facing, p.y + y).distance))
          const headDistance = nearestBoundary(b, p.x + pose.head[0] * p.facing, p.y + pose.head[1]).distance - 6.2
          leadingTouch ||= distance < .4 && headDistance > 2
        }
        const snapshot = structuredClone(p)
        athletePose(p); assert.deepEqual(p, snapshot, 'the contact rig is read-only')
        mirrorPlayerState(p); mirrorPlayerState(p); assert.deepEqual(p, snapshot, 'overhead normals and palms survive gravity reflection')
      }
    }
    assert.ok(braceFrames > .2 / dt, 'the route includes sustained upward contact')
    assert.ok(leadingTouch, 'a palm meets the underside while the head remains comfortably below it')
    assert.equal(p.waterMotion.ceiling, undefined, 'diving away releases the overhead reach')
  })
}
