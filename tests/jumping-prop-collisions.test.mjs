import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

function corners(b) {
  const r = b.size / 2, c = Math.cos(b.angle), s = Math.sin(b.angle)
  return [[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,y]) => [b.x+x*c-y*s,b.y-r+x*s+y*c])
}

function scene(props, width = 1800) {
  const level = blankTrial(); level.width = width; level.goal.x = width - 100; level.props = props
  const run = createRun(level); run.started = true
  return run
}
const prop = (kind, x, y = 920, size = 80) => ({ kind, x, y, size })
function gap(a, b) {
  const ar = a.size / 2, br = b.size / 2
  if (a.kind === 'box' && b.kind === 'box') {
    const ac = corners(a), bc = corners(b)
    return Math.max(...[a.angle, b.angle].flatMap(angle => [angle, angle + Math.PI / 2]).map(angle => {
      const c = Math.cos(angle), s = Math.sin(angle), av = ac.map(([x,y])=>x*c+y*s), bv = bc.map(([x,y])=>x*c+y*s)
      return Math.max(Math.min(...av)-Math.max(...bv), Math.min(...bv)-Math.max(...av))
    }))
  }
  if (a.kind === 'ball' && b.kind === 'ball') return Math.hypot(a.x - b.x, a.y - ar - b.y + br) - ar - br
  if (a.kind === 'box') return gap(b, a)
  const dx = a.x-b.x, dy = a.y-ar-b.y+br, c = Math.cos(b.angle), s = Math.sin(b.angle)
  const x = dx*c+dy*s, y = -dx*s+dy*c
  return Math.hypot(Math.max(-br,Math.min(br,x))-x, Math.max(-br,Math.min(br,y))-y)-ar
}
function tick(run, input = NEUTRAL_INPUT, dt = STEP) {
  stepRun(run, input, dt)
  for (const [i, a] of run.props.entries()) {
    const points = a.kind === 'box' ? corners(a) : [[a.x-a.size/2,a.y],[a.x+a.size/2,a.y]]
    assert.ok(points.every(([x])=>x>=-.05&&x<=run.level.width+.05), 'props must stay inside the walls')
    assert.ok(points.every(([,y])=>y<=run.level.floor+.05), `props must stay above the floor: ${Math.max(...points.map(p=>p[1]))}`)
    for (const b of run.props.slice(i + 1)) assert.ok(gap(a, b) >= -.05, `${a.kind}/${b.kind} overlap: ${gap(a, b)}`)
  }
}

for (const kinds of [['ball', 'ball'], ['box', 'box'], ['ball', 'box'], ['box', 'ball']]) {
  test(`${kinds.join('/')} impacts transfer momentum without interpenetration or creation-order dependence`, () => {
    for (const direction of [-1, 1]) {
      const definitions = [prop(kinds[0], 900 - direction * 100), prop(kinds[1], 900)]
      const runs = [scene(definitions), scene([...definitions].reverse())]
      for (const [i, run] of runs.entries()) run.props[i ? 1 : 0].vx = direction * 500
      for (let frame = 0; frame < 90; frame++) for (const run of runs) tick(run)
      for (const [i, run] of runs.entries()) {
        const incoming = run.props[i ? 1 : 0], target = run.props[i ? 0 : 1]
        assert.ok((target.x - 900) * direction > 5, 'the struck prop must move')
        assert.ok((target.x - incoming.x) * direction >= 79.99)
      }
      for (let i = 0; i < 2; i++) {
        assert.ok(Math.abs(runs[0].props[i].x - runs[1].props[1 - i].x) < .001)
        assert.ok(Math.abs(runs[0].props[i].vx - runs[1].props[1 - i].vx) < .001)
      }
    }
  })

  test(`${kinds.join('/')} vertical contact settles and remains supported`, () => {
    for (const reverse of [false, true]) {
      const definitions = [prop(kinds[0], 800, 640), prop(kinds[1], 800)]
      const run = scene(reverse ? definitions.reverse() : definitions)
      for (let i = 0; i < 360; i++) tick(run)
      const top = run.props[reverse ? 1 : 0], bottom = run.props[reverse ? 0 : 1]
      assert.ok(Math.abs(top.y - 840) < .001 && Math.abs(bottom.y - 920) < .001)
      assert.ok(top.grounded && bottom.grounded)
      assert.ok(Math.abs(top.vy) < .001 && Math.abs(bottom.vy) < .001)
    }
  })

  test(`${kinds.join('/')} fast opposing impacts cannot pass through each other`, () => {
    const run = scene([prop(kinds[0], 650, 920, 30), prop(kinds[1], 850, 920, 30)])
    run.props[0].vx = 4000; run.props[1].vx = -4000
    for (let i = 0; i < 8; i++) {
      tick(run, NEUTRAL_INPUT, 1 / 30)
      assert.ok(run.props[0].x < run.props[1].x)
    }
  })
}

test('balls clear empty space beside a box corner before making round contact', () => {
  const run = scene([prop('ball', 970, 850), prop('box', 900)])
  run.props[0].grounded = false; run.props[0].vx = -30
  tick(run)
  assert.equal(run.props[1].vx, 0, 'a ball must not collide as its bounding square')
  assert.equal(run.props[0].vx, -30)
  for (let i = 0; i < 120; i++) tick(run)
  assert.ok(run.props[1].x < 900, 'the rounded impact must eventually push the box')
})

test('pushing a mixed chain against a wall cannot squeeze props through each other or terrain', () => {
  const run = scene([prop('ball', 540), prop('box', 620), prop('ball', 700), prop('box', 780)], 900)
  run.player.x = 488
  for (let i = 0; i < 600; i++) tick(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.props[3].x > 850)
  assert.ok(run.props.every(b => Math.abs(b.vx) < 1))
})
