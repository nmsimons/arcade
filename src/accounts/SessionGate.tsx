import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasRememberedAccount, leaveAccount, restoreSession } from './session'
import './accounts.css'

/** Restore the save owner before any route can create a game session. */
export function SessionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(() => hasRememberedAccount() ? 'loading' : 'ready')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (phase !== 'loading') return
    let active = true
    void restoreSession().then(() => { if (active) setPhase('ready') }, error => {
      if (active) { setMessage(error instanceof Error ? error.message : 'Please try again.'); setPhase('error') }
    })
    return () => { active = false }
  }, [phase])
  if (phase === 'ready') return children
  return <main className="account-overlay">
    <section className="account-panel" aria-busy={phase === 'loading'}>
      <header><div><p className="arcade-eyebrow">DREAM LARGE ARCADE</p><h2 role="status">{phase === 'loading' ? 'Restoring your account…' : 'Your account couldn’t be restored'}</h2></div></header>
      <p>{phase === 'loading' ? 'Opening your saved account and game profile.' : message}</p>
      {phase === 'error' && <>
        <p>Your saves are still on this device.</p>
        <div className="account-actions">
          <button className="account-primary" onClick={() => setPhase('loading')}>Try again</button>
          <button onClick={() => { void leaveAccount(); navigate('/', { replace: true }); setPhase('ready') }}>Back to arcade</button>
        </div>
      </>}
    </section>
  </main>
}
