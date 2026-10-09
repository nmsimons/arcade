import { createRun } from '../../src/games/jumping/challenge.ts'
import { blankTrial } from '../../src/games/jumping/level.ts'

export const PUSH_SCENARIOS = [
  { name: 'creep crate', kind: 'box', size: 80, effort: .02 },
  { name: 'ordinary crate', kind: 'box', size: 80 },
  { name: '90-speed ball', kind: 'ball', size: 80 },
  { name: 'low crate', kind: 'box', size: 30 },
  { name: 'low ball', kind: 'ball', size: 30 },
  { name: '100 ball', kind: 'ball', size: 100 },
  { name: 'uphill crate', kind: 'box', size: 80, slope: -.3 },
  { name: 'downhill crate', kind: 'box', size: 80, slope: .3 },
  { name: 'crouched uphill crate', kind: 'box', size: 80, slope: -.3, crouch: true },
  { name: 'moving carrier', kind: 'box', size: 80, carrier: true },
  { name: 'blocked on carrier', kind: 'box', size: 80, carrier: true, blocked: true },
  { name: 'blocked crate', kind: 'box', size: 80, blocked: true },
  { name: 'light blocked crate', kind: 'box', size: 80, blocked: true, effort: .2 },
]

export const LOW_PUSH_SCENARIOS = []
for (const [kind, size] of [['box', 30], ['ball', 30], ['box', 80], ['ball', 80], ['ball', 100]]) {
  for (const crouch of [false, true]) for (const blocked of [false, true]) {
    LOW_PUSH_SCENARIOS.push({ name: `${size} ${kind} ${crouch ? 'crouch' : 'upright'} ${blocked ? 'blocked' : 'moving'}`,
      kind, size, crouch, blocked })
  }
}
for (const kind of ['box', 'ball']) for (const slope of [-.3, .3]) {
  for (const crouch of [false, true]) for (const blocked of [false, true]) {
    LOW_PUSH_SCENARIOS.push({ name: `30 ${kind} slope ${slope} ${crouch ? 'crouch' : 'upright'} ${blocked ? 'blocked' : 'moving'}`,
      kind, size: 30, slope, crouch, blocked })
  }
}

/** Initialized motor encounters shared by contact checks and native recordings.
 * Carrier starts exercise prepared dynamic support; authored spawn validation
 * separately requires static ground. These are not authored route fixtures. */
export function pushScenario(config, facing) {
  const size = config.size, x = 800, y = 650, slope = (config.slope ?? 0) * facing
  const surface = at => y + slope * (at - x)
  const spawnX = x - facing * (size / 2 + 25.5)
  const level = { ...blankTrial(), width: 3000, height: 1200, floor: 1100,
    spawn: { x: spawnX, y: surface(spawnX) }, goal: { x: 2500, y: config.slope || config.carrier ? 1100 : 650 },
    props: [{ kind: config.kind, x, y, size }] }
  if (!config.carrier) level.platforms = [slope
    ? { x: 200, y: 0, w: 2000, h: 1100, profile: [[0, surface(200)], [2000, surface(2200)]] }
    : { x: 0, y, w: 3000, h: 450 }]
  else level.mechanisms = [{ id: 'carrier', kind: 'lift',
    x: config.blocked ? facing > 0 ? 300 : x - size / 2 : 300, y,
    w: config.blocked ? facing > 0 ? x + size / 2 - 300 : 1200 : 1600,
    h: 20, travel: 360, ...(config.blocked ? {} : { orientation: 'horizontal' }), power: 'always' }]
  if (config.blocked) {
    const wall = { x: facing > 0 ? x + size / 2 : x - size / 2 - 100, y: y - 200, w: 100, h: 200 }
    level.platforms.push(config.carrier ? { ...wall, y: 0, h: 1000 } : wall)
  }
  return createRun(level)
}
