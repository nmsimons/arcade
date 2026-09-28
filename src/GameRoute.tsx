import { Component, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { KeyboardDialog } from './games/hardVacuum/KeyboardDialog'
import { useControlHints } from './games/hardVacuum/controlHints'
import { useLocation } from 'react-router-dom'
import { gameForPath } from './arcade/games'

function RouteMessage({ failed, onExit }: { failed?: boolean; onExit: () => void }) {
  const { hint } = useControlHints()
  const { pathname } = useLocation()
  const game = gameForPath(pathname)
  return <KeyboardDialog label={failed ? 'Game unavailable' : 'Loading game'} focusKey={failed ? 'load-failed' : 'loading'} globalMenu onClose={onExit}
    className="arcade-overlay arcade-route-overlay">
    <div className="arcade-route-panel">
      <header>
        <p className="arcade-eyebrow">THE ARCADE</p>
        <h1 role={failed ? 'alert' : 'status'}>{failed ? 'This game could not be loaded' : 'Loading game…'}</h1>
        {game && <p className="arcade-route-game">{game.label}</p>}
      </header>
      {failed && <p className="arcade-route-description">Check your connection, then reload to try again.</p>}
      <div className="arcade-route-actions">
        {failed && <button className="arcade-route-button arcade-route-primary" onClick={() => window.location.reload()}>Reload game</button>}
        <button className="arcade-route-button" onClick={onExit}>Back to game selector</button>
      </div>
      <p className="arcade-route-help">{hint('back', 'Esc')} <span>Back</span></p>
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
