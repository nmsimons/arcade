import { useLayoutEffect, useRef, useState } from 'react'
import type { JumpLevel } from './level'
import type { LevelFile, LocalLevelEntry, MissingLevelFile } from './levelAssets'
import { compareFileNames } from './levelAssets'
import type { LocalLevels } from './localLevels'
import { LocalFolderPanel } from './LocalFolderPanel'
import { LevelThumbnail } from './LevelThumbnail'
import { DeleteLevelButton, DeleteLevelDialog, MissingLevelNotice } from './LevelFileActions'
import { RecycleBin } from './RecycleBin'
import type { LevelSource } from './routes'

export type LibraryChoice = ({ kind: 'new' } | { kind: 'open' | 'template'; file: LevelFile }) & { source?: LevelSource }

export function BuilderLibrary({ local: editorStore, collections, templates, fileName, level, dirty, saving, message, onSave, onChoose, onClose }: {
  local: LocalLevels; templates: LevelFile[]; fileName: string; level: JumpLevel
  collections?: { local: LocalLevels; builtIn: LocalLevels }
  dirty: boolean; saving: boolean; message: string
  onSave: () => Promise<LevelFile | undefined>; onChoose: (choice: LibraryChoice) => void; onClose: () => void
}) {
  const [source, setSource] = useState<LevelSource>(editorStore.repository ? 'built-in' : 'local')
  const local = collections ? source === 'built-in' ? collections.builtIn : collections.local : editorStore
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null)
  const [deleted, setDeleted] = useState<MissingLevelFile | null>(null), [binOpen, setBinOpen] = useState(false)
  const deleting = useRef(false)
  const [pending, setPending] = useState<LibraryChoice | null>(null)
  const grid = useRef<HTMLDivElement>(null), dragging = useRef<string | null>(null), writingOrder = useRef(false)
  const [dragged, setDragged] = useState<string | null>(null), [dropSlot, setDropSlot] = useState<number | null>(null)
  const [orderSaving, setOrderSaving] = useState(false), [orderMessage, setOrderMessage] = useState(''), [orderError, setOrderError] = useState('')
  const canReorder = local.canWrite && !local.busy && !orderSaving && local.entries.length > 1
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  useLayoutEffect(() => { (pending ? cancel : close).current?.focus() }, [pending])
  function choose(choice: LibraryChoice) {
    const target = { ...choice, source }
    if (dirty) setPending(target)
    else onChoose(target)
  }
  async function deleteFile(file: LevelFile) {
    if (deleting.current || local.busy) return
    deleting.current = true; setOrderError(''); setOrderMessage('')
    try { await local.remove(file) }
    catch (error) { setOrderError((error as Error).message) }
    finally { deleting.current = false }
  }
  async function saveOrder(files: LocalLevelEntry[], order: 'filename' | 'listed', moved?: string) {
    if (writingOrder.current || !local.canWrite || local.busy) return
    writingOrder.current = true; setOrderSaving(true); setOrderError(''); setOrderMessage('Saving order…')
    const focus = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    try {
      await local.reorder(files, order)
      setOrderMessage(order === 'filename' ? 'Filename order restored.' : `${moved ? `${moved} moved. ` : ''}Order saved.`)
    } catch (error) { setOrderError((error as Error).message); setOrderMessage('') }
    finally {
      writingOrder.current = false; setOrderSaving(false)
      requestAnimationFrame(() => {
        // Restoring a disabled button must not steal focus from the next action.
        const active = document.activeElement
        if (focus?.isConnected && (active === document.body || active === dialog.current || active === focus)) {
          focus.focus({ preventScroll: true }); focus.scrollIntoView({ block: 'nearest' })
        }
      })
    }
  }
  function move(from: number, to: number) {
    if (!canReorder || from < 0 || from === to || to < 0 || to >= local.entries.length || 'missing' in local.entries[from]) return
    const files = [...local.entries], [file] = files.splice(from, 1)
    files.splice(to, 0, file)
    void saveOrder(files, 'listed', 'level' in file ? file.level.name : file.fileName)
  }
  function endDrag() { dragging.current = null; setDragged(null); setDropSlot(null) }
  function slotAt(x: number, y: number) {
    const cards = [...grid.current!.children]
    for (const [index, card] of cards.entries()) {
      const rect = card.getBoundingClientRect()
      if (y < rect.top || y <= rect.bottom && x < rect.left + rect.width / 2) return index
    }
    return cards.length
  }
  return <dialog ref={dialog} className="builder-library" aria-label={pending ? 'Unsaved changes' : 'Level library'}
    aria-modal="true" role={pending ? 'alertdialog' : 'dialog'} onCancel={event => {
      event.preventDefault()
      if (dragging.current) { endDrag(); return }
      if (!saving && !orderSaving && !local.busy) { if (pending) setPending(null); else if (binOpen) setBinOpen(false); else onClose() }
    }} onKeyDown={event => {
      event.stopPropagation()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') event.preventDefault()
    }}>
    <header className="builder-library-header">
      <div><p className="jumping-eyebrow">LEVEL STUDIO</p><h2>Library</h2></div>
      <div className="builder-library-actions">
        {!pending && !binOpen && <button className="builder-play" disabled={local.busy} onClick={() => choose({ kind: 'new' })}><span aria-hidden="true">+ </span>New level</button>}
        {!pending && !binOpen && local.hasHandle && <button disabled={local.busy} onClick={() => { setBinOpen(true); void local.loadDeleted() }}>Recycle bin</button>}
        {binOpen && <button disabled={local.busy} onClick={() => setBinOpen(false)}>Back to levels</button>}
        <button ref={close} aria-label="Close library" disabled={saving || orderSaving || local.busy} onClick={onClose}>Close</button>
      </div>
    </header>
    {binOpen ? <RecycleBin local={local} /> : pending ? <div className="builder-library-confirm">
      <h3>Save your changes?</h3>
      <p>“{level.name}” has unsaved changes. {pending.kind === 'new' ? 'Creating a new level' : pending.kind === 'open' ? `Opening “${pending.file.level.name}”` : `Using “${pending.file.level.name}” as a template`} will replace this draft.</p>
      {!editorStore.canWrite && <p>Cancel and choose a writable folder in the library to save this draft first.</p>}
      {message && <p className="builder-library-message" role="status">{message}</p>}
      <div className="builder-library-confirm-actions">
        <button ref={cancel} disabled={saving} onClick={() => setPending(null)}>Cancel</button>
        <button className="builder-delete" disabled={saving || local.busy} onClick={() => onChoose(pending)}>Discard changes</button>
        <button className="builder-play" disabled={saving || editorStore.busy || !editorStore.canWrite} aria-busy={saving} onClick={async () => {
          const saved = await onSave()
          if (saved) onChoose(pending.kind === 'open' && local.repository === editorStore.repository && pending.file.level.id === saved.level.id ? { ...pending, file: saved } : pending)
        }}>Save and continue</button>
      </div>
    </div> : <>
      <div className="builder-library-folder">
        {collections && <div className="jumping-collection-tabs" role="group" aria-label="Library source">
          <button aria-pressed={source === 'built-in'} disabled={saving || local.busy || orderSaving} onClick={() => setSource('built-in')}>Built-in levels</button>
          <button aria-pressed={source === 'local'} disabled={saving || local.busy || orderSaving} onClick={() => setSource('local')}>Local folder</button>
        </div>}
        <LocalFolderPanel local={local} />
        {message && <p className="builder-library-message" role="status">{message}</p>}
        {orderMessage && <p className="builder-library-description" role="status">{orderMessage}</p>}
        {orderError && <p className="builder-library-message" role="alert">{orderError}</p>}
      </div>
      <div className="builder-library-content">
        <div className="builder-local-heading"><h3>{local.repository ? 'Built-in levels' : 'Local levels'}</h3>
          {local.entries.length > 0 && <button disabled={!local.canWrite || local.busy || orderSaving || local.manifest?.order !== 'listed'} onClick={() => void saveOrder([...local.entries].sort((a, b) => compareFileNames(a.fileName, b.fileName)), 'filename')}>Sort by filename</button>}
        </div>
        <p className="builder-library-description" id="library-order-help">Open a level to edit it, or use it as a template.{local.entries.length > 1 && (local.canWrite ? ' Drag to reorder, or focus a level and use Alt + Arrow keys. Order saves automatically.' : ' Enable saving to reorder levels.')}</p>
        {local.entries.length ? <div ref={grid} className="builder-local-files" role="group" aria-label={local.repository ? 'Built-in level files' : 'Local level files'} aria-describedby="library-order-help"
          onDragOver={event => {
            if (!dragging.current || !canReorder) return
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'
            setDropSlot(slotAt(event.clientX, event.clientY))
          }} onDrop={event => {
            if (!dragging.current || !canReorder) return
            event.preventDefault()
            const from = local.entries.findIndex(file => file.fileName === dragging.current), slot = slotAt(event.clientX, event.clientY)
            endDrag(); move(from, slot > from ? slot - 1 : slot)
          }}>{local.entries.map((file, index) => <div
          className={`builder-local-file${dragged === file.fileName ? ' is-dragging' : ''}${dropSlot === index ? ' drop-before' : ''}${dropSlot === local.entries.length && index === local.entries.length - 1 ? ' drop-after' : ''}`}
          key={file.fileName} draggable={canReorder && !('missing' in file)} onDragStart={event => {
            if (!canReorder || 'missing' in file) { event.preventDefault(); return }
            dragging.current = file.fileName; setDragged(file.fileName)
            event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', file.fileName)
          }} onDragEnd={endDrag} onKeyDown={event => {
            if ('missing' in file || !event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault(); event.stopPropagation()
            const cards = [...grid.current!.children] as HTMLElement[]
            const columns = cards.filter(card => card.offsetTop === cards[0].offsetTop).length
            const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
            move(index, Math.max(0, Math.min(local.entries.length - 1, index + delta)))
          }}>
          {'missing' in file ? <>
            <MissingLevelNotice fileName={file.fileName} />
            <DeleteLevelButton fileName={file.fileName} disabled={local.busy || !local.canWrite} primary onClick={() => setDeleted(file)} />
          </> : <>
          <button className="builder-file-preview" disabled={local.busy} aria-label={`Open ${file.fileName}`} aria-pressed={local.repository === editorStore.repository && fileName === file.fileName && level.id === file.level.id}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
            onClick={() => choose({ kind: 'open', file })}>
            <LevelThumbnail level={file.level} /><span><strong>{file.level.name}</strong><small title={file.fileName}>{file.fileName}</small></span>
          </button>
          <div className="builder-file-actions"><button className="builder-use-template" disabled={local.busy} aria-label={`Use ${file.fileName} as template`} onClick={() => choose({ kind: 'template', file })}>Use as template</button>
          <DeleteLevelButton fileName={file.fileName} disabled={local.busy || !local.canWrite} onClick={() => void deleteFile(file)} /></div>
          </>}
        </div>)}</div> : <p className="builder-library-empty">{local.status === 'ready' ? 'Create a new level to start this collection.' : 'Choose your level folder above to see its JSON files here.'}</p>}
        {templates.length > 0 && <><h3>Built-in levels</h3><p className="builder-library-description">Use a built-in level as a template for your own.</p>
          <div className="builder-templates">{templates.map(file => <button key={file.fileName} onClick={() => choose({ kind: 'template', file })}>
            <LevelThumbnail level={file.level} /><strong>{file.level.name}</strong><span>{file.fileName}</span>
          </button>)}</div></>}
      </div>
    </>}
    {deleted && <DeleteLevelDialog entry={deleted} local={local} onClose={() => setDeleted(null)} onDeleted={() => { setOrderMessage(''); setOrderError('') }} />}
  </dialog>
}
