import { createRun, stepRun } from '../../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../../src/games/jumping/model.ts'
import { mirrorPlatform } from '../../src/games/jumping/gravityFrame.ts'
import { pushScenario } from './jumpingPushScenarios.mjs'

export const CROUCHED_PUSH_SCENARIOS = [
  ...[['box', 30], ['box', 80], ['ball', 30], ['ball', 100]].flatMap(([kind, size]) =>
    [false, true].map(blocked => ({ name: `${size} ${kind} ${blocked ? 'blocked' : 'moving'}`, kind, size, blocked }))),
  ...[-.2, .2].flatMap(angle => [false, true].map(blocked =>
    ({ name: `tilted box ${angle} ${blocked ? 'blocked' : 'moving'}`, kind: 'box', size: 80, angle, blocked }))),
  ...[-.3, .3].flatMap(slope => ['box', 'ball'].map(kind =>
    ({ name: `${kind} slope ${slope}`, kind, size: kind === 'box' ? 30 : 100, slope }))),
  ...[['box', 30], ['box', 80], ['ball', 30], ['ball', 100]].map(([kind, size]) =>
    ({ name: `${size} ${kind} 40-unit opening`, kind, size, blocked: true, ceiling: true })),
]

export function crouchedPushLevel(config, facing, inverted = false) {
  const level = structuredClone(pushScenario(config, facing).level)
  if (config.ceiling) {
    const target = level.spawn.x
    level.platforms.push({ x: facing > 0 ? target - 100 : target - 20, y: 570, w: 120, h: 40 })
    // Begin outside the beam, then use normal held crouch to enter the passage.
    level.spawn.x -= facing * 120
  }
  if (inverted) {
    level.platforms = level.platforms.map(platform => {
      const reflected = mirrorPlatform(platform)
      return { ...reflected, y: reflected.y + 1300 }
    })
    level.floor = 1300; level.height = 1400; level.spawn.y = 1300; level.goal.y = 1300
    level.props[0].y = 1300
    level.gravityPlates = [{ id: 'reverse', x: 0, y: 0, w: 3000, h: 1400, gravity: -1, power: 'always' }]
  }
  return level
}

export function crouchedPushScenario(config, facing, inverted = false) {
  const run = createRun(crouchedPushLevel(config, facing, inverted))
  if (inverted) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    for (let tick = 0; tick < 720; tick++) stepRun(run, NEUTRAL_INPUT)
  }
  if (config.angle) run.props[0].angle = config.angle
  return run
}
