import { blankTrial } from '../../src/games/jumping/level.ts'
import { createRun, stepRun } from '../../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../../src/games/jumping/model.ts'

export const clusterStages = [
  ['Surface push', 3, { move: 1 }],
  ['Dive between floats', 1.2, { move: 1, descend: true }],
  ['Swim below', 3.5, { move: -1 }],
  ['Rise through floats', 2.5, { move: 1, climb: true }],
  ['Reverse at the surface', 3, { move: -1 }],
  ['Release into float', 1, {}],
]

export function createWaterCluster(side = 1, spacing = 48, depth = 50, dt = STEP) {
  const at = x => side > 0 ? x : 1800 - x
  const run = createRun({ ...blankTrial(), spawn: { x: at(420), y: 450 },
    goal: { x: 1700, y: 900, id: 'closed', power: 'switched' },
    props: Array.from({ length: 6 }, (_, i) => ({ kind: 'ball', x: at(570 + i * spacing), y: 420, size: 40 })),
    platforms: [{ x: 0, y: 900, w: 1800, h: 80 }],
    gravityPlates: [{ id: 'water', x: 0, y: 400, w: 1800, h: 500, effect: 'water' }] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0; run.player.facing = side
  for (let i = 0; i < Math.round(5 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
  // Additional starts reproduce an already streamlined swimmer at shallow depth.
  if (depth > 50) {
    run.player.y = 400 + depth; run.player.waterMotion.amount = 1
    run.player.freeFall = { time: 2, amount: 1, recovery: null }
  }
  return run
}

export function clusterInput(intent, side) {
  return { ...NEUTRAL_INPUT, ...intent, move: (intent.move ?? 0) * side }
}
