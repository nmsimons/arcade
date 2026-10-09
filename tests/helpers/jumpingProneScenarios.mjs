import { blankTrial } from '../../src/games/jumping/level.ts'
import { keyboardMovement } from '../../src/games/jumping/input.ts'
import { NEUTRAL_INPUT } from '../../src/games/jumping/model.ts'
import { createPlayer } from '../../src/games/jumping/model.ts'
import { mirrorPlatform, mirrorPlayerState } from '../../src/games/jumping/gravityFrame.ts'
import { boxShape, ballShape } from '../../src/games/jumping/propGeometry.ts'

export const PRONE_CLEARANCE_SCENARIOS = [
  { name: 'front wall', solids: [{ x: 520, y: 0, w: 200, h: 1400 }] },
  { name: 'rear wall', solids: [{ x: 280, y: 0, w: 200, h: 1400 }] },
  { name: 'corner', solids: [{ x: 520, y: 350, w: 200, h: 180 }] },
  { name: 'overhead face beyond the physical hull', solids: [{ x: 516, y: 480, w: 80, h: 14 }] },
  { name: 'undercut', solids: [{ x: 520, y: 300, w: 200, h: 1100,
    polygon: [[0, 0], [200, 0], [200, 1100], [0, 1100], [0, 400], [80, 400], [80, 100], [0, 100]] }] },
  { name: 'tilted crate', solids: [boxShape({ x: 570, y: 700, size: 80, angle: .3 })] },
  { name: 'ball', solids: [ballShape({ x: 570, y: 700, size: 100 })], ball: { x: 570, y: 650, r: 50 } },
]

/** Isolate presentation at the reported fall state. Dynamic encounters and
 * naturally acquired falls are exercised separately by proneDropLevel. */
export function proneClearancePlayer(config, direction, inverted) {
  const player = createPlayer({ x: 500, y: 500 })
  Object.assign(player, { grounded: false, coyote: 0, vy: 300, facing: direction,
    freeFall: { time: 2, amount: 1, recovery: null } })
  const solids = config.solids.map(solid => direction > 0 ? solid : { ...solid, x: 1000 - solid.x - solid.w,
    ...(solid.polygon ? { polygon: solid.polygon.map(([x, y]) => [solid.w - x, y]).reverse() } : {}) })
  if (inverted) { mirrorPlayerState(player); player.inverted = true }
  return { player, solids: inverted ? solids.map(mirrorPlatform) : solids,
    balls: config.ball ? [{ ...config.ball, x: direction > 0 ? config.ball.x : 1000 - config.ball.x, y: inverted ? -config.ball.y : config.ball.y }] : [] }
}

export const PRONE_DROP_SCENARIOS = ['wall', 'undercut', 'force field', 'moving gate', 'box', 'ball']

export function proneDropLevel(kind, direction) {
  const width = 2000, rect = (x, y, w, h) => ({ x: direction > 0 ? x : width - x - w, y, w, h })
  const level = { ...blankTrial(), width, height: 2500, floor: 2400,
    spawn: { x: direction > 0 ? 200 : 1800, y: 160 }, goal: { x: direction > 0 ? 1820 : 180, y: 2400 },
    platforms: [rect(100, 160, 220, 24)] }
  if (kind === 'wall') level.platforms.push(rect(420, 0, 200, 2400))
  if (kind === 'undercut') {
    const points = [[0, 0], [200, 0], [200, 2400], [0, 2400], [0, 1500], [80, 1500], [80, 200], [0, 200]]
    level.platforms.push({ ...rect(420, 0, 200, 2400), polygon: direction > 0 ? points : points.map(([x, y]) => [200 - x, y]).reverse() })
  }
  if (kind === 'force field') level.forceFields = [{ ...rect(420, 0, 12, 2400), id: 'barrier', orientation: 'vertical', power: 'always' }]
  if (kind === 'moving gate') {
    level.mechanisms = [{ ...rect(420, 1800, 20, 600), id: 'moving', kind: 'gate', travel: 600, switchReversed: true }]
  }
  if (kind === 'box' || kind === 'ball') level.props = [{ kind, x: direction > 0 ? 440 : 1560, y: 2400, size: kind === 'box' ? 80 : 100 }]
  return level
}

/** A real Shift + direction walk-off, release, then deliberate departure.
 * No fall, contact, location or velocity state is injected. */
export function proneDropInput(tick, direction) {
  const keys = new Set(tick < 168 ? ['ShiftLeft', direction > 0 ? 'KeyD' : 'KeyA'] : [])
  if (tick >= 480 && tick < 492) keys.add('KeyX')
  return { ...NEUTRAL_INPUT, move: keyboardMovement(keys), drop: keys.has('KeyX'), detach: keys.has('KeyX') }
}
