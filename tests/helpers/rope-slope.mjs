import { blankTrial } from '../../src/games/jumping/level.ts'
import { ropeSegmentCount } from '../../src/games/jumping/climbables.ts'

/** A rope draped over a vertical face, steep shoulder, and shallow summit. */
export function ropeSlope(mirror = false, { anchor = 'summit', length = 380 } = {}) {
  const level = { ...blankTrial(), id: 'rope-slope', name: 'Rope scramble', width: 1800, height: 920, floor: 920,
    spawn: { x: 620, y: 740 }, goal: { x: 1620, y: 920 },
    platforms: [
      { x: 720, y: 360, w: 440, h: 400, polygon: [[0, 100], [40, 40], [100, 160 / 7], [180, 0], [280, 40], [340, 120], [440, 100], [380, 260], [440, 400], [280, 340], [140, 320], [0, 400]] },
      { x: 540, y: 740, w: 120, h: 180 },
    ],
    climbables: { ladders: [], ropes: [{ x: 900, y: 360, length: 380, segments: ropeSegmentCount(380), anchor: { platform: 0, x: 180, y: 0 } }] },
  }
  if (anchor === 'shoulder') level.climbables.ropes = [{ x: 760, y: 400, length, segments: ropeSegmentCount(length) }]
  if (mirror) {
    for (const p of level.platforms) {
      p.x = level.width - p.x - p.w
      if (p.polygon) p.polygon = p.polygon.map(([x, y]) => [p.w - x, y]).reverse()
    }
    for (const rope of level.climbables.ropes) {
      rope.x = level.width - rope.x
      if (rope.anchor) rope.anchor.x = level.platforms[rope.anchor.platform].w - rope.anchor.x
    }
    level.spawn.x = level.width - level.spawn.x
    level.goal.x = level.width - level.goal.x; level.goal.flipX = true
  }
  return level
}

/** A vertical rope under a thin sloping lip, with room to climb around its end. */
export function slopedLip(mirror = false, slope = .2, thickness = 40) {
  const far = Math.max(0, 400 * slope), near = Math.max(0, -400 * slope)
  const level = { ...blankTrial(), id: 'sloped-lip', name: 'Sloped lip', width: 1800, height: 920, floor: 920,
    spawn: { x: 1162, y: 780 }, goal: { x: 1600, y: 920 },
    platforms: [
      { x: 760, y: 460 - near, w: 400, h: Math.max(far + thickness + 80, near + thickness),
        polygon: [[0, far], [400, near], [400, near + thickness], [0, far + thickness + 80]] },
      { x: 1120, y: 780, w: 160, h: 140 },
    ],
    climbables: { ladders: [], ropes: [{ x: 1160, y: 460, length: 260, segments: ropeSegmentCount(260), anchor: { platform: 0, x: 400, y: near } }] },
  }
  if (mirror) {
    for (const p of level.platforms) {
      p.x = level.width - p.x - p.w
      if (p.polygon) p.polygon = p.polygon.map(([x, y]) => [p.w - x, y]).reverse()
    }
    const rope = level.climbables.ropes[0]
    rope.x = level.width - rope.x; rope.anchor.x = 0
    level.spawn.x = level.width - level.spawn.x
    level.goal.x = level.width - level.goal.x; level.goal.flipX = true
  }
  return level
}
