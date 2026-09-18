import { KeyboardDialog } from './KeyboardDialog'
import { DEV_CREDITS, DEV_LEVELS } from './development'
import type { BerthId } from './campaignWorld'

const button = 'border border-[#00ff88]/35 p-3 text-left text-sm text-[#c1e9d9] hover:bg-[#00ff88]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ff88]'

export function DevelopmentPanel({ current, banked, onLevel, onCredits, onClose }: {
  current?: string; banked: number; onLevel: (id: BerthId) => void; onCredits: () => void; onClose: () => void
}) {
  return <KeyboardDialog label="Developer panel" focusKey="development" onClose={onClose} className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center overflow-y-auto p-4">
    <div className="w-full max-w-xl my-auto border border-[#00ff88]/35 bg-[#050d0d] p-5 sm:p-7 text-white">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl text-[#00ff88]">Developer panel</h2><span className="text-xs text-white/45">SIMULATION PAUSED</span></div>
      <h3 className="mt-6 text-xs uppercase tracking-widest text-white/60">Jump to level</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/50">Completes earlier routes and supplies required gear. Existing progress and equipment are kept. Haven stays at the latest powered berth.</p>
      <div className="grid sm:grid-cols-2 gap-2 mt-4">{DEV_LEVELS.map(level => <button key={level.id} className={button} data-initial-focus={current === level.id || undefined} onClick={() => onLevel(level.id)}>
        <span className="text-[#00ff88] mr-2">{level.number}.</span>{level.name}{current === level.id && <span className="block mt-1 text-[10px] text-white/45">CURRENT REGION</span>}
      </button>)}</div>
      <div className="mt-6 border-t border-white/15 pt-5">
        <p className="text-xs text-white/60" role="status">Banked credits: <span className="text-[#ffcf85]">{banked.toLocaleString()}</span></p>
        <button className={`${button} mt-3 w-full`} onClick={onCredits}>Add {DEV_CREDITS.toLocaleString()} banked credits</button>
      </div>
      <button className={`${button} mt-6`} onClick={onClose} aria-keyshortcuts="` ~ Escape">Close · ~ / Esc</button>
    </div>
  </KeyboardDialog>
}
