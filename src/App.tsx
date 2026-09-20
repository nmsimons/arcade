import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { GameLoadBoundary, GameLoading, GameViewport } from './GameRoute'
import { createControllerReader } from './games/hardVacuum/controllerInput'
import { KeyboardDialog } from './games/hardVacuum/KeyboardDialog'
import { topDialog } from './games/hardVacuum/dialogNavigation'
import { controlDialog, scrollDialog } from './games/hardVacuum/controllerUi'
import { createKeyboardGate } from './games/hardVacuum/keyboardGate'
import { ControlHintsContext, controlHint } from './games/hardVacuum/controlHints'

const HardVacuumGame = lazy(() => import('./games/HardVacuumGame').then(m => ({ default: m.HardVacuumGame })))
const HelloWorldGame = lazy(() => import('./games/HelloWorldGame').then(m => ({ default: m.HelloWorldGame })))
const KickballGame = lazy(() => import('./games/KickballGame').then(m => ({ default: m.KickballGame })))
const FinalApproachGame = lazy(() => import('./games/FinalApproachGame').then(m => ({ default: m.FinalApproachGame })))
const NoExitGame = lazy(() => import('./games/NoExitGame').then(m => ({ default: m.NoExitGame })))
const SlingLoadGame = lazy(() => import('./games/SlingLoadGame').then(m => ({ default: m.SlingLoadGame })))
const UrbanFireGame = lazy(() => import('./games/UrbanFireGame').then(m => ({ default: m.UrbanFireGame })))

export default function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [controller] = useState(createControllerReader)
  const [keyboard] = useState(createKeyboardGate)
  const [controllerConnected, setControllerConnected] = useState(false)

  const games = useMemo(
    () =>
      [
        { id: 'hardVacuum', path: '/hard-vacuum', label: 'Hard Vacuum' },
        { id: 'kickball', path: '/bumper-ball', label: 'Bumper Ball' },
        { id: 'noExit', path: '/no-exit', label: 'No Exit' },
        { id: 'finalApproach', path: '/final-approach', label: 'Final Approach' },        
        { id: 'urbanFire', path: '/urban-fire', label: 'Urban Fire' },
      ] as const,
    [],
  )

  const pollMenuController = useEffectEvent((now: number) => {
    const dialog = topDialog()
    keyboard.enter(`${pathname}:${dialog?.dataset.dialogScreen ?? 'game'}`)
    if (!dialog?.dataset.globalMenu) { controller.reset(); return }
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard remains available. */ }
    const input = controller.sample(pads, `menu:${dialog.dataset.dialogScreen}`, now, document.hasFocus() && document.visibilityState !== 'hidden')
    if (input.connected !== controllerConnected) setControllerConnected(input.connected)
    if (input.pressed.includes(controller.layout.buttons.back)) controlDialog(dialog, 'back')
    else if (input.pressed.includes(controller.layout.buttons.confirm)) controlDialog(dialog, 'confirm')
    else if (input.navigation) controlDialog(dialog, input.navigation)
    scrollDialog(dialog, input.scroll * 8)
  })
  useEffect(() => {
    controller.reset()
    let frame: number
    const poll = (now: number) => { pollMenuController(now); frame = requestAnimationFrame(poll) }
    const reset = () => { controller.reset(); keyboard.reset() }
    const keyDown = (event: KeyboardEvent) => {
      // Controller-generated Escape events have no keyup and are not physical keys.
      if (!event.isTrusted || event.altKey || event.ctrlKey || event.metaKey) return
      const screen = `${window.location.pathname}:${topDialog()?.dataset.dialogScreen ?? 'game'}`
      if (!keyboard.press(event.code || event.key, screen, event.repeat)) {
        event.preventDefault(); event.stopImmediatePropagation()
      }
    }
    const keyUp = (event: KeyboardEvent) => { if (event.isTrusted) keyboard.release(event.code || event.key) }
    window.addEventListener('keydown', keyDown, true); window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', reset); window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', reset)
    frame = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('blur', reset); window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', reset)
      window.removeEventListener('keydown', keyDown, true); window.removeEventListener('keyup', keyUp, true)
    }
  }, [controller, keyboard])
  const onExit = () => navigate('/', { replace: true })

  return (
    <ControlHintsContext.Provider value={{ connected: controllerConnected, layout: controller.layout }}>
    <GameLoadBoundary key={pathname} onExit={onExit}>
    <Suspense fallback={<GameLoading onExit={onExit} />}>
    <Routes>
      <Route
        path="/"
        element={
          <KeyboardDialog label="Arcade" focusKey="arcade" globalMenu onClose={() => {}}>
              <div className="menu-surface arcade-menu">
                <p className="menu-eyebrow">SIMULATION ARCHIVE / 05 TITLES</p>
                <h1 className="text-3xl text-[#d9eee5] mt-3 mb-7 tracking-wider">Select Game</h1>
                <div className="flex flex-col gap-3">
                  {games.map((g, i) => (
                    <button
                      key={g.id}
                      data-menu-id={g.id}
                      data-initial-focus={selectedIndex === i || undefined}
                      onFocus={() => setSelectedIndex(i)}
                      onClick={() => navigate(g.path)}
                      className="menu-button arcade-choice"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="menu-help">{controllerConnected
                  ? <p>Stick / D-pad <span>Choose</span> · {controlHint(true, 'confirm', '', controller.layout)} <span>Play</span></p>
                  : <p>↑ ↓ / Tab <span>Choose</span> · Enter <span>Play</span></p>}</div>
              </div>
          </KeyboardDialog>
        }
      />

      <Route path="/hard-vacuum" element={<GameViewport><HardVacuumGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/final-approach" element={<GameViewport><FinalApproachGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/no-exit" element={<GameViewport><NoExitGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/urban-fire" element={<GameViewport><UrbanFireGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/bumper-ball" element={<GameViewport><KickballGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/sling-load" element={<GameViewport><SlingLoadGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />
      <Route path="/hello-world" element={<GameViewport><HelloWorldGame onExit={() => navigate('/', { replace: true })} /></GameViewport>} />

      {/* Back-compat redirects */}
      <Route path="/games/hard-vacuum" element={<Navigate to="/hard-vacuum" replace />} />
      <Route path="/games/final-approach" element={<Navigate to="/final-approach" replace />} />
      <Route path="/games/no-exit" element={<Navigate to="/no-exit" replace />} />
      <Route path="/games/urban-fire" element={<Navigate to="/urban-fire" replace />} />
      <Route path="/games/bumper-ball" element={<Navigate to="/bumper-ball" replace />} />
      <Route path="/games/sling-load" element={<Navigate to="/sling-load" replace />} />
      <Route path="/games/hello-world" element={<Navigate to="/hello-world" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </GameLoadBoundary>
    </ControlHintsContext.Provider>
  )
}
