import { blankTrial } from '../../src/games/jumping/level.ts'

/** Real Matter momentum supplies the later obstruction; the player is never
 * placed inside an artificial collider during the returning step. */
export function movingStepPropFixture(side, kind, size) {
  const initial = kind === 'ball' ? size === 80 ? 350 : 400 : size === 80 ? 450 : 477
  const mirror = x => side > 0 ? x : 1200-x
  return { initial: mirror(initial), level: { ...blankTrial(), width: 1200, height: 750, floor: 650,
    spawn: { x: mirror(574.5), y: 650 }, goal: { x: 1100, y: 650 },
    platforms: [{ x: side > 0 ? 600 : 400, y: 590, w: 200, h: 60 }],
    props: [{ kind, x: mirror(initial), y: 650, size }] } }
}
