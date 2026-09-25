import { blankTrial } from '../../src/games/jumping/level.ts'

// A continuous tower face interrupted by retracting gates and undercut floors.
export function ropeTower() {
  const level = blankTrial()
  Object.assign(level, { width: 1000, height: 1500, floor: 1500, spawn: { x: 200, y: 1500 }, goal: { x: 750, y: 1500 } })
  const floor = y => ({ x: 340, y, w: 400, h: 160,
    polygon: [[0, 0], [20, 0], [20, 40], [400, 40], [400, 60], [320, 60], [320, 160], [300, 160], [300, 60], [20, 60], [20, 120], [0, 120]] })
  level.platforms = [
    { x: 340, y: 160, w: 400, h: 80, polygon: [[0, 0], [400, 0], [400, 20], [20, 20], [20, 80], [0, 80]] },
    floor(340), floor(560), floor(780),
  ]
  level.mechanisms = [240, 460].map((y, i) => ({ id: `gate-${i}`, kind: 'gate', x: 340, y, w: 20, h: 100, travel: 100 }))
  level.climbables.ropes = [{ x: 340, y: 160, length: 560, segments: 70 }]
  return level
}
