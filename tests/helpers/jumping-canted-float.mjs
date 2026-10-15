import { createPlayer } from '../../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../../src/games/jumping/gravity.ts'
import { mirrorPlatform, mirrorPlayerState } from '../../src/games/jumping/gravityFrame.ts'

export function floatingWall(side, inverted) {
  const wall = { x: 0, y: 0, w: 20, h: 240, polygon: [[0, 0], [10, 0], [20, 240], [0, 240]] }
  const plate = { id: 'lift', x: 20, y: 170, w: 55, h: 150, gravity: -3, power: 'always' }
  const p = createPlayer({ x: 30, y: 200 })
  Object.assign(p, { grounded: false, coyote: 0, facing: -1 })
  if (side === 1) {
    wall.x = -20; wall.polygon = wall.polygon.map(([x, y]) => [20 - x, y])
    plate.x = -75; p.x *= -1; p.facing = 1
  }
  if (inverted) {
    mirrorPlayerState(p); p.inverted = true
    plate.y = -plate.y - plate.h; plate.gravity *= -1
  }
  const terrain = [inverted ? mirrorPlatform(wall) : wall], field = createGravityField()
  // Overlapping multipliers average: -1 outside, +1 inside the inverted lift.
  const plates = inverted ? [{ id: 'reverse', x: -500, y: -1000, w: 1000, h: 2000, gravity: -1, power: 'always' },
    plate] : [plate]
  updateGravityField(field, plates, new Map(), true)
  return { p, terrain, field }
}
