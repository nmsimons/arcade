import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { KeyboardDialog } from '../games/hardVacuum/KeyboardDialog'
import { configured, prepareAuth, signIn } from './auth'
import type { Provider } from './auth'
import { createCloudStore } from './cloudStore'
import { createGoogleDriveStore } from './googleDriveStore'
import type { PickedGoogleFile } from './googleDriveStore'
import { googlePickerConfigured, pickGoogleLevels } from './googlePicker'
import type { CloudEntry, CloudFolder } from './cloudStore'
import { CloudAccessError, CloudBusyError, CloudChangedError } from './errors'
import { createSync } from './sync'
import type { SyncPhase, SyncResult } from './sync'
import { currentProfile, gameStorage, subscribeGameStorage, SAVE_SLOTS, LEVELS_SLOT } from './profileStorage'
import { digest, parseWorkspace, readCurrentWorkspace, readWorkspace, replaceWorkspace, serializeWorkspace } from './data'
import { isLevelFileName } from '../games/jumping/levelAssets'
import { importLevelCollection } from './levelLibrary'
import { readLevelText } from '../games/jumping/levelLimits'
import { getLevelSyncActivity, setLevelSyncActivity } from './levelSaveState'
import { cloudDownloadsAllowed, getAccountOpenRequest, getAccountSurface, hasUnsavedDraft, refreshAccountCloud, registerAccountSync, restartAccountGame, subscribeAccountRuntime } from './runtime'
import { disconnectCloud, enableCloud, getSession, leaveAccount, operation, subscribeSession, setLogin } from './session'
// Official provider artwork from their sign-in branding guidelines.
import googleLogo from '../assets/auth/google.png'
import microsoftLogo from '../assets/auth/microsoft.svg'
import './accounts.css'

type Notice = { title: string; detail: string; tone?: 'success' | 'error' | 'warning' }
type Confirmation = { label: string; description: string; action: () => Promise<void> }
type Screen = 'home' | 'saves' | 'settings' | 'history'
const label = (provider: Provider) => provider === 'google' ? 'Google Drive' : 'OneDrive'
const providerName = (provider: Provider) => provider === 'google' ? 'Google' : 'Microsoft'
const signInDescription = 'Signing in lets you save game data and custom levels in your own Google Drive or OneDrive.'
const date = (value: string) => new Date(value).toLocaleString()
const errorText = (error: unknown) => error instanceof SyntaxError
  ? 'A save file could not be read. Check that it is a valid game backup or level file.'
  : error instanceof Error ? error.message : 'Please try again.'
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AccountControls() {
  const account = useSyncExternalStore(subscribeSession, getSession)
  const surface = useSyncExternalStore(subscribeAccountRuntime, getAccountSurface)
  useLayoutEffect(() => {
    // Lazy account controls can move a menu's already-focused game below the
    // viewport. Keep that selection visible after the portal is inserted.
    const menu = surface?.node.closest('.game-dialog'), focused = document.activeElement
    if (focused instanceof HTMLElement && menu?.contains(focused)) {
      focused.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }
  }, [surface])
  const [open, setOpen] = useState(false), [screen, setScreen] = useState<Screen>('home')
  const [ready, setReady] = useState<Partial<Record<Provider, boolean>>>({})
  const [activity, setActivity] = useState<Notice>(), [notice, setNotice] = useState<Notice>()
  const [result, setResult] = useState<SyncResult>(), [lastSync, setLastSync] = useState('')
  const [syncProblem, setSyncProblem] = useState<'retry' | 'reconnect'>()
  const [waitingForCloud, setWaitingForCloud] = useState<string>()
  const [pendingLocal, setPendingLocal] = useState(false)
  const [cloudFolder, setCloudFolder] = useState<CloudFolder & { owner: string }>()
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const busyRef = useRef<symbol | undefined>(undefined), lifetime = useRef(0), pauseSync = useRef(false), confirming = useRef(false)
  const input = useRef<HTMLInputElement>(null), backupInput = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const pickerOperation = useRef<AbortController | undefined>(undefined)
  const drivePickerTrigger = useRef<HTMLButtonElement>(null)
  const syncRef = useRef<{ run: (choice?: 'local' | CloudEntry, completed?: string) => Promise<SyncResult | undefined> } | null>(null)
  const login = account.login, owner = currentProfile(), busy = !!activity
  const drive = login ? label(login.identity.provider) : ''
  const connectReady = login?.identity.provider !== 'google' || !!ready.google
  const folder = login && cloudFolder?.owner === owner ? cloudFolder : undefined

  useEffect(() => {
    const lifetimeRef = lifetime
    lifetimeRef.current++
    let lastOpen = getAccountOpenRequest()
    const unsubscribe = subscribeAccountRuntime(() => {
      if (getAccountOpenRequest() !== lastOpen) {
        lastOpen = getAccountOpenRequest()
        if (getAccountSurface()) { setScreen('home'); setOpen(true) }
      }
    })
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === 'F8' && !event.repeat) {
        // Account controls belong to menus and the editor, never gameplay.
        // Native file dialogs also make their surrounding header inert.
        if (!getAccountSurface() || pickerOperation.current || document.querySelector('dialog:modal')) return
        event.preventDefault(); event.stopPropagation(); setScreen('home'); setOpen(true)
      }
    }
    window.addEventListener('keydown', shortcut, true)
    const pickerRef = pickerOperation
    return () => { lifetimeRef.current++; pickerRef.current?.abort(); unsubscribe(); window.removeEventListener('keydown', shortcut, true) }
  }, [])
  useEffect(() => {
    if (!open) return
    let active = true
    for (const provider of login ? [login.identity.provider] : ['google', 'microsoft'] as const) if (configured[provider]) {
      void prepareAuth(provider).then(() => { if (active) setReady(previous => ({ ...previous, [provider]: true })) }, () => {
        if (active) setNotice({ tone: 'error', title: `${providerName(provider)} sign-in could not load`, detail: 'Check your connection, then close and reopen this panel to try again.' })
      })
    }
    return () => { active = false }
  }, [open, login])

  // Lives across routes. Upload local saves anywhere; apply incoming saves only
  // at a safe menu or on an explicit library refresh, never over active play.
  useEffect(() => {
    if (!login || !account.cloudEnabled) return
    let active = true, pending: AbortController | undefined, timer: number | undefined, lastStarted = 0
    let running: Promise<SyncResult | undefined> | undefined, manualApply: (() => boolean) | undefined, queued = false, urgent = false, retryable = false
    const store = gameStorage(owner)
    const localSignature = () => JSON.stringify([...SAVE_SLOTS, LEVELS_SLOT].map(key => store.getItem(key)))
    let lastLocal = localSignature()
    let lastLevels = store.getItem(LEVELS_SLOT)
    const queuedDelay = () => urgent ? 700 : Math.max(700, 30000 - (Date.now() - lastStarted))
    const driveName = label(login.identity.provider)
    const progress = (phase: SyncPhase) => {
      if (!active) return
      setLevelSyncActivity(owner, phase === 'uploading' ? 'uploading' : 'checking')
      const titles = { checking: `Checking ${driveName}…`, downloading: `Loading your saves from ${driveName}…`, uploading: `Saving to ${driveName}…` }
      setActivity({ title: titles[phase], detail: 'Keep this tab open. We’ll let you know when your saves are up to date.' })
    }
    const cloud = createCloudStore(login.identity.provider, () => login.token(), fetch, folder => {
      if (active) setCloudFolder({ ...folder, owner })
    }, progress => {
      if (!active) return
      setLevelSyncActivity(owner, progress.stage === 'checking' ? 'checking' : 'uploading')
      const count = progress.total ? ` ${progress.completed} of ${progress.total} files` : ''
      const titles = {
        checking: `Checking ${driveName}…`,
        history: `Saving to ${driveName}… Backing up${count}`,
        publishing: `Saving to ${driveName}…${count}`,
        verifying: `Verifying your ${driveName} saves…`,
      }
      setActivity({ title: titles[progress.stage], detail: `${progress.fileName ? `Uploading “${progress.fileName}”. ` : ''}Your local saves are safe. You can keep playing while this finishes.` })
    })
    const engine = createSync(store, cloud, progress, () => manualApply?.() || cloudDownloadsAllowed())
    const perform = async (choice?: 'local' | CloudEntry, completed?: string) => {
      if (busyRef.current) return
      queued = false; urgent = false; retryable = false
      clearTimeout(timer); lastStarted = Date.now()
      const ticket = Symbol('sync'); busyRef.current = ticket
      setLevelSyncActivity(owner, 'checking')
      let retrySoon = false
      setWaitingForCloud(undefined)
      setActivity({ title: `Connecting to ${driveName}…`, detail: 'Checking for saved progress and custom levels.' })
      requestAnimationFrame(() => statusRef.current?.scrollIntoView({ block: 'nearest' }))
      setSyncProblem(undefined)
      const op = operation(); pending = op.controller
      try {
        const task = () => choice ? engine.resolve(choice, op.controller.signal) : engine.sync(op.controller.signal)
        const next = navigator.locks ? await navigator.locks.request(`arcade-cloud:${owner}`, { signal: op.controller.signal }, task) : await task()
        if (active) {
          setResult(next); pauseSync.current = next.status === 'conflict'
          setLevelSyncActivity(owner, next.status === 'conflict' ? 'attention' : 'idle')
          if (next.status === 'conflict') {
            setScreen('home')
            setNotice(next.recovery
              ? { tone: 'warning', title: 'An interrupted upload needs recovery', detail: `Choose this device’s saves or a complete cloud version. The interrupted files will be kept in ${driveName} history.` }
              : { tone: 'warning', title: 'Which progress would you like to keep playing?', detail: 'This device and the cloud have different saves. Choose one to continue. Both versions will stay in history.' })
          } else if (next.status === 'deferred') {
            setNotice({ title: 'New cloud saves are available', detail: 'Your current game and editor are unchanged. Refresh your level library to load them, or load the cloud saves here to restart this game.' })
          } else {
            const current = serializeWorkspace(await readCurrentWorkspace(store))
            const confirmed = await digest(current) === next.hash && serializeWorkspace(readWorkspace(store)) === current
            if (!active) return next
            setPendingLocal(!confirmed); queued = !confirmed
            const at = new Date().toLocaleTimeString(); setLastSync(at)
            setNotice({ tone: 'success', title: completed || 'Your saves are up to date', detail: `Synced with ${driveName} at ${at}. You’re ready to play.` })
          }
          return next
        }
      } catch (error) {
        if (active && !op.controller.signal.aborted) {
          if (error instanceof CloudBusyError || error instanceof CloudChangedError) {
            retrySoon = true; retryable = true; pauseSync.current = false
            setLevelSyncActivity(owner, 'waiting')
            const waiting = error instanceof CloudBusyError
            setWaitingForCloud(waiting ? 'Waiting for your other device' : `${driveName} changed during sync`)
            setNotice(waiting
              ? { title: 'Waiting for your other browser or device', detail: `It is saving to ${driveName}. We’ll try again automatically in a few seconds. You can keep playing.` }
              : { title: `${driveName} changed during sync`, detail: 'We’ll check the latest files again automatically in a few seconds. Your changes are still on this device.' })
          } else {
            pauseSync.current = true
            setLevelSyncActivity(owner, 'attention')
            const reconnect = error instanceof CloudAccessError
            setSyncProblem(reconnect ? 'reconnect' : 'retry')
            setNotice({ tone: 'error', title: reconnect ? `Reconnect ${driveName} to keep syncing` : 'Your saves couldn’t sync', detail: `${errorText(error)} Your progress is still on this device.` })
          }
        }
      } finally {
        op.release()
        if (busyRef.current === ticket) { busyRef.current = undefined; if (active) setActivity(undefined) }
        // Schedule from completion: a slow sync must not immediately begin the
        // next minute's check, hiding its completion almost as soon as it appears.
        clearTimeout(timer)
        if (active && !pauseSync.current) timer = window.setTimeout(automatic, retrySoon ? 5000 : queued ? queuedDelay() : 60000)
      }
    }
    const run = (choice?: 'local' | CloudEntry, completed?: string): Promise<SyncResult | undefined> => {
      if (!running) running = perform(choice, completed).finally(() => { running = undefined })
      return running
    }
    syncRef.current = { run }
    const unregister = registerAccountSync(async () => {
      const path = window.location.pathname
      manualApply = () => window.location.pathname === path
      try {
        if (running) await running
        while (active && window.location.pathname === path) {
          const result = await run()
          if (result?.status === 'synced') return
          if (!retryable) throw new Error(result?.status === 'conflict'
            ? 'This device and the cloud have different saves. Open your account to choose which version to use. Your local files are kept.'
            : 'Cloud refresh did not finish. Your local files are kept. Open your account for details or try Refresh again.')
          await new Promise(resolve => window.setTimeout(resolve, 5000))
        }
        throw new DOMException('Refresh cancelled', 'AbortError')
      } finally { manualApply = undefined }
    })
    // Wait for consent's action() to release its activity before initial sync.
    const automatic = () => {
      clearTimeout(timer)
      if (!active || pauseSync.current) return
      if (document.visibilityState !== 'visible' || confirming.current || busyRef.current) { timer = window.setTimeout(automatic, 5000); return }
      void run()
    }
    const wake = () => { if (document.visibilityState === 'visible' && Date.now() - lastStarted > 2000) automatic() }
    const localChanged = () => {
      const signature = localSignature()
      if (signature === lastLocal) return
      lastLocal = signature; queued = true
      const levels = store.getItem(LEVELS_SLOT)
      if (levels !== lastLevels) urgent = true
      lastLevels = levels; setPendingLocal(true)
      if (!busyRef.current && !pauseSync.current) { clearTimeout(timer); timer = window.setTimeout(automatic, queuedDelay()) }
    }
    const unsubscribeStorage = subscribeGameStorage(localChanged)
    let couldApply = cloudDownloadsAllowed()
    const unsubscribeLocation = subscribeAccountRuntime(() => {
      const allowed = cloudDownloadsAllowed()
      if (allowed && !couldApply) { clearTimeout(timer); timer = window.setTimeout(automatic, 0) }
      couldApply = allowed
    })
    timer = window.setTimeout(automatic, 0)
    window.addEventListener('online', automatic)
    window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake)
    return () => {
      active = false; pending?.abort(); clearTimeout(timer); window.removeEventListener('online', automatic); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); syncRef.current = null
      unregister(); unsubscribeStorage(); unsubscribeLocation()
      if (getLevelSyncActivity(owner) !== 'attention') setLevelSyncActivity(owner, 'idle')
    }
  }, [login, account.cloudEnabled, account.revision, owner])

  async function action(progress: Notice, task: () => Promise<string | void>, syncAfter = false) {
    if (busyRef.current) return
    const version = lifetime.current, ticket = Symbol('action')
    busyRef.current = ticket; setActivity(progress); setNotice(undefined)
    requestAnimationFrame(() => statusRef.current?.scrollIntoView({ block: 'nearest' }))
    let completed: string | void = undefined, succeeded = false
    try {
      completed = await task(); succeeded = true
      if (lifetime.current === version && completed) setNotice({ tone: 'success', title: completed, detail: syncAfter ? 'Saved on this device.' : '' })
    } catch (error) {
      if (lifetime.current === version && !(error instanceof DOMException && error.name === 'AbortError')) {
        if (error instanceof CloudAccessError) { setSyncProblem('reconnect'); pauseSync.current = true }
        setNotice({ tone: 'error', title: 'That didn’t finish', detail: errorText(error) })
      }
    } finally {
      if (busyRef.current === ticket) { busyRef.current = undefined; if (lifetime.current === version) setActivity(undefined) }
    }
    if (succeeded && lifetime.current === version && syncAfter) await syncRef.current?.run(undefined, completed || undefined)
    return succeeded
  }
  async function loginWith(provider: Provider) {
    const version = lifetime.current
    await action({ title: `Signing in with ${providerName(provider)}…`, detail: 'Finish signing in in the popup window. You can close this panel to cancel.' }, async () => {
      const next = await signIn(provider)
      if (lifetime.current !== version) { await next.signOut(); return }
      pauseSync.current = false; setLogin(next); setResult(undefined); setSyncProblem(undefined); setLastSync(''); setScreen('home')
    })
  }
  function requestLogin(provider: Provider) {
    if (hasUnsavedDraft()) {
      confirm('Sign in and switch saves', 'This switches to your account’s saves and closes the current editor draft. Save your draft first, or continue to discard its unsaved changes. Saved guest files stay on this device.', () => loginWith(provider))
    } else void loginWith(provider)
  }
  function connect() {
    if (!login) return
    void action({ title: `Connecting ${drive}…`, detail: `Approve access in the ${providerName(login.identity.provider)} popup. Then we’ll sync your saves automatically.` }, async () => {
      await login.authorize(); pauseSync.current = false; setSyncProblem(undefined); enableCloud(); setScreen('home')
    })
  }
  function confirm(label: string, description: string, task: () => Promise<void>) {
    confirming.current = true; setConfirmation({ label, description, action: task })
  }
  function dismissConfirmation() { confirming.current = false; setConfirmation(undefined) }
  function confirmTransfer(label: string, description: string, task: () => Promise<string>) {
    confirm(label, `${description} This reloads the current game; save unfinished editor changes first.`, async () => {
      if (await action({ title: `${label}…`, detail: 'Updating your saves on this device.' }, task, true)) restartAccountGame()
    })
  }
  async function restoreCloud(entry: CloudEntry, completed?: string) {
    const next = await syncRef.current?.run(entry, completed)
    if (next?.status === 'synced') restartAccountGame()
  }
  function requestSignOut() {
    const signOut = async () => { await action({ title: 'Signing out…', detail: 'Keeping your saves on this device.' }, async () => { await leaveAccount(); setResult(undefined); setSyncProblem(undefined); setLastSync(''); setScreen('home'); return 'You’re signed out' }) }
    if (hasUnsavedDraft()) confirm('Sign out and close draft', 'Save your unfinished editor changes first, or continue to discard them. Saved account files stay on this device.', signOut)
    else void signOut()
  }
  async function importLevels(files: FileList | null) {
    if (!files?.length || !login) return
    const chosen = Array.from(files), selectedOwner = owner
    await action({ title: 'Importing your levels…', detail: 'Checking the files and adding them to Account levels.' }, async () => {
      if (chosen.filter(file => file.name !== 'index.json').length > 500) throw new Error('Import at most 500 levels at once.')
      const store = gameStorage(selectedOwner), data = await readCurrentWorkspace(store), before = serializeWorkspace(data)
      const incoming: Record<string, string> = {}
      for (const file of chosen) {
        if (file.name !== 'index.json' && !isLevelFileName(file.name)) throw new Error('Choose level JSON files and an optional index.json.')
        if (incoming[file.name] !== undefined) throw new Error('Choose each filename only once.')
        incoming[file.name] = await readLevelText(file)
      }
      data.levels = importLevelCollection(data.levels, incoming)
      if (currentProfile() !== selectedOwner) throw new Error('The account changed. Import was cancelled.')
      await replaceWorkspace(store, data, before)
      const count = chosen.filter(file => file.name !== 'index.json').length
      return `Imported ${count} level${count === 1 ? '' : 's'}`
    }, true)
  }
  async function chooseDriveLevels() {
    if (!login || login.identity.provider !== 'google' || !account.cloudEnabled || busyRef.current || pickerOperation.current) return
    const selectedLogin = login, selectedOwner = owner, path = location.pathname
    const op = operation(); pickerOperation.current = op.controller
    const check = () => {
      if (getSession().login !== selectedLogin || currentProfile() !== selectedOwner || location.pathname !== path) op.controller.abort()
      op.controller.signal.throwIfAborted()
    }
    const unsubscribe = subscribeAccountRuntime(() => {
      if (location.pathname !== path || !getAccountSurface()) op.controller.abort()
    })
    let files: PickedGoogleFile[] | undefined
    try {
      const succeeded = await action({ title: 'Opening Google Drive…', detail: 'Select level JSON files and an optional index.json. Google will give Arcade access to the selected files.' }, async () => {
        const cloud = createGoogleDriveStore(() => selectedLogin.token(), fetch)
        const parent = await cloud.levelFolder(op.controller.signal)
        const ids = await pickGoogleLevels(await selectedLogin.token(), parent, op.controller.signal)
        check()
        if (!ids) return
        setActivity({ title: 'Reading your selected levels…', detail: 'Checking the files before adding them to Account levels.' })
        files = await cloud.pickedFiles(ids, op.controller.signal)
        check()
      })
      if (!succeeded || !files) return
      // Selection grants access to existing library files. Pull them first, so
      // importing the same bytes locally cannot create a needless sync conflict.
      check(); await refreshAccountCloud(); check()
      const outside = files.filter(file => !file.inLibrary)
      if (outside.length) {
        await action({ title: 'Importing your levels…', detail: 'Copying the selected files into Account levels. The originals stay in Google Drive.' }, async () => {
          check()
          const store = gameStorage(selectedOwner), data = await readCurrentWorkspace(store), before = serializeWorkspace(data)
          data.levels = importLevelCollection(data.levels, Object.fromEntries(outside.map(file => [file.name, file.text])))
          check(); await replaceWorkspace(store, data, before)
          return 'Google Drive levels imported'
        }, true)
      } else setNotice({ tone: 'success', title: 'Google Drive levels are ready', detail: 'Your selected files are available under Account levels.' })
    } catch (error) {
      if (!op.controller.signal.aborted) setNotice({ tone: 'error', title: 'Drive levels couldn’t finish loading', detail: errorText(error) })
    } finally {
      unsubscribe(); op.release()
      if (pickerOperation.current === op.controller) pickerOperation.current = undefined
      requestAnimationFrame(() => drivePickerTrigger.current?.focus({ preventScroll: true }))
    }
  }
  function closePanel() {
    pickerOperation.current?.abort()
    // The Microsoft bridge can take time to notice a closed popup. Reject any
    // late sign-in response after the player explicitly leaves this panel.
    if (busy && !login) { lifetime.current++; busyRef.current = undefined; setActivity(undefined); setNotice(undefined) }
    if (!busy || !login || account.cloudEnabled) { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }
  }
  function go(next: Screen) { setScreen(next) }

  const defaultNotice: Notice = !login
    ? { title: 'Your next game, on any device', detail: signInDescription }
    : !account.cloudEnabled
      ? { title: 'Save across devices', detail: `Connect ${drive} to keep your account’s progress and custom levels backed up and ready on your other devices.` }
      : { title: 'Ready to sync', detail: `Check ${drive} for your latest progress.` }
  const conflict = result?.status === 'conflict' && !syncProblem
  const pendingNotice: Notice | undefined = login && account.cloudEnabled && pendingLocal && !syncProblem && !conflict && !waitingForCloud && result?.status !== 'deferred'
    ? { title: 'Your latest changes are saved on this device', detail: `Waiting to sync with ${drive}. Keep this tab open until syncing finishes.` } : undefined
  const status = activity || pendingNotice || notice || defaultNotice
  const statusDetail = status.detail || (!login ? signInDescription : '')
  const barText = activity?.title || (login ? syncProblem ? 'Saves need attention' : conflict ? 'Choose which progress to use' : result?.status === 'deferred' ? 'New cloud saves available' : account.cloudEnabled ? waitingForCloud ? `${waitingForCloud} · Retrying automatically` : pendingLocal ? 'Saved locally · Waiting to sync' : lastSync ? `Saved to ${drive} · ${lastSync}` : 'Connecting cloud saves' : 'Saved on this device' : 'Playing as a guest · Saved on this device')
  const titles = { home: login ? login.identity.name : 'Play anywhere', saves: 'Manage saves', settings: 'Account settings', history: 'Cloud history' }
  // Keep the sync effects mounted while playing, without rendering account UI.
  if (!surface) return null
  const compact = surface.compact
  const accountName = login?.identity.name || 'Sign in'
  const indicator = busy ? 'busy' : syncProblem || conflict ? 'attention' : !account.cloudEnabled ? 'local'
    : result?.status === 'deferred' ? 'download' : waitingForCloud || pendingLocal || !lastSync ? 'waiting' : 'synced'
  return createPortal(<>
    <div className={`arcade-account-bar${compact ? ' account-compact' : ''}`}>
      <button ref={trigger} aria-keyshortcuts="F8" aria-label={accountName} aria-description={barText} aria-haspopup="dialog" title={`${accountName} · ${barText} (F8)`} onClick={() => { setScreen('home'); setOpen(true) }}>
        <span className="account-name">{accountName}</span>
        {compact && login && <svg className={`account-indicator is-${indicator}`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {indicator === 'busy' && <><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" /></>}
          {indicator === 'synced' && <path d="m5 12 4 4L19 6" />}
          {indicator === 'attention' && <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v4m0 4h.01" /></>}
          {indicator === 'waiting' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
          {indicator === 'download' && <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />}
          {indicator === 'local' && <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M12 17v3m-4 0h8" /></>}
        </svg>}
      </button>
      {!compact && <span role={open ? undefined : 'status'}>{barText}</span>}
      {!compact && folder?.webUrl && <a href={folder.webUrl} target="_blank" rel="noopener noreferrer">Open {drive} folder ↗</a>}
    </div>
    {open && <KeyboardDialog label="Player account" focusKey={`account-${screen}-${login ? account.cloudEnabled ? 'cloud' : 'local' : 'guest'}`} globalMenu onClose={closePanel} className="account-overlay">
      <section className="account-panel">
        <header><div><p className="arcade-eyebrow">DREAM LARGE ARCADE</p><h2>{titles[screen]}</h2>{login && screen !== 'home' && <p className="account-identity">{login.identity.name}</p>}</div><button aria-label="Close account" data-initial-focus disabled={busy && !!login && !account.cloudEnabled} onClick={closePanel}>Close</button></header>
        {screen !== 'home' && <button className="account-back" disabled={busy} onClick={() => go(screen === 'history' ? 'saves' : 'home')}>← {screen === 'history' ? 'Manage saves' : 'Back to cloud saves'}</button>}
        {screen === 'home' && !account.cloudEnabled && <ol className="account-steps" aria-label="Cloud save setup"><li className={login ? 'is-complete' : 'is-current'} aria-current={!login ? 'step' : undefined}>1. Sign in</li><li className={login ? 'is-current' : ''} aria-current={login ? 'step' : undefined}>2. Connect saves</li><li>3. Play anywhere</li></ol>}
        {(screen === 'home' || activity || notice) && <div ref={statusRef} className={`account-status ${busy ? 'is-busy' : `is-${status.tone || 'info'}`}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="account-status-icon" aria-hidden="true">{busy ? '' : status.tone === 'success' ? '✓' : status.tone === 'error' || status.tone === 'warning' ? '!' : '↗'}</span>
          <div><strong>{status.title}</strong>{statusDetail && <p>{statusDetail}</p>}</div>
        </div>}
        {!login ? <>
          <div className="account-actions account-provider-actions">
            {(['microsoft', 'google'] as const).filter(provider => configured[provider]).map(provider => <button className="account-provider" key={provider} disabled={busy || !ready[provider]} onClick={() => requestLogin(provider)}><img src={provider === 'google' ? googleLogo : microsoftLogo} width="20" height="20" alt="" aria-hidden="true" /><span>{!ready[provider] ? `Loading ${providerName(provider)} sign-in…` : `Sign in with ${providerName(provider)}`}</span></button>)}
          </div>
          {!configured.google && !configured.microsoft && <p className="account-note">Sign-in isn’t available here yet. Your games still save on this device.</p>}
          <p className="account-note">Guest progress stays separate. You can bring it into your account after signing in.</p>
          <button className="account-text-button" onClick={closePanel}>{busy ? 'Cancel sign-in' : 'Keep playing as a guest'}</button>
        </> : <>
          {syncProblem && account.cloudEnabled && <div className="account-actions"><button className="account-primary" disabled={busy || syncProblem === 'reconnect' && !connectReady} onClick={() => syncProblem === 'reconnect' ? connect() : void syncRef.current?.run()}>{syncProblem === 'reconnect' ? `Reconnect ${drive}` : 'Try sync again'}</button>{screen === 'home' && <button disabled={busy} onClick={closePanel}>Play on this device</button>}</div>}
          {screen === 'home' && <>
            {conflict ? <div className="account-conflict"><button disabled={busy} onClick={() => confirm('Use this device', 'Continue with this device’s progress on all devices. The other versions will stay in cloud history.', async () => { await syncRef.current?.run('local') })}><strong>Use this device</strong><span>Your progress saved in this browser</span></button>
              {result.heads.map(entry => <button disabled={busy} key={entry.id} onClick={() => confirm('Use cloud version', `Continue with the saves from ${date(entry.at)}. Your current saved progress will be backed up first. This reloads the game; save unfinished editor changes first.`, () => restoreCloud(entry))}><strong>Use cloud version</strong><span>Saved {date(entry.at)}</span></button>)}
              <button className="account-text-button" disabled={busy} onClick={closePanel}>Decide later</button>
            </div> : !syncProblem && <div className="account-actions">
              {!account.cloudEnabled ? <><button className="account-primary" disabled={busy || !connectReady} onClick={connect}>{busy ? 'Connecting…' : !connectReady ? 'Loading Google sign-in…' : `Connect ${drive}`}</button><button disabled={busy} onClick={closePanel}>Play on this device</button></>
                : <><button className="account-primary" onClick={closePanel}>{compact ? 'Keep playing' : 'Back to arcade'}</button><button disabled={busy} onClick={() => void syncRef.current?.run()}>{busy ? 'Syncing…' : 'Sync now'}</button></>}
            </div>}
            {result?.status === 'deferred' && <button disabled={busy} onClick={() => confirm('Load cloud saves', 'Load your cloud saves and restart this game. Save any unfinished editor changes first. Your saved local progress will be kept in history.', () => restoreCloud(result.heads[0]))}>Load cloud saves</button>}
            {!conflict && <p className="account-note">{account.cloudEnabled ? 'Changes save on this device first and sync automatically while you play. Wait for sync to finish before closing this tab.' : 'Cloud saves are optional. To bring in progress from before you signed in, choose Manage saves.'}</p>}
            <nav className="account-secondary" aria-label="Account options"><button disabled={busy} onClick={() => go('saves')}>Manage saves</button><button disabled={busy} onClick={() => go('settings')}>Account settings</button></nav>
          </>}
          {screen === 'saves' && <>
            <div className="account-option"><div><h3>Bring your guest progress</h3><p>Copy the progress you made before signing in into this account.</p></div><button disabled={busy} onClick={() => confirmTransfer('Import guest progress', 'Replace this account’s game progress with guest progress from this browser. Account levels are kept, and a recovery copy is saved first.', async () => {
              const store = gameStorage(owner), data = await readCurrentWorkspace(store), before = serializeWorkspace(data), anonymous = readWorkspace(gameStorage(''))
              await replaceWorkspace(store, { ...data, slots: anonymous.slots }, before); return 'Guest progress imported'
            })}>Import guest progress</button></div>
            <div className="account-option"><div><h3>Custom levels</h3><p>Choose level JSON files and an optional index.json. Find them under Account levels in the jumping game.{login.identity.provider === 'google' && (googlePickerConfigured ? ' Added files directly in Drive? Choose them below to give Arcade access.' : ' Files copied directly into Google Drive are not automatically available to Arcade; import the originals from your computer.')}</p></div><div className="account-actions"><button disabled={busy} onClick={() => input.current?.click()}>Import level files</button>{login.identity.provider === 'google' && googlePickerConfigured && <button ref={drivePickerTrigger} disabled={busy || !account.cloudEnabled} title={!account.cloudEnabled ? 'Connect Google Drive first' : undefined} onClick={() => void chooseDriveLevels()}>Choose from Google Drive</button>}</div></div>
            <div className="account-option"><div><h3>Backups</h3><p>Download all your game data, or restore a backup you already have.</p></div><div className="account-actions"><button disabled={busy} onClick={() => void action({ title: 'Preparing your backup…', detail: 'Collecting your saves and custom levels.' }, async () => { download(serializeWorkspace(await readCurrentWorkspace(gameStorage(owner))), 'arcade-backup.json'); return 'Backup download started' })}>Download backup</button><button disabled={busy} onClick={() => backupInput.current?.click()}>Import backup</button></div></div>
            <div className="account-option"><div><h3>Recover earlier progress</h3><p>Undo the last import or restore an earlier cloud save.</p></div><div className="account-actions"><button disabled={busy} onClick={() => confirmTransfer('Restore local recovery copy', 'Restore the copy saved before the last import or cloud download. Current progress becomes the next recovery copy.', async () => {
              const store = gameStorage(owner), text = store.getItem('arcade.cloud.recovery.v1')
              if (!text) throw new Error('No recovery copy is available on this device.')
              await replaceWorkspace(store, parseWorkspace(text), serializeWorkspace(await readCurrentWorkspace(store))); return 'Recovery copy restored'
            })}>Restore local recovery copy</button>{account.cloudEnabled && <button disabled={busy} onClick={() => go('history')}>Cloud history</button>}</div></div>
          </>}
          {screen === 'history' && <div className="account-history"><p>Choose a saved version to restore. Your current progress will be backed up first.</p>{!result?.entries.length && <p className="account-note">No cloud versions to show yet. Sync your game progress to create the first one.</p>}{[...(result?.entries ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(entry => <button key={entry.id} disabled={busy} onClick={() => confirm('Restore cloud version', `Restore progress from ${date(entry.at)}. Your current saved progress will be backed up first. This reloads the game; save unfinished editor changes first.`, () => restoreCloud(entry, 'Cloud version restored'))}>{date(entry.at)} · Restore</button>)}</div>}
          {screen === 'settings' && <>
            <div className="account-option"><h3>Your storage</h3><p>{folder ? <>Your {drive} folder is <strong>{folder.name}</strong>. {folder.webUrl && <a href={folder.webUrl} target="_blank" rel="noopener noreferrer">Open your {drive} folder ↗</a>}</> : <>Connect {drive} and sync to find your app folder.</>} Each game has its own folder. Custom levels are in <strong>Untitled Jumping Game/Levels</strong>. Copy the level JSON files and index.json together to move a collection.</p>{login.identity.provider === 'google' && <p>Google gives Arcade access per file. Copying files into this folder does not grant access. {googlePickerConfigured ? <>Use <strong>Manage saves → Choose from Google Drive</strong> to select those files once; then they can sync.</> : <>Use <strong>Manage saves → Import level files</strong> to import the JSON files from your computer.</>}</p>}{account.cloudEnabled && <div className="account-actions"><button disabled={busy || !connectReady} onClick={connect}>Reconnect {drive}</button><button disabled={busy} onClick={() => {
              disconnectCloud(); setResult(undefined); setSyncProblem(undefined); setLastSync(''); pauseSync.current = false
              setNotice({ title: 'Cloud saves disconnected', detail: 'Your progress stays on this device. Existing cloud files are kept.' }); setScreen('home')
            }}>Disconnect cloud</button></div>}</div>
            <div className="account-option"><h3>Your account</h3><p>Signing out keeps your account’s saves and returns you to your guest progress.</p><div className="account-actions"><button disabled={busy} onClick={requestSignOut}>Sign out</button><button disabled={busy} onClick={() => window.open(login.identity.provider === 'google' ? 'https://myaccount.google.com/connections' : 'https://account.live.com/consent/Manage', '_blank', 'noopener,noreferrer')}>Review provider permissions ↗</button></div></div>
            <p className="account-note">Dream Large Arcade requests access only to its game storage. Your files stay with your storage provider. You can revoke access in your provider’s settings.</p>
          </>}
          <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={event => { void importLevels(event.target.files); event.target.value = '' }} />
          <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
            if (file.size > 4_000_000) { setNotice({ tone: 'error', title: 'This backup is too large', detail: 'Choose a backup smaller than 4 MB.' }); return }
            confirmTransfer('Import backup', 'Replace this account’s saves and levels with the selected backup. Your current data is kept in local recovery.', async () => {
              const store = gameStorage(owner), before = serializeWorkspace(await readCurrentWorkspace(store)), text = await file.text()
              await replaceWorkspace(store, parseWorkspace(text), before); return 'Backup imported'
            })
          }} />
        </>}
        {(screen === 'settings' || !login) && <footer><button className="account-text-button" disabled={busy && !!login} onClick={() => window.open(`${import.meta.env.BASE_URL}privacy.html`, '_blank', 'noopener,noreferrer')}>Data and privacy ↗</button></footer>}
      </section>
    </KeyboardDialog>}
    {confirmation && <KeyboardDialog label={confirmation.label} focusKey="account-confirm" confirmation globalMenu onClose={dismissConfirmation} className="account-overlay account-confirmation"><section className="account-panel"><h2>{confirmation.label}</h2><p>{confirmation.description}</p><div className="account-actions"><button data-initial-focus onClick={dismissConfirmation}>Cancel</button><button className="account-primary" onClick={() => { const task = confirmation.action; dismissConfirmation(); void task() }}>{confirmation.label}</button></div></section></KeyboardDialog>}
  </>, surface.node)
}
