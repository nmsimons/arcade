import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { digest } from './data'
import { CLOUD_BASELINE_SLOT, currentProfile, gameStorage, subscribeGameStorage } from './profileStorage'
import { getSession, subscribeSession } from './session'
import { confirmedLevelHash, getLevelSyncActivity, levelSaveState, subscribeLevelSyncActivity } from './levelSaveState'
import type { LevelSaveState } from './levelSaveState'
import './levelSaveStatus.css'

interface Props { kind: 'account' | 'folder' | 'built-in'; fileName: string; text?: string; dirty?: boolean; saving?: boolean; context?: 'builder' }
function Badge({ state, label, detail }: { state: LevelSaveState; label: string; detail: string }) {
  const icon = state === 'synced' ? '✓' : state === 'pending' || state === 'syncing' ? '↑' : state === 'attention' ? '!' : '•'
  return <span className={`level-save-status is-${state}`} data-save-state={state} title={detail} aria-label={`${label}. ${detail}`}>
    <span aria-hidden="true">{icon}</span>{label}
  </span>
}
function AccountFileStatus({ fileName, text, dirty, saving, context }: Props) {
  const account = useSyncExternalStore(subscribeSession, getSession), owner = currentProfile()
  const baseline = useSyncExternalStore(subscribeGameStorage, () => gameStorage(owner).getItem(CLOUD_BASELINE_SLOT))
  const activity = useSyncExternalStore(subscribeLevelSyncActivity, () => getLevelSyncActivity(owner))
  const expected = useMemo(() => confirmedLevelHash(baseline, fileName), [baseline, fileName])
  const [fingerprint, setFingerprint] = useState<{ text: string; hash: string }>()
  useEffect(() => {
    if (text === undefined || !expected) return
    let active = true
    void digest(text).then(hash => { if (active) setFingerprint({ text, hash }) }, () => { /* Unverified files stay local. */ })
    return () => { active = false }
  }, [text, expected])
  const state = levelSaveState({ dirty, saving, connected: !!account.login && account.cloudEnabled,
    confirmed: text !== undefined && fingerprint?.text === text && fingerprint.hash === expected, activity })
  const drive = account.login?.identity.provider === 'google' ? 'Google Drive' : 'OneDrive'
  const labels: Record<LevelSaveState, [string, string]> = {
    unsaved: ['Unsaved changes', 'These edits have not been saved on this device.'],
    saving: ['Saving…', 'Writing this file on this device.'],
    local: ['Saved locally', 'Saved on this device. Open your account to connect cloud storage and use it on other devices.'],
    pending: [context === 'builder' ? 'Saved locally · Waiting to sync' : 'Waiting to sync', `Saved on this device. This file is queued to sync with ${drive} automatically.`],
    syncing: ['Syncing…', `Saved on this device. Cloud sync is in progress; this version is not yet confirmed in ${drive}.`],
    synced: [`Saved to ${drive}`, `Saved on this device and matches the file last confirmed in ${drive}.`],
    attention: ['Sync needs attention', 'Saved on this device. Open your account here to finish syncing.'],
  }
  return <Badge state={state} label={labels[state][0]} detail={labels[state][1]} />
}
/** One quiet status line; explanations live in its accessible label and tooltip. */
export function LevelSaveStatus(props: Props) {
  if (props.kind === 'account') return <AccountFileStatus {...props} />
  if (props.saving) return <Badge state="saving" label="Saving…" detail="Writing this level file." />
  if (props.dirty) return <Badge state="unsaved" label="Unsaved changes" detail="These edits have not been saved to the file." />
  return <Badge state="local" label={props.kind === 'built-in' ? 'Built-in level' : 'Saved to folder'}
    detail={props.kind === 'built-in' ? 'Part of the built-in level collection.' : 'Saved in your selected local folder. This folder is not uploaded by the arcade.'} />
}
