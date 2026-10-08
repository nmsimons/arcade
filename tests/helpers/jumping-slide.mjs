import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { mirrorPlatform } from '../../src/games/jumping/gravityFrame.ts'

/** Normal-control regression terrain, never an authored/deployed level. */
export function slideLevel(degrees = 55, direction = 1, inverted = false) {
  const rise = 700 * Math.tan(degrees * Math.PI / 180)
  const height = Math.ceil((rise + 500) / 100) * 100, width = 1800
  let platform = { x: 100, y: 200, w: 1200, h: height - 200,
    polygon: [[0, 0], [200, 0], [900, rise], [1200, rise], [1200, height - 200], [0, height - 200]] }
  if (direction < 0) platform = { ...platform, x: width - platform.x - platform.w,
    polygon: platform.polygon.map(([x, y]) => [platform.w - x, y]).reverse() }
  if (inverted) { platform = mirrorPlatform(platform); platform = { ...platform, y: platform.y + height } }
  const level = { ...blankTrial(), name: `${degrees} degree slide ${direction} ${inverted ? 'inverted' : 'normal'}`,
    width, height, floor: height, spawn: { x: direction > 0 ? 250 : width - 250, y: inverted ? height : 200 },
    goal: { x: direction > 0 ? 1600 : 200, y: height }, platforms: [platform],
    ...(inverted ? { gravityPlates: [{ id: 'up', x: 0, y: 0, w: width, h: height, gravity: -1, power: 'always' }] } : {}) }
  const problems = levelProblems(level)
  if (problems.length) throw new Error(problems.join('\n'))
  return level
}
