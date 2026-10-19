import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { parseLevel, levelTerrain, levelProblems } from '../src/games/jumping/level.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { towerWallCatchLevel } from './helpers/jumpingTowerWallCatch.mjs'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'

const authored = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Tower II.jump-level.json', import.meta.url), 'utf8')))

test('equivalent rectangle, polygon and profile lips retain falling catches in either gravity frame', () => {
  for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const inverted of [false, true]) {
    for (const shape of [{}, { polygon: [[0, 0], [400, 0], [400, 140], [0, 140]] }, { profile: [[0, 0], [400, 0]] }]) {
      let lip = { x: 900, y: 1080, w: 400, h: 140, ...shape }
      const edge = side === -1 ? 1300 : 900
      const p = createPlayer({ x: edge - side * 11.5, y: 1085 })
      Object.assign(p, { vx: side * 15, vy: 500, grounded: false, coyote: 0, facing: side })
      const field = createGravityField()
      if (inverted) {
        mirrorPlayerState(p); p.inverted = true; lip = mirrorPlatform(lip)
        updateGravityField(field, [{ id: 'reverse', x: 0, y: -5000, w: 5000, h: 10000, gravity: -1, power: 'always' }], new Map(), true)
      }
      let caught = false
      for (let tick = 0; tick < 1 / dt; tick++) {
        stepPlayer(p, { ...NEUTRAL_INPUT, move: caught ? 0 : side }, dt, [lip], undefined, undefined, undefined, field)
        caught ||= !!p.hang
      }
      assert.ok(caught && p.hang, `${JSON.stringify(shape)}: side=${side}, inverted=${inverted}, dt=${dt}`)
      assert.equal(p.hang.edgeX, edge)
      assert.equal(p.hang.edgeY, inverted ? -1080 : 1080)
    }
  }
})

test('falling past a polygon lip does not kick the player away from an intended grip', () => {
  for (const side of [-1, 1]) for (const reverse of [false, true]) {
    const lip = { x: 900, y: 1080, w: 400, h: 140,
      polygon: authored.platforms[9].polygon.map(([x, y]) => [side === -1 ? x : 400 - x, y]) }
    if (reverse) lip.polygon.reverse()
    const edge = side === -1 ? 1300 : 900
    const p = createPlayer({ x: edge - side * 11.5, y: 1085 })
    Object.assign(p, { vx: side * 15, vy: 500, grounded: false, coyote: 0, facing: side })
    let caught = false
    for (let tick = 0; tick < 120; tick++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: caught ? 0 : side }, STEP, [lip])
      assert.ok(!bodyIntersects(p.x, p.y, lip), 'the body still clears the corner')
      caught ||= !!p.hang
    }
    assert.ok(caught && p.hang, 'the player settles into the reachable grip')
    assert.equal(p.hang.edgeX, edge)
    assert.equal(p.hang.edgeY, 1080)
  }
})

for (const press of [50, 70, 80, 90]) test(`Tower II wall return catches the upper lip after press ${press}`, () => {
  const terrain = levelTerrain(authored), p = createPlayer({ x: 1292, y: 1300 })
  p.vx = 300 // Begin on the pictured rim with ordinary running momentum.
  let jumped = false, caught = false
  for (let tick = 0; tick < 260; tick++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: jumped ? -1 : 1,
      jump: tick < 22 || tick >= press && tick < press + 22 }, STEP, terrain, authored.climbables)
    jumped ||= !!p.wallJump
    if (p.hang?.edgeY === 1080) { caught = true; break }
  }
  assert.ok(jumped, 'a fresh press actually launches off the outer shaft wall')
  assert.ok(caught, 'the return arc catches the upper ledge')
  for (let tick = 0; tick < 150; tick++) stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, STEP, terrain)
  assert.ok(p.grounded && !p.hang && !p.mantle)
  assert.equal(p.y, 1080)
})

for (const delay of [1, 5, 9]) test(`Tower II encounter runs, wall jumps and pulls up from rest, wall delay ${delay}`, () => {
  const level = towerWallCatchLevel(authored)
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level), p = run.player
  let phase = 'run', age = 0, jumped = false, caught = false
  for (let tick = 0; tick < 360; tick++) {
    if (phase === 'run' && p.x >= 1240) { phase = 'jump'; age = 0 }
    if (phase === 'jump' && p.wallBrace?.active && p.x > 1450) { phase = 'wall'; age = 0 }
    if (phase === 'wall' && age === delay) { phase = 'return'; age = 0 }
    stepRun(run, { ...NEUTRAL_INPUT, move: phase === 'return' ? -1 : 1,
      jump: (phase === 'jump' || phase === 'return') && age < 22 })
    jumped ||= !!p.wallJump
    age++
    if (p.hang?.edgeY === 1080) { caught = true; break }
  }
  assert.ok(jumped && caught, 'fresh normal controls reach and retain the upper grip')
  for (let tick = 0; tick < 150; tick++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(p.grounded && !p.hang && !p.mantle)
  assert.equal(p.y, 1080)
})
