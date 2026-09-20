import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { GameLoadBoundary, GameLoading, GameViewport } from './GameRoute'
import { createControllerReader } from './games/hardVacuum/controllerInput'

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
  const menuButtons = useRef<(HTMLButtonElement | null)[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [controller] = useState(createControllerReader)

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

  useEffect(() => {
    // Only handle menu keys on the home route.
    if (pathname !== '/') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault()
        setSelectedIndex((i) => (i > 0 ? i - 1 : games.length - 1))
      }
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSelectedIndex((i) => (i < games.length - 1 ? i + 1 : 0))
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        navigate(games[selectedIndex].path)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [games, navigate, pathname, selectedIndex])

  useEffect(() => {
    if (pathname === '/') menuButtons.current[selectedIndex]?.focus({ preventScroll: true })
  }, [pathname, selectedIndex])
  const pollMenuController = useEffectEvent((now: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard remains available. */ }
    const input = controller.sample(pads, 'menu:arcade', now, document.hasFocus() && document.visibilityState !== 'hidden')
    const active = menuButtons.current.indexOf(document.activeElement as HTMLButtonElement)
    if (input.pressed.includes(controller.layout.buttons.confirm)) {
      if (active >= 0) menuButtons.current[active]?.click()
      else menuButtons.current[selectedIndex]?.focus()
    } else if (input.navigation) {
      const delta = input.navigation === 'up' || input.navigation === 'left' ? -1 : 1
      setSelectedIndex(((active >= 0 ? active : selectedIndex) + delta + games.length) % games.length)
    }
  })
  useEffect(() => {
    if (pathname !== '/') return
    controller.reset()
    let frame: number
    const poll = (now: number) => { pollMenuController(now); frame = requestAnimationFrame(poll) }
    const reset = () => controller.reset()
    window.addEventListener('blur', reset); window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', reset)
    frame = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('blur', reset); window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [controller, pathname])
  const onExit = () => navigate('/', { replace: true })

  return (
    <GameLoadBoundary key={pathname} onExit={onExit}>
    <Suspense fallback={<GameLoading onExit={onExit} />}>
    <Routes>
      <Route
        path="/"
        element={
          <div className="relative w-screen h-screen overflow-hidden font-mono bg-[#0a0a0a]">
            {/* Scanline effect */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(0, 255, 136, 0.06) 11px, rgba(0, 255, 136, 0.06) 12px)',
                animation: 'scanline 0.2s linear infinite',
              }}
            />
            <style>{`
              @keyframes scanline {
                0% { background-position: 0 0; }
                100% { background-position: 0 12px; }
              }
            `}</style>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
                <h1 className="text-4xl text-[#00ff88] mb-8 text-center tracking-[0.3em] uppercase">Select Game</h1>
                <div className="flex flex-col gap-3">
                  {games.map((g, i) => (
                    <button
                      key={g.id}
                      ref={element => { menuButtons.current[i] = element }}
                      onFocus={() => setSelectedIndex(i)}
                      onClick={() => navigate(g.path)}
                      className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                        selectedIndex === i
                          ? 'border-[#00ff88] bg-[#00ff88] text-black'
                          : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ / stick / D-pad to select • Enter / A to play</p>
              </div>
            </div>
          </div>
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
  )
}
