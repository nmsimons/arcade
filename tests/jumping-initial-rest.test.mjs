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
  { name: 'floor', level: { ...base(), spawn: { x: 500, y: 650 } } },
  { name: 'narrow ledge', level: { ...base(), platforms: [{ x: 492, y: 500, w: 16, h: 20 }] } },
  ...[-1, 1].map(side => ({ name: `slope ${side}`, level: { ...base(),
    platforms: [{ x: 300, y: 450, w: 400, h: 250, profile: side > 0 ? [[0, 100], [400, 0]] : [[0, 0], [400, 100]] }] } })),
  ...['box', 'ball'].map(kind => ({ name: kind, level: { ...base(), spawn: { x: 500, y: 570 },
    props: [{ kind, x: 500, y: 650, size: 80 }] } })),
  { name: 'carrier', level: { ...base(), mechanisms: [{ id: 'carrier', kind: 'lift',
    x: 400, y: 500, w: 260, h: 20, travel: 120, orientation: 'horizontal', power: 'always' }] } },
]

test('the ready stance uses final narrow, sloped, prop and carrier support without starting the world', () => {
  for (const { name, level } of fixtures) {
    for (let restart = 0; restart < 2; restart++) {
      const run = createRun(level), p = run.player, before = JSON.stringify(run)
      assert.equal(p.grounded, true, name)
      assert.ok(p.contacts.support, `${name}: the ready frame identifies real support`)
      assert.ok(p.footwork.feet.some(foot => foot.planted), `${name}: at least one shoe bears weight`)
      const pose = athletePose(p)
      assert.ok(Math.hypot(...pose.frontLeg.end.map((v, i) => v - pose.backLeg.end[i])) > .5,
        `${name}: the initial legs are not coincident`)
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

test('ten seconds of started idle retain real support, readable quiet arms and passive carrier transport', () => {
  const reverse = { ...base(), spawn: { x: 500, y: 650 }, platforms: [{ x: 0, y: 0, w: 1200, h: 100 }],
    gravityPlates: [{ id: 'reverse', x: 0, y: 0, w: 1200, h: 750, gravity: -1, power: 'always' }] }
  const contexts = [...fixtures,
    { name: 'crouched floor', level: { ...base(), spawn: { x: 500, y: 650 } } },
    { name: 'reversed gravity', level: reverse }, { name: 'crouched reversed gravity', level: reverse }]
  for (const { name, level } of contexts) for (const facing of [-1, 1]) {
    const run = createRun(level), p = run.player, input = { ...NEUTRAL_INPUT, crouch: name.includes('crouched') }
    for (let tick = 0; tick < 4; tick++) stepRun(run, { ...input, move: facing })
    for (let tick = 0; tick < 360; tick++) stepRun(run, input)
    assert.equal(run.started, true, `${name}: exercise the started world rather than the frozen ready frame`)
    assert.ok(p.grounded && p.footwork.feet.every(foot => foot.planted), `${name}: reach actual settled support`)
    assert.equal(p.facing, facing)
    assert.equal(!!p.inverted, name.includes('reversed'))
    const anchors = p.footwork.feet.map(foot => [foot.anchorX, foot.anchorY]), carrier = name === 'carrier' ? run.mechanisms[0] : null
    const origin = carrier ? [carrier.x, carrier.y] : [0, 0], initialX = p.x
    let carrierTravel = 0
    for (let tick = 0; tick < 1200; tick++) {
      stepRun(run, input)
      const before = structuredClone(p), pose = athletePose(p)
      assert.deepEqual(p, before, 'the rendered pose remains read-only')
      assert.equal(p.gait.moving, 0, `${name}: passive rest does not cycle the gait`)
      assert.ok(p.footwork.feet.every(foot => foot.planted), `${name}: no cosmetic idle steps`)
      assert.ok(Math.hypot(...pose.frontArm.end.map((v, i) => v - pose.backArm.end[i])) > 6,
        `${name}: quiet hands stay distinct, including crouching`)
      const shift = carrier ? [carrier.x - origin[0], carrier.y - origin[1]] : [0, 0]
      for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        const foot = p.footwork.feet[i]
        assert.equal(leg.planted, true)
        assert.ok(Math.hypot(p.x + leg.end[0] * p.facing - foot.x, p.y + leg.end[1] * (p.inverted ? -1 : 1) - foot.y) < 1e-6,
          `${name}: the final shoe retains its motor ankle`)
        assert.ok(Math.hypot(foot.anchorX - anchors[i][0] - shift[0], foot.anchorY - anchors[i][1] - shift[1]) < 1e-6,
          `${name}: the sole stays fixed relative to its actual support`)
      }
      carrierTravel = Math.max(carrierTravel, Math.abs(p.x - initialX))
    }
    if (carrier) assert.ok(carrierTravel > 100, 'the always-powered carrier really transports the still rider')
    const elapsed = run.elapsed
    stepRun(run, { ...NEUTRAL_INPUT, jump: true })
    assert.ok(p.vy * (p.inverted ? -1 : 1) < 0 && !p.grounded, `${name}: fresh jump remains immediately available`)
    assert.ok(run.elapsed > elapsed)
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
