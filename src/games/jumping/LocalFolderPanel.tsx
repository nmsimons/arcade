import type { LocalLevels } from './localLevels'
import { missingManifestPrompt } from './localLevels'
import './localFolder.css'

export function LocalFolderActions({ local }: { local: LocalLevels }) {
  const remembered = !!local.name, connected = local.status === 'ready', reconnect = local.status === 'reconnect'
  const openLabel = local.busy ? 'Working…' : remembered ? local.hasHandle ? 'Change folder' : 'Reselect folder' : 'Choose folder'
  const label = (text: string, short = text.replace(' folder', '')) => <><span className="local-folder-label-full">{text}</span><span className="local-folder-label-short" aria-hidden="true">{short}</span></>
  return <div className="local-folder-actions">
    {reconnect && <button className="local-folder-open" aria-label="Reconnect folder" disabled={local.busy} onClick={() => void local.reconnect()}>{label('Reconnect folder')}</button>}
    <button className={!remembered || local.status === 'reselect' ? 'local-folder-open' : ''} aria-label={openLabel} disabled={local.busy} onClick={() => void local.open()}>{label(openLabel)}</button>
    {connected && local.hasHandle && <button className="local-folder-refresh" aria-label="Refresh folder" title="Reload files changed outside the game" disabled={local.busy} onClick={() => void local.refresh()}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7a6.5 6.5 0 1 0 .2 5M16 3v4h-4" /></svg><span>Refresh</span></button>}
    {connected && !local.canWrite && local.canRequest && <button aria-label="Enable saving" title="Allow edits to save directly to this folder" disabled={local.busy} onClick={() => void local.reconnect()}>{label('Enable saving', 'Save')}</button>}
  </div>
}

export function LocalFolderPanel({ local, compact = false, summary = false }: { local: LocalLevels; compact?: boolean; summary?: boolean }) {
  const remembered = !!local.name, connected = local.status === 'ready', reconnect = local.status === 'reconnect'
  const status = local.restoring ? 'Restoring folder…' : reconnect ? 'Folder remembered · Access needed'
    : local.status === 'reselect' ? 'Folder remembered · Reselect to load levels'
    : connected ? `${local.files.length} ${local.files.length === 1 ? 'level' : 'levels'}${local.missing.length ? ` · ${local.missing.length} missing` : ''} · ${local.canWrite ? 'Save directly to folder' : 'Read only'}` : 'Open a folder to play and edit its level files.'
  const note = local.restoring ? 'Checking the folder used on your last visit.'
    : reconnect ? 'Allow access to reopen this folder. Your level files stay on disk.'
    : local.status === 'reselect' ? 'This browser requires you to select the folder again after a reload.'
    : connected ? missingManifestPrompt(local) || (local.hasHandle
      ? !local.canWrite ? 'Enable saving to write edits directly to this folder.' : local.files.length ? 'Drag levels in Library to change their order.' : 'No level files yet. Save a level here from the builder.'
      : local.files.length ? 'Reselect to pick up changes. Saving requires a browser with writable folder access, such as Chrome or Edge.' : 'Add JSON level files here, then reselect the folder.')
    : 'JSON level files · Kept on your device'
  return <section className={`local-folder ${compact ? 'local-folder-compact' : ''} ${remembered ? 'is-connected' : 'is-empty'}`} aria-label="Local level folder" aria-busy={local.busy}>
    <div className="local-folder-heading">
      <span className="local-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" /><path d="M3 9h18" /></svg></span>
      <div className="local-folder-title">
        <strong title={remembered ? local.name : undefined}>{remembered ? local.name : 'Your levels, on your computer'}</strong>
        <span>{status}</span>
      </div>
    </div>
    {!summary && <LocalFolderActions local={local} />}
    {(!summary || (!local.notice && !local.errors.length)) && <p className="local-folder-note">{note}</p>}
    {local.notice && (!summary || !local.errors.length) && <p className="local-folder-note" role="status" title={local.notice}>{local.notice}</p>}
    {local.errors.length > 0 && (summary ? <p className="local-folder-summary-error" role="alert" title={local.errors.join('\n')}>{local.errors.join(' · ')}</p>
      : <div className="local-folder-errors" role="alert"><strong>Folder needs attention</strong><ul>{local.errors.map(error => <li key={error}>{error}</li>)}</ul></div>)}
  </section>
}
