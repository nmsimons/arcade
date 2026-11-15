import type { NamedObject } from './objectNames.ts'
import { DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT, DIGITAL_GREEN, DIGITAL_AMBER, DIGITAL_RED, drawDigitalDisplay } from './digitalDisplay.ts'
import type { DigitalIcon } from './digitalDisplay.ts'
import type { WorldPaint } from './worldPaint.ts'
import type { Grade } from './grading.ts'
/** Wall-timer positions are the top-left of the display, in world coordinates. */
export interface WallTimer extends NamedObject { x: number; y: number }
/** Six tiles by two tiles on the level's 20-unit grid. */
export const WALL_TIMER_WIDTH = DIGITAL_DISPLAY_WIDTH
export const WALL_TIMER_HEIGHT = DIGITAL_DISPLAY_HEIGHT

/** Only the face saturates; score timing retains its full precision and range. */
export function formatWallTime(seconds: number) {
  const total = Math.min(3599, Math.max(0, Math.floor(seconds + 1e-7)))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Clocks count the run's time up from zero. `warning` lights them red for the flash of each power-down warning beat. */
export function drawWallTimer(ctx: CanvasRenderingContext2D, timer: WallTimer, seconds: number,
  status?: Exclude<DigitalIcon, 'coin'>, paint?: WorldPaint, grade?: Grade, warning = false) {
  const color = warning || status === 'fast' ? DIGITAL_RED : status === 'pause' ? DIGITAL_AMBER : DIGITAL_GREEN
  drawDigitalDisplay(ctx, timer.x, timer.y, formatWallTime(seconds), color, status, paint, { grade, dimmed: grade === 'F' })
}
