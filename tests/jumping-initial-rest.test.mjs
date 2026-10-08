import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'

const base = () => ({ ...blankTrial(), width: 1200, height: 750, floor: 650,
  spawn: { x: 500, y: 500 }, goal: { x: 1100, y: 650 } })
const fixtures = [
  { name: 'narrow ledge', level: { ...base(), platforms: [{ x: 492, y: 500, w: 16, h: 20 }] } },
  ...[-1, 1].map(side => ({ name: `slope ${side}`, level: { ...base(),
    platforms: [{ x: 300, y: 450, w: 400, h: 250, profile: side > 0 ? [[0, 100], [400, 0]] : [[0, 0], [400, 100]] }] } })),
  ...['box', 'ball'].map(kind => ({ name: kind, level: { ...base(), spawn: { x: 500, y: 570 },
    props: [{ kind, x: 500, y: 650, size: 80 }] } })),
  { name: 'carrier', level: { ...base(), mechanisms: [{ id: 'carrier', kind: 'lift',
    x: 400, y: 500, w: 260, h: 20, range: [300, 500], speed: 120 }] } },
]

test('the ready stance uses final narrow, sloped, prop and carrier support without starting the world', () => {
  for (const { name, level } of fixtures) {
    for (let restart = 0; restart < 2; restart++) {
      const run = createRun(level), p = run.player, before = JSON.stringify(run)
      assert.equal(p.grounded, true, name)
      assert.ok(p.contacts.support, `${name}: the ready frame identifies real support`)
      assert.ok(p.footwork.feet.some(foot => foot.planted), `${name}: at least one shoe bears weight`)
      const pose = athletePose(p)
      assert.ok(Math.hypot(...pose.frontArm.end.map((v, i) => v - pose.backArm.end[i])) > 6,
        `${name}: relaxed arms remain distinguishable`)
      for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        const foot = p.footwork.feet[i]
        assert.equal(leg.planted, foot.planted, `${name}: drawing does not invent support`)
        if (!foot.planted) continue
        const ground = groundAt(run.platforms, foot.anchorX, foot.anchorY, .2)
        assert.ok(ground, `${name}: the anchor lies on final prepared geometry`)
        assert.ok(Math.abs(ground.y - foot.anchorY) < .2, name)
        assert.ok(Math.hypot(p.x + leg.end[0] * p.facing - foot.x, p.y + leg.end[1] - foot.y) < 1e-6,
          `${name}: the rig retains its motor ankle`)
      }
      assert.equal(JSON.stringify(run), before, `${name}: pose queries are read-only`)
      for (let tick = 0; tick < 1200; tick++) stepRun(run, NEUTRAL_INPUT)
      assert.equal(JSON.stringify(run), before, `${name}: ten seconds of waiting cannot start clocks, props or ropes`)
      assert.equal(run.started, false, name)
      assert.equal(run.elapsed, 0, name)
      assert.equal(run.activeTime, 0, name)
    }
  }
})

test('unsupported ready frames retain an airborne rig instead of borrowing the lower floor', () => {
  for (const { name, level } of fixtures) {
    const run = createRun({ ...level, spawn: { x: level.spawn.x, y: level.spawn.y - 100 } }), p = run.player
    assert.equal(p.grounded, false, name)
    assert.equal(p.footwork, null, name)
    assert.equal(p.contacts.support, null, name)
    const pose = athletePose(p)
    assert.equal(pose.frontLeg.planted || pose.backLeg.planted, false, name)
    assert.equal(run.started, false, name)
  }
})
