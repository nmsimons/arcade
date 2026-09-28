import test from 'node:test'
import assert from 'node:assert/strict'
import { PerformanceMonitor } from '../src/games/jumping/performanceMonitor.ts'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} should equal ${expected}`)

test('reports real frame cadence at different refresh rates and publishes at most twice per second', () => {
  for (const hz of [30, 60, 120, 144, 240]) {
    const monitor = new PerformanceMonitor()
    let summary, publications = 0
    for (let i = 0; i <= hz * 4; i++) {
      const result = monitor.record(i * 1000 / hz, 2, 5, 120 / hz)
      if (result) { summary = result; publications++ }
    }
    near(summary.fps, hz)
    near(summary.frameMs, 1000 / hz)
    near(summary.p95Ms, 1000 / hz)
    near(summary.updateMs, 2); near(summary.drawMs, 5); near(summary.steps, 120 / hz)
    assert.ok(publications >= 7 && publications <= 8)
  }
})

test('includes uncapped stalls in FPS, p95, worst frame and slow frame counts', () => {
  const monitor = new PerformanceMonitor()
  let now = 0
  monitor.record(now, 0, 0, 0)
  for (let i = 0; i < 18; i++) { now += 16; monitor.record(now, 1, 2, 2) }
  now += 80; monitor.record(now, 1, 2, 6)
  now += 1000
  const summary = monitor.record(now, 1, 2, 6)
  near(summary.fps, 20 * 1000 / 1368)
  near(summary.p95Ms, 80)
  near(summary.worstMs, 1000)
  assert.equal(summary.slowFrames, 2)
})

test('a pause/reset starts a fresh window without recording the suspended interval', () => {
  const monitor = new PerformanceMonitor()
  monitor.record(0, 0, 0, 0)
  assert.equal(monitor.record(1000, 50, 80, 6).worstMs, 1000)
  monitor.reset()
  assert.equal(monitor.record(30000, 1, 2, 2), null)
  let summary
  for (let i = 1; i <= 32; i++) summary = monitor.record(30000 + 16 * i, 1, 2, 2) ?? summary
  near(summary.worstMs, 16)
  near(summary.updateMs, 1)
  assert.equal(summary.slowFrames, 0)
})

test('old hitches age out and even extreme refresh rates keep bounded, detached history', () => {
  const monitor = new PerformanceMonitor()
  monitor.record(0, 0, 0, 0)
  const first = monitor.record(500, 10, 20, 6)
  first.history[0].ms = 9999
  let summary
  for (let now = 501; now <= 4000; now++) summary = monitor.record(now, 1, 2, 0) ?? summary
  assert.equal(summary.history.length, 1024)
  near(summary.worstMs, 1)
  near(summary.fps, 1000)
  assert.equal(summary.slowFrames, 0)
  assert.ok(summary.history.every(frame => frame.time > -2000))
})
