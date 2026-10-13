import { stressRun, stressSnapshot } from './labStressScene.mjs'
import { stepRun } from '../../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../../src/games/jumping/model.ts'
import { LightingRenderer, lightingPixelRatio } from '../../src/games/jumping/lightingRender.ts'
import { lightingForLevel } from '../../src/games/jumping/lightingDefinition.ts'
import { gameCamera } from '../../src/games/jumping/camera.ts'
import { ropeQuality } from './labRopeQuality.mjs'

const stats = values => {
  const sorted = values.toSorted((a, b) => a - b), n = sorted.length
  return { samples: n, mean: values.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.ceil(n * .5) - 1], p95: sorted[Math.ceil(n * .95) - 1],
    p99: sorted[Math.ceil(n * .99) - 1], max: sorted.at(-1) }
}
window.labStress = {
  async runCase({ fixture, scenario, frames, warmup, width, height, dpr, profileWindow }) {
    const run = stressRun(fixture, scenario), renderer = new LightingRenderer({ backend: 'auto' })
    const canvas = document.createElement('canvas'), ratio = lightingPixelRatio(width, height, dpr)
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
    document.body.style.margin = '0'; document.body.replaceChildren(canvas)
    const ctx = renderer.drawingContext(canvas), definition = lightingForLevel(run.level)
    const samples = { simulation: [], draw: [], cpu: [], intervals: [], movingProps: [], movingRopes: [], movingLifts: [] }
    const started = performance.now()
    let previous = 0, metrics, peakBuffers = 0, totalLights = 0, maxEdges = 0
    try {
      for (let frame = 0; frame <= warmup + frames; frame++) {
        if (document.hidden) throw new Error('Benchmark document became hidden')
        const now = await new Promise(requestAnimationFrame)
        // Observe the final measured frame in a trailing callback without work.
        if (frame > warmup) samples.intervals.push(now - previous)
        if (frame === warmup + frames) break
        // Diagnostic-only hooks; ordinary measurements have no profiler callbacks.
        if (profileWindow && frame === profileWindow.start) await window.labStressProfileBoundary('start')
        const begin = performance.now(), liftPositions = run.mechanisms.map(m => [m.x, m.y])
        stepRun(run, NEUTRAL_INPUT, STEP); stepRun(run, NEUTRAL_INPUT, STEP)
        const updated = performance.now(), view = gameCamera(width, height, run.player, run.level, true)
        if (scenario.scroll) { view.x += Math.sin(frame / 30) * 50; view.y += Math.sin(frame / 45) * 15 }
        metrics = renderer.render(ctx, run, definition, { ...view, zoom: view.zoom * ratio,
          width: canvas.width, height: canvas.height }, 1 / 60)
        const drawn = performance.now()
        peakBuffers = Math.max(peakBuffers, metrics.bufferBytes); totalLights = Math.max(totalLights, metrics.lights); maxEdges = Math.max(maxEdges, metrics.edges)
        if (frame >= warmup) {
          samples.simulation.push(updated - begin); samples.draw.push(drawn - updated); samples.cpu.push(drawn - begin)
          samples.movingProps.push(run.props.filter(p => Math.hypot(p.vx, p.vy) > 1 || Math.abs(p.angularVelocity) > .01).length)
          samples.movingRopes.push((run.player.ropes ?? []).filter(r => r.nodes.some(n => Math.abs(n.x - n.oldX) + Math.abs(n.y - n.oldY) > .0005)).length)
          samples.movingLifts.push(run.mechanisms.filter((m, i) => m.x !== liftPositions[i][0] || m.y !== liftPositions[i][1]).length)
        }
        previous = now
        if (profileWindow && frame + 1 === profileWindow.end) await window.labStressProfileBoundary('stop')
      }
      if (run.finished) throw new Error('Stress scene unexpectedly completed')
      const intervals = stats(samples.intervals)
      return { scenario: scenario.id, backend: 'javascript', frames, warmup, elapsedMs: performance.now() - started,
        fps: 1000 / intervals.mean, simulation: stats(samples.simulation), draw: stats(samples.draw), cpu: stats(samples.cpu), intervals,
        over16_9ms: samples.intervals.filter(ms => ms > 16.9).length, over33_83ms: samples.intervals.filter(ms => ms > 33.83).length,
        activity: { props: stats(samples.movingProps), ropes: stats(samples.movingRopes), lifts: stats(samples.movingLifts) },
        renderer: { backend: metrics.backend, lights: totalLights, edges: maxEdges, peakBuffers,
          backingWidth: canvas.width, backingHeight: canvas.height, ratio },
        ropeQuality: ropeQuality(run), samples, snapshot: stressSnapshot(run) }
    } finally { renderer.dispose() }
  },
}
