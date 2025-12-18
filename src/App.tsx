import { useState, useEffect } from 'react'
import { ArmorAttackGame } from './games/ArmorAttackGame'
import { HardVacuumGame } from './games/HardVacuumGame'
import { HelloWorldGame } from './games/HelloWorldGame'
import { KickballGame } from './games/KickballGame'
import { LunarLanderGame } from './games/LunarLanderGame'
import { OmegaRaceGame } from './games/OmegaRaceGame'
import { SlingLoadGame } from './games/SlingLoadGame'

type GameId = 'hardVacuum' | 'hello' | 'lander' | 'omega' | 'armor' | 'kickball' | 'sling'

const GAMES: GameId[] = ['hardVacuum', 'lander', 'omega', 'armor', 'kickball', 'sling', 'hello']

export default function App() {
  const [game, setGame] = useState<GameId | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (game !== null) return // Don't handle keys when in a game

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault()
        setSelectedIndex((i) => (i > 0 ? i - 1 : GAMES.length - 1))
      }
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSelectedIndex((i) => (i < GAMES.length - 1 ? i + 1 : 0))
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setGame(GAMES[selectedIndex])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, selectedIndex])

  if (game === 'hardVacuum') {
    return <HardVacuumGame onExit={() => setGame(null)} />
  }

  if (game === 'hello') {
    return <HelloWorldGame onExit={() => setGame(null)} />
  }

  if (game === 'lander') {
    return <LunarLanderGame onExit={() => setGame(null)} />
  }

  if (game === 'omega') {
    return <OmegaRaceGame onExit={() => setGame(null)} />
  }

  if (game === 'armor') {
    return <ArmorAttackGame onExit={() => setGame(null)} />
  }

  if (game === 'kickball') {
    return <KickballGame onExit={() => setGame(null)} />
  }

  if (game === 'sling') {
    return <SlingLoadGame onExit={() => setGame(null)} />
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono bg-[#0a0a0a]">
      {/* Scanline effect */}
      <div 
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(0, 255, 136, 0.06) 11px, rgba(0, 255, 136, 0.06) 12px)',
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
            {GAMES.map((g, i) => (
              <button
                key={g}
                onClick={() => setGame(g)}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  selectedIndex === i
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                {g === 'hardVacuum'
                  ? 'Hard Vacuum'
                  : g === 'lander'
                    ? 'Lunar Lander'
                    : g === 'omega'
                      ? 'Omega Race'
                      : g === 'armor'
                        ? 'Armor Attack'
                        : g === 'kickball'
                          ? 'Bumper Ball'
                          : g === 'sling'
                            ? 'Sling Load'
                            : 'Hello World'}
              </button>
            ))}
          </div>
          <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to play</p>
        </div>
      </div>
    </div>
  )
}
