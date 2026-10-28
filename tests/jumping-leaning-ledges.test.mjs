import test from 'node:test'
import assert from 'node:assert/strict'
import { leaningLedgeLevel } from './helpers/jumpingLeaningLedge.mjs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { bodyIntersects, pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { ledgeObstacles } from '../src/games/jumping/terrainLedges.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { athleteSkin } from './helpers/jumpingSkin.mjs'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const clearBody = (p, terrain) => {
  const body = playerContactBody(p), obstacles = p.mantle ? ledgeObstacles(terrain, p.mantle) : terrain
  assert.ok(obstacles.every(b => !bodyIntersects(body.x, body.y, b, body.height, 1, 0, body.outline)), 'the real collision hull clears the terrain')
}
const clearSkin = (p, terrain) => {
  for (const shape of athleteSkin(p)) for (const [x, y] of shape.points) for (const b of terrain) {
    const tolerance = shape.name.endsWith(':palm') ? .2 : .1
    assert.ok(!pointInside(b, x, y) || nearestBoundary(b, x, y).distance <= tolerance, `${shape.name} clears the leaning face`)
  }
  for (const limb of [athletePose(p).frontArm, athletePose(p).backArm]) {
    assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1]) - 10) < 1e-6)
    assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1]) - 9) < 1e-6)
  }
}

for (const side of [-1, 1]) test(`a normal jump catches and climbs the reported leaning rock, side ${side}`, () => {
  const level = parseLevel(leaningLedgeLevel(side))
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level), p = run.player, edgeX = side > 0 ? 600 : 1600
  for (let tick = 0; tick < 240 && !p.hang; tick++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: tick < 18 }); clearBody(p, run.platforms)
  }
  assert.ok(p.hang, 'a full ordinary jump catches the slightly leaning wall')
  assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.edgeY, 280)
  assert.equal(p.hang.braced, true, 'the feet brace against the actual slanted wall')
  for (let tick = 0; tick < 90; tick++) { stepRun(run, NEUTRAL_INPUT); clearBody(p, run.platforms) }
  assert.ok(p.hang && p.vx === 0 && p.vy === 0, 'the grip settles without a catch/release loop')
  clearSkin(p, run.platforms)
  const lean = p.hang.outwardSlope, pose = athletePose(p)
  for (const leg of [pose.frontLeg, pose.backLeg]) {
    const distances = FOOT_CONTACT.map(contact => {
      const offset = footPoint(contact, leg.footAngle, leg.toeAngle)
      const x = (p.x - edgeX) * side + leg.end[0] + offset[0]
      const y = p.y - p.hang.edgeY + leg.end[1] + offset[1]
      return (x + y * lean) / Math.hypot(1, lean)
    })
    assert.ok(Math.abs(Math.max(...distances) + .05) < 1e-6, 'the toe pad rests on the real wall')
    const pad = [2.2, 2.775, 3.35, 3.925, 4.5].map(x => {
      const offset = footPoint([x, 2.8], leg.footAngle, leg.toeAngle, true)
      return [(p.x - edgeX) * side + leg.end[0] + offset[0], p.y - p.hang.edgeY + leg.end[1] + offset[1]]
    })
    for (const [x, y] of pad) assert.ok(Math.abs((x + y * lean) / Math.hypot(1, lean) + .05) < 1e-6, 'the whole forefoot pad lies flush along the leaning wall')
    const along = pad.map(([x, y]) => (y - x * lean) / Math.hypot(1, lean))
    assert.ok(Math.abs(Math.max(...along) - Math.min(...along) - 2.3) < 1e-6, 'the flat toe contact retains its native length')
    const ankleX = (p.x - edgeX) * side + leg.end[0], ankleY = p.y - p.hang.edgeY + leg.end[1]
    const gap = -(ankleX + ankleY * lean) / Math.hypot(1, lean)
    assert.ok(gap > 2 && gap < 3.5, 'the ankle uses the native foot reach')
  }
  let pulled = false
  for (let tick = 0; tick < 180; tick++) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true }); clearBody(p, run.platforms)
    pulled ||= !!p.mantle
    if (pulled && !p.mantle) break
  }
  assert.ok(pulled && !p.hang && !p.mantle && p.grounded, 'Up completes the pull-up onto the actual top')
  assert.ok((p.x - edgeX) * side > 0)
  clearSkin(p, run.platforms)
})
