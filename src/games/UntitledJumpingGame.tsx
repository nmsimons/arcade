import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { cancelJumpInput, createPlayer, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { drawPlayground } from './jumping/render'
import { DEFAULT_LEVEL, isPuzzleLevel, levelPlayer, levelRules } from './jumping/level'
import type { JumpLevel, PuzzleLevel } from './jumping/level'
import { LevelBuilder } from './jumping/LevelBuilder'
import { createRun, FIRST_LEVEL, formatTime, medalFor, readBest, saveBest, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { CAMPAIGN, PLAYABLE_LEVELS } from './jumping/levels'
import { LevelThumbnail } from './jumping/LevelThumbnail'
import { drawChallenge } from './jumping/challengeRender'
import './jumping/jumping.css'

type Screen = 'menu' | 'playing' | 'paused' | 'building' | 'complete'
const PLAY_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', 'Escape', 'KeyP'])

export function UntitledJumpingGame({ onExit }: { onExit: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [initialRun] = useState(createRun)
  const run = useRef<Run | null>(initialRun)
  const player = useRef(initialRun.player), keys = useRef(new Set<string>())
  const [result, setResult] = useState({ elapsed: 0, medal: 'No medal' })
  const [challenge, setChallenge] = useState(true)
  const [trial, setTrial] = useState<PuzzleLevel>(FIRST_LEVEL)
  const [bestTimes, setBestTimes] = useState<Record<string, number | null>>(() => Object.fromEntries(PLAYABLE_LEVELS.map(l => { try { return [l.id, readBest(localStorage, l.id)] } catch { return [l.id, null] } })))
  const best = bestTimes[trial.id] ?? null
  const campaignIndex = CAMPAIGN.findIndex(l => l.id === trial.id)
  const [saveError, setSaveError] = useState(false)
  const terrain = useRef(levelTerrain(DEFAULT_LEVEL))
  const activeLevel = useRef(DEFAULT_LEVEL), rules = useRef(levelRules(DEFAULT_LEVEL))
  const [builderStarted, setBuilderStarted] = useState(false), [testing, setTesting] = useState(false)
  const jumpQueue = useRef<boolean[]>([]), keyboardJump = useRef(false)
  const [controller] = useState(createJumpController)
  const [screen, setScreen] = useState<Screen>('menu')
  const screenRef = useRef<Screen>('menu')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('Take a breath. Pick up where you left off.')
  const [metrics, setMetrics] = useState({ state: 'Ready', speed: 0, charge: 0, height: 0, elapsed: 0, started: false, lift: false, rope: false })

  function changeScreen(next: Screen, reason?: string) {
    keys.current.clear(); controller.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    screenRef.current = next; setScreen(next)
    if (next === 'paused') setPauseReason(reason ?? 'Take a breath. Pick up where you left off.')
  }
  useLayoutEffect(() => {
    if (screen === 'playing') canvasRef.current?.focus({ preventScroll: true })
  }, [screen])
  function resetPosition() {
    if (run.current) { run.current = createRun(run.current.level); player.current = run.current.player }
    else respawn(player.current)
    keys.current.clear(); controller.reset()
    jumpQueue.current = []; keyboardJump.current = false
    canvasRef.current?.focus({ preventScroll: true })
  }
  function playChallenge(level: PuzzleLevel, fromBuilder = false) {
    run.current = createRun(level); player.current = run.current.player; setTrial(level)
    setChallenge(true); setTesting(fromBuilder); setSaveError(false); changeScreen('playing')
  }
  function startChallenge() { playChallenge(trial, testing) }
  function selectTrial(level: PuzzleLevel) {
    setTrial(level); run.current = createRun(level); player.current = run.current.player; setChallenge(true); setTesting(false)
  }
  function startPlayground() {
    run.current = null; setChallenge(false); setTesting(false)
    activeLevel.current = DEFAULT_LEVEL; terrain.current = levelTerrain(DEFAULT_LEVEL); rules.current = levelRules(DEFAULT_LEVEL); player.current = createPlayer()
    changeScreen('playing')
  }
  function openBuilder() { setBuilderStarted(true); changeScreen('building') }
  function testLevel(level: JumpLevel) {
    if (isPuzzleLevel(level)) { playChallenge(level, true); return }
    run.current = null; setChallenge(false)
    activeLevel.current = level; terrain.current = levelTerrain(level); rules.current = levelRules(level); player.current = levelPlayer(level)
    setTesting(true); changeScreen('playing')
  }
  function closeBuilder() {
    activeLevel.current = DEFAULT_LEVEL; terrain.current = levelTerrain(DEFAULT_LEVEL); rules.current = levelRules(DEFAULT_LEVEL); player.current = createPlayer()
    run.current = createRun(trial); player.current = run.current.player; setChallenge(true)
    setTesting(false); changeScreen('menu')
  }
  const finishRun = useEffectEvent(() => {
    if (!run.current?.finished || screenRef.current !== 'playing') return
    setResult({ elapsed: run.current.elapsed, medal: run.current.medal ?? 'No medal' })
    if (!testing) {
      const { elapsed, level } = run.current
      try { const time = saveBest(localStorage, elapsed, level.id); setBestTimes(previous => ({ ...previous, [level.id]: time })); setSaveError(false) }
      catch { setBestTimes(previous => ({ ...previous, [level.id]: Math.min(previous[level.id] ?? Infinity, elapsed) })); setSaveError(true) }
    }
    changeScreen('complete')
  })
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (screenRef.current !== 'playing' || event.altKey || event.ctrlKey || event.metaKey || !PLAY_KEYS.has(event.code)) return
    // Preserve Tab/Enter behavior for the small on-screen toolbar.
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return
    event.preventDefault()
    if (event.repeat) return
    if (event.code === 'Escape' || event.code === 'KeyP') changeScreen('paused')
    else if (event.code === 'KeyR') resetPosition()
    else {
      if (event.code === 'Space' && !keys.current.has(event.code)) jumpQueue.current.push(true)
      keys.current.add(event.code)
    }
  })
  const suspend = useEffectEvent(() => {
    keys.current.clear(); controller.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    if (screenRef.current === 'playing') changeScreen('paused', 'Paused while the game was out of focus.')
  })
  const frameInput = useEffectEvent((now: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard stays available. */ }
    const pad = controller.sample(pads, screenRef.current, now, document.hasFocus() && !document.hidden)
    if (pad.connected !== connected) setConnected(pad.connected)
    if (pad.disconnected && screenRef.current === 'playing') {
      changeScreen('paused', 'Controller disconnected. Reconnect, or continue with the keyboard.')
      return null
    }
    if (screenRef.current !== 'playing') {
      if (screenRef.current === 'building') return null
      const dialog = controllerDialog(rootRef.current)
      if (dialog) {
        if (pad.pause && screenRef.current === 'paused') changeScreen('playing')
        else if (pad.pressed.includes(1)) controlDialog(dialog, 'back')
        else if (pad.pressed.includes(0)) controlDialog(dialog, 'confirm')
        else if (pad.navigation) controlDialog(dialog, pad.navigation)
      }
      return null
    }
    if (pad.pause) { changeScreen('paused'); return null }
    if (pad.resetPosition) { resetPosition(); return null }
    const k = keys.current, keyboard = keyboardMovement(k)
    return { move: keyboard || pad.move, jump: pad.jump,
      climb: k.has('KeyW') || k.has('ArrowUp') || pad.climb,
      drop: k.has('KeyS') || k.has('ArrowDown') || k.has('KeyX') || pad.drop,
      descend: k.has('KeyS') || k.has('ArrowDown') || pad.descend, detach: k.has('KeyX') || pad.detach,
      crouch: pad.crouch, reach: pad.reach }
  })

  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!
    let width = 0, height = 0, ratio = 1, frame = 0, previous = 0, accumulator = 0, published = 0
    const paint = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (run.current) drawChallenge(ctx, width, height, run.current)
      else drawPlayground(ctx, width, height, player.current, activeLevel.current)
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      paint()
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.closest('.jumping-overlay')) focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space' && keys.current.has('Space')) jumpQueue.current.push(false)
      keys.current.delete(event.code)
    }
    const visibility = () => { if (document.hidden) suspend() }
    window.addEventListener('keydown', handleKey); window.addEventListener('keyup', keyup)
    window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', visibility)
    const tick = (now: number) => {
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now
      const input = frameInput(now)
      if (input) {
        accumulator += dt
        while (accumulator >= STEP) {
          // Preserve even a complete keyboard tap between two rendered frames.
          if (jumpQueue.current.length) keyboardJump.current = jumpQueue.current.shift()!
          const controls = { ...input, jump: input.jump || keyboardJump.current }
          if (run.current) stepRun(run.current, controls)
          else stepPlayer(player.current, controls, STEP, terrain.current, activeLevel.current.climbables, rules.current)
          accumulator -= STEP
          if (run.current?.finished) { finishRun(); accumulator = 0; break }
        }
      } else accumulator = 0
      paint()
      if (now - published > 80) {
        const p = player.current
        setMetrics({ state: playerState(p), speed: Math.abs(p.vx) / 60, charge: p.charge, height: p.bestHeight / 60, rope: !!p.climbing?.rope,
          elapsed: run.current?.elapsed ?? 0, started: run.current?.started ?? false, lift: run.current?.mechanisms.some(m => m.active) ?? false })
        published = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  const ropeControls = metrics.rope && screen === 'playing'
  return <div className="jumping-game" ref={rootRef}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? `${trial.name}: reach the flag` : 'Untitled Jumping Game movement playground'} />
    <header className="jumping-header">
      <div><p className="jumping-eyebrow">{challenge ? `${testing ? 'PLAYTEST' : campaignIndex < 0 ? 'EXPERIMENT' : `LEVEL 0${campaignIndex + 1}`} / ${trial.name.toUpperCase()}` : 'MOVEMENT PLAYGROUND'}</p><h1>Untitled Jumping Game</h1></div>
      <div className="jumping-toolbar"><span className="jumping-device">{connected ? 'Controller connected' : 'Keyboard · controller ready'}</span>
        {screen === 'playing' && <>{(!challenge || testing) && <button onClick={openBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button>}<button onClick={resetPosition}>{challenge ? 'Restart' : 'Reset'} <kbd>{connected ? 'Y / △' : 'R'}</kbd></button><button onClick={() => changeScreen('paused')}>Pause <kbd>{connected ? 'Menu' : 'Esc'}</kbd></button></>}
      </div>
    </header>
    <aside className="jumping-telemetry" aria-label="Movement readout">
      <span className="jumping-state">{metrics.state}</span>
      {!challenge && <><span>Speed <b data-testid="jump-speed">{metrics.speed.toFixed(1)}</b><small>m/s</small></span>
      <span>Best jump <b>{metrics.height.toFixed(1)}</b><small>m</small></span></>}
      <span className="jumping-charge">Charge <meter min="0" max="1" value={metrics.charge} aria-label="Jump charge" /></span>
    </aside>
    {challenge && screen === 'playing' && <aside className="jumping-race" aria-label="Level time">
      <b data-testid="level-time">{formatTime(metrics.elapsed)}</b>
      <span>{metrics.started ? trial.climbables.ropes.length ? 'Swing, release, reach the flag.' : trial.mechanisms.length ? metrics.lift ? 'Mechanism active · Reach the flag' : 'Find your route to the flag' : 'Hold jump to charge. Release to leap.' : 'Move to start the clock'}</span>
      <div className="jumping-medal-times"><span className="gold">Gold {trial.times.gold}s</span><span>Silver {trial.times.silver}s</span><span className="bronze">Bronze {trial.times.bronze}s</span></div>
      {best !== null && <small>Personal best {formatTime(best)}</small>}
    </aside>}
    <footer className="jumping-footer">
      {connected ? <><span><kbd>L stick / D-pad</kbd> Move / swing</span><span><kbd>A / ×</kbd> {ropeControls ? 'Jump off rope' : 'Jump / let go'}</span><span><kbd>↑ ↓</kbd> Climb / descend</span><span><kbd>B / ○</kbd> {ropeControls ? 'Push off wall' : 'Drop'}</span></>
        : <><span><kbd>A D / ← →</kbd> Move / swing <kbd>Shift</kbd> Walk</span><span><kbd>Space</kbd> {ropeControls ? 'Jump off rope' : 'Jump / let go'}</span><span><kbd>W S / ↑ ↓</kbd> Climb / descend</span><span><kbd>X</kbd> {ropeControls ? 'Push off wall' : 'Drop'}</span></>}
      <span className="jumping-grab-hint">{ropeControls ? 'Steer away to swing · Push off keeps your grip · Jump releases the rope' : 'Press jump while braced to kick off · Ledges & ropes catch automatically'}</span>
    </footer>
    {screen === 'complete' && <KeyboardDialog label="Level complete" focusKey="jumping-complete" onClose={startChallenge} className="jumping-overlay">
      <div className="jumping-menu jumping-result">
        <p className="jumping-eyebrow">{trial.name.toUpperCase()} / {testing ? 'TEST COMPLETE' : 'COMPLETE'}</p><h2>Flag reached.</h2>
        <div className={`jumping-medal ${result.medal.toLowerCase().replace(' ', '-')}`} aria-hidden="true">{result.medal === 'No medal' ? '⚑' : '★'}</div>
        <p className="jumping-result-time">{formatTime(result.elapsed)}</p>
        <p>{result.medal === 'No medal' ? 'Level complete. Another run, another route.' : `${result.medal} medal`}</p>
        <div className="jumping-medal-times"><span className="gold">Gold ≤ {trial.times.gold}s</span><span>Silver ≤ {trial.times.silver}s</span><span className="bronze">Bronze ≤ {trial.times.bronze}s</span></div>
        {!testing && best !== null && <p>Personal best {formatTime(best)}</p>}
        {saveError && <p role="status">Your time is kept for this visit. Browser storage is unavailable.</p>}
        <div className="jumping-actions">{!testing && campaignIndex >= 0 && campaignIndex < CAMPAIGN.length - 1 && <button className="jumping-primary" onClick={() => playChallenge(CAMPAIGN[campaignIndex + 1])}>Next level <span aria-hidden="true">→</span></button>}{testing && <button className="jumping-primary" onClick={openBuilder}>Return to builder</button>}<button onClick={startChallenge}>Try again <span aria-hidden="true">↗</span></button><button onClick={() => changeScreen('menu')}>Level menu</button><button onClick={onExit}>Back to arcade</button></div>
      </div>
    </KeyboardDialog>}
    {(screen === 'menu' || screen === 'paused') && <KeyboardDialog label={screen === 'menu' ? 'Untitled Jumping Game' : 'Game paused'} focusKey={`jumping-${screen}`}
      onClose={() => screen === 'menu' ? onExit() : changeScreen('playing')} className="jumping-overlay">
      <div className={`jumping-menu ${screen === 'menu' ? 'jumping-level-menu' : ''}`}>
        <p className="jumping-eyebrow">{screen === 'menu' ? 'SMALL LEAPS / BETTER TIMES' : 'PAUSED'}</p>
        <h2>{screen === 'menu' ? 'Find your way across.' : 'Find your footing.'}</h2>
        <p>{screen === 'menu' ? 'One flag. A few good jumps. As many tries as you need.' : pauseReason}</p>
        {screen === 'menu' && <>
          <div className="jumping-level-cards">{CAMPAIGN.map((level, index) => {
            const record = bestTimes[level.id]
            return <button key={level.id} className="jumping-level-card" aria-pressed={trial.id === level.id} onClick={() => selectTrial(level)} aria-label={`Level ${index + 1}: ${level.name}`}>
              <span className="level-card-number">0{index + 1}</span><LevelThumbnail level={level} />
              <strong>{level.name}</strong><span>{['Charge your jump', 'Catch and swing', 'Make the transfer'][index]}</span>
              <small>{record ? `${medalFor(record, level)} · ${formatTime(record)}` : 'Ready to try'}</small>
            </button>
          })}</div>
          <div className="jumping-level-detail"><div><h3>{trial.name}</h3><p>{trial.description}</p></div><div className="jumping-medal-times"><span className="gold">Gold {trial.times.gold}s</span><span>Silver {trial.times.silver}s</span><span className="bronze">Bronze {trial.times.bronze}s</span></div></div>
          {best !== null && <p className="jumping-best">Personal best: {formatTime(best)}</p>}
        </>}
        <div className="jumping-actions">
          <button data-initial-focus className="jumping-primary" onClick={() => screen === 'menu' ? playChallenge(trial) : changeScreen('playing')}>{screen === 'menu' ? 'Start level' : 'Resume'} <span aria-hidden="true">↗</span></button>
          {screen === 'menu' && <button onClick={startPlayground}>Enter playground</button>}
          {screen === 'paused' && <button onClick={() => { resetPosition(); changeScreen('playing') }}>{challenge ? 'Restart level' : 'Reset position'}</button>}
          <button onClick={openBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button>
          {screen === 'paused' && <button onClick={() => { setTesting(false); changeScreen('menu') }}>Level menu</button>}
          <button onClick={onExit}>Back to arcade</button>
        </div>
        <p className="jumping-menu-note">{connected ? 'Stick / D-pad to choose · A / Cross to confirm' : 'A / D to move · Hold Space, release to jump · W / S to climb'}<br />No death. A missed jump is another try.</p>
      </div>
    </KeyboardDialog>}
    {builderStarted && <LevelBuilder active={screen === 'building'} onPlay={testLevel} onClose={closeBuilder} />}
  </div>
}
