import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { KeyboardDialog } from '../games/hardVacuum/KeyboardDialog'
import { configured, prepareAuth, signIn } from './auth'
import type { Provider } from './auth'
import { createCloudStore } from './cloudStore'
import type { CloudEntry } from './cloudStore'
import { createSync } from './sync'
import type { SyncResult } from './sync'
import { currentProfile, gameStorage } from './profileStorage'
import { parseWorkspace, readWorkspace, replaceWorkspace, serializeWorkspace, validateLibrary } from './data'
import { decodeLevelFile, isLevelFileName } from '../games/jumping/levelAssets'
import { readLevelText } from '../games/jumping/levelLimits'
import { disconnectCloud, enableCloud, getSession, leaveAccount, operation, subscribeSession, setLogin } from './session'
import './accounts.css'

type Confirmation = { label: string; description: string; action: () => Promise<void> }
const label = (provider: Provider) => provider === 'google' ? 'Google Drive' : 'OneDrive'
const date = (value: string) => new Date(value).toLocaleString()
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AccountControls() {
  const account = useSyncExternalStore(subscribeSession, getSession)
  const [open, setOpen] = useState(false), [ready, setReady] = useState<Partial<Record<Provider, boolean>>>({})
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [result, setResult] = useState<SyncResult>()
  const [confirmation, setConfirmation] = useState<Confirmation>(), [showHistory, setShowHistory] = useState(false)
  const busyRef = useRef(false), lifetime = useRef(0), input = useRef<HTMLInputElement>(null), backupInput = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const login = account.login, owner = currentProfile()
  const syncRef = useRef<{ run: (choice?: 'local' | CloudEntry) => Promise<void> } | null>(null)

  useEffect(() => {
    const lifetimeRef = lifetime
    lifetimeRef.current++
    return () => { lifetimeRef.current++ }
  }, [])
  useEffect(() => {
    if (!open || login) return
    let active = true
    for (const provider of ['google', 'microsoft'] as const) if (configured[provider]) {
      void prepareAuth(provider).then(() => { if (active) setReady(previous => ({ ...previous, [provider]: true })) }, () => { if (active) setMessage(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in could not load. Close this panel and try again.`) })
    }
    return () => { active = false }
  }, [open, login])

  // Only mounted at the arcade menu. Leaving it aborts all downloads/restores;
  // gameplay always uses the local, account-scoped save slot.
  useEffect(() => {
    if (!login || !account.cloudEnabled) return
    let active = true, pending: AbortController | undefined
    const cloud = createCloudStore(login.identity.provider, () => login.token()), store = gameStorage(owner), engine = createSync(store, cloud)
    const run = async (choice?: 'local' | CloudEntry) => {
      if (busyRef.current) return
      busyRef.current = true; setBusy(true); setMessage('Syncing game data…')
      const op = operation(); pending = op.controller
      try {
        const task = () => choice ? engine.resolve(choice, op.controller.signal) : engine.sync(op.controller.signal)
        const next = navigator.locks ? await navigator.locks.request(`arcade-cloud:${owner}`, { signal: op.controller.signal }, task) : await task()
        if (active) { setResult(next); setMessage(next.status === 'conflict' ? 'Progress differs between devices. Choose a version below; both versions are kept.' : `Synced with ${label(login.identity.provider)} · ${new Date().toLocaleTimeString()}`) }
      } catch (error) {
        if (active && !op.controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Cloud sync failed. Local progress is safe.')
      } finally {
        op.release(); busyRef.current = false
        if (active) setBusy(false)
      }
    }
    syncRef.current = { run }
    // Authorization may still be finishing its UI action when this effect runs.
    const initial = window.setTimeout(() => { void run() }, 0)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void run() }, 60000)
    const reconnect = () => { void run() }
    window.addEventListener('online', reconnect)
    return () => { active = false; pending?.abort(); clearTimeout(initial); clearInterval(timer); window.removeEventListener('online', reconnect); syncRef.current = null }
  }, [login, account.cloudEnabled, account.revision, owner])

  async function action(task: () => Promise<void>) {
    if (busyRef.current) return
    const version = lifetime.current
    busyRef.current = true; setBusy(true); setMessage('')
    try { await task() }
    catch (error) { if (lifetime.current === version) setMessage(error instanceof Error ? error.message : 'Could not complete that action.') }
    finally { if (lifetime.current === version) { busyRef.current = false; setBusy(false); setConfirmation(undefined) } }
  }
  async function loginWith(provider: Provider) {
    const version = lifetime.current
    await action(async () => {
      const next = await signIn(provider)
      if (lifetime.current !== version) { await next.signOut(); return }
      setLogin(next); setResult(undefined); setMessage('Signed in. Your account has its own local saves. Enable cloud storage to use them on other devices.')
    })
  }
  function confirm(label: string, description: string, task: () => Promise<void>) { setConfirmation({ label, description, action: task }) }
  async function importLevels(files: FileList | null) {
    if (!files?.length || !login) return
    const chosen = Array.from(files), selectedOwner = owner
    await action(async () => {
      if (chosen.length > 500) throw new Error('Import at most 500 levels at once.')
      const store = gameStorage(selectedOwner), before = serializeWorkspace(readWorkspace(store)), data = readWorkspace(store)
      for (const file of chosen) {
        if (!isLevelFileName(file.name)) throw new Error('Choose level JSON files, without index.json.')
        if (data.levels.files[file.name] !== undefined) throw new Error(`“${file.name}” already exists. Rename the imported file first.`)
        const text = await readLevelText(file); decodeLevelFile(text); data.levels.files[file.name] = text
      }
      validateLibrary(data.levels)
      if (currentProfile() !== selectedOwner) throw new Error('The account changed. Import was cancelled.')
      replaceWorkspace(store, data, before); setMessage(`Imported ${chosen.length} level${chosen.length === 1 ? '' : 's'}. Open Account levels in the jumping game. Sync to upload them.`)
    })
  }
  const exportData = async () => download(serializeWorkspace(readWorkspace(gameStorage(owner))), 'arcade-backup.json')
  function closePanel() {
    // MSAL's cross-origin popup bridge may not detect a manually closed popup
    // immediately. Always let an anonymous player leave a pending sign-in.
    if (busy && !login) { lifetime.current++; busyRef.current = false; setBusy(false); setMessage('Sign-in cancelled. You can keep playing anonymously.') }
    if (!busy || !login) { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }
  }
  return <>
    <div className="arcade-account-bar">
      <button ref={trigger} onClick={() => setOpen(true)}>{login ? login.identity.name : 'Sign in / Cloud saves'}</button>
      <span role="status">{busy ? 'Working…' : login ? account.cloudEnabled ? message || 'Cloud connected' : 'Account saves on this device' : 'Playing anonymously · Saved on this device'}</span>
    </div>
    {open && <KeyboardDialog label="Player account" focusKey="account" globalMenu onClose={closePanel} className="account-overlay">
      <section className="account-panel">
        <header><div><p className="arcade-eyebrow">YOUR ARCADE</p><h2>{login ? login.identity.name : 'Play anywhere'}</h2></div><button aria-label="Close account" data-initial-focus disabled={busy && !!login} onClick={closePanel}>Close</button></header>
        {!login ? <>
          <p>Keep playing anonymously, or sign in to keep a separate set of saves and custom levels. Cloud storage is optional.</p>
          <div className="account-actions">
            <button disabled={busy || !ready.google} onClick={() => void loginWith('google')}>Sign in with Google</button>
            <button disabled={busy || !ready.microsoft} onClick={() => void loginWith('microsoft')}>Sign in with Microsoft</button>
          </div>
          {(!configured.google || !configured.microsoft) && <p className="account-note">{!configured.google && !configured.microsoft ? 'Sign-in is not configured on this deployment yet.' : `${!configured.google ? 'Google' : 'Microsoft'} sign-in is not configured on this deployment yet.`} Anonymous play remains available.</p>}
        </> : <>
          <p>{account.cloudEnabled ? 'Progress syncs when you return to the arcade and while this menu is open. Keep the tab open until sync finishes.' : 'Your account saves stay on this device until you enable cloud storage.'}</p>
          <p className="account-note">{login.identity.provider === 'google' ? 'Google stores game data in hidden storage reserved for Arcade. Use export below to keep a copy.' : 'OneDrive stores game data in Apps/Arcade (or the registered app name).'} Arcade does not receive your files or store an account on a server.</p>
          <div className="account-actions">
            <button disabled={busy} onClick={() => void action(async () => { await login.authorize(); enableCloud(); setMessage('Cloud access enabled.') })}>{account.cloudEnabled ? `Reconnect ${label(login.identity.provider)}` : `Enable ${label(login.identity.provider)}`}</button>
            {account.cloudEnabled && <><button disabled={busy} onClick={() => void syncRef.current?.run()}>Sync now</button><button disabled={busy} onClick={() => { disconnectCloud(); setBusy(false); setResult(undefined); setMessage('Disconnected. Local progress and cloud files are kept.') }}>Disconnect cloud</button></>}
            <button disabled={busy} onClick={() => void action(async () => { await leaveAccount(); setResult(undefined); setMessage('Signed out. Anonymous progress is available again.') })}>Sign out</button>
            <button onClick={() => window.open(login.identity.provider === 'google' ? 'https://myaccount.google.com/connections' : 'https://account.live.com/consent/Manage', '_blank', 'noopener,noreferrer')}>Review provider permissions</button>
          </div>
          {result?.status === 'conflict' && <div className="account-conflict"><h3>Choose progress to continue</h3><p>No version has been overwritten. Continuing with a version keeps the others in cloud history.</p>
            <button disabled={busy} onClick={() => confirm('Use this device', 'Make this device’s progress the version used by future syncs. Other cloud versions remain in history.', async () => { setConfirmation(undefined); await syncRef.current?.run('local') })}>Use this device</button>
            {result.heads.map(entry => <button disabled={busy} key={entry.id} onClick={() => confirm('Use cloud version', `Use progress saved ${date(entry.at)}. Unsynced local progress will first be backed up.`, async () => { setConfirmation(undefined); await syncRef.current?.run(entry) })}>Use cloud version · {date(entry.at)}</button>)}
          </div>}
          <h3>Transfer and recover</h3>
          <div className="account-actions">
            <button disabled={busy} onClick={() => confirm('Import anonymous progress', 'Replace this account’s game saves with anonymous progress from this browser. Account levels are kept, and a local recovery copy is created.', async () => {
              const store = gameStorage(owner), before = serializeWorkspace(readWorkspace(store)), data = readWorkspace(store), anonymous = readWorkspace(gameStorage(''))
              replaceWorkspace(store, { ...data, slots: anonymous.slots }, before); setMessage('Anonymous progress copied into this account. Sync to upload it.')
            })}>Import anonymous progress</button>
            <button disabled={busy} onClick={() => input.current?.click()}>Import level files</button>
            <button disabled={busy} onClick={() => void action(exportData)}>Export all game data</button>
            <button disabled={busy} onClick={() => backupInput.current?.click()}>Import backup</button>
            <button disabled={busy} onClick={() => confirm('Restore local recovery copy', 'Restore the copy kept before the last import or cloud download. Current progress becomes the next recovery copy.', async () => {
              const store = gameStorage(owner), text = store.getItem('arcade.cloud.recovery.v1')
              if (!text) throw new Error('No recovery copy is available on this device.')
              replaceWorkspace(store, parseWorkspace(text), serializeWorkspace(readWorkspace(store))); setMessage('Local recovery copy restored. Sync when ready.')
            })}>Restore local recovery copy</button>
            {account.cloudEnabled && <button onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide cloud history' : 'Cloud history'}</button>}
          </div>
          <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={event => { void importLevels(event.target.files); event.target.value = '' }} />
          <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
            if (file.size > 4_000_000) { setMessage('Backups must fit within 4 MB.'); return }
            confirm('Import backup', 'Replace this account’s saves and level library with the selected backup. Current data is kept in local recovery.', async () => {
              const store = gameStorage(owner), before = serializeWorkspace(readWorkspace(store)), text = await file.text()
              replaceWorkspace(store, parseWorkspace(text), before); setMessage('Backup imported. Sync when ready.')
            })
          }} />
          {showHistory && <div className="account-history"><p>Each sync keeps a version. Latest 30 shown; files count against your drive quota.</p>{[...(result?.entries ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(entry => <button key={entry.id} disabled={busy} onClick={() => confirm('Restore cloud version', `Restore progress from ${date(entry.at)}. Unsynced local changes will be backed up first.`, async () => { setConfirmation(undefined); await syncRef.current?.run(entry) })}>{date(entry.at)} · Restore</button>)}</div>}
          <p className="account-note">Sign-out keeps local and cloud saves. Disconnecting stops sync; use Review provider permissions to revoke access in your provider’s account settings. Only Arcade game storage is requested.</p>
        </>}
        {message && <p className="account-status" role="status">{message}</p>}
        <button onClick={() => window.open(`${import.meta.env.BASE_URL}privacy.html`, '_blank', 'noopener,noreferrer')}>Data and privacy</button>
      </section>
    </KeyboardDialog>}
    {confirmation && <KeyboardDialog label={confirmation.label} focusKey="account-confirm" confirmation globalMenu onClose={() => { if (!busy) setConfirmation(undefined) }} className="account-overlay account-confirmation"><section className="account-panel"><h2>{confirmation.label}</h2><p>{confirmation.description}</p><div className="account-actions"><button data-initial-focus disabled={busy} onClick={() => setConfirmation(undefined)}>Cancel</button><button disabled={busy} onClick={() => {
      // Cloud operations own their busy flag; local transfers use action().
      if (confirmation.label === 'Use this device' || confirmation.label === 'Use cloud version' || confirmation.label === 'Restore cloud version') void confirmation.action()
      else void action(confirmation.action)
    }}>{confirmation.label}</button></div></section></KeyboardDialog>}
  </>
}
