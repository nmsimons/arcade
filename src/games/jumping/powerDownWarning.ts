import type { Run } from './challenge.ts'
import { gradeTimes } from './grading.ts'
import type { WorldPaint } from './worldPaint.ts'

/** The last stretch before the D deadline, when F would power the level down, in seconds of clock time. */
export const POWER_DOWN_WARNING_SECONDS = 10
/** The warning keeps one beat a second of play: a beep, with the wall clocks lit red for this first part of it. */
export const POWER_DOWN_FLASH_SECONDS = .5

export type WarnedRun = Pick<Run, 'level' | 'elapsed' | 'activeTime' | 'failed' | 'exit'>
/** `beat` counts whole seconds of play since the warning began; `phase` is how far into the current one. */
export interface PowerDownWarning { beat: number; phase: number; remaining: number }

/** When each run's warning began, in `activeTime`, so its beats fall a second apart from that moment. */
const onsets = new WeakMap<object, number>()

/**
 * The warning holds while fewer than ten seconds of a timed run remain before F, until the level powers down. A run
 * that reaches the exit first, or a time bonus that takes it back above ten seconds, ends it. Beats run on play time,
 * not the clock, so a stopwatch that freezes the clock does not silence it.
 */
export function powerDownWarning(run: WarnedRun): PowerDownWarning | null {
  const { level } = run
  const remaining = level.timing === 'untimed' || !level.times ? Infinity : gradeTimes({ times: level.times }).d - run.elapsed
  if (run.failed || run.exit || !(remaining < POWER_DOWN_WARNING_SECONDS - 1e-7)) { onsets.delete(run); return null }
  let onset = onsets.get(run)
  if (onset === undefined || onset > run.activeTime) { onset = run.activeTime; onsets.set(run, onset) }
  const since = run.activeTime - onset, beat = Math.floor(since + 1e-7)
  return { beat, phase: Math.max(0, since - beat), remaining: Math.max(0, remaining) }
}

/** Whether the wall clocks are lit red at this point in the beat. */
export const powerDownFlash = (warning: PowerDownWarning | null) => !!warning && warning.phase < POWER_DOWN_FLASH_SECONDS

/** How far the border glow reaches into the level, and in how many steps it fades. */
const BORDER_DEPTH = 64, BORDER_BANDS = 8

/**
 * A red glow just inside the level's border, swelling on each beat and settling to a low hold between them. Plain
 * bands of falling opacity rather than a gradient, so either renderer draws it; it lights itself, like a display.
 */
export function drawPowerDownBorder(ctx: CanvasRenderingContext2D, level: { width: number; height: number }, warning: PowerDownWarning, paint: WorldPaint) {
  const strength = .35 + .65 * Math.exp(-warning.phase * 3.5), band = BORDER_DEPTH / BORDER_BANDS
  const { width: w, height: h } = level
  paint(ctx, 1, () => {
    ctx.save(); ctx.fillStyle = '#d6483a'
    for (let i = 0; i < BORDER_BANDS; i++) {
      const inset = i * band
      ctx.globalAlpha = .55 * strength * (1 - i / BORDER_BANDS) ** 2
      ctx.fillRect(inset, inset, w - 2 * inset, band)
      ctx.fillRect(inset, h - inset - band, w - 2 * inset, band)
      ctx.fillRect(inset, inset + band, band, h - 2 * inset - 2 * band)
      ctx.fillRect(w - inset - band, inset + band, band, h - 2 * inset - 2 * band)
    }
    ctx.restore()
  }, false, { x: 0, y: 0, w, h })
}
