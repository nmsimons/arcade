import { Component, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { KeyboardDialog } from './games/hardVacuum/KeyboardDialog'
import { useControlHints } from './games/hardVacuum/controlHints'
import { useLocation } from 'react-router-dom'
import { gameForPath } from './arcade/games'

function RouteMessage({ failed, onExit }: { failed?: boolean; onExit: () => void }) {
  const { hint } = useControlHints()
  const { pathname } = useLocation()
  const game = gameForPath(pathname), theme = game?.theme
  const surface = theme === 'bumper' ? 'bumper-menu' : theme === 'urban' ? 'urban-menu' : 'menu-surface max-w-lg'
  const button = theme === 'bumper' ? 'menu-button bumper-button' : theme === 'urban' ? 'urban-button' : 'menu-button'
  return <KeyboardDialog label={failed ? 'Game unavailable' : 'Loading game'} focusKey={failed ? 'load-failed' : 'loading'} globalMenu onClose={onExit}
    className={theme === 'bumper' ? 'bumper-overlay' : theme === 'urban' ? 'urban-overlay' : 'menu-overlay'}>
    <div className={`${surface} route-message space-y-5`}>
      {game && <p className={theme === 'bumper' ? 'bumper-eyebrow' : theme === 'urban' ? 'urban-eyebrow' : 'menu-eyebrow'}>{game.label}</p>}
      <h1 role={failed ? 'alert' : 'status'} className="route-message-title text-xl">{failed ? 'This game could not be loaded' : 'Loading game…'}</h1>
      {failed && <p className="text-sm opacity-80">Check your connection, then reload to try again.</p>}
      <div className={theme === 'urban' ? 'urban-actions' : 'flex flex-col gap-3'}>
        {failed && <button className={button} onClick={() => window.location.reload()}>Reload game</button>}
        <button className={`${button} ${theme === 'bumper' && failed ? 'bumper-button-secondary' : ''}`} onClick={onExit}>Back to game selector</button>
      </div>
      <p className={theme === 'bumper' ? 'menu-help bumper-help' : theme === 'urban' ? 'menu-help urban-help' : 'menu-help'}>{hint('back', 'Esc')} <span>Back</span></p>
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
