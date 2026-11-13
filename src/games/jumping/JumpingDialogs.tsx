import { useState, type ReactNode } from 'react'
import { KeyboardDialog } from '../hardVacuum/KeyboardDialog'
import { LabLogo } from '../../branding/LabLogo'
import { formatTime } from './challenge'
import { GRADE_TARGETS, gradeTimes } from './grading'
import type { PuzzleLevel } from './level'
import type { CourseRecord, WingRecord } from './facility'
import { RELEASE_GRADES, releaseCertificate } from './releaseCertificate'

function RestartIcon() {
  return <svg className="jumping-dialog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
    <path d="M4 10a8 8 0 1 1 1 7" /><path d="M4 4v6h6" />
  </svg>
}

/**
 * How to play, on the pause and start screens. It opens with the controller,
 * the best way to play, then lists what the robot can do, grouped by topic, each
 * with how to do it on the input in use: controller, keyboard or touch. Edge
 * cases are left for the courses to teach.
 */
function ControlsReference({ connected, touchReference }: { connected: boolean; touchReference: boolean }) {
  const touch = touchReference
  const key = (pad: string, keyboard: string) => <kbd>{connected ? pad : keyboard}</kbd>
  const jump = key('A / ×', 'Space'), up = key('↑', 'W / ↑'), down = key('↓', 'S / ↓'), move = key('L stick / D-pad', 'A D / ← →')
  const letGo = key('B / ○', 'X'), fire = key('RT / R2', 'F'), pickUp = key('X / □', 'E')
  const groups: [string, [string, ReactNode][]][] = [
    ['Move', [
      ['Run', touch ? 'Swipe sideways and hold' : move],
      ...(touch ? [['Walk', 'Hold the left or right side'] as [string, ReactNode]] : connected ? [] : [['Walk', <>Hold <kbd>Shift</kbd> as you move</>] as [string, ReactNode]]),
      ['Crouch', touch ? 'Drag down and hold' : <>Hold {down}</>],
    ]],
    ['Jump', [
      ['Jump', touch ? 'Tap' : jump],
      ['Jump higher', touch ? 'Flick up' : <>Hold {jump}</>],
    ]],
    ['Climb', [
      ['Climb onto a ledge', touch ? 'Drag up' : up],
      ['Use a ladder or door', touch ? 'Drag up' : up],
      ['Hang from an edge', touch ? 'Drag down at the edge' : <>{down} at the edge</>],
      ['Let go', touch ? 'Flick down' : letGo],
    ]],
    ['Swim', [
      ['Swim up or dive', touch ? 'Drag up or down' : <>{up} or {down}</>],
      ['Leave the water', touch ? 'Tap at the surface' : <>{jump} at the surface</>],
    ]],
    ['Tools', [
      ['Pick up or drop a tool', touch ? 'Pick up / Drop button' : pickUp],
      ['Fire a tool', touch ? 'Fire / Shove button' : fire],
      ['Shove things and bots', touch ? 'Fire / Shove button' : <>{fire} with empty hands</>],
    ]],
  ]
  return <section className="jumping-dialog-controls" aria-label="How to play" data-controller-scroll>
    <p className="jumping-controls-pad">{connected
      ? <><strong>Controller connected.</strong> The best way to play.</>
      : <><strong>Best with a controller.</strong> Connect one and press any button.</>}</p>
    {groups.map(([title, rows]) => <div key={title} className="jumping-controls-group">
      <h3>{title}</h3>
      <dl>{rows.map(([can, how]) => <div key={can}><dt>{can}</dt><dd>{how}</dd></div>)}</dl>
      {/* Below Move, so a short touch screen still opens on the first row. */}
      {touch && title === 'Move' && <p className="jumping-controls-note">Move with one finger. Jump, climb or dive with another.</p>}
    </div>)}
  </section>
}

/** Where the robot is: a facility area, a course behind a level door, or a course an exit led into (the route). */
export interface FacilityPauseActions { where: 'course' | 'hub' | 'route'; onLeave: () => void }
/** The evaluation so far, for the system menu's Progress view; `released` once the game has been finished. */
export interface StartProgress { passed: number; required: number; complete: boolean; wings: WingRecord[]; released?: boolean }
/**
 * The release certificate, the reward for finishing the game: the unit rating
 * earned from the course grades, then the tallies behind it.
 */
function ReleaseCertificate({ progress, reveal = false }: { progress: StartProgress; reveal?: boolean }) {
  const certificate = releaseCertificate(progress)
  return <section className={`jumping-release-certificate${reveal ? ' is-revealed' : ''}`} aria-label="Release certificate">
    <p className="jumping-release-title">Release certificate</p>
    <p className="jumping-release-rating"><span>Unit rating</span> <strong>{certificate.rating}</strong></p>
    <dl>
      <div><dt>Courses passed</dt><dd>{certificate.passed} / {certificate.required}</dd></div>
      <div><dt>Grades</dt><dd>{RELEASE_GRADES.map(grade => `${grade} ${certificate.grades[grade]}`).join(' · ')}</dd></div>
      {certificate.total !== null && <div><dt>Best times</dt><dd>{formatTime(certificate.total)}</dd></div>}
    </dl>
  </section>
}
function courseRecord(course: Exclude<CourseRecord, { state: 'locked' }>) {
  if (course.state === 'passed') return course.best === null ? 'Passed' : `${formatTime(course.best)} ${course.grade}`
  return course.deadline === null ? 'Not passed' : `D ${formatTime(course.deadline).replace(/\.00$/, '')} to pass`
}
function ProgressReport({ progress }: { progress: StartProgress }) {
  return <section className="jumping-dialog-controls jumping-start-progress" aria-label="Evaluation progress" data-controller-scroll>
    {progress.released && <ReleaseCertificate progress={progress} />}
    <p className="jumping-start-total">{progress.complete ? 'Evaluation complete. Unit released for dispatch.' : `Evaluation ${progress.passed} / ${progress.required}`}</p>
    {progress.wings.map(wing => <section key={wing.id} aria-label={wing.name}>
      <h3><span>{wing.name}</span> <span>{wing.open ? `${wing.passed}/${wing.courses.length}` : 'Sealed'}</span></h3>
      {wing.open && <ul>{wing.courses.map((course, i) => course.state === 'locked'
        ? <li key={i} className="jumping-start-locked">Locked</li>
        : <li key={course.id}><span>{course.name}</span> <span>{courseRecord(course)}</span></li>)}</ul>}
    </section>)}
  </section>
}

type SystemMenuMode =
  | { mode: 'start'; fresh: boolean; opening: string; onContinue: () => void; onRestartGame: () => void }
  | { mode: 'pause'; onResume: () => void; restartLabel: string; onRestart: () => void; leave?: { label: string; onLeave: () => void } }
  | { mode: 'ending'; onReturn: () => void }
/**
 * The robot's system menu, opening L.A.B. and pausing it alike: the place's
 * name and status, Progress, Controls and the other destinations. As a title
 * screen (`titleScreen`) it fills the view over the place, as the start screen
 * always does and a pause in the facility does; otherwise it is a panel over
 * the paused game. Only the start screen restarts the whole game, erasing the
 * save, and only after asking; a pause restarts the course or area. Finishing
 * the game ends on it too, with the release certificate.
 */
function SystemMenu(props: SystemMenuMode & {
  name: string; reason: string; connected: boolean; touchControls?: boolean; canEdit: boolean; titleScreen: boolean
  progress: StartProgress | null; builderLabel: string; onBuilder: () => void; onExit: () => void
}) {
  const { mode, name, reason, connected, touchControls, canEdit, titleScreen, progress, builderLabel, onBuilder, onExit } = props
  const [view, setView] = useState<'menu' | 'progress' | 'controls' | 'restart'>('menu')
  const touchReference = !!touchControls && !connected, back = () => setView('menu')
  const reference = view === 'progress' || view === 'controls'
  const primary = props.mode === 'start' ? props.onContinue : props.mode === 'ending' ? props.onReturn : props.onResume
  const label = mode === 'pause' ? 'Game paused' : mode === 'ending' ? 'Game complete' : view === 'restart' ? 'Restart the game' : 'Game start'
  const focusKey = mode !== 'pause' ? `jumping-${mode}-${view}` : view === 'menu' ? 'jumping-paused' : view === 'controls' ? 'jumping-controls' : 'jumping-pause-progress'
  const heading = view === 'progress' ? 'Progress.' : view === 'controls' ? 'Controls.' : view === 'restart' ? 'Restart?' : mode === 'start' ? 'Online.' : mode === 'ending' ? 'Released.' : 'Paused.'
  const panel = titleScreen ? `jumping-pause-system jumping-start${mode === 'ending' ? ' jumping-ending' : ''}` : 'jumping-pause'
  const destinations = view === 'menu' && <nav className="jumping-dialog-actions jumping-pause-destinations" aria-label="Other destinations">
    {canEdit && <button onClick={onBuilder}>{builderLabel}</button>}
    <button onClick={onExit}>Back to arcade</button>
  </nav>
  // Restarting the game is destructive: it asks as an alert dialog, with Cancel first.
  return <KeyboardDialog label={label} focusKey={focusKey} confirmation={view === 'restart'}
    onClose={view === 'menu' ? primary : back} className={`jumping-overlay jumping-dialog-overlay${titleScreen ? ' jumping-title-screen' : ''}`}>
    <div className={`jumping-dialog-panel ${panel}${reference ? ' jumping-controls-open' : ''}${view === 'controls' && touchReference ? ' jumping-touch-controls' : ''}`} data-controller-scroll>
      <header className="jumping-dialog-heading">
        {mode !== 'pause' && view === 'menu' && <LabLogo className="jumping-start-logo" />}
        {/* Once released, the start screen carries the mark of it. */}
        {mode === 'start' && view === 'menu' && progress?.released && <p className="jumping-release-mark">Released for dispatch · {releaseCertificate(progress).rating}</p>}
        <div className="jumping-dialog-kicker"><p title={name}>{name}</p><span className="jumping-dialog-light" aria-hidden="true" /></div>
        <h2>{heading}</h2>
        {view === 'menu' && reason && <p className="jumping-pause-reason" role="status">{reason}</p>}
        {/* The reward sits under the status, beside the menu on a short screen. */}
        {mode === 'ending' && view === 'menu' && progress && <ReleaseCertificate progress={progress} reveal />}
      </header>
      <div className={`jumping-dialog-body${reference ? '' : ' jumping-pause-menu'}`} data-controller-scroll>
        {reference ? <>
          {view === 'progress' && progress ? <ProgressReport progress={progress} /> : <ControlsReference connected={connected} touchReference={touchReference} />}
          <nav className="jumping-dialog-actions jumping-controls-actions" aria-label={view === 'progress' ? 'Progress actions' : 'Controls actions'}>
            <button data-initial-focus onClick={back}>Back</button>
          </nav>
        </> : view === 'restart' && props.mode === 'start' ? <>
          <p className="jumping-start-warning">Every passed course, every best time and the robot’s place will be erased. The robot wakes again in {props.opening}.</p>
          <nav className="jumping-dialog-actions" aria-label="Restart actions">
            <button data-initial-focus onClick={back}>Cancel</button>
            <button onClick={props.onRestartGame}>Erase progress and restart <RestartIcon /></button>
          </nav>
        </> : props.mode === 'ending' ? <nav className="jumping-dialog-actions" aria-label="Ending actions">
          <button data-initial-focus onClick={props.onReturn}>Return to the facility <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
          {progress && <button onClick={() => setView('progress')}>Progress</button>}
        </nav> : props.mode === 'start' ? <nav className="jumping-dialog-actions" aria-label="Start actions">
          <button data-initial-focus onClick={props.onContinue}>{props.fresh ? 'Start' : 'Continue'} <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
          {!props.fresh && progress && <button onClick={() => setView('progress')}>Progress</button>}
          {!props.fresh && <button onClick={() => setView('restart')}>Restart <RestartIcon /></button>}
          <button onClick={() => setView('controls')}>Controls</button>
        </nav> : <nav className="jumping-dialog-actions" aria-label="Pause actions">
          <button data-initial-focus onClick={props.onResume}>Resume <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
          <button onClick={props.onRestart}>{props.restartLabel} <RestartIcon /></button>
          {props.leave && <button onClick={props.leave.onLeave}>{props.leave.label}</button>}
          {progress && <button onClick={() => setView('progress')}>Progress</button>}
          <button onClick={() => setView('controls')}>Controls</button>
        </nav>}
      </div>
      {titleScreen ? <footer className="jumping-start-footer">
        {destinations}
        {/* Touch players tap; keys and buttons get a reminder of how to move through the menu. */}
        {!touchReference && <p className="jumping-start-hints" aria-hidden="true">
          <span><kbd>{connected ? 'D-pad' : '↑ ↓'}</kbd>Choose</span>
          <span><kbd>{connected ? 'A / ×' : 'Enter'}</kbd>Select</span>
          {view !== 'menu' && <span><kbd>{connected ? 'B / ○' : 'Esc'}</kbd>Back</span>}
        </p>}
      </footer> : destinations}
    </div>
  </KeyboardDialog>
}

/**
 * Pausing: in the facility, the system menu fills the view as the start screen
 * does, with Progress; elsewhere, as in the library and studio tests, it is a
 * panel. A facility area restarts where the robot came in: its door, or the start's pod.
 */
export function JumpingPauseDialog({ name, reason, connected, touchControls, testing, challenge, canEdit, facility, progress = null, onResume, onRestart, onBuilder, onLevels, levelsLabel = 'Level menu', onExit }: {
  name: string; reason: string; connected: boolean; touchControls?: boolean; testing: boolean; challenge: boolean; canEdit: boolean
  facility?: FacilityPauseActions; progress?: StartProgress | null
  onResume: () => void; onRestart: () => void; onBuilder: () => void; onLevels: () => void; levelsLabel?: string; onExit: () => void
}) {
  const restartLabel = facility ? facility.where === 'course' ? 'Restart course' : facility.where === 'hub' ? 'Restart area' : 'Restart from entrance' : challenge ? 'Restart level' : 'Reset position'
  const leave = !facility ? { label: levelsLabel, onLeave: onLevels }
    : facility.where === 'hub' ? undefined : { label: facility.where === 'route' ? 'Return to the facility' : 'Leave course', onLeave: facility.onLeave }
  return <SystemMenu mode="pause" name={name} reason={reason} connected={connected} touchControls={touchControls} canEdit={canEdit}
    titleScreen={!!facility} progress={facility ? progress : null} builderLabel={testing ? 'Return to builder' : 'Level studio'}
    onBuilder={onBuilder} onExit={onExit} onResume={onResume} restartLabel={restartLabel} onRestart={onRestart} leave={leave} />
}

/**
 * Finishing the game: once the bus has gone, the robot's system display fills
 * the screen as it does at the start, under the L.A.B. mark, and shows the
 * release certificate it earned. Return to the facility to replay, or see the
 * full evaluation.
 */
export function JumpingEndingDialog({ name, reason, progress, connected, touchControls, canEdit, onReturn, onBuilder, onExit }: {
  name: string; reason: string; progress: StartProgress | null; connected: boolean; touchControls?: boolean; canEdit: boolean
  onReturn: () => void; onBuilder: () => void; onExit: () => void
}) {
  return <SystemMenu mode="ending" name={name} reason={reason} connected={connected} touchControls={touchControls} canEdit={canEdit} titleScreen
    progress={progress} builderLabel="Level studio" onBuilder={onBuilder} onExit={onExit} onReturn={onReturn} />
}

/**
 * Opening L.A.B. is a title screen: the robot's system display fills the
 * screen over the place it wakes in, under the L.A.B. mark it boots with.
 * Continue from there, see the evaluation so far, or restart, which erases the
 * save. A new save only starts.
 */
export function JumpingStartDialog({ name, reason, fresh, opening, progress, connected, touchControls, canEdit, onContinue, onRestart, onBuilder, onExit }: {
  name: string; reason: string; fresh: boolean; opening: string; progress: StartProgress | null; connected: boolean; touchControls?: boolean; canEdit: boolean
  onContinue: () => void; onRestart: () => void; onBuilder: () => void; onExit: () => void
}) {
  return <SystemMenu mode="start" name={name} reason={reason} connected={connected} touchControls={touchControls} canEdit={canEdit} titleScreen
    progress={progress} builderLabel="Level studio" onBuilder={onBuilder} onExit={onExit} fresh={fresh} opening={opening} onContinue={onContinue} onRestartGame={onRestart} />
}

export function JumpingResultDialog({ level, elapsed, grade, best, testing, saveError, canEdit, onNext, onRetry, onBuilder, onLevels, levelsLabel = 'Level menu', onExit }: {
  level: PuzzleLevel; elapsed: number; grade: string; best: number | null; testing: boolean; saveError: boolean; canEdit: boolean
  onNext?: () => void; onRetry: () => void; onBuilder: () => void; onLevels: () => void; levelsLabel?: string; onExit: () => void
}) {
  const ending = level.goal.kind === 'overlook' || level.goal.kind === 'walk-off' || level.goal.kind === 'bus'
  const primary = testing && canEdit ? onBuilder : ending ? onLevels : onNext ?? onRetry
  const primaryLabel = testing && canEdit ? 'Return to builder' : ending ? levelsLabel : onNext ? 'Next level' : 'Try again'
  const time = formatTime(elapsed), [wholeTime, fraction] = time.split('.')
  return <KeyboardDialog label="Level complete" focusKey="jumping-complete" onClose={ending ? onLevels : onRetry} className={`jumping-overlay jumping-dialog-overlay${ending ? ' jumping-ending' : ''}`}>
    <div className="jumping-dialog-panel jumping-result" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <p className="jumping-eyebrow">{level.name}</p>
        <h2 className="jumping-result-heading">{testing ? 'Test complete.' : level.goal.kind === 'bus' || level.goal.ending === 'bus' ? 'On your way.' : ending ? 'You’re outside.' : grade === 'F' ? 'Run finished.' : 'Level complete.'}</h2>
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
          {!ending && <button onClick={onLevels}>{levelsLabel}</button>}
          <button onClick={onExit}>Back to arcade</button>
        </nav>
        {saveError && <p className="jumping-result-storage" role="status">{level.timing === 'untimed' ? 'Your completion is kept' : 'Your time is kept'} for this visit. Browser storage is unavailable.</p>}
      </footer>
    </div>
  </KeyboardDialog>
}

/**
 * Outside the facility, as in a studio playtest, a facility area ends when the
 * robot goes through one of its doors. There is no time or grade to report.
 */
export function JumpingDoorDialog({ name, door, testing, canEdit, onRetry, onBuilder, onLevels, levelsLabel = 'Level menu', onExit }: {
  name: string; door: string; testing: boolean; canEdit: boolean
  onRetry: () => void; onBuilder: () => void; onLevels: () => void; levelsLabel?: string; onExit: () => void
}) {
  const builder = testing && canEdit
  return <KeyboardDialog label="Door taken" focusKey="jumping-door" onClose={onRetry} className="jumping-overlay jumping-dialog-overlay">
    <div className="jumping-dialog-panel jumping-result" data-controller-scroll>
      <header className="jumping-dialog-heading">
        <p className="jumping-eyebrow">{name}</p>
        <h2 className="jumping-result-heading">{testing ? 'Test complete.' : 'Through the door.'}</h2>
      </header>
      <p className="jumping-result-door" role="status">{door}</p>
      <nav className="jumping-dialog-actions jumping-result-actions" aria-label="Completion actions">
        <button data-initial-focus onClick={builder ? onBuilder : onRetry}>{builder ? 'Return to builder' : <>Try again <RestartIcon /></>}</button>
        {builder && <button onClick={onRetry}>Try again <RestartIcon /></button>}
      </nav>
      <footer className="jumping-result-destinations">
        <nav className="jumping-dialog-actions" aria-label="Other destinations">
          <button onClick={onLevels}>{levelsLabel}</button>
          <button onClick={onExit}>Back to arcade</button>
        </nav>
      </footer>
    </div>
  </KeyboardDialog>
}
