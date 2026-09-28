import { memo } from 'react'
import type { PerformanceSnapshot } from './performanceMonitor'
import './performance.css'

export const PerformancePanel = memo(function PerformancePanel({ snapshot, paused = false }: {
  snapshot: PerformanceSnapshot | null; paused?: boolean
}) {
  const ceiling = Math.max(50, snapshot?.worstMs ?? 0)
  const y = (ms: number) => 40 - ms / ceiling * 38
  // Keep spikes when reducing high-refresh-rate history to a small graph.
  const buckets = new Map<number, number>()
  for (const frame of snapshot?.history ?? []) {
    const x = Math.max(0, Math.min(119, Math.round((frame.time + 2000) / 2000 * 119)))
    buckets.set(x, Math.max(buckets.get(x) ?? 0, frame.ms))
  }
  const path = [...buckets].map(([x, ms], i) => `${i ? 'L' : 'M'}${x * 2},${y(ms).toFixed(1)}`).join(' ')
  return <aside className={`jumping-performance${paused ? ' is-paused' : ''}`} aria-label="Performance monitor" aria-live="off">
    <header><strong>Performance</strong><span>{paused ? 'Paused · last sample' : 'F2 to hide'}</span></header>
    {snapshot ? <>
      <div className="jumping-performance-rate"><strong>{snapshot.fps.toFixed(0)} <small>FPS</small></strong><span>Last {snapshot.seconds.toFixed(1)} s</span></div>
      <svg viewBox="0 0 240 44" role="img" aria-label={`Frame times over the last two seconds; worst ${snapshot.worstMs.toFixed(1)} milliseconds. Dashed line: 16.7 milliseconds, or 60 FPS.`}>
        <line x1="0" x2="240" y1={y(1000 / 60)} y2={y(1000 / 60)} stroke="currentColor" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="jumping-performance-legend"><span>Frame time · ms</span><span>Dashed: 60 FPS</span></div>
      <dl>
        <div><dt>Frame avg / p95</dt><dd>{snapshot.frameMs.toFixed(1)} / {snapshot.p95Ms.toFixed(1)} ms</dd></div>
        <div><dt>Worst frame</dt><dd>{snapshot.worstMs.toFixed(1)} ms</dd></div>
        <div><dt>Frames &gt;33.3 ms</dt><dd>{snapshot.slowFrames}</dd></div>
        <div><dt>Update / draw CPU</dt><dd>{snapshot.updateMs.toFixed(1)} / {snapshot.drawMs.toFixed(1)} ms</dd></div>
        <div><dt>Physics steps/frame</dt><dd>{snapshot.steps.toFixed(1)}</dd></div>
        <div><dt>Canvas pixels</dt><dd>{snapshot.width} × {snapshot.height}</dd></div>
        <div><dt>Render scale / DPR</dt><dd>{snapshot.scale.toFixed(2)} / {snapshot.dpr.toFixed(2)}</dd></div>
        <div><dt>Lighting renderer</dt><dd>{snapshot.lighting ? snapshot.lighting.backend === 'gpu' ? 'GPU' : 'Canvas' : 'Off'}</dd></div>
        <div><dt>Lights / shadow edges</dt><dd>{snapshot.lighting ? `${snapshot.lighting.lights} / ${snapshot.lighting.edges}` : 'Off'}</dd></div>
        <div><dt>Object shadows</dt><dd>{snapshot.shadows === 'full' ? 'On' : 'Off · adaptive'}</dd></div>
        <div><dt>Lighting buffers (est.)</dt><dd>{((snapshot.lighting?.bufferBytes ?? 0) / 1048576).toFixed(1)} MiB</dd></div>
      </dl>
      <p>CPU averages exclude GPU and compositing.<br />p95: 95% of frames were this fast or faster.</p>
    </> : <p>{paused ? 'Resume to collect frame timings.' : 'Collecting frame timings…'}</p>}
  </aside>
})
