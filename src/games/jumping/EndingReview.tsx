import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPlayer, NEUTRAL_INPUT, STEP } from './model'
import { stepRun } from './challenge'
import { gameCamera } from './camera'
import { advanceBusEnding, busEndingFrame, BUS_ENDING_SECONDS, BUS_DEPARTURE_START_SECONDS, createBusDeparture } from './busEnding'
import type { BusEnding, EndingCamera } from './busEnding'
import { GOAL_EXIT_SECONDS, GOAL_OPEN_SECONDS } from './goal'
import { clonePreparedLevel, prepareLevelInWorker } from './levelPreparation'
import type { PreparedLevel } from './levelPreparation'
import { keyboardMovement } from './input'
import { LightingRenderer, lightingPixelRatio } from './lightingRender'
import { lightingForLevel } from './lightingDefinition'
import { parseLevel } from './level'
import './EndingReview.css'

const DURATION = Math.round((BUS_ENDING_SECONDS - BUS_DEPARTURE_START_SECONDS) * 100) / 100
type ReviewMode = 'approach' | 'departure'
/** Development-only: normal controls on Exit's final approach, without saving progress. */
export default function EndingReview() {
  const canvas = useRef<HTMLCanvasElement>(null), scene = useRef<BusEnding | null>(null)
  const source = useRef<PreparedLevel | null>(null), world = useRef<PreparedLevel | null>(null)
  const playing = useRef(true), held = useRef(new Set<string>()), modeRef = useRef<ReviewMode>('approach')
  const lastCamera = useRef<EndingCamera>({ x: 0, y: 0, zoom: 1 })
  const [mode, setMode] = useState<ReviewMode>('approach'), [running, setRunning] = useState(true)
  const [time, setTime] = useState(0), [phase, setPhase] = useState('Loading Exit…'), [error, setError] = useState('')
  const reset = useCallback((kind: ReviewMode, at = 0) => {
    if (!source.current || !canvas.current) return
    const prepared = clonePreparedLevel(source.current), run = prepared.run, goal = prepared.level.goal
    if (!run || goal?.kind !== 'bus') return
    const actor = createPlayer({ x: goal.x - (kind === 'approach' ? 900 : 34), y: goal.y })
    actor.terrain = run.platforms; prepared.player = run.player = actor
    run.started = true; run.entrance = null; run.goalLit = true; run.goalElapsed = GOAL_OPEN_SECONDS
    scene.current = null; held.current.clear()
    const camera = gameCamera(canvas.current.clientWidth, canvas.current.clientHeight, actor, prepared.level, true)
    lastCamera.current = camera
    if (kind === 'departure') {
      run.finished = true; run.exit = { elapsed: GOAL_EXIT_SECONDS, fromX: actor.x, toX: actor.x }
      scene.current = run.busDeparture = createBusDeparture(goal, actor, camera)
      advanceBusEnding(scene.current, at)
    }
    world.current = prepared; modeRef.current = kind
    setMode(kind); setTime(at); setPhase(scene.current ? busEndingFrame(scene.current).phase : 'Walk right to board')
    canvas.current.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const node = canvas.current!, renderer = new LightingRenderer(), ctx = renderer.drawingContext(node)
    const abort = new AbortController()
    let frame = 0, previous = 0, accumulator = 0
    fetch(`${import.meta.env.BASE_URL}levels/jumping/exit.jump-level.json`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Could not load Exit.'); return response.json() })
      .then(value => prepareLevelInWorker(parseLevel(value), { signal: abort.signal, play: true }))
      .then(prepared => {
        if (abort.signal.aborted) return
        source.current = prepared
        setError('')
        if (prepared.lighting) renderer.prepare(prepared.level, prepared.lighting)
        reset('approach')
      }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)) })
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || document.activeElement !== node) return
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault(); held.current.add(event.code)
      }
    }
    const keyup = (event: KeyboardEvent) => held.current.delete(event.code)
    const blur = () => { held.current.clear(); playing.current = false; setRunning(false) }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
    const tick = (now: number) => {
      const prepared = world.current, run = prepared?.run
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now
      if (prepared && run) {
        if (playing.current && !document.hidden) {
          if (!scene.current) {
            accumulator += dt
            while (accumulator >= STEP && !run.finished) {
              stepRun(run, { ...NEUTRAL_INPUT, move: keyboardMovement(held.current), jump: held.current.has('Space') })
              accumulator -= STEP
              if (run.exit) setPhase('Boarding the bus')
            }
            if (run.finished) {
              scene.current = run.busDeparture = createBusDeparture(run.level.goal, run.player, lastCamera.current)
              held.current.clear(); accumulator = 0
            }
          } else {
            const finished = advanceBusEnding(scene.current, dt)
            setTime(scene.current.elapsed - BUS_DEPARTURE_START_SECONDS); setPhase(busEndingFrame(scene.current).phase)
            if (finished) { playing.current = false; setRunning(false) }
          }
        } else accumulator = 0
        const ratio = lightingPixelRatio(node.clientWidth, node.clientHeight, window.devicePixelRatio || 1, false, true)
        const width = Math.round(node.clientWidth * ratio), height = Math.round(node.clientHeight * ratio)
        if (node.width !== width || node.height !== height) {
          node.width = width; node.height = height
          if (scene.current) scene.current.camera = gameCamera(width / ratio, height / ratio, run.player, prepared.level, true)
        }
        const camera = scene.current?.camera ?? gameCamera(width / ratio, height / ratio, run.player, prepared.level, true)
        lastCamera.current = camera
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        renderer.render(ctx, run, lightingForLevel(prepared.level), { ...camera, width, height, zoom: camera.zoom * ratio }, scene.current ? 0 : dt)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      abort.abort(); cancelAnimationFrame(frame); renderer.release(); source.current = world.current = null
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur)
    }
  }, [reset])
  function restart(kind: ReviewMode) {
    reset(kind); playing.current = true; setRunning(true)
  }
  return <main className="ending-review">
    <canvas ref={canvas} tabIndex={0} role="img" aria-label="Exit bus goal preview" onPointerDown={() => canvas.current?.focus()} />
    <div className="ending-review-controls">
      <Link to="/lab">Back to game</Link>
      {!running && <button onClick={() => {
        if (time >= DURATION) reset(modeRef.current)
        playing.current = true; held.current.clear(); setRunning(true); canvas.current?.focus()
      }}>Play</button>}
      <button onClick={() => restart(modeRef.current)}>Restart</button>
      <button onClick={() => restart(mode === 'approach' ? 'departure' : 'approach')}>{mode === 'approach' ? 'Departure preview' : 'Try boarding'}</button>
      {mode === 'departure' ? <label>Departure <input aria-label="Scene time" type="range" min="0" max={DURATION} step=".05" value={time}
        onChange={event => { reset('departure', Number(event.target.value)); playing.current = false; setRunning(false); event.currentTarget.focus() }} /></label>
        : <span>A/D or arrows to walk · Space to jump</span>}
      <output role="status" aria-live="polite" aria-label="Bus goal review">{error || phase}</output>
    </div>
  </main>
}
