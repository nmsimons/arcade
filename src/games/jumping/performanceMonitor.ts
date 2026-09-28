const CAPACITY = 1024
const WINDOW_MS = 2000
const PUBLISH_MS = 500

export interface PerformanceSummary {
  fps: number
  frameMs: number
  p95Ms: number
  worstMs: number
  updateMs: number
  drawMs: number
  steps: number
  slowFrames: number
  seconds: number
  history: { time: number; ms: number }[]
}

export interface PerformanceSnapshot extends PerformanceSummary {
  width: number
  height: number
  scale: number
  dpr: number
  shadows: 'full' | 'structural'
  lighting: { lights: number; edges: number; bufferBytes: number; backend: 'gpu' | 'canvas' } | null
}

/** Opt-in, bounded frame history. Uses raw rAF intervals, never the physics dt cap. */
export class PerformanceMonitor {
  private times = new Float64Array(CAPACITY)
  private intervals = new Float64Array(CAPACITY)
  private updates = new Float64Array(CAPACITY)
  private draws = new Float64Array(CAPACITY)
  private stepCounts = new Float64Array(CAPACITY)
  private cursor = 0
  private count = 0
  private previous: number | null = null
  private published = 0

  reset() {
    this.cursor = 0; this.count = 0; this.previous = null; this.published = 0
  }

  record(now: number, updateMs: number, drawMs: number, steps: number): PerformanceSummary | null {
    const previous = this.previous
    this.previous = now
    if (previous === null) { this.published = now; return null }
    const interval = now - previous
    if (interval <= 0) return null
    const index = this.cursor
    this.times[index] = now; this.intervals[index] = interval
    this.updates[index] = updateMs; this.draws[index] = drawMs; this.stepCounts[index] = steps
    this.cursor = (index + 1) % CAPACITY
    this.count = Math.min(this.count + 1, CAPACITY)
    if (now - this.published < PUBLISH_MS) return null
    this.published = now
    const history: PerformanceSummary['history'] = []
    let elapsed = 0, update = 0, draw = 0, ticks = 0, slowFrames = 0
    for (let offset = this.count; offset > 0; offset--) {
      const i = (this.cursor - offset + CAPACITY) % CAPACITY
      if (this.times[i] <= now - WINDOW_MS) continue
      const ms = this.intervals[i]
      history.push({ time: this.times[i] - now, ms })
      elapsed += ms; update += this.updates[i]; draw += this.draws[i]; ticks += this.stepCounts[i]
      if (ms > 1000 / 30) slowFrames++
    }
    const sorted = history.map(frame => frame.ms).sort((a, b) => a - b), count = sorted.length
    return {
      fps: count * 1000 / elapsed, frameMs: elapsed / count,
      p95Ms: sorted[Math.ceil(count * .95) - 1], worstMs: sorted[count - 1],
      updateMs: update / count, drawMs: draw / count, steps: ticks / count,
      slowFrames, seconds: elapsed / 1000, history,
    }
  }
}
