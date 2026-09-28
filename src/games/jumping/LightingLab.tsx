import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import fixtureUrl from '../../../tests/fixtures/jumping/lighting-prototype.json?url'
import { createPreviewRun, createRun, stepRun } from './challenge.ts'
import type { Run } from './challenge.ts'
import { isPuzzleLevel, parseLevel } from './level.ts'
import { NEUTRAL_INPUT, STEP } from './model.ts'
import { LightingRenderer } from './lightingRender.ts'
import type { LightingDefinition } from './lightingModel.ts'
import { drawLightSources } from './lightingStudy.ts'
import './LightingLab.css'

/** A development-only art/performance experiment; no level files or scores are written. */
export default function LightingLab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<{ run: Run; lighting: LightingDefinition; renderer: LightingRenderer; time: number; liftTime: number; debt: number; samples: number[] } | null>(null)
  const keys = useRef(new Set<string>())
  const [nightMode, setNightMode] = useState(true)
  const [blackout, setBlackout] = useState(false)
  const [goal, setGoal] = useState(false)
  const [overlap, setOverlap] = useState(false)
  const [motion, setMotion] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [showSources, setShowSources] = useState(true)
  const [onlyLight, setOnlyLight] = useState('')
  const [focus, setFocus] = useState('room')
  const [liftHeight, setLiftHeight] = useState(0)
  const [cycleLift, setCycleLift] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState('Loading room…')
  const [ready, setReady] = useState(false)

  const draw = useEffectEvent((now: number, dt: number) => {
    const state = scene.current, element = canvas.current
    if (!state || !element) return
    const { run, renderer } = state
    const width = Math.max(320, Math.min(1600, Math.round(element.clientWidth)))
    const height = Math.max(200, Math.min(1000, Math.round(element.clientHeight)))
    if (element.width !== width || element.height !== height) { element.width = width; element.height = height }
    state.time += dt
    if (playing) {
      state.debt += dt
      const held = (codes: string[]) => codes.some(code => keys.current.has(code))
      while (state.debt >= STEP) {
        stepRun(run, { ...NEUTRAL_INPUT, move: Number(held(['ArrowRight', 'KeyD'])) - Number(held(['ArrowLeft', 'KeyA'])),
          jump: held(['Space']), climb: held(['ArrowUp', 'KeyW']), crouch: held(['ArrowDown', 'KeyS']), descend: held(['ArrowDown', 'KeyS']) })
        state.debt -= STEP
      }
    } else {
      run.pickupTime = state.time
      run.empRemaining = blackout ? 5 : 0; run.goalLit = goal; run.goalElapsed = goal ? .3 : 0
      const box = run.props[0]
      box.x = 700 + (motion ? Math.sin(state.time * .55) * 85 : 0)
      box.angle = motion ? Math.sin(state.time * .4) * .14 : 0
      run.robots[0].seesPlayer = true
      const lift = run.mechanisms[0]
      if (cycleLift && !blackout) state.liftTime += dt
      const progress = cycleLift ? (1 - Math.cos(state.liftTime * Math.PI / 3)) / 2 : liftHeight / 100
      lift.y = lift.definition.y - lift.definition.travel * progress
      if (cycleLift && now - Number(element.dataset.liftUiTime ?? 0) > 100) {
        setLiftHeight(Math.round(progress * 100)); element.dataset.liftUiTime = String(now)
      }
    }
    const lights = state.lighting.lights.map(light => ({ ...light }))
    if (overlap) Object.assign(lights[1], { ...lights[0], id: lights[1].id })
    const definition = { nightMode, ambient: 0, lights }
    const subject = focus === 'bot' ? { x: run.robots[0].x, y: run.robots[0].y - 35, w: 220, h: 160 }
      : focus === 'player' ? { x: run.player.x, y: run.player.y - 45, w: 320, h: 220 }
      : focus === 'props' ? { x: (run.props[0].x + run.props[1].x) / 2, y: 565, w: 460, h: 300 }
      : { x: 640, y: 320, w: 1360, h: 720 }
    const zoom = Math.min(width / subject.w, height / subject.h)
    const view = { width, height, zoom, x: subject.x - width / zoom / 2, y: subject.y - height / zoom / 2 }
    const start = performance.now()
    const ctx = element.getContext('2d')!
    const metrics = renderer.render(ctx, run, definition, view, dt, onlyLight || undefined)
    state.samples.push(performance.now() - start)
    if (showSources) drawLightSources(ctx, metrics.sources, view, onlyLight || undefined)
    if (state.samples.length > 120) state.samples.shift()
    if (now - Number(element.dataset.statsTime ?? 0) > 600) {
      const sorted = [...state.samples].sort((a, b) => a - b)
      setStats(`${metrics.lights} ${metrics.lights === 1 ? 'light' : 'lights'} · ${metrics.edges} edges · ${(metrics.bufferBytes / 1048576).toFixed(1)} MiB · render p95 ${sorted[Math.floor(sorted.length * .95)].toFixed(1)} ms`)
      element.dataset.statsTime = String(now)
    }
  })
  useEffect(() => {
    const abort = new AbortController()
    let frame = 0, previous = performance.now()
    fetch(fixtureUrl, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error('Could not load the lighting room.')
      return response.json()
    }).then(fixture => {
      if (abort.signal.aborted) return
      const level = parseLevel(fixture.level)
      if (!isPuzzleLevel(level)) throw new Error('The lighting fixture needs a puzzle level.')
      scene.current = { run: createPreviewRun(level), lighting: fixture.lighting, renderer: new LightingRenderer(), time: 0, liftTime: 0, debt: 0, samples: [] }
      setReady(true)
      const tick = (now: number) => {
        const dt = document.hidden ? 0 : Math.min(.05, (now - previous) / 1000)
        previous = now; draw(now, dt); frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not open lighting lab.') })
    const release = () => keys.current.clear()
    window.addEventListener('blur', release)
    return () => { abort.abort(); cancelAnimationFrame(frame); scene.current?.renderer.dispose(); scene.current = null; window.removeEventListener('blur', release) }
  }, [])
  const restart = (play: boolean) => {
    const state = scene.current
    if (!state) return
    state.renderer.dispose(); state.renderer = new LightingRenderer()
    state.run = play ? createRun(state.run.level) : createPreviewRun(state.run.level)
    state.time = 0; state.liftTime = 0; state.debt = 0; state.samples = []; keys.current.clear(); setPlaying(play)
    setLiftHeight(0); setCycleLift(false)
    if (play) { setBlackout(false); setGoal(false); canvas.current?.focus() }
  }
  return <main className="lighting-lab">
    <header><div><p>UNTITLED JUMPING GAME · DEVELOPMENT</p><h1>After hours.</h1></div><Link to="/untitled-jumping-game">Back to game</Link></header>
    <div className="lighting-lab-controls">
      <button type="button" role="switch" aria-checked={nightMode} title="Switch between full daylight and authored night lighting" onClick={() => setNightMode(!nightMode)}>Night mode</button>
      <button type="button" aria-pressed={blackout} disabled={playing} onClick={() => setBlackout(!blackout)}>EMP blackout</button>
      <button type="button" aria-pressed={goal} disabled={playing} onClick={() => setGoal(!goal)}>Exit light</button>
      <button type="button" aria-pressed={overlap} onClick={() => setOverlap(!overlap)}>Overlap lamps</button>
      <button type="button" aria-pressed={motion} disabled={playing} onClick={() => setMotion(!motion)}>Move box</button>
      <button type="button" disabled={!ready} onClick={() => restart(!playing)}>{playing ? 'Inspect room' : 'Play room'}</button>
      <button type="button" disabled={!ready} onClick={() => restart(playing)}>Reset</button>
    </div>
    <div className="lighting-lab-study" aria-label="Shadow inspection">
      <label>View <select value={focus} onChange={e => setFocus(e.target.value)}>
        <option value="room">Room</option><option value="player">Player</option><option value="bot">Shovebot</option><option value="props">Box and ball</option>
      </select></label>
      <button type="button" aria-pressed={showSources} onClick={() => setShowSources(!showSources)}>Show sources</button>
      <label>Light <select value={onlyLight} onChange={e => { setOnlyLight(e.target.value); if (scene.current) scene.current.samples = [] }}>
        <option value="">All sources</option>
        <option value="spot-left">1 · Spotlight</option><option value="spot-middle">2 · Spotlight</option>
        <option value="spot-right">3 · Spotlight</option>
      </select></label>
      <label className="lighting-lab-lift">Elevator <input aria-label="Elevator position" type="range" min="0" max="100" value={liftHeight}
        disabled={playing || !ready} onChange={e => { setCycleLift(false); setLiftHeight(Number(e.target.value)) }} /><output>{liftHeight}%</output></label>
      <button type="button" aria-pressed={cycleLift} disabled={playing || !ready} onClick={() => {
        if (!cycleLift && scene.current) scene.current.liftTime = Math.acos(1 - 2 * liftHeight / 100) * 3 / Math.PI
        setCycleLift(!cycleLift)
      }}>Cycle elevator</button>
    </div>
    <canvas ref={canvas} tabIndex={0} aria-label="Lighting prototype room" data-ready={ready}
      onKeyDown={e => { if (playing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) { e.preventDefault(); keys.current.add(e.code) } }}
      onKeyUp={e => { keys.current.delete(e.code) }} onBlur={() => keys.current.clear()} />
    <footer><span>{playing ? 'Arrows / WASD to move · hold and release Space to jump.' : 'Lighting study · ambient, occlusion, overlap, and readable objects.'}</span><output>{stats}</output></footer>
    {error && <p role="alert">{error}</p>}
  </main>
}
