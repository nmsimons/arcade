import { useState } from 'react'
import { KeyboardDialog } from '../hardVacuum/KeyboardDialog'
import { formatTime } from './challenge'
import { GRADE_TARGETS, gradeTimes } from './grading'
import type { PuzzleLevel } from './level'

function RestartIcon() {
  return <svg className="jumping-dialog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
    <path d="M4 10a8 8 0 1 1 1 7" /><path d="M4 4v6h6" />
  </svg>
}

export function JumpingPauseDialog({ name, reason, connected, touchControls, testing, challenge, canEdit, onResume, onRestart, onBuilder, onLevels, onExit }: {
  name: string; reason: string; connected: boolean; touchControls?: boolean; testing: boolean; challenge: boolean; canEdit: boolean
  onResume: () => void; onRestart: () => void; onBuilder: () => void; onLevels: () => void; onExit: () => void
}) {
  const [controls, setControls] = useState(false)
  const touchReference = touchControls && !connected
  return <KeyboardDialog label="Game paused" focusKey={controls ? 'jumping-controls' : 'jumping-paused'}
    onClose={() => controls ? setControls(false) : onResume()} className="jumping-overlay jumping-dialog-overlay">
    <div className={`jumping-dialog-panel jumping-pause${controls ? ' jumping-controls-open' : ''}${controls && touchReference ? ' jumping-touch-controls' : ''}`} data-controller-scroll>
      <header className="jumping-dialog-heading">
        <div className="jumping-dialog-kicker"><p title={name}>{name}</p><span className="jumping-dialog-light" aria-hidden="true" /></div>
        <h2>{controls ? 'Controls.' : 'Paused.'}</h2>
        {reason && <p className="jumping-pause-reason" role="status">{reason}</p>}
      </header>
      <div className={`jumping-dialog-body${controls ? '' : ' jumping-pause-menu'}`} data-controller-scroll>
        {controls ? <>
          <section className="jumping-dialog-controls" aria-label="How to play" data-controller-scroll>
            {touchReference ? <>
              <dl>
                <div><dt>Jump / higher jump</dt><dd>Tap / flick up and lift</dd></div>
                <div><dt>Walk left / right</dt><dd>Hold on that side of the screen</dd></div>
                <div><dt>Run / turn / swing</dt><dd>Swipe left or right and keep holding</dd></div>
                <div><dt>Climb / swim up</dt><dd>Drag up and hold</dd></div>
                <div><dt>Crouch / lower / dive</dt><dd>Drag down and hold</dd></div>
                <div><dt>Let go</dt><dd>Flick down and lift</dd></div>
              </dl>
              <p>Keep one finger down to move; use another to jump, crouch or climb. Lift a movement finger to stop directing the player. A flick is a short swipe followed by lifting; a drag and hold continues the action.</p>
              <p>Ledges and airborne ropes catch automatically; drag vertically to take a ladder. From a ledge, drag up to pull up or tap to jump away. After a catch, lift and tap again to jump. Down near a clear lip lowers to a safe hang; lift and drag down again to drop, or flick down and lift to let go. Under reverse gravity, drag up to lower instead.</p>
              <p>In water, drag up to swim up and down to dive. Combine movement and vertical drags to swim diagonally. Release to glide, then ease into an upright float at your reached depth underwater. On the pool floor, stand or walk with relaxed arms; Down crouches and Up swims away. Tap at the surface to jump out. Swim to push objects. Only a stable supported crate offers a grip: drag up, with a surface jump first if needed, then pull up. Terrain banks can catch automatically.</p>
            </> : <><dl>
              <div><dt>Move / swing</dt><dd><kbd>{connected ? 'L stick / D-pad' : 'A D / ← →'}</kbd></dd></div>
              <div><dt>Press to jump</dt><dd><kbd>{connected ? 'A / ×' : 'Space'}</kbd></dd></div>
              <div><dt>Climb / swim up</dt><dd><kbd>{connected ? '↑' : 'W / ↑'}</kbd></dd></div>
              <div><dt>Crouch / lower / descend / dive</dt><dd><kbd>{connected ? '↓' : 'S / ↓'}</kbd></dd></div>
              <div><dt>Drop</dt><dd><kbd>{connected ? 'B / ○' : 'X'}</kbd></dd></div>
              {!connected && <div><dt>Walk</dt><dd><kbd>Shift</kbd></dd></div>}
            </dl>
            <p>Ledges and airborne ropes catch automatically; use Up or Down to take a ladder. From a ledge, Up pulls up and Jump leaps away. A catch consumes a held Jump: release, then press again to leave. Down near a clear lip lowers to a safe hang; release and press Down again to drop, or use Drop to let go. Elsewhere on support, Down crouches; add movement to crouch walk. Under reverse gravity, Up lowers over an edge instead.</p>
            <p>Tap Jump for a short jump; hold it briefly after takeoff to jump higher. Release to stop adding lift. This also works from ledges, ropes, ladders, walls, and slopes. Running carries you farther.</p>
            <p>In water, Up swims up and Down dives. Combine horizontal and vertical movement to swim diagonally. Release to glide, then ease into an upright float at your reached depth underwater. On the pool floor, stand or walk with relaxed arms; Down crouches and Up swims away. Jump at the surface to leave. Swim to push objects. Only a stable supported crate offers a grip: use Up, with a surface jump first if needed, then pull up. Terrain banks can catch automatically.</p>
            </>}
            <p>Shove: With empty hands, F / RT-R2 shoves forward, even if nothing is in reach. Release and press again after the motion finishes; there is no extra cooldown. Shoves give you room and nudge objects; heavy cargo barely moves. Rbot shoves just as quickly and hits much harder. Step away during its windup to dodge. On touch, use Fire / Shove.</p>
            <p>Tools: E / X-Square picks up or drops. F / RT-R2 fires. EMP bolts disable the device or bot they hit for five seconds; the repulsor pushes objects. Both tools stay equipped and have a cooldown. Movement directions also aim in eight directions; release them for horizontal hip fire. Equipped tools allow normal traversal, including pushing, climbing, grabs, and wall jumps. Aiming and use pause while the right arm supports you. Red fields strip off carried tools and stop shots. An EMP hit on either a blue or red beam or emitter disables that field. On touch, use the action buttons alongside normal movement gestures.</p>
          </section>
          <nav className="jumping-dialog-actions jumping-controls-actions" aria-label="Controls actions">
            <button data-initial-focus onClick={() => setControls(false)}>Back</button>
          </nav>
        </> : <>
          <nav className="jumping-dialog-actions" aria-label="Pause actions">
            <button data-initial-focus onClick={onResume}>Resume <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
            <button onClick={onRestart}>{challenge ? 'Restart level' : 'Reset position'} <RestartIcon /></button>
            <button onClick={onLevels}>Level menu</button>
            <button onClick={() => setControls(true)}>Controls</button>
          </nav>
        </>}
      </div>
      {!controls && <nav className="jumping-dialog-actions jumping-pause-destinations" aria-label="Other destinations">
        {canEdit && <button onClick={onBuilder}>{testing ? 'Return to builder' : 'Level studio'}</button>}
        <button onClick={onExit}>Back to arcade</button>
      </nav>}
    </div>
  </KeyboardDialog>
}

export function JumpingResultDialog({ level, elapsed, grade, best, testing, saveError, canEdit, onNext, onRetry, onBuilder, onLevels, onExit }: {
  level: PuzzleLevel; elapsed: number; grade: string; best: number | null; testing: boolean; saveError: boolean; canEdit: boolean
  onNext?: () => void; onRetry: () => void; onBuilder: () => void; onLevels: () => void; onExit: () => void
}) {
  const ending = level.goal.kind === 'overlook' || level.goal.kind === 'walk-off'
  const primary = testing && canEdit ? onBuilder : ending ? onLevels : onNext ?? onRetry
  const primaryLabel = testing && canEdit ? 'Return to builder' : ending ? 'Level menu' : onNext ? 'Next level' : 'Try again'
  const time = formatTime(elapsed), [wholeTime, fraction] = time.split('.')
  return <KeyboardDialog label="Level complete" focusKey="jumping-complete" onClose={ending ? onLevels : onRetry} className={`jumping-overlay jumping-dialog-overlay${ending ? ' jumping-ending' : ''}`}>
    <div className="jumping-dialog-panel jumping-result" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <p className="jumping-eyebrow">{level.name}</p>
        <h2 className="jumping-result-heading">{testing ? 'Test complete.' : ending ? 'You’re outside.' : grade === 'F' ? 'Run finished.' : 'Level complete.'}</h2>
        {level.timing !== 'untimed' && <p className="jumping-result-time" aria-label={`Finish time ${time}`}>{wholeTime}<wbr /><span className="jumping-result-fraction">.{fraction}</span></p>}
        {level.timing !== 'untimed' && <div className="jumping-result-summary">
          <p className="jumping-result-award">
            Grade {grade}
          </p>
          {!testing && grade !== 'F' && best !== null && <p className="jumping-result-best">{elapsed <= best ? 'Personal best' : <>Best <span>{formatTime(best)}</span></>}</p>}
        </div>}
      </header>
      {grade === 'F' && <p className="jumping-result-failure">Finish with a D or better to unlock the next level.</p>}
      {level.timing !== 'untimed' && <dl className="jumping-result-targets" aria-label="Grade target times">
        {GRADE_TARGETS.map(target => <div key={target}>
          <dt>{target.toUpperCase()}</dt><dd>{formatTime(gradeTimes(level)[target]).replace(/\.00$/, '')}</dd>
        </div>)}
      </dl>}
      <nav className="jumping-dialog-actions jumping-result-actions" aria-label="Completion actions">
        <button data-initial-focus onClick={primary}>{primaryLabel}{!testing && !onNext && !ending && <RestartIcon />}</button>
        {(testing || onNext || ending) && <button onClick={onRetry}>{ending ? 'Play again' : 'Try again'} <RestartIcon /></button>}
      </nav>
      <footer className="jumping-result-destinations">
        <nav className="jumping-dialog-actions" aria-label="Other destinations">
          {!ending && <button onClick={onLevels}>Level menu</button>}
          <button onClick={onExit}>Back to arcade</button>
        </nav>
        {saveError && <p className="jumping-result-storage" role="status">{level.timing === 'untimed' ? 'Your completion is kept' : 'Your time is kept'} for this visit. Browser storage is unavailable.</p>}
      </footer>
    </div>
  </KeyboardDialog>
}
