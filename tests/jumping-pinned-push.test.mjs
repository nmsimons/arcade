import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, playerState } from '../src/games/jumping/model.ts'
import { presentedAthletePose, resolveAthletePose } from '../src/games/jumping/athletePose.ts'
import { rigViolations } from '../src/games/jumping/athleteLimits.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const posePoints = pose => [pose.head, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end]

// Freight's lower pile (#106): a small ball rests on a heavy crate beside a box
// that backs onto the wall. The robot stands near the crate's end and pushes the
// ball, which cannot move. Its hull's shoulder corner meets the ball above the
// ball's center, an upward-facing contact far too steep to stand on.
function pinnedBallLevel(direction, ball = 30) {
  const level = blankTrial(), wall = direction < 0 ? 0 : level.width
  const at = offset => wall - direction * offset
  level.props = [
    { kind: 'box', x: at(65), y: level.floor, size: 130, weight: 'heavy' },
    { kind: 'box', x: at(40), y: level.floor - 130, size: 80 },
    { kind: 'ball', x: at(81 + ball / 2), y: level.floor - 130, size: ball },
  ]
  level.entrance = { x: level.width / 2, y: level.floor }
  return { level, start: at(122), top: level.floor - 130 }
}

test('pushing a ball pinned on a crate near its end holds one steady braced push (#106)', () => {
  for (const direction of [-1, 1]) for (const ball of [26, 30, 34]) {
    const { level, start, top } = pinnedBallLevel(direction, ball), context = `direction ${direction}, ball ${ball}`
    const run = createRun(level)
    Object.assign(run.player, { x: start, y: top, vx: 0, vy: 0, facing: direction })
    for (let i = 0; i < 90; i++) stepRun(run, NEUTRAL_INPUT)
    let previous, steps
    for (let i = 0; i < 480; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      const p = run.player, points = posePoints(resolveAthletePose(p))
      const moves = previous && points.map((point, j) => [point[0] - previous.points[j][0], point[1] - previous.points[j][1]])
      if (i > 120) {
        assert.equal(playerState(p), 'Pushing', `the push must not drop out: ${context}, frame ${i}`)
        assert.ok(p.grounded && !p.sliding?.active, `the crate stays underfoot: ${context}, frame ${i}`)
        assert.ok(p.contacts?.push?.hands, `the hands stay on the ball: ${context}, frame ${i}`)
        // The pinned stack settles against the wall to within hundredths of a unit.
        assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) < .1, `the body must not shuffle: ${context}, frame ${i}`)
        // Effort can move the pose smoothly; it must never pop or reverse frame to frame.
        for (const [j, move] of moves.entries()) {
          assert.ok(Math.hypot(...move) < .5, `the pose must not pop: ${context}, frame ${i}`)
          const before = steps[j]
          assert.ok(!(Math.hypot(...move) > .05 && Math.hypot(...before) > .05 && move[0] * before[0] + move[1] * before[1] < 0),
            `the pose must not vibrate: ${context}, frame ${i}`)
        }
      }
      previous = { x: p.x, y: p.y, points }; steps = moves
    }
  }
})

test('holding into a steep bank from the very end of a short ledge stays supported and still', () => {
  for (const direction of [-1, 1]) for (const degrees of [60, 75]) {
    const rise = 400 * Math.tan(degrees * Math.PI / 180)
    const bank = { x: 600, y: 100, w: 400, h: rise + 100,
      polygon: [...(direction > 0 ? [[0, rise], [400, 0]] : [[0, 0], [400, rise]]), [400, rise + 100], [0, rise + 100]] }
    // Find where the body comes to rest against the bank, then cut the ledge so
    // its far end lies a few units behind the robot, closer than a body width.
    const settle = floor => {
      const p = createPlayer({ x: direction > 0 ? 550 : 1050, y: floor.y }), terrain = [floor, bank]
      for (let i = 0; i < 240; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, terrain)
      return p
    }
    const y = rise + 100, rest = settle({ x: 0, y, w: 2000, h: 200 }).x
    const ledge = direction > 0 ? { x: rest - 8, y, w: 2000 - (rest - 8), h: 200 } : { x: 0, y, w: rest + 8, h: 200 }
    const p = createPlayer({ x: rest, y }), terrain = [ledge, bank], context = `${degrees}°, direction ${direction}`
    let previous
    for (let i = 0; i < 360; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, terrain)
      assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)), `terrain must never penetrate the body: ${context}`)
      const head = athletePose(p).head
      if (i > 150) {
        assert.ok(p.grounded && !p.sliding?.active, `contact toggled at the ledge end: ${context}`)
        assert.ok(Math.abs(p.x - previous.x) < .001 && Math.abs(p.y - previous.y) < .001, `the body must stay still: ${context}`)
        assert.ok(Math.hypot(head[0] - previous.head[0], head[1] - previous.head[1]) < .01, `the blocked pose must not vibrate: ${context}`)
      }
      previous = { x: p.x, y: p.y, head }
    }
  }
})

// #106, the Concourse report: a crate riding the pushed one slips back against
// the chest and catches on a ledge. The head shoved below the shoulders, the
// trunk stretched after a receding face and the body snapped upright on release.
test('pushing a pile whose top crate catches on a ledge keeps the head, trunk and arms whole', () => {
  for (const direction of [-1, 1]) {
    const level = blankTrial(), floor = level.floor, at = x => direction < 0 ? x : level.width - x
    level.platforms = [{ x: at(direction < 0 ? 500 : 560), y: floor - 140, w: 60, h: 96 }]
    level.props = [{ kind: 'box', x: at(650), y: floor, size: 40 }, { kind: 'box', x: at(648), y: floor - 40, size: 35 }]
    level.entrance = { x: level.width / 2, y: floor }
    const run = createRun(level)
    Object.assign(run.player, { x: at(700), y: floor, vx: 0, vy: 0, facing: direction })
    for (let i = 0; i < 90; i++) stepRun(run, NEUTRAL_INPUT)
    let previous
    for (let i = 0; i < 700; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      const p = run.player, pose = resolveAthletePose(p), drawn = presentedAthletePose(p), context = `direction ${direction}, frame ${i} (${playerState(p)})`
      assert.ok(pose.head[1] < pose.shoulder[1] - 3, `the head stays above the shoulders: ${context}`)
      assert.ok(pose.shoulder[0] - pose.hip[0] < 16, `the trunk does not stretch after a receding face: ${context}`)
      assert.deepEqual(rigViolations(drawn), [], `the drawn neck and joints stay inside the rig limits: ${context}`)
      const points = posePoints(drawn).map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) for (const [j, point] of points.entries())
        assert.ok(Math.hypot(point[0] - previous[j][0], point[1] - previous[j][1]) < 12, `the pose must not pop: ${context}`)
      previous = points
    }
  }
})
