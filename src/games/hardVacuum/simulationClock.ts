export const SIMULATION_STEP = 1 / 60
export const MAX_CATCH_UP_STEPS = 6

/** Fixed 60 Hz gameplay; at most 100 ms of a hitch is replayed. Excess time is discarded. */
export class SimulationClock {
  private previous: number | undefined
  private remainder = 0
  discardedSeconds = 0

  reset() { this.previous = undefined; this.remainder = 0 }

  advance(timestampMs: number, running: boolean, step: (dt: number) => void) {
    if (!Number.isFinite(timestampMs)) return 0
    const elapsed = this.previous === undefined ? 0 : Math.max(0, (timestampMs - this.previous) / 1000)
    this.previous = timestampMs
    if (!running) { this.remainder = 0; return 0 }
    const admitted = Math.min(elapsed, SIMULATION_STEP * MAX_CATCH_UP_STEPS)
    this.discardedSeconds += elapsed - admitted
    this.remainder += admitted
    let steps = 0
    while (this.remainder + 1e-10 >= SIMULATION_STEP && steps < MAX_CATCH_UP_STEPS) {
      this.remainder = Math.max(0, this.remainder - SIMULATION_STEP)
      step(SIMULATION_STEP)
      steps++
    }
    return steps
  }
}
