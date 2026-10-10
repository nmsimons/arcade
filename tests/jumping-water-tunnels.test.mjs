import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun, setWaterEffectsEnabled } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/jumping/narrow-water-tunnel.json', import.meta.url), 'utf8'))
assert.deepEqual(levelProblems(parseLevel(source)), [])

for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) for (const kind of ['rectangles', 'single block', 'sloped block']) {
  test(`a swimmer enters, rests, turns and leaves a 34-unit ${kind} tunnel (${direction}, ${dt})`, () => {
    const level = structuredClone(source)
    level.spawn.y = 670
    if (kind === 'rectangles') level.platforms = [
      { x: 400, y: 400, w: 800, h: 216 }, { x: 400, y: 650, w: 800, h: 270 }, { x: 400, y: 616, w: 50, h: 34 },
    ]
    if (kind === 'sloped block') level.platforms[0].polygon = [[0, 0], [800, 0], [800, 218], [50, 216], [50, 250], [800, 252], [800, 520], [0, 520]]
    if (direction > 0) {
      level.spawn.x = 1800 - level.spawn.x
      for (const b of level.platforms) {
        b.x = 1800 - b.x - b.w
        if (b.polygon) b.polygon = b.polygon.map(([x, y]) => [b.w - x, y]).reverse()
      }
    }
    const run = createRun(parseLevel(level)), p = run.player
    run.started = true; p.grounded = false; p.coyote = 0; p.facing = direction
    // The same solid clearance applies with optional surface physics disabled.
    setWaterEffectsEnabled(run, kind !== 'rectangles')
    let previous
    const center = () => p.y + playerWaterCenterOffset(p)
    const advance = (seconds, intent = {}) => {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        stepRun(run, { ...NEUTRAL_INPUT, ...intent }, dt)
        assert.ok(!p.grounded && !p.hang && !p.mantle, 'the passage remains a swimming route')
        const pose = athletePose(p)
        const points = [pose.hip, pose.waist, pose.shoulder, pose.head,
          ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(a => [a.joint, a.end])]
          .map(([x, y]) => [p.x + x * p.facing, p.y + y])
        assert.ok(points.flat().every(Number.isFinite))
        if (previous) for (const [i, point] of points.entries()) {
          assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 600 * dt + .5, 'the tunnel cannot teleport a joint')
        }
        previous = points
        for (const [point, radius] of [[pose.head, 6.2], [pose.hip, 2.8], [pose.waist, 2.8], [pose.shoulder, 2.4]]) {
          const x = p.x + point[0] * p.facing, y = p.y + point[1]
          for (const b of p.terrain) {
            assert.equal(pointInside(b, x, y), false, 'the core remains outside the terrain')
            assert.ok(nearestBoundary(b, x, y).distance > radius - .1, 'the visible core fits the opening')
          }
        }
        for (const arm of [pose.frontArm, pose.backArm]) for (const [x, y] of handOutline(arm)) {
          for (const b of p.terrain) assert.equal(pointInside(b, p.x + x * p.facing, p.y + y), false, 'palms clear the roof and floor')
        }
      }
    }
    const start = p.x, depth = center()
    advance(4, { move: direction })
    assert.ok((p.x - start) * direction > 395, 'the standing collider cannot block the visible opening')
    assert.ok(Math.abs(center() - depth) < .1, 'swimming through the opening holds depth')
    advance(3)
    const rest = { x: p.x, center: center() }
    advance(2)
    assert.ok(Math.abs(p.x - rest.x) < .01 && Math.abs(center() - rest.center) < .01, 'resting in the tunnel does not drift or pop through its roof')
    assert.ok(p.waterMotion.amount > .4, 'the swimmer stays gathered where an upright float cannot fit')
    advance(5, { move: -direction })
    assert.ok((p.x - start) * -direction > 50, 'the player can reverse and swim back out')
    advance(3)
    assert.equal(p.waterMotion.amount, 0, 'open water still permits the requested upright float')
    const pose = athletePose(p)
    assert.ok(pose.head[1] < pose.hip[1] - 20)
  })
}

for (const dt of [STEP, 1 / 30]) for (const vertical of [-1, 1]) {
  test(`a swimmer passes through a 20-unit vertical shaft (${vertical}, ${dt})`, () => {
    const run = createRun({ ...parseLevel(source), spawn: { x: 600, y: vertical > 0 ? 550 : 900 },
      platforms: [{ x: 0, y: 600, w: 590, h: 200 }, { x: 610, y: 600, w: 1190, h: 200 }] })
    const p = run.player
    run.started = true; p.grounded = false; p.coyote = 0
    const center = p.y + playerWaterCenterOffset(p)
    for (let i = 0; i < Math.round(3 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, swimVertical: vertical }, dt)
      const pose = athletePose(p)
      for (const b of p.terrain) {
        const x = p.x + pose.head[0] * p.facing, y = p.y + pose.head[1]
        assert.equal(pointInside(b, x, y), false)
        assert.ok(nearestBoundary(b, x, y).distance > 6.1)
      }
    }
    assert.ok((p.y + playerWaterCenterOffset(p) - center) * vertical > 200, 'the narrower swimming body passes the visible shaft')
    assert.ok(Math.abs(p.x - 600) < .1, 'the shaft cannot eject the swimmer sideways')
    assert.equal(p.grounded, false)
  })
}
