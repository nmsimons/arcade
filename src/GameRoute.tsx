import { Component, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

function RouteMessage({ failed, onExit }: { failed?: boolean; onExit: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <div ref={ref} tabIndex={-1} role={failed ? 'alert' : 'status'} aria-live="polite" className="min-h-screen bg-black text-[#00ff88] font-mono flex flex-col items-center justify-center gap-6 outline-none">
    <h1>{failed ? 'This game could not be loaded' : 'Loading game…'}</h1>
    {failed && <><p>Check your connection, then reload to try again.</p><button className="border-2 p-3" onClick={() => window.location.reload()}>Reload game</button></>}
    <button className="border-2 p-3" onClick={onExit}>Back to game selector</button>
  </div>
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
