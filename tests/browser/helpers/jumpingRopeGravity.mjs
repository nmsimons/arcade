import { blankTrial } from '../../../src/games/jumping/level.ts'
import { advanceJumpingPassiveWait } from './simulation.mjs'

/** Let the floor-anchored rope float before approaching it from the ceiling.
 * Holding detach prevents an early floor grip from blocking the airborne roll;
 * the completed physical half-turn faces away, so turn back toward the rope. */
export async function reachReverseRopeCeiling(page, passive = true) {
  await page.keyboard.down('x')
  await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
  if (passive) await advanceJumpingPassiveWait(page, 3500)
  else await page.clock.runFor(3500)
  await page.keyboard.up('x')
  await page.keyboard.down('d'); await page.clock.runFor(100); await page.keyboard.up('d')
}

export function reverseRopeWorkshop(anchor = 'floor') {
  return { ...blankTrial(), id: 'reverse-rope-browser', name: 'Reverse rope workshop', width: 1200, height: 600, floor: 600,
    entrance: { x: 380, y: 600 }, goal: { x: 1040, y: 600 },
    climbables: { ladders: [], ropes: [{ x: 400, y: anchor === 'floor' ? 600 : 100, length: anchor === 'floor' ? 600 : 500, segments: anchor === 'floor' ? 75 : 63 }] },
    gravityPlates: [{ id: 'g', x: 0, y: 0, w: 1200, h: 600, gravity: -1, power: 'always' }] }
}
