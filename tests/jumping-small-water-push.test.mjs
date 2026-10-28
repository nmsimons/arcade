import test from 'node:test'
import assert from 'node:assert/strict'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'

function checkRig(p, previous, dt) {
  const pose = athletePose(p), center = [p.x, p.y + playerWaterCenterOffset(p)]
  if (previous) assert.ok(Math.hypot(center[0] - previous[0], center[1] - previous[1]) < dt * 600 + 1, 'the transition does not teleport the displaced body')
  for (const [point, radius] of [[pose.head, 6.2], ...[pose.hip, pose.waist, pose.shoulder].map(point => [point, 2.8])]) {
    const x = p.x + point[0] * p.facing, y = p.y + point[1]
    for (const solid of p.terrain ?? []) {
      const distance = nearestBoundary(solid, x, y).distance
      assert.ok((pointInside(solid, x, y) ? radius + distance : radius - distance) < .15, 'the head and torso clear the prop')
    }
  }
  return center
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const kind of ['ball', 'box']) for (const size of [30, 50]) {
  test(`a short rise keeps a reachable ${size}-unit ${kind} push usable, side ${side}, ${1 / dt} Hz`, () => {
    const level = readLevelAsset('small-water-prop.json')
    level.props[0].kind = kind; level.props[0].size = size
    level.entrance.x = 600 - side * 120
    const run = createRun(level), p = run.player, prop = run.props[0]
    p.facing = side
    for (let i = 0; i < Math.round(.1 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
    let contacts = 0, previous
    for (let i = 0; i < Math.round(5 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side }, dt)
      if (p.contacts?.push?.collider.prop === prop) contacts++
      previous = checkRig(p, previous, dt)
      for (const limb of Object.values(athletePose(p)).filter(value => value?.root)) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-6)
      }
    }
    assert.ok((prop.x - 600) * side > (kind === 'ball' ? 35 : 10), 'the swimmer pushes the small prop instead of passing over it')
    assert.ok(contacts * dt > .2, 'the hands establish a sustained working contact')
  })
}

for (const dt of [STEP, 1 / 30]) for (const departure of [{}, { climb: true, move: 1 }, { descend: true, move: 1 }, { move: -1 }, { jump: true, move: 1 }]) {
  test(`small-prop palms release for ${JSON.stringify(departure)}, ${1 / dt} Hz`, () => {
    const run = createRun(readLevelAsset('small-water-prop.json')), p = run.player
    for (let i = 0; i < Math.round(.1 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
    for (let i = 0; i < Math.round(3 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: 1 }, dt)
      if (p.contacts?.push?.lowSwimming && p.pushing?.amount > .95) break
    }
    assert.ok(p.contacts?.push?.lowSwimming, 'establish a working contact first')
    stepRun(run, { ...NEUTRAL_INPUT, ...departure }, dt)
    assert.ok(!p.contacts?.push?.lowSwimming, 'departure immediately releases the low swimming motor')
    for (let i = 0; i < Math.round(.4 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, ...departure }, dt)
    assert.ok(!p.waterMotion?.propLean, 'the preparation relaxes after departure')
  })
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) test(`a working floor push hands off to swimming, side ${side}, ${1 / dt} Hz`, () => {
  const level = readLevelAsset('small-water-prop.json')
  level.entrance.x = 600 - side * 120
  const run = createRun(level), p = run.player, prop = run.props[0]
  p.facing = side
  for (let i = 0; i < Math.round(3 / dt); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: side }, dt)
    if (p.grounded && p.pushing?.amount > .95) break
  }
  assert.ok(p.grounded && p.contacts?.push, 'start with an actual standing push')
  const start = prop.x
  let previous = checkRig(p, null, dt)
  for (let i = 0; i < Math.round(.1 / dt); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
    previous = checkRig(p, previous, dt)
  }
  let swimming = 0
  for (let i = 0; i < Math.round(3 / dt); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: side }, dt)
    previous = checkRig(p, previous, dt)
    if (p.contacts?.push?.lowSwimming) swimming += dt
  }
  assert.ok(swimming > .3, 'hands resume useful contact after leaving the floor')
  assert.ok((prop.x - start) * side > 35, 'the transition keeps moving the prop')
})

for (const scenario of ['above', 'wall', 'dry']) test(`small-prop reach does not engage from ${scenario}`, () => {
  const level = readLevelAsset('small-water-prop.json')
  if (scenario === 'wall') level.platforms.push({ x: 550, y: 400, w: 12, h: 520 })
  if (scenario === 'dry') level.gravityPlates = []
  const run = createRun(level), p = run.player
  for (let i = 0; i < (scenario === 'above' ? 120 : 12); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  for (let i = 0; i < 360; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    assert.ok(!p.contacts?.push?.lowSwimming, 'no special palm load')
    assert.ok(!p.waterMotion?.propLean, 'no downward preparation without a reachable low prop')
  }
  if (scenario !== 'dry') assert.ok(Math.abs(run.props[0].x - 600) < .1, 'the prop receives no remote force')
})
