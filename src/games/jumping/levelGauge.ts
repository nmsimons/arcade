import type { NamedObject } from './objectNames.ts'
import type { WallWiringSettings } from './switchPower.ts'
import type { GravityPlate } from './gravity.ts'
import { effectiveWaterLevel, waterSurfaceY } from './waterLevel.ts'
import type { WaterLevels } from './waterLevel.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

/**
 * A depth board on the wall of a pool, with a lamp above it. `x, y` is the mark:
 * the gauge reads the waterline of the pool it is mounted in, exactly, so a gate
 * or pump wired to it switches on the frame the water reaches the mark.
 */
export interface LevelGauge extends NamedObject, WallWiringSettings {
  id: string; x: number; y: number; targets: string[]; activeWhen?: 'above' | 'below'
}
/** `pool` indexes the run's water pools; -1 when the mark is in no pool, and the gauge never switches on. */
export interface LevelGaugeState { definition: LevelGauge; pool: number; reading: boolean; active: boolean }
export const MAX_LEVEL_GAUGES = 16
/** A waterline this close to the mark counts as at it, so float rounding cannot leave a full pool short. */
export const LEVEL_GAUGE_TOLERANCE = .05
export const LEVEL_GAUGE_WIDTH = 12, LEVEL_GAUGE_HEIGHT = 96
/** The mark line reaches this far past each side of the board. */
const MARK_REACH = 5
/** The steel head the board hangs from, a little wider than the board, with the lamp's lens set in it. */
const HEAD_W = 18, HEAD_H = 20, LENS_R = 5.5, HEAD_OVERLAP = 3

/** The lamp's lens, in the head at the top of the board. */
export const levelGaugeLamp = (gauge: Pick<LevelGauge, 'x' | 'y'>) => ({ x: gauge.x, y: gauge.y - LEVEL_GAUGE_HEIGHT / 2 - HEAD_H / 2 + HEAD_OVERLAP })
/** Head, board and mark line: for validation, hit-testing and selection. */
export function levelGaugeBounds(gauge: Pick<LevelGauge, 'x' | 'y'>) {
  const half = Math.max(HEAD_W / 2, LEVEL_GAUGE_WIDTH / 2 + MARK_REACH), top = gauge.y - LEVEL_GAUGE_HEIGHT / 2 - HEAD_H + HEAD_OVERLAP
  return { x: gauge.x - half, y: top, w: half * 2, h: gauge.y + LEVEL_GAUGE_HEIGHT / 2 - top }
}
/** Mounted in a level, the lamp must be inside it; the lower half of the board may run on behind the floor. */
export function levelGaugeFits(gauge: Pick<LevelGauge, 'x' | 'y'>, width: number, height: number) {
  const b = levelGaugeBounds(gauge)
  return b.x >= 0 && b.x + b.w <= width && b.y >= 0 && gauge.y <= height
}

/** Edges count: a full pool's surface sits on its top edge, and an empty one's on its bottom. */
export const markInPool = (gauge: Pick<LevelGauge, 'x' | 'y'>, plate: Pick<GravityPlate, 'x' | 'y' | 'w' | 'h'>) =>
  gauge.x >= plate.x && gauge.x <= plate.x + plate.w && gauge.y >= plate.y && gauge.y <= plate.y + plate.h
/** The first water pool, in authored order, whose rectangle contains the mark. */
export const levelGaugePool = (gauge: Pick<LevelGauge, 'x' | 'y'>, plates: readonly GravityPlate[]) =>
  plates.find(plate => plate.effect === 'water' && markInPool(gauge, plate))
/** Whether a waterline at `surfaceY` reads as on: at or above the mark, or at or below it. */
export const levelGaugeReads = (gauge: Pick<LevelGauge, 'y' | 'activeWhen'>, surfaceY: number) =>
  gauge.activeWhen === 'below' ? surfaceY >= gauge.y - LEVEL_GAUGE_TOLERANCE : surfaceY <= gauge.y + LEVEL_GAUGE_TOLERANCE

function poolIndex(definition: LevelGauge, water: WaterLevels) {
  return water.pools.findIndex(pool => markInPool(definition, pool.definition))
}
function reading(state: Pick<LevelGaugeState, 'definition' | 'pool'>, water: WaterLevels) {
  // Pumped water counts as soon as it is pumped, before the 30 Hz step applies it to the region.
  const pool = water.pools[state.pool]
  return !!pool && levelGaugeReads(state.definition, waterSurfaceY(pool.definition, effectiveWaterLevel(pool)))
}
/** Reads the run's live water, which starts at the authored levels, including input still pending. */
export function createLevelGauge(definition: LevelGauge, water: WaterLevels): LevelGaugeState {
  const state = { definition, pool: poolIndex(definition, water), reading: false, active: false }
  state.reading = state.active = reading(state, water)
  return state
}
/**
 * Like a float switch, EMP and the power-down suppress the contact. Each frame the run reads
 * gauges and resolves switches before `advanceWaterLevels` adds that frame's pump input, so a
 * pump a gauge guards stops on the frame its pumped water reaches the mark.
 */
export function updateLevelGauge(state: LevelGaugeState, water: WaterLevels, powered: boolean) {
  state.reading = reading(state, water)
  state.active = powered && state.reading
}
/**
 * Contacts from authored water levels, or from saved levels (indexed like the run's pools),
 * for wiring previews and a facility area's doors before it runs.
 */
export function levelGaugeStates(level: { levelGauges?: readonly LevelGauge[]; gravityPlates?: readonly GravityPlate[] }, levels?: readonly number[]) {
  const pools = (level.gravityPlates ?? []).filter(plate => plate.effect === 'water')
  return (level.levelGauges ?? []).map(gauge => {
    const index = pools.findIndex(pool => markInPool(gauge, pool)), pool = pools[index]
    if (!pool) return { active: false }
    const minimum = pool.waterMinLevel ?? 0, percent = Math.max(minimum, Math.min(100, levels?.[index] ?? Math.max(minimum, pool.waterLevel ?? 100)))
    return { active: levelGaugeReads(gauge, waterSurfaceY(pool, percent)) }
  })
}

const BOARD = '#ebe4cf', BOARD_EDGE = '#8b9389', TICK = '#56645c', MARK = '#b04a3c', BRACKET = '#738575'
const HEAD_SHADE = '#5f7064', LENS_BEZEL = '#4f5e54', LENS_OFF = '#9aa38e', LENS_ON = '#a9d56b'
/**
 * A slim cream depth board with graduations and a bold mark at the switching height,
 * hanging from a steel head whose lens lights while the gauge reads. The head and lens
 * match the wall light and exit lamp, so the light reads as part of the instrument.
 * Wall art: the pool's own water passes in front of it.
 */
export function drawLevelGauge(ctx: CanvasRenderingContext2D, gauge: LevelGauge, active: boolean, paint: WorldPaint = paintNormally) {
  const left = gauge.x - LEVEL_GAUGE_WIDTH / 2, top = gauge.y - LEVEL_GAUGE_HEIGHT / 2
  ctx.save()
  paint(ctx, 0, () => {
    // A bracket fixes the foot of the board to the wall; the head holds the top.
    ctx.fillStyle = BRACKET
    ctx.fillRect(left - 2, top + LEVEL_GAUGE_HEIGHT - 6, LEVEL_GAUGE_WIDTH + 4, 3)
    ctx.fillStyle = BOARD; ctx.strokeStyle = BOARD_EDGE; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(left, top, LEVEL_GAUGE_WIDTH, LEVEL_GAUGE_HEIGHT, 2); ctx.fill(); ctx.stroke()
    // Graduations every 8 units from the mark, longer every 24, all read from the left edge.
    ctx.strokeStyle = TICK; ctx.lineWidth = 1.25; ctx.beginPath()
    for (let step = -5; step <= 5; step++) {
      if (!step) continue
      const y = gauge.y + step * 8, long = step % 3 === 0
      ctx.moveTo(left + 1.5, y); ctx.lineTo(left + (long ? LEVEL_GAUGE_WIDTH - 2.5 : 5.5), y)
    }
    ctx.stroke()
  })
  // The mark stays faintly readable in the dark.
  paint(ctx, .65, () => {
    ctx.strokeStyle = MARK; ctx.fillStyle = MARK; ctx.lineWidth = 3; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.moveTo(left - MARK_REACH, gauge.y); ctx.lineTo(left + LEVEL_GAUGE_WIDTH + MARK_REACH, gauge.y); ctx.stroke()
    // Pointers either side stand taller than a waterline drawn across the mark, so it still shows when met.
    const right = left + LEVEL_GAUGE_WIDTH
    ctx.beginPath()
    ctx.moveTo(left, gauge.y); ctx.lineTo(left - MARK_REACH, gauge.y - 3.5); ctx.lineTo(left - MARK_REACH, gauge.y + 3.5); ctx.closePath()
    ctx.moveTo(right, gauge.y); ctx.lineTo(right + MARK_REACH, gauge.y - 3.5); ctx.lineTo(right + MARK_REACH, gauge.y + 3.5); ctx.closePath()
    ctx.fill()
  })
  const lens = levelGaugeLamp(gauge), headTop = lens.y - HEAD_H / 2
  paint(ctx, 0, () => {
    // The head caps the board: a rounded steel housing, shaded along its foot where it grips the board.
    ctx.fillStyle = BRACKET
    ctx.beginPath(); ctx.roundRect(gauge.x - HEAD_W / 2, headTop, HEAD_W, HEAD_H, [5, 5, 2, 2]); ctx.fill()
    ctx.fillStyle = HEAD_SHADE; ctx.fillRect(gauge.x - HEAD_W / 2, headTop + HEAD_H - 3, HEAD_W, 3)
    ctx.fillStyle = LENS_BEZEL; ctx.beginPath(); ctx.arc(lens.x, lens.y, LENS_R + 1.5, 0, Math.PI * 2); ctx.fill()
  })
  // Lit, the lens keeps its full colour in the dark, like a wall light.
  paint(ctx, active ? 1 : 0, () => {
    ctx.fillStyle = active ? LENS_ON : LENS_OFF; ctx.beginPath(); ctx.arc(lens.x, lens.y, LENS_R, 0, Math.PI * 2); ctx.fill()
  })
  ctx.restore()
}
