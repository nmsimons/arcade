import type { NamedObject } from './objectNames.ts'
import type { WallWiringSettings } from './switchPower.ts'
import type { GravityPlate } from './gravity.ts'
import { effectiveWaterLevel, waterSurfaceY } from './waterLevel.ts'
import type { WaterLevels } from './waterLevel.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

/**
 * A depth board on the wall of a pool, with a lamp in its head. The gauge reads the waterline of
 * the pool it is mounted in, exactly, so a gate or pump wired to it switches on the frame the
 * water reaches a mark. It has one mark (`x, y`, read at or above it, or at or below it), or two:
 * a low mark read at or below it and a high mark read at or above it, each its own contact.
 */
export type LevelGauge = SingleMarkGauge | TwoMarkGauge
interface GaugeBase extends NamedObject, WallWiringSettings { id: string; x: number }
export interface SingleMarkGauge extends GaugeBase {
  y: number; targets: string[]; activeWhen?: 'above' | 'below'; low?: undefined; high?: undefined
}
/** A mark of a two-mark gauge: its height and the items its contact switches. */
export interface GaugeMark { y: number; targets: string[] }
export interface TwoMarkGauge extends GaugeBase {
  low: GaugeMark; high: GaugeMark; y?: undefined; targets?: undefined; activeWhen?: undefined
}
export const isTwoMarkGauge = (gauge: LevelGauge): gauge is TwoMarkGauge => gauge.low !== undefined
/** The high mark sits at least this far above the low mark. */
export const MIN_MARK_GAP = 20
/** A two-mark board runs this far past each mark. */
const MARK_MARGIN = 24
/**
 * `pool` indexes the run's water pools; -1 when the (low) mark is in no pool, and the gauge never
 * switches on. `active` is the single mark's contact, or the low mark's; a two-mark gauge adds its
 * high mark's reading and contact.
 */
export interface LevelGaugeState { definition: LevelGauge; pool: number; reading: boolean; active: boolean; highReading?: boolean; highActive?: boolean }
/** Contacts as switches read them: `active` is the single or low mark, `highActive` the high mark. */
export interface LevelGaugeContacts { active: boolean; highActive?: boolean }
export const MAX_LEVEL_GAUGES = 16
/** A waterline this close to the mark counts as at it, so float rounding cannot leave a full pool short. */
export const LEVEL_GAUGE_TOLERANCE = .05
export const LEVEL_GAUGE_WIDTH = 12, LEVEL_GAUGE_HEIGHT = 96
/** The mark line reaches this far past each side of the board. */
const MARK_REACH = 5
/** The steel head the board hangs from, a little wider than the board, with the lamp's lens set in it. */
const HEAD_W = 18, HEAD_H = 20, LENS_R = 5.5, HEAD_OVERLAP = 3

/** The board's top and bottom edges. */
export function levelGaugeBoard(gauge: LevelGauge) {
  return isTwoMarkGauge(gauge) ? { top: gauge.high.y - MARK_MARGIN, bottom: gauge.low.y + MARK_MARGIN }
    : { top: gauge.y - LEVEL_GAUGE_HEIGHT / 2, bottom: gauge.y + LEVEL_GAUGE_HEIGHT / 2 }
}
/** The marks, top first: one, or the high and low marks. */
export const levelGaugeMarks = (gauge: LevelGauge): number[] => isTwoMarkGauge(gauge) ? [gauge.high.y, gauge.low.y] : [gauge.y]
/** The point that places a gauge: its x and its top (or only) mark. */
export const levelGaugeAnchor = (gauge: LevelGauge) => ({ x: gauge.x, y: levelGaugeMarks(gauge)[0] })
/** The mark that chooses the pool: the only mark, or the low mark. */
const readingMark = (gauge: LevelGauge) => ({ x: gauge.x, y: isTwoMarkGauge(gauge) ? gauge.low.y : gauge.y })
/** Moves a gauge and all its marks; the caller has copied the level. */
export function shiftLevelGauge(gauge: LevelGauge, dx: number, dy: number) {
  gauge.x += dx
  if (isTwoMarkGauge(gauge)) { gauge.low.y += dy; gauge.high.y += dy } else gauge.y += dy
}
/** The lens in the head (the high or only mark's lamp) and, on a two-mark gauge, the lens in the foot (the low mark's). */
export function levelGaugeLamps(gauge: LevelGauge) {
  const board = levelGaugeBoard(gauge), offset = HEAD_H / 2 - HEAD_OVERLAP
  return { head: { x: gauge.x, y: board.top - offset }, foot: isTwoMarkGauge(gauge) ? { x: gauge.x, y: board.bottom + offset } : undefined }
}
export const levelGaugeLamp = (gauge: LevelGauge) => levelGaugeLamps(gauge).head
/** Head, board, foot and mark lines: for validation, hit-testing and selection. */
export function levelGaugeBounds(gauge: LevelGauge) {
  const half = Math.max(HEAD_W / 2, LEVEL_GAUGE_WIDTH / 2 + MARK_REACH), board = levelGaugeBoard(gauge)
  const top = board.top - HEAD_H + HEAD_OVERLAP, bottom = isTwoMarkGauge(gauge) ? board.bottom + HEAD_H - HEAD_OVERLAP : board.bottom
  return { x: gauge.x - half, y: top, w: half * 2, h: bottom - top }
}
/** Mounted in a level, the head must be inside it; below the lowest mark the board may run on behind the floor. */
export function levelGaugeFits(gauge: LevelGauge, width: number, height: number) {
  const b = levelGaugeBounds(gauge), marks = levelGaugeMarks(gauge)
  return b.x >= 0 && b.x + b.w <= width && b.y >= 0 && marks[marks.length - 1] <= height
}

/** Edges count: a full pool's surface sits on its top edge, and an empty one's on its bottom. */
export const markInPool = (gauge: { x: number; y: number }, plate: Pick<GravityPlate, 'x' | 'y' | 'w' | 'h'>) =>
  gauge.x >= plate.x && gauge.x <= plate.x + plate.w && gauge.y >= plate.y && gauge.y <= plate.y + plate.h
/** The first water pool, in authored order, whose rectangle contains the mark (the low mark of a two-mark gauge). */
export const levelGaugePool = (gauge: LevelGauge | { x: number; y: number }, plates: readonly GravityPlate[]) =>
  plates.find(plate => plate.effect === 'water' && markInPool('id' in gauge ? readingMark(gauge) : gauge, plate))
/** Whether a waterline at `surfaceY` reads as on: at or above the mark, or at or below it. */
export const levelGaugeReads = (gauge: { y: number; activeWhen?: 'above' | 'below' }, surfaceY: number) =>
  gauge.activeWhen === 'below' ? surfaceY >= gauge.y - LEVEL_GAUGE_TOLERANCE : surfaceY <= gauge.y + LEVEL_GAUGE_TOLERANCE

/** The readings for a surface: the single or low mark, then the high mark of a two-mark gauge. */
function readings(gauge: LevelGauge, surfaceY: number | undefined): [boolean, boolean | undefined] {
  if (!isTwoMarkGauge(gauge)) return [surfaceY !== undefined && levelGaugeReads(gauge, surfaceY), undefined]
  if (surfaceY === undefined) return [false, false]
  return [levelGaugeReads({ y: gauge.low.y, activeWhen: 'below' }, surfaceY), levelGaugeReads({ y: gauge.high.y }, surfaceY)]
}
function poolIndex(definition: LevelGauge, water: WaterLevels) {
  return water.pools.findIndex(pool => markInPool(readingMark(definition), pool.definition))
}
function surface(state: Pick<LevelGaugeState, 'pool'>, water: WaterLevels) {
  // Pumped water counts as soon as it is pumped, before the 30 Hz step applies it to the region.
  const pool = water.pools[state.pool]
  return pool && waterSurfaceY(pool.definition, effectiveWaterLevel(pool))
}
/** Reads the run's live water, which starts at the authored levels, including input still pending. */
export function createLevelGauge(definition: LevelGauge, water: WaterLevels): LevelGaugeState {
  const state: LevelGaugeState = { definition, pool: poolIndex(definition, water), reading: false, active: false }
  const [low, high] = readings(definition, surface(state, water))
  state.reading = state.active = low
  if (high !== undefined) state.highReading = state.highActive = high
  return state
}
/**
 * Like a float switch, EMP and the power-down suppress the contact. Each frame the run reads
 * gauges and resolves switches before `advanceWaterLevels` adds that frame's pump input, so a
 * pump a gauge guards stops on the frame its pumped water reaches the mark.
 */
export function updateLevelGauge(state: LevelGaugeState, water: WaterLevels, powered: boolean) {
  const [low, high] = readings(state.definition, surface(state, water))
  state.reading = low
  state.active = powered && low
  if (high !== undefined) { state.highReading = high; state.highActive = powered && high }
}
/**
 * Contacts from authored water levels, or from saved levels (indexed like the run's pools),
 * for wiring previews and a facility area's doors before it runs.
 */
export function levelGaugeStates(level: { levelGauges?: readonly LevelGauge[]; gravityPlates?: readonly GravityPlate[] }, levels?: readonly number[]): LevelGaugeContacts[] {
  const pools = (level.gravityPlates ?? []).filter(plate => plate.effect === 'water')
  return (level.levelGauges ?? []).map(gauge => {
    const index = pools.findIndex(pool => markInPool(readingMark(gauge), pool)), pool = pools[index]
    let surfaceY: number | undefined
    if (pool) {
      const minimum = pool.waterMinLevel ?? 0
      surfaceY = waterSurfaceY(pool, Math.max(minimum, Math.min(100, levels?.[index] ?? Math.max(minimum, pool.waterLevel ?? 100))))
    }
    const [active, highActive] = readings(gauge, surfaceY)
    return highActive === undefined ? { active } : { active, highActive }
  })
}

const BOARD = '#ebe4cf', BOARD_EDGE = '#8b9389', TICK = '#56645c', MARK = '#b04a3c', BRACKET = '#738575'
const HEAD_SHADE = '#5f7064', LENS_BEZEL = '#4f5e54', LENS_OFF = '#9aa38e', LENS_ON = '#a9d56b'
/**
 * A slim cream depth board with graduations and a bold mark at each switching height, hanging
 * from a steel head whose lens lights while the gauge reads. A two-mark gauge also stands on a
 * matching steel foot: the head's lens is the high mark's lamp and the foot's the low mark's.
 * The housings and lenses match the wall light and exit lamp, so the lights read as part of the
 * instrument. Wall art: the pool's own water passes in front of it. `active` lights the single
 * or low mark's lamp, `highActive` the high mark's.
 */
export function drawLevelGauge(ctx: CanvasRenderingContext2D, gauge: LevelGauge, active: boolean, paint: WorldPaint = paintNormally, highActive = false) {
  const two = isTwoMarkGauge(gauge), board = levelGaugeBoard(gauge), left = gauge.x - LEVEL_GAUGE_WIDTH / 2, marks = levelGaugeMarks(gauge)
  ctx.save()
  paint(ctx, 0, () => {
    // A bracket fixes the foot of a one-mark board to the wall; the head holds the top.
    ctx.fillStyle = BRACKET
    if (!two) ctx.fillRect(left - 2, board.bottom - 6, LEVEL_GAUGE_WIDTH + 4, 3)
    ctx.fillStyle = BOARD; ctx.strokeStyle = BOARD_EDGE; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(left, board.top, LEVEL_GAUGE_WIDTH, board.bottom - board.top, 2); ctx.fill(); ctx.stroke()
    // Graduations every 8 units from the (top) mark, longer every 24, all read from the left edge.
    ctx.strokeStyle = TICK; ctx.lineWidth = 1.25; ctx.beginPath()
    const first = Math.ceil((board.top + 4 - marks[0]) / 8), last = Math.floor((board.bottom - 4 - marks[0]) / 8)
    for (let step = first; step <= last; step++) {
      const y = marks[0] + step * 8, long = step % 3 === 0
      if (marks.some(mark => Math.abs(y - mark) < 4)) continue
      ctx.moveTo(left + 1.5, y); ctx.lineTo(left + (long ? LEVEL_GAUGE_WIDTH - 2.5 : 5.5), y)
    }
    ctx.stroke()
  })
  // The marks stay faintly readable in the dark.
  paint(ctx, .65, () => {
    ctx.strokeStyle = MARK; ctx.fillStyle = MARK; ctx.lineWidth = 3; ctx.lineCap = 'butt'
    const right = left + LEVEL_GAUGE_WIDTH
    for (const y of marks) {
      ctx.beginPath(); ctx.moveTo(left - MARK_REACH, y); ctx.lineTo(right + MARK_REACH, y); ctx.stroke()
      // Pointers either side stand taller than a waterline drawn across the mark, so it still shows when met.
      ctx.beginPath()
      ctx.moveTo(left, y); ctx.lineTo(left - MARK_REACH, y - 3.5); ctx.lineTo(left - MARK_REACH, y + 3.5); ctx.closePath()
      ctx.moveTo(right, y); ctx.lineTo(right + MARK_REACH, y - 3.5); ctx.lineTo(right + MARK_REACH, y + 3.5); ctx.closePath()
      ctx.fill()
    }
  })
  const lamps = levelGaugeLamps(gauge)
  const housing = (lens: { x: number; y: number }, foot: boolean) => paint(ctx, 0, () => {
    // A rounded steel housing, shaded where it grips the board.
    const top = lens.y - HEAD_H / 2
    ctx.fillStyle = BRACKET
    ctx.beginPath(); ctx.roundRect(gauge.x - HEAD_W / 2, top, HEAD_W, HEAD_H, foot ? [2, 2, 5, 5] : [5, 5, 2, 2]); ctx.fill()
    ctx.fillStyle = HEAD_SHADE; ctx.fillRect(gauge.x - HEAD_W / 2, foot ? top : top + HEAD_H - 3, HEAD_W, 3)
    ctx.fillStyle = LENS_BEZEL; ctx.beginPath(); ctx.arc(lens.x, lens.y, LENS_R + 1.5, 0, Math.PI * 2); ctx.fill()
  })
  // Lit, a lens keeps its full colour in the dark, like a wall light.
  const lens = (at: { x: number; y: number }, lit: boolean) => paint(ctx, lit ? 1 : 0, () => {
    ctx.fillStyle = lit ? LENS_ON : LENS_OFF; ctx.beginPath(); ctx.arc(at.x, at.y, LENS_R, 0, Math.PI * 2); ctx.fill()
  })
  housing(lamps.head, false)
  if (lamps.foot) housing(lamps.foot, true)
  lens(lamps.head, two ? highActive : active)
  if (lamps.foot) lens(lamps.foot, active)
  ctx.restore()
}
