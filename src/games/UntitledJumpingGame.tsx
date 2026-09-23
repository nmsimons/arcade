import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { cancelJumpInput, createPlayer, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { drawPlayground } from './jumping/render'
import './jumping/jumping.css'

type Screen = 'menu' | 'playing' | 'paused'
const PLAY_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', 'Escape', 'KeyP'])

export function UntitledJumpingGame({ onExit }: { onExit: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const player = useRef(createPlayer()), keys = useRef(new Set<string>())
  const jumpQueue = useRef<boolean[]>([]), keyboardJump = useRef(false)
  const [controller] = useState(createJumpController)
  const [screen, setScreen] = useState<Screen>('menu')
  const screenRef = useRef<Screen>('menu')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('Take a breath. Pick up where you left off.')
  const [metrics, setMetrics] = useState({ state: 'Ready', speed: 0, charge: 0, height: 0 })

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
    respawn(player.current); keys.current.clear(); controller.reset()
    jumpQueue.current = []; keyboardJump.current = false
    canvasRef.current?.focus({ preventScroll: true })
  }
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
      drawPlayground(ctx, width, height, player.current)
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
          stepPlayer(player.current, { ...input, jump: input.jump || keyboardJump.current }); accumulator -= STEP
        }
      } else accumulator = 0
      paint()
      if (now - published > 80) {
        const p = player.current
        setMetrics({ state: playerState(p), speed: Math.abs(p.vx) / 60, charge: p.charge, height: p.bestHeight / 60 })
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

  return <div className="jumping-game" ref={rootRef}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label="Untitled Jumping Game movement playground" />
    <header className="jumping-header">
      <div><p className="jumping-eyebrow">MOVEMENT STUDY / 001</p><h1>Untitled Jumping Game</h1></div>
      <div className="jumping-toolbar"><span className="jumping-device">{connected ? 'Controller connected' : 'Keyboard · controller ready'}</span>
        {screen === 'playing' && <><button onClick={resetPosition}>Reset <kbd>{connected ? 'Y / △' : 'R'}</kbd></button><button onClick={() => changeScreen('paused')}>Pause <kbd>{connected ? 'Menu' : 'Esc'}</kbd></button></>}
      </div>
    </header>
    <aside className="jumping-telemetry" aria-label="Movement readout">
      <span className="jumping-state">{metrics.state}</span>
      <span>Speed <b data-testid="jump-speed">{metrics.speed.toFixed(1)}</b><small>m/s</small></span>
      <span>Best jump <b>{metrics.height.toFixed(1)}</b><small>m</small></span>
      <span className="jumping-charge">Charge <meter min="0" max="1" value={metrics.charge} aria-label="Jump charge" /></span>
    </aside>
    <footer className="jumping-footer">
      {connected ? <><span><kbd>L stick / D-pad</kbd> Move / swing</span><span><kbd>A / ×</kbd> Jump / let go</span><span><kbd>↑ ↓</kbd> Climb / descend</span><span><kbd>B / ○</kbd> Drop</span></>
        : <><span><kbd>A D / ← →</kbd> Move / swing <kbd>Shift</kbd> Walk</span><span><kbd>Space</kbd> Jump / let go</span><span><kbd>W S / ↑ ↓</kbd> Climb / descend</span><span><kbd>X</kbd> Drop</span></>}
      <span className="jumping-grab-hint">Ledges & ropes catch automatically</span>
    </footer>
    {screen !== 'playing' && <KeyboardDialog label={screen === 'menu' ? 'Untitled Jumping Game' : 'Game paused'} focusKey={`jumping-${screen}`}
      onClose={() => screen === 'menu' ? onExit() : changeScreen('playing')} className="jumping-overlay">
      <div className="jumping-menu">
        <p className="jumping-eyebrow">{screen === 'menu' ? 'THE MOVEMENT PLAYGROUND' : 'PAUSED'}</p>
        <h2>{screen === 'menu' ? 'A little room to jump.' : 'Find your footing.'}</h2>
        <p>{screen === 'menu' ? 'Run, charge, catch, climb. A quiet space to find the feel of the next game.' : pauseReason}</p>
        {screen === 'menu' && <div className="jumping-instructions">
          <p><strong>Move at your pace.</strong> Tilt the left stick to walk or run. Keyboard: A/D or arrows, hold Shift to walk.</p>
          <p><strong>Load the jump.</strong> Hold A/Cross or Space, then release. A quick tap makes a small hop.</p>
          <p><strong>Keep your grip.</strong> Face a ledge to catch it, or press Down near an edge to lower into a hang. Up or jump climbs. Press Down again or B/Circle / X to drop. Away + jump pushes off.</p>
          <p><strong>Find another way up.</strong> Jump into a rope to catch it automatically, or hold Up near a ladder or rope to grab it. Up/Down climbs and descends. Left/Right swings the rope; jump lets go with your momentum.</p>
        </div>}
        <div className="jumping-actions">
          <button className="jumping-primary" onClick={() => changeScreen('playing')}>{screen === 'menu' ? 'Enter playground' : 'Resume'} <span aria-hidden="true">↗</span></button>
          {screen === 'paused' && <button onClick={() => { resetPosition(); changeScreen('playing') }}>Reset position</button>}
          <button onClick={onExit}>Back to arcade</button>
        </div>
        <p className="jumping-menu-note">{connected ? 'Stick / D-pad to choose · A / Cross to confirm' : 'Keyboard supported · Connect a controller and press a button'}</p>
      </div>
    </KeyboardDialog>}
  </div>
}
