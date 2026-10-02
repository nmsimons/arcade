/** Performance mode is enabled by default in every build. Judge two complete slow
 * seconds below 35 FPS, leaving headroom above the 30 FPS minimum rather than
 * chasing 60 FPS at the expense of quality. Ignore one hitch or device identity.
 * Latch for the run to avoid flicker
 * and repeated probes; restarting or disabling the mode restores normal resolution. */
export class AdaptiveLighting {
  reduced = false
  private previous: number | null = null
  private elapsed = 0
  private frames = 0
  private slowWindows = 0

  suspend() { this.previous = null; this.elapsed = 0; this.frames = 0; this.slowWindows = 0 }
  reset() { this.reduced = false; this.suspend() }

  observe(now: number) {
    const previous = this.previous; this.previous = now
    if (this.reduced || previous === null || now <= previous) return this.reduced
    this.elapsed += now - previous; this.frames++
    if (this.elapsed >= 1000) {
      this.slowWindows = this.frames * 1000 / this.elapsed < 35 ? this.slowWindows + 1 : 0
      this.elapsed = 0; this.frames = 0
      if (this.slowWindows >= 2) this.reduced = true
    }
    return this.reduced
  }
}
