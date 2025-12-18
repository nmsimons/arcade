import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { HardVacuumGame } from './games/HardVacuumGame'
import { HelloWorldGame } from './games/HelloWorldGame'
import { KickballGame } from './games/KickballGame'
import { FinalApproachGame } from './games/FinalApproachGame'
import { NoExitGame } from './games/NoExitGame'
import { SlingLoadGame } from './games/SlingLoadGame'
import { UrbanFireGame } from './games/UrbanFireGame'

export default function App() {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const games = useMemo(
    () =>
      [
        { id: 'hardVacuum', path: '/hard-vacuum', label: 'Hard Vacuum' },
        { id: 'finalApproach', path: '/final-approach', label: 'Final Approach' },
        { id: 'noExit', path: '/no-exit', label: 'No Exit' },
        { id: 'urbanFire', path: '/urban-fire', label: 'Urban Fire' },
        { id: 'kickball', path: '/bumper-ball', label: 'Bumper Ball' },
        { id: 'sling', path: '/sling-load', label: 'Sling Load' },
        { id: 'hello', path: '/hello-world', label: 'Hello World' },
      ] as const,
    [],
  )

  useEffect(() => {
    // Only handle menu keys on the home route.
    if (window.location.pathname !== '/') return

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [games, navigate, selectedIndex])

  return (
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
                <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to play</p>
              </div>
            </div>
          </div>
        }
      />

      <Route path="/hard-vacuum" element={<HardVacuumGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/final-approach" element={<FinalApproachGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/no-exit" element={<NoExitGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/urban-fire" element={<UrbanFireGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/bumper-ball" element={<KickballGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/sling-load" element={<SlingLoadGame onExit={() => navigate('/', { replace: true })} />} />
      <Route path="/hello-world" element={<HelloWorldGame onExit={() => navigate('/', { replace: true })} />} />

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
  )
}
