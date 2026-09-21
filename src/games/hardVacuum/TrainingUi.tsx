import { KeyboardDialog } from './KeyboardDialog'
import { useControlHints } from './controlHints'
import { TRAINING_LOG } from './training'
import type { TrainingRuntime } from './training'
import type { HardVacuumGameState } from './ui'
import { TetherInfo } from './TetherInfo'

export function TrainingHud({credits,connected,onPause,onLog}: {credits:number;connected:boolean;onPause:()=>void;onLog:()=>void}) {
  const {hint}=useControlHints()
  return <>
    <div className="flight-hud">
      <div className="hud-location"><div className="hud-room">Flight training</div><dl className="hud-credits" aria-label="Training credits"><div><dt>Training</dt><dd>{credits.toLocaleString()}</dd></div></dl></div>
      <section className="hud-console" aria-label="Ship systems"><nav className="hud-console-nav" aria-label="Flight tools"><button onClick={onLog} aria-label="Flight recorder">Log · {hint('journal','G')}</button><button onClick={onPause} aria-label="Pause game">Pause · {hint('pause','Esc')}</button></nav><div className="hud-warnings"><div role="alert" className="hud-hull-warning">Hull exposed</div></div></section>
    </div>
    {connected && <TetherInfo record={TRAINING_LOG} onOpen={onLog} />}
  </>
}
export function TrainingOverlay({mode,training,journalOpen,onCloseJournal,onResume,onReset,onExit,returnToExpedition=false}: {
  mode:HardVacuumGameState;training:TrainingRuntime;journalOpen:boolean;onCloseJournal:()=>void;onResume:()=>void;onReset:()=>void;onExit:()=>void
  returnToExpedition?:boolean
}) {
  const {hint}=useControlHints()
  if(mode!=='paused') return null
  if(journalOpen) return <KeyboardDialog label="Flight recorder" focusKey="training-recorder" onClose={onCloseJournal}><div className="menu-surface max-w-2xl"><p className="menu-eyebrow">MINER INDUCTION / RECORDER</p><h2 className="text-2xl mt-3">{training.logRead ? TRAINING_LOG.title : 'No recordings downloaded'}</h2>{training.logRead && <p className="mt-5 text-sm text-white/70 leading-relaxed">{TRAINING_LOG.text}</p>}<button className="menu-button mt-6" data-initial-focus onClick={onCloseJournal}>Back · {hint('back','Esc')}</button></div></KeyboardDialog>
  return <KeyboardDialog label="Training paused" focusKey="paused-false" onClose={onResume}><div className="menu-surface max-w-2xl"><p className="menu-eyebrow">MINER INDUCTION</p><h2 className="text-3xl mt-3">Training paused</h2>{returnToExpedition && <p className="text-sm text-white/65 mt-4">Your expedition remains paused.</p>}<div className="flex flex-wrap gap-3 mt-7"><button className="menu-button" data-initial-focus onClick={onResume}>Resume · {hint('back','Esc')}</button><button className="menu-button" onClick={onReset}>Restart simulation</button><button className="menu-button" onClick={onExit}>{returnToExpedition ? 'Return to expedition' : 'Leave training'}</button></div></div></KeyboardDialog>
}
