import { performance } from 'node:perf_hooks'
import { createRope, ropeImpulse, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

// Run with: node scripts/benchmark-jumping-ropes.mjs
// CPU costs exclude canvas drawing and the rest of the game. Coupled columns
// include the player controller and its pose query alongside the loaded rope.
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
const distantTerrain = Array.from({ length: 12 }, (_, i) => ({ x: i % 2 ? 500 : -500, y: i * 170, w: 200, h: 60 }))
const results = []
for (const length of [320, 1280, 2000]) {
  const row = { length }
  for (const cliff of [false, true]) {
    const terrain = cliff ? [{ x: 0, y: 0, w: 400, h: 2400 }] : distantTerrain
    const samples = []
    for (let trial = 0; trial < 3; trial++) {
      // Distinct anchors avoid measuring a previously cached layout.
      const definition = { x: cliff ? 400 : 0, y: 100 + trial, length, segments: Math.ceil(length / 8) }
      const start = performance.now()
      prepareRope(definition, terrain)
      samples.push(performance.now() - start)
    }
    row[cliff ? 'cliff placement ms' : 'free placement ms'] = +median(samples).toFixed(3)
  }
  for (const swinging of [false, true]) {
    const rope = createRope(prepareRope({ x: 0, y: 0, length, segments: Math.ceil(length / 8) }, distantTerrain))
    const load = swinging ? { distance: length - 8, move: 0 } : null
    if (swinging) ropeImpulse(rope, length - 8, 150, 0, STEP)
    const tick = () => stepRope(rope, STEP, distantTerrain, load)
    for (let i = 0; i < 120; i++) tick()
    const samples = []
    for (let trial = 0; trial < 3; trial++) {
      const start = performance.now()
      for (let i = 0; i < 120; i++) tick()
      // Two 120 Hz physics steps per 60 Hz display frame.
      samples.push((performance.now() - start) / 60)
    }
    row[swinging ? 'swing ms/frame' : 'idle ms/frame'] = +median(samples).toFixed(3)
  }
  // Include the player load, contact/pose queries and live rope reflection.
  // Equivalent free swings isolate the added cost of reverse-gravity support.
  for (const inverted of [false, true]) {
    const definition = { x: 0, y: inverted ? 3100 : 100, length, segments: Math.ceil(length / 8) }
    const rope = createRope(definition)
    if (inverted) for (let i = 0; i < rope.nodes.length; i++) rope.nodes[i].y = rope.nodes[i].oldY = definition.y - Math.min(length, i * 8)
    const y = 100 + length / 2 + 56, p = createPlayer({ x: -10, y: inverted ? 3200 - y : y })
    Object.assign(p, { grounded: false, inverted, ropes: [rope] })
    const field = createGravityField()
    updateGravityField(field, [{ id: 'g', x: -400, y: 0, w: 800, h: 3200, gravity: inverted ? -1 : 1, power: 'always' }], new Map(), true)
    const world = { ladders: [], ropes: [definition] }, samples = []
    const frame = i => {
      const input = { ...NEUTRAL_INPUT, move: i % 120 < 60 ? 1 : -1 }
      for (let j = 0; j < 2; j++) stepPlayer(p, input, STEP, [], world, undefined, undefined, field)
      athletePose(p)
    }
    for (let i = 0; i < 120; i++) frame(i)
    for (let trial = 0; trial < 3; trial++) {
      const start = performance.now()
      for (let i = 0; i < 120; i++) frame(i)
      samples.push((performance.now() - start) / 120)
    }
    if (p.climbing?.kind !== 'rope' || !!p.inverted !== inverted) throw new Error('Benchmark lost its rope grip or orientation')
    row[inverted ? 'reverse coupled ms/frame' : 'upright coupled ms/frame'] = +median(samples).toFixed(3)
  }
  results.push(row)
}
console.table(results)
