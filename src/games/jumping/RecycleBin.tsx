import { useState } from 'react'
import type { DeletedLevel, LocalLevels } from './localLevels'
import { DeleteLevelButton, FileActionDialog } from './LevelFileActions'
import { LevelThumbnail } from './LevelThumbnail'

export function RecycleBin({ local }: { local: LocalLevels }) {
  const [restore, setRestore] = useState<DeletedLevel | null>(null), [fileName, setFileName] = useState('')
  const [empty, setEmpty] = useState<DeletedLevel[] | null>(null)
  const [deleted, setDeleted] = useState<DeletedLevel | null>(null)
  return <>
    <div className="builder-bin-header">
      <div><h3>Recycle bin</h3><p>Recover a level or delete it permanently.</p></div>
      <div className="builder-library-actions">
        <button className="level-file-danger" disabled={local.busy || !local.canWrite || !local.trash.deleted.length} onClick={() => setEmpty([...local.trash.deleted])}>Empty recycle bin</button>
      </div>
    </div>
    <div className="builder-bin-content" aria-busy={local.busy}>
      {local.trash.errors.map(error => <p key={error} className="level-file-error" role="alert">{error}</p>)}
      {!local.canWrite && <p className="builder-library-description">Enable saving in this folder to recover or permanently delete levels.</p>}
      {!local.trash.deleted.length && <p className="builder-library-empty">{local.busy ? 'Loading recycle bin…' : 'The recycle bin is empty.'}</p>}
      <div className="builder-local-files" role="group" aria-label="Deleted levels">{local.trash.deleted.map(entry => <div className="builder-local-file" key={`${entry.directoryName}/${entry.fileName}`} title={`Deleted ${new Date(entry.deletedAt).toLocaleString()}`}>
        <div className="builder-file-preview">
          {entry.level ? <LevelThumbnail level={entry.level} /> : <div className="level-thumbnail level-file-placeholder" aria-hidden="true">—</div>}
          <span><strong>{entry.level?.name ?? entry.fileName}</strong><small title={entry.fileName}>{entry.fileName}</small></span>
        </div>
        <div className="builder-file-actions">
          <button className="builder-use-template" disabled={local.busy || !local.canWrite} aria-label={`Recover ${entry.fileName}`} onClick={() => { setFileName(entry.fileName); setRestore(entry) }}>Recover</button>
          <DeleteLevelButton fileName={entry.fileName} disabled={local.busy || !local.canWrite} permanent onClick={() => setDeleted(entry)} />
        </div>
      </div>)}</div>
    </div>
    {restore && <FileActionDialog title="Recover level" confirmLabel="Recover" onClose={() => setRestore(null)} onConfirm={() => local.restoreDeleted(restore, fileName)}>
      <p>Recover <strong>{restore.level?.name ?? restore.fileName}</strong> to this level folder.</p>
      <label>Filename<input aria-label="Recovery filename" value={fileName} onChange={event => setFileName(event.target.value)} /></label>
      <p className="level-file-note">Existing files will not be overwritten. The level keeps its ID and is added to the end of a custom order.</p>
    </FileActionDialog>}
    {deleted && <FileActionDialog title="Delete level permanently?" confirmLabel="Delete permanently" destructive onClose={() => setDeleted(null)} onConfirm={() => local.deletePermanently([deleted])}>
      <p>Permanently delete <strong>{deleted.level?.name ?? deleted.fileName}</strong> ({deleted.fileName}) from the recycle bin?</p><p>This cannot be undone.</p>
    </FileActionDialog>}
    {empty && <FileActionDialog title="Empty recycle bin?" confirmLabel="Empty recycle bin" destructive onClose={() => setEmpty(null)} onConfirm={() => local.deletePermanently(empty)}>
      <p>Permanently delete {empty.length} {empty.length === 1 ? 'level' : 'levels'} from this folder’s recycle bin?</p><p>This cannot be undone.</p>
    </FileActionDialog>}
  </>
}
