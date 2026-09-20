import { Component, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { KeyboardDialog } from './games/hardVacuum/KeyboardDialog'
import { useControlHints } from './games/hardVacuum/controlHints'

function RouteMessage({ failed, onExit }: { failed?: boolean; onExit: () => void }) {
  const { hint } = useControlHints()
  return <KeyboardDialog label={failed ? 'Game unavailable' : 'Loading game'} focusKey={failed ? 'load-failed' : 'loading'} globalMenu onClose={onExit}>
    <div className="menu-surface max-w-lg space-y-5">
      <h1 role={failed ? 'alert' : 'status'} className="text-xl">{failed ? 'This game could not be loaded' : 'Loading game…'}</h1>
      {failed && <p className="text-sm text-white/60">Check your connection, then reload to try again.</p>}
      <div className="flex flex-wrap gap-3">
        {failed && <button className="menu-button" onClick={() => window.location.reload()}>Reload game</button>}
        <button className="menu-button" onClick={onExit}>Back to game selector</button>
      </div>
      <p className="menu-help">{hint('back', 'Esc')} <span>Back</span></p>
    </div>
  </KeyboardDialog>
}
export const GameLoading = ({ onExit }: { onExit: () => void }) => <RouteMessage onExit={onExit} />

/** Suspense commits this only once the chosen game has loaded. Preserve game-owned focus. */
export function GameViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) {
      (ref.current?.querySelector<HTMLElement>('button, canvas[tabindex]') ?? ref.current)?.focus({ preventScroll: true })
    }
  }, [])
  return <div ref={ref} tabIndex={-1} className="outline-none">{children}</div>
}

export class GameLoadBoundary extends Component<{ children: ReactNode; onExit: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <RouteMessage failed onExit={this.props.onExit} /> : this.props.children }
}
