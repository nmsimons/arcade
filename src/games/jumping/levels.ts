import type { PuzzleLevel } from './level.ts'
import { newLevelId } from './level.ts'

export const YARD_LEVEL: PuzzleLevel = {
  version: 1, id: 'counterweight-yard', name: 'Counterweight Yard', width: 2600, height: 1200, floor: 1080,
  description: 'An experiment with crates, counterweights, and a very persistent pusher.',
  spawn: { x: 155, y: 1080 }, checkpoints: [],
  platforms: [
    { x: 270, y: 730, w: 220, h: 22 },
    { x: 590, y: 580, w: 180, h: 22 },
    { x: 930, y: 420, w: 180, h: 22 },
    { x: 900, y: 755, w: 230, h: 22 },
    { x: 1320, y: 540, w: 590, h: 22 },
    { x: 1435, y: 450, w: 64, h: 90 },
    { x: 2040, y: 350, w: 380, h: 22 },
    { x: 340, y: 1010, w: 290, h: 70, profile: [[0, 70], [80, 0], [135, 0], [290, 70]] },
    { x: 1620, y: 1030, w: 500, h: 50, profile: [[0, 50], [70, 28], [120, 36], [200, 0], [270, 20], [330, 12], [420, 38], [500, 50]] },
  ],
  climbables: { ladders: [{ x: 254, top: 730, bottom: 1080, platform: 0, side: 1 }],
    ropes: [{ x: 857, y: 215, length: 420, segments: 28 }] },
  props: [{ kind: 'ball', x: 445, y: 1010, size: 68 }, { kind: 'box', x: 825, y: 1080, size: 84 }],
  triggers: [{ x: 640, y: 1080, w: 130, target: 'yard-lift', mode: 'weight' }],
  mechanisms: [{ id: 'yard-lift', kind: 'lift', x: 1170, y: 1048, w: 150, h: 22, travel: 508 }],
  robots: [{ x: 1760, y: 540, left: 1530, right: 1870 }],
  flag: { x: 2300, y: 350 }, times: { gold: 32, silver: 50, bronze: 80 },
}

export function pitLevel(ropes: 0 | 1 | 2, gap = [320, 600, 930][ropes]): PuzzleLevel {
  const edge = 560, right = edge + gap, floor = 920, deck = 520, width = right + 400
  return {
    version: 1, id: ['first-leap', 'one-rope', 'two-ropes'][ropes],
    name: ['First Leap', 'A Little Swing', 'Hand Over Hand'][ropes],
    description: [
      'Hold your jump to charge it, then release near the edge. Missed it? The ladder takes you back for another try.',
      'A wider gap. Catch the rope, build a swing, and jump off toward the flag. The ladder is your way back.',
      'Keep your momentum. Transfer from the first rope to the second, then let go toward the far bank.',
    ][ropes],
    width, height: 1040, floor, spawn: { x: 170, y: deck }, flag: { x: right + 240, y: deck },
    checkpoints: [], platforms: [{ x: 24, y: deck, w: edge - 24, h: floor - deck }, { x: right, y: deck, w: width - right - 24, h: floor - deck }],
    climbables: { ladders: [{ x: edge + 16, top: deck, bottom: floor, platform: 0, side: -1 }],
      ropes: ropes === 0 ? [] : (ropes === 1 ? [850] : [810, 1140]).map(x => ({ x, y: ropes === 2 ? 100 : 150, length: ropes === 2 ? 430 : 390, segments: 28 })) },
    props: [], mechanisms: [], triggers: [], robots: [],
    times: [{ gold: 3.5, silver: 6, bronze: 15 }, { gold: 7, silver: 12, bronze: 24 }, { gold: 11, silver: 18, bronze: 32 }][ropes],
  }
}
export const CAMPAIGN = [pitLevel(0), pitLevel(1), pitLevel(2)]
export const FIRST_LEVEL = CAMPAIGN[0]
export const PLAYABLE_LEVELS = [...CAMPAIGN]
export function blankTrial(): PuzzleLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', description: '', width: 1800, height: 920, floor: 920,
    spawn: { x: 160, y: 920 }, flag: { x: 1620, y: 920 }, platforms: [], checkpoints: [],
    climbables: { ropes: [], ladders: [] }, props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
}
