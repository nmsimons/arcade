import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { createGravityField, updateGravityField, playerGravity, propGravity } from '../src/games/jumping/gravity.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'

// Field CPU cost only, excluding Matter, locomotion and rendering. Each display
// frame models two 120 Hz player ticks and four prop substeps for 80 loose props.
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor(values.length * fraction)]
const cases = [
  { name: 'inactive', plates: [] },
  { name: 'one full-room field', plates: [{ id: 'g', x: 0, y: 0, w: 1800, h: 6000, gravity: -1 }] },
  { name: '16 overlapping fields, bodies crossing edges', plates: Array.from({ length: 16 }, (_, i) => ({
    id: `g${i}`, x: 200 + i * 19, y: 300 + i * 23, w: 440 + i * 7, h: 500 + i * 11, gravity: [-3, -.5, 0, 2][i % 4],
  })) },
]
let checksum = 0
const results = []
for (const { name, plates } of cases) {
  const states = new Map(plates.map(p => [p.id, true])), field = createGravityField()
  updateGravityField(field, plates, states, true)
  const player = createPlayer({ x: 500, y: 700 }); player.inverted = true
  const props = Array.from({ length: 80 }, (_, i) => ({ kind: i % 2 ? 'ball' : 'box',
    x: 180 + i % 10 * 62, y: 330 + Math.floor(i / 10) * 74, size: 80, angle: i * .17,
    vx: 0, vy: 0, angularVelocity: 0, grounded: false }))
  const frame = i => {
    player.x = 450 + i % 60
    for (let tick = 0; tick < 2; tick++) {
      updateGravityField(field, plates, states, true)
      checksum += playerGravity(field, player)
      for (let substep = 0; substep < 2; substep++) for (const prop of props) checksum += propGravity(field, prop)
    }
  }
  for (let i = 0; i < 300; i++) frame(i)
  const samples = []
  for (let trial = 0; trial < 10; trial++) {
    const start = performance.now()
    for (let i = 0; i < 500; i++) frame(i)
    samples.push((performance.now() - start) / 500)
  }
  const rebuild = []
  for (let trial = 0; trial < 10; trial++) {
    const start = performance.now()
    for (let i = 0; i < 500; i++) updateGravityField(field, plates, states, !!(i % 2))
    rebuild.push((performance.now() - start) / 500)
  }
  results.push({ case: name, cells: field.strips.reduce((sum, s) => sum + s.spans.length, 0),
    'query ms/frame median': +percentile(samples, .5).toFixed(4),
    'query ms/frame p95': +percentile(samples, .95).toFixed(4),
    'power-change ms median': +percentile(rebuild, .5).toFixed(4) })
}
console.log(`Gravity field CPU benchmark on ${cpus()[0].model}; 80 props, 240 Hz prop queries, 120 Hz player queries.`)
console.table(results)
// Exercise the reflected controller too, with maximum terrain/prop counts.
// Props remain fixed for this isolated comparison; Matter and rendering are excluded.
const terrain = [{ x: 0, y: 920, w: 1800, h: 40 }, { x: 0, y: -40, w: 1800, h: 40 },
  ...Array.from({ length: 158 }, (_, i) => ({ x: 900 + i % 15 * 50, y: 100 + Math.floor(i / 15) * 60, w: 30, h: 30 }))]
const props = Array.from({ length: 80 }, (_, i) => ({ kind: 'box', x: 50 + i % 20 * 80, y: 400 + Math.floor(i / 20) * 80,
  size: 40, angle: 0, vx: 0, vy: 0, angularVelocity: 0, grounded: false }))
const colliders = [...terrain.map((platform, i) => ({ id: `terrain:${i}`, platform })),
  ...props.map((prop, i) => ({ id: `prop:${i}`, prop, platform: boxShape(prop) }))]
const world = { colliders, platforms: colliders.map(c => c.platform) }
const controller = []
for (const inverted of [false, true]) {
  const field = createGravityField()
  if (inverted) updateGravityField(field, cases[1].plates, new Map([['g', true]]), true)
  const p = createPlayer({ x: 450, y: inverted ? 0 : 920 }); p.inverted = inverted
  const frame = i => {
    const input = { ...NEUTRAL_INPUT, move: i % 120 < 60 ? 1 : -1 }
    for (let tick = 0; tick < 2; tick++) stepPlayer(p, input, STEP, world.platforms, undefined, undefined, world, field)
  }
  for (let i = 0; i < 240; i++) frame(i)
  const samples = []
  for (let trial = 0; trial < 5; trial++) {
    const start = performance.now()
    for (let i = 0; i < 240; i++) frame(i)
    samples.push((performance.now() - start) / 240)
  }
  controller.push({ footing: inverted ? 'inverted' : 'upright', 'controller ms/frame median': +percentile(samples, .5).toFixed(4) })
}
console.table(controller)
if (!Number.isFinite(checksum)) throw new Error('Nonfinite field result')
