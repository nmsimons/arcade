export type HardVacuumGameState = 'menu' | 'playing' | 'paused' | 'waveComplete' | 'dying' | 'gameOver'

export function HardVacuumTopCenterHud(props: {
  gameState: HardVacuumGameState
  level: number
  waveStartTime: number
  waveElapsedTime: number
  calculateTimeMultiplier: (timeSeconds: number) => number
}) {
  const { gameState, level, waveStartTime, waveElapsedTime, calculateTimeMultiplier } = props

  if (gameState !== 'playing' && gameState !== 'waveComplete') return null

  return (
    <div className="absolute top-3 sm:top-6 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="flex items-center gap-3 sm:gap-6 text-white tracking-wider">
        {/* Wave Number */}
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-white/50 uppercase">Wave</span>
          <span className="text-2xl sm:text-4xl font-bold text-[#00ff88]">{level}</span>
        </div>

        {/* Divider */}
        <div className="h-8 sm:h-10 w-px bg-white/20"></div>

        {/* Time Bonus */}
        {gameState === 'playing' &&
          waveStartTime > 0 &&
          (() => {
            const currentMultiplier = calculateTimeMultiplier(waveElapsedTime)
            const multiplierColor =
              currentMultiplier >= 1.5 ? '#00ff88' : currentMultiplier >= 1.25 ? '#ffaa00' : '#ff8844'

            return (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-white/50 uppercase">Bonus</span>
                <span style={{ color: multiplierColor }} className="text-2xl sm:text-4xl font-bold">
                  {currentMultiplier.toFixed(2)}x
                </span>
              </div>
            )
          })()}
      </div>
    </div>
  )
}

export function HardVacuumLeftHud(props: { gameState: HardVacuumGameState; score: number }) {
  const { gameState, score } = props

  if (gameState !== 'playing' && gameState !== 'waveComplete') return null

  return (
    <div className={`absolute top-2 left-2 sm:top-6 sm:left-6 pointer-events-none ${gameState === 'waveComplete' ? 'z-50' : ''}`}>
      <div
        className={`flex items-baseline gap-2 ${gameState === 'waveComplete' ? 'bg-black/70 px-4 py-2 border-2 border-[#00ff88]/50 rounded' : ''}`}
      >
        <span className="text-xs text-white/50 uppercase tracking-wider">Credits</span>
        <span className="text-xl sm:text-3xl font-bold text-[#00ff88]">{score.toString().padStart(6, '0')}</span>
      </div>
    </div>
  )
}

export function HardVacuumRightHud(props: {
  gameState: HardVacuumGameState
  attractorTimer: number
}) {
  const { gameState, attractorTimer } = props

  if (gameState !== 'playing' && gameState !== 'waveComplete') return null

  return (
    <div className="absolute top-14 right-2 sm:top-6 sm:right-6 pointer-events-none">
      <div className="flex items-center">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[#4488ff] text-2xl font-bold">{Math.ceil(attractorTimer)}</span>
          <span className="text-xs text-[#4488ff]/70 uppercase">A</span>
        </div>
      </div>
    </div>
  )
}

export function HardVacuumWaveCompleteOverlay(props: {
  gameState: HardVacuumGameState
  level: number
  waveCompletionTime: number
  waveCreditsEarned: number
  waveTimeBonus: number
  calculateTimeMultiplier: (timeSeconds: number) => number
  continueToNextWave: () => void
}) {
  const {
    gameState,
    level,
    waveCompletionTime,
    waveCreditsEarned,
    waveTimeBonus,
    calculateTimeMultiplier,
    continueToNextWave,
  } = props

  if (gameState !== 'waveComplete') return null

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/90">
      <div className="text-center max-w-2xl px-8">
        {/* Wave Complete Summary */}
        {waveCompletionTime > 0 && (
          <div className="mb-8 border-2 border-[#ffaa00]/40 bg-[#ffaa00]/5 px-6 py-4 rounded">
            <div className="text-[#ffaa00] text-2xl font-bold tracking-wider mb-3">WAVE {level} COMPLETE</div>
            <div className="flex items-center justify-center gap-8 text-lg">
              <div>
                <div className="text-white/50 text-xs uppercase mb-1">Time</div>
                <div className="text-white font-bold">{waveCompletionTime.toFixed(1)}s</div>
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div>
                <div className="text-white/50 text-xs uppercase mb-1">Multiplier</div>
                <div className="text-[#ffaa00] font-bold">
                  {calculateTimeMultiplier(waveCompletionTime).toFixed(2)}x
                </div>
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div>
                <div className="text-white/50 text-xs uppercase mb-1">Credits</div>
                <div className="text-white font-bold">{waveCreditsEarned}</div>
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div>
                <div className="text-[#ffaa00]/70 text-xs uppercase mb-1">Bonus</div>
                <div className="text-[#ffaa00] font-bold text-xl">+{waveTimeBonus}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <button
            onClick={continueToNextWave}
            className="w-full max-w-sm px-6 py-4 border-2 border-[#00ff88] bg-[#00ff88] text-black uppercase tracking-wider transition-all hover:scale-105"
          >
            <div className="text-2xl font-bold mb-1">→</div>
            <div className="text-xs opacity-70 mb-2">Continue</div>
            <div className="text-sm">Next Wave</div>
          </button>
        </div>

        <div className="text-white/40 text-xs tracking-wider mb-2">Enter or Space to continue</div>
        <div className="text-white/50 text-xs tracking-wider">Tip: Process rocks inside your base for more credits. Use harpoon (F).</div>
      </div>
    </div>
  )
}

export function HardVacuumMenuOverlay(props: {
  gameState: HardVacuumGameState
  menuIndex: number
  startGame: () => void
  exitToGameSelect: () => void
}) {
  const { gameState, menuIndex, startGame, exitToGameSelect } = props

  if (gameState !== 'menu') return null

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
      <div className="text-center max-w-md px-8">
        <h1 className="text-4xl sm:text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">Hard Vacuum</h1>
        <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
          <div className="flex items-center gap-2">
            <span className="text-white">›</span> Arrow Keys: Move & Rotate
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white">›</span> Space: Shoot
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white">›</span> F: Harpoon (toggle reel)
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white">›</span> A: Attractor Beam
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white">›</span> P: Pause
          </div>
          <div className="lg:hidden text-white/70 pt-1">Touch controls appear after launch.</div>
        </div>
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={startGame}
            className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
              menuIndex === 0
                ? 'border-[#00ff88] bg-[#00ff88] text-black'
                : 'border-[#00ff88] bg-black text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
            }`}
          >
            Start
          </button>
          <button
            onClick={exitToGameSelect}
            className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
              menuIndex === 1
                ? 'border-[#00ff88] bg-[#00ff88] text-black'
                : 'border-[#00ff88]/50 bg-black text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
            }`}
          >
            Back
          </button>
        </div>
        <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">
          ↑ ↓ to select • Enter to confirm • Esc to exit
        </p>
      </div>
    </div>
  )
}

export function HardVacuumPausedOverlay(props: {
  gameState: HardVacuumGameState
  resume: () => void
  exitToGameSelect: () => void
}) {
  const { gameState, resume, exitToGameSelect } = props

  if (gameState !== 'paused') return null

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
      <div className="text-center max-w-md px-8">
        <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] uppercase">Paused</h2>
        <p className="text-[#00ff88]/70 text-center mb-6 tracking-wider">Press P to resume • Press Esc to exit</p>
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={resume}
            className="w-64 px-8 py-3 border-2 border-[#00ff88] bg-black text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
          >
            Resume
          </button>
          <button
            onClick={exitToGameSelect}
            className="w-64 px-8 py-3 border-2 border-[#00ff88] bg-black text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

export function HardVacuumGameOverOverlay(props: {
  gameState: HardVacuumGameState
  score: number
  level: number
  gameOverIndex: number
  startGame: () => void
  mainMenu: () => void
  exitToGameSelect: () => void
}) {
  const { gameState, score, level, gameOverIndex, startGame, mainMenu, exitToGameSelect } = props

  if (gameState !== 'gameOver') return null

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
      <div className="text-center max-w-md px-8">
        <h2 className="text-4xl text-[#ff4444] mb-2 tracking-[0.3em] uppercase">Game Over</h2>
        <div className="text-center mb-8">
          <div className="text-[#00ff88] text-2xl mb-2 tracking-wider">Credits {score.toString().padStart(6, '0')}</div>
          <div className="text-[#00ff88]/70 tracking-wider uppercase">Wave {level}</div>
        </div>
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={startGame}
            className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
              gameOverIndex === 0
                ? 'border-[#00ff88] bg-[#00ff88] text-black'
                : 'border-[#00ff88] bg-black text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
            }`}
          >
            Play Again
          </button>
          <button
            onClick={mainMenu}
            className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
              gameOverIndex === 1
                ? 'border-[#00ff88] bg-[#00ff88] text-black'
                : 'border-[#00ff88]/50 bg-black text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
            }`}
          >
            Main Menu
          </button>
          <button
            onClick={exitToGameSelect}
            className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
              gameOverIndex === 2
                ? 'border-[#00ff88] bg-[#00ff88] text-black'
                : 'border-[#ff4444] bg-black text-[#ff4444] hover:bg-[#00ff88] hover:text-black hover:border-[#00ff88]'
            }`}
          >
            Back
          </button>
        </div>
        <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">↑ ↓ to select • Enter to confirm</p>
      </div>
    </div>
  )
}
