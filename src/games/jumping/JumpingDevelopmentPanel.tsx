import { KeyboardDialog } from '../hardVacuum/KeyboardDialog'
import { PerformancePanel } from './PerformancePanel'
import type { PerformanceSnapshot } from './performanceMonitor'

export function JumpingDevelopmentPanel({ onClose, showPerformance, onPerformanceChange, snapshot, performanceMode, onPerformanceModeChange, objectShadows }: {
  onClose: () => void
  showPerformance: boolean; onPerformanceChange: (value: boolean) => void; snapshot: PerformanceSnapshot | null
  performanceMode: boolean; onPerformanceModeChange: (value: boolean) => void; objectShadows: boolean
}) {
  return <KeyboardDialog label="Developer panel" focusKey="jumping-development" onClose={onClose} className="jumping-overlay jumping-dialog-overlay jumping-development-overlay">
    <div className="jumping-dialog-panel jumping-development" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <p className="jumping-eyebrow">UNTITLED JUMPING GAME · DEVELOPMENT</p>
        <h2>Developer panel.</h2>
        <p>Gameplay pauses while this panel is open.</p>
      </header>
      <div className="jumping-dialog-body" data-controller-scroll>
        <div className="jumping-dialog-actions">
          <button data-initial-focus role="switch" aria-checked={showPerformance} aria-label="Performance monitor" onClick={() => onPerformanceChange(!showPerformance)}>Performance monitor <span>{showPerformance ? 'On' : 'Off'}</span></button>
          <button role="switch" aria-checked={performanceMode} aria-label="Lighting performance mode" aria-describedby="jumping-performance-mode-help" onClick={() => onPerformanceModeChange(!performanceMode)}>Lighting performance mode <span>{performanceMode ? 'On' : 'Off'}</span></button>
        </div>
        <p id="jumping-performance-mode-help" className="jumping-performance-mode-help">{performanceMode
          ? `${objectShadows ? 'Full quality is on. After two seconds below 35 FPS, object shadows switch off and rendering resolution drops for this run.' : 'Object shadows are off for this run, and rendering resolution is reduced.'} Walls and mechanisms still cast shadows. Restart or turn this mode off to restore full quality.`
          : 'Full quality. Enable to reduce object shadows and rendering resolution during sustained low frame rates.'}</p>
        {showPerformance && <PerformancePanel snapshot={snapshot} paused />}
      </div>
      <div className="jumping-dialog-actions jumping-pause-destinations">
        <button onClick={onClose} aria-keyshortcuts="` Escape">Close <kbd>` / Esc</kbd></button>
      </div>
    </div>
  </KeyboardDialog>
}
