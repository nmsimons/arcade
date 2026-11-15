import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, solidColliders, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { firstPropCollider } from '../src/games/jumping/propPhysics.ts'

const levelDirectory = new URL('../public/levels/jumping/', import.meta.url)
const builtIns = JSON.parse(readFileSync(new URL('index.json', levelDirectory))).levels
  .map(file => parseLevel(JSON.parse(readFileSync(new URL(file, levelDirectory)))))

test('the held-box offset matches the collider order in every built-in level, bus or not', () => {
  assert.ok(builtIns.some(level => level.goal?.kind === 'bus'))
  for (const level of builtIns) {
    const run = createRun(level), colliders = solidColliders(run)
    const first = colliders.findIndex(c => c.prop?.kind === 'box')
    if (first < 0) continue
    assert.equal(firstPropCollider(run), first, level.name)
  }
})

// Exit's ending: draining the water exposes a crate on the floor with a bus as
// the goal. The bus collider shifted the held-box lookup, so the pull-up's own
// separation shoved its support sideways and the grip followed it each frame.
for (const bus of [false, true]) for (const side of [-1, 1]) {
  test(`a pull-up onto a floor crate leaves the crate in place (${bus ? 'bus goal' : 'plain goal'}, side ${side})`, () => {
    const level = blankTrial()
    if (bus) level.goal = { kind: 'bus', x: level.width - 120, y: 920 }
    // A ball listed first and a second box exercise the box-then-ball ordering.
    level.props = [{ kind: 'ball', x: 300, y: 920, size: 60 }, { kind: 'box', x: 1400, y: 920, size: 40 },
      { kind: 'box', x: 800, y: 920, size: 150 }]
    const run = createRun(level), p = run.player, crate = run.props[2]
    for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
    Object.assign(p, { x: 800 - side * 200, y: 920, vx: 0, vy: 0, grounded: true, facing: side })
    for (let i = 0; i < 600 && (crate.x - p.x) * side - crate.size / 2 > 40; i++) stepRun(run, { ...NEUTRAL_INPUT, move: side })
    const startX = crate.x
    let mantled = false, largest = 0
    const advance = (frames, input) => { for (let i = 0; i < frames && !(mantled && !p.mantle); i++) {
      const x = crate.x
      stepRun(run, { ...NEUTRAL_INPUT, ...input })
      mantled ||= !!p.mantle
      largest = Math.max(largest, Math.abs(crate.x - x))
    } }
    advance(6, { move: side, jump: true, climb: true })
    advance(240, { move: side, climb: true })
    for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
    assert.ok(mantled, 'the jump catches the crate and pulls up')
    assert.ok(largest < 1, `the crate never jumps sideways (largest step ${largest.toFixed(2)})`)
    assert.ok(Math.abs(crate.x - startX) < 2, `the crate stays put (moved ${(crate.x - startX).toFixed(2)})`)
    assert.ok(!p.mantle && p.grounded && Math.abs(p.y - (920 - crate.size)) < .5, 'the player finishes standing on the crate')
  })
}
