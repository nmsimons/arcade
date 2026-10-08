import { blankTrial } from '../../../src/games/jumping/level.ts'

export function reverseRopeWorkshop(anchor = 'floor') {
  return { ...blankTrial(), id: 'reverse-rope-browser', name: 'Reverse rope workshop', width: 1200, height: 600, floor: 600,
    spawn: { x: 380, y: 600 }, goal: { x: 1040, y: 600 },
    climbables: { ladders: [], ropes: [{ x: 400, y: anchor === 'floor' ? 600 : 100, length: anchor === 'floor' ? 600 : 500, segments: anchor === 'floor' ? 75 : 63 }] },
    gravityPlates: [{ id: 'g', x: 0, y: 0, w: 1200, h: 600, gravity: -1, power: 'always' }] }
}
