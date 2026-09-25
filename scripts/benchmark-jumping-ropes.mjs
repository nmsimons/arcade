import { performance } from 'node:perf_hooks'
import { createRope, ropeImpulse, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { STEP } from '../src/games/jumping/model.ts'

// Run with: node scripts/benchmark-jumping-ropes.mjs
// These are rope CPU costs, excluding rendering and the rest of the game.
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
  results.push(row)
}
console.table(results)
