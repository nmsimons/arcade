import { useState } from 'react'
import type { ReactNode } from 'react'
import { KeyboardDialog } from '../hardVacuum/KeyboardDialog'
import { formatTime } from './challenge'
import type { PuzzleLevel } from './level'

function RestartIcon() {
  return <svg className="jumping-dialog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
    <path d="M4 10a8 8 0 1 1 1 7" /><path d="M4 4v6h6" />
  </svg>
}

export function JumpingPauseDialog({ name, reason, connected, testing, challenge, onResume, onRestart, onBuilder, onLevels, onExit, brighterDarkLevels, onBrightnessChange, showPerformance, onPerformanceChange, performancePanel, performanceMode, onPerformanceModeChange, objectShadows }: {
  performanceMode: boolean; onPerformanceModeChange: (value: boolean) => void; objectShadows: boolean
  showPerformance: boolean; onPerformanceChange: (value: boolean) => void; performancePanel: ReactNode
  brighterDarkLevels: boolean; onBrightnessChange: (value: boolean) => void
  name: string; reason: string; connected: boolean; testing: boolean; challenge: boolean
  onResume: () => void; onRestart: () => void; onBuilder: () => void; onLevels: () => void; onExit: () => void
}) {
  const [controls, setControls] = useState(false)
  return <KeyboardDialog label="Game paused" focusKey={controls ? 'jumping-controls' : 'jumping-paused'}
    onClose={() => controls ? setControls(false) : onResume()} className="jumping-overlay jumping-dialog-overlay">
    <div className="jumping-dialog-panel jumping-pause" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <div className="jumping-dialog-kicker"><p title={name}>{name}</p><span className="jumping-dialog-light" aria-hidden="true" /></div>
        <h2>{controls ? 'Controls.' : 'Paused.'}</h2>
        <p className="jumping-pause-reason" role="status">{reason}</p>
      </header>
      <div className={`jumping-dialog-body${controls ? '' : ' jumping-pause-menu'}`} data-controller-scroll>
        {controls ? <>
          <section className="jumping-dialog-controls" aria-label="How to play">
            <dl>
              <div><dt>Move / swing</dt><dd><kbd>{connected ? 'L stick / D-pad' : 'A D / ← →'}</kbd></dd></div>
              <div><dt>Hold, release to jump</dt><dd><kbd>{connected ? 'A / ×' : 'Space'}</kbd></dd></div>
              <div><dt>Climb / descend</dt><dd><kbd>{connected ? '↑ ↓' : 'W S / ↑ ↓'}</kbd></dd></div>
              <div><dt>Crouch / crouch walk</dt><dd><kbd>{connected ? '↓ + move' : 'S / ↓ + move'}</kbd></dd></div>
              <div><dt>Drop</dt><dd><kbd>{connected ? 'B / ○' : 'X'}</kbd></dd></div>
              {!connected && <div><dt>Walk</dt><dd><kbd>Shift</kbd></dd></div>}
            </dl>
            <p>Ledges and ropes catch automatically. Press Up to pull up from a ledge. Hold Jump to charge; release to jump, including from ledges, ropes, ladders, walls, and slopes.</p>
          </section>
          <div className="jumping-dialog-actions"><button role="switch" aria-checked={brighterDarkLevels} title="Raise the ambient brightness of dark levels without changing the level" onClick={() => onBrightnessChange(!brighterDarkLevels)}>Brighter dark levels <span>{brighterDarkLevels ? 'On' : 'Off'}</span></button></div>
          <nav className="jumping-dialog-actions jumping-controls-actions" aria-label="Controls actions">
            <button data-initial-focus onClick={() => setControls(false)}>Back</button>
          </nav>
        </> : <>
          <nav className="jumping-dialog-actions" aria-label="Pause actions">
            <button data-initial-focus onClick={onResume}>Resume <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
            <button onClick={onRestart}>{challenge ? 'Restart level' : 'Reset position'} <RestartIcon /></button>
            <button onClick={onLevels}>Level menu</button>
            <button onClick={() => setControls(true)}>Controls</button>
            {import.meta.env.DEV && <>
            <button role="switch" aria-checked={showPerformance} aria-label="Performance monitor" title="Toggle performance monitor (F2)" onClick={() => onPerformanceChange(!showPerformance)}>Performance monitor <span>{showPerformance ? 'On' : 'Off'}</span></button>
            <button role="switch" aria-checked={performanceMode} aria-label="Lighting performance mode" aria-describedby="jumping-performance-mode-help" onClick={() => onPerformanceModeChange(!performanceMode)}>Lighting performance mode <span>{performanceMode ? 'On' : 'Off'}</span></button>
            </>}
          </nav>
          {import.meta.env.DEV && <>
          <p id="jumping-performance-mode-help" className="jumping-performance-mode-help">{performanceMode
            ? `${objectShadows ? 'Full quality is on. After two seconds below 35 FPS, object shadows switch off and rendering resolution drops for this run.' : 'Object shadows are off for this run, and rendering resolution is reduced.'} Walls and mechanisms still cast shadows. Restart or turn this mode off to restore full quality.`
            : 'Full quality. Enable to reduce object shadows and rendering resolution during sustained low frame rates.'}</p>
          {performancePanel}
          </>}
        </>}
      </div>
      {!controls && <nav className="jumping-dialog-actions jumping-pause-destinations" aria-label="Other destinations">
        <button onClick={onBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button>
        <button onClick={onExit}>Back to arcade</button>
      </nav>}
    </div>
  </KeyboardDialog>
}

export function JumpingResultDialog({ level, elapsed, medal, best, testing, saveError, onNext, onRetry, onBuilder, onLevels, onExit }: {
  level: PuzzleLevel; elapsed: number; medal: string; best: number | null; testing: boolean; saveError: boolean
  onNext?: () => void; onRetry: () => void; onBuilder: () => void; onLevels: () => void; onExit: () => void
}) {
  const primary = testing ? onBuilder : onNext ?? onRetry
  const primaryLabel = testing ? 'Return to builder' : onNext ? 'Next level' : 'Try again'
  const time = formatTime(elapsed), [wholeTime, fraction] = time.split('.')
  return <KeyboardDialog label="Level complete" focusKey="jumping-complete" onClose={onRetry} className="jumping-overlay jumping-dialog-overlay">
    <div className="jumping-dialog-panel jumping-result" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <p className="jumping-eyebrow">{level.name}</p>
        <h2 className="jumping-result-heading">{testing ? 'Test complete.' : 'Level complete.'}</h2>
        <p className="jumping-result-time" aria-label={`Finish time ${time}`}>{wholeTime}<wbr /><span className="jumping-result-fraction">.{fraction}</span></p>
        <div className="jumping-result-summary">
          <p className="jumping-result-award">
            {medal === 'No medal' ? 'No medal' : `${medal} medal`}
            {medal !== 'No medal' && <svg className={`jumping-result-medal ${medal.toLowerCase()}`} viewBox="0 0 24 32" fill="currentColor" aria-hidden="true"><path d="M5 17 2 32l10-5 10 5-3-15Z" /><circle cx="12" cy="11" r="11" /></svg>}
          </p>
          {!testing && best !== null && <p className="jumping-result-best">{elapsed <= best ? 'Personal best' : <>Best <span>{formatTime(best)}</span></>}</p>}
        </div>
      </header>
      <dl className="jumping-result-targets" aria-label="Medal target times">
        {(['gold', 'silver', 'bronze'] as const).map(target => <div key={target}>
          <dt>{target[0].toUpperCase() + target.slice(1)}</dt><dd>{formatTime(level.times[target]).replace(/\.00$/, '')}</dd>
        </div>)}
      </dl>
      <nav className="jumping-dialog-actions jumping-result-actions" aria-label="Completion actions">
        <button data-initial-focus onClick={primary}>{primaryLabel}{!testing && !onNext && <RestartIcon />}</button>
        {(testing || onNext) && <button onClick={onRetry}>Try again <RestartIcon /></button>}
      </nav>
      <footer className="jumping-result-destinations">
        <nav className="jumping-dialog-actions" aria-label="Other destinations">
          <button onClick={onLevels}>Level menu</button>
          <button onClick={onExit}>Back to arcade</button>
        </nav>
        {saveError && <p className="jumping-result-storage" role="status">Your time is kept for this visit. Browser storage is unavailable.</p>}
      </footer>
    </div>
  </KeyboardDialog>
}
