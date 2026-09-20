import { KeyboardDialog } from './KeyboardDialog'
import { DEV_CREDITS, DEV_LEVELS } from './development'
import type { BerthId } from './campaignWorld'
import { ControllerHelp } from './ControllerHelp'
import { useControlHints } from './controlHints'

const button = 'menu-item'

export function DevelopmentPanel({ current, banked, mapRevealed, onLevel, onCredits, onRevealMap, onClose }: {
  current?: string; banked: number; mapRevealed: boolean
  onLevel: (id: BerthId) => void; onCredits: () => void; onRevealMap: () => void; onClose: () => void
}) {
  const { hint } = useControlHints()
  return <KeyboardDialog label="Developer panel" focusKey="development" onClose={onClose} className="menu-overlay z-50">
    <div className="menu-surface max-w-xl">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl text-[#00ff88]">Developer panel</h2><span className="text-xs text-white/45">SIMULATION PAUSED</span></div>
      <h3 className="mt-6 text-xs uppercase tracking-widest text-white/60">Jump to level</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/50">Completes earlier routes and supplies required gear. Existing progress and equipment are kept. Haven stays at the latest powered berth.</p>
      <div data-menu-grid className="grid sm:grid-cols-2 gap-2 mt-4">{DEV_LEVELS.map(level => <button key={level.id} data-menu-id={level.id} className={button} data-initial-focus={current === level.id || undefined} onClick={() => onLevel(level.id)}>
        <span className="text-[#00ff88] mr-2">{level.number}.</span>{level.name}{current === level.id && <span className="block mt-1 text-[10px] text-white/45">CURRENT REGION</span>}
      </button>)}</div>
      <div className="mt-6 border-t border-white/15 pt-5">
        <button className={`${button} w-full flex justify-between gap-4`} aria-pressed={mapRevealed} aria-describedby="dev-map-description" onClick={onRevealMap}>
          <span>Show whole map</span><span aria-hidden="true" className="text-[#00ff88]">{mapRevealed ? 'ON' : 'OFF'}</span>
        </button>
        <p id="dev-map-description" className="mt-2 text-xs leading-relaxed text-white/50">Opens the full station map. In flight, {hint('map', 'M')} reopens it; in the map, {hint('mapOverview', 'O')} switches views. Exploration progress is unchanged. Reveal lasts for this session.</p>
      </div>
      <div className="mt-6 border-t border-white/15 pt-5">
        <p className="text-xs text-white/60" role="status">Banked credits: <span className="text-[#ffcf85]">{banked.toLocaleString()}</span></p>
        <button className={`${button} mt-3 w-full`} onClick={onCredits}>Add {DEV_CREDITS.toLocaleString()} banked credits</button>
      </div>
      <button className={`${button} mt-6`} data-menu-id="close-development" onClick={onClose} aria-keyshortcuts="` ~ Escape">Close · {hint('back', '~ / Esc')}</button>
      <ControllerHelp />
    </div>
  </KeyboardDialog>
}
