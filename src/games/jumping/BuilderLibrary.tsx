import { useLayoutEffect, useRef, useState } from 'react'
import type { JumpLevel } from './level'
import type { LevelFile, LocalLevelEntry } from './levelAssets'
import { sortLevelEntriesByName } from './levelAssets'
import type { BuiltInLevels } from './builtInLevels'
import { LevelThumbnail } from './LevelThumbnail'
import { DeleteLevelButton, MissingLevelNotice } from './LevelFileActions'
import { RecycleBin } from './RecycleBin'
import type { Campaign } from './campaign'
import { librarySections } from './libraryOrder'
import { PlusIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type LibraryChoice = { kind: 'new' } | { kind: 'open' | 'template'; file: LevelFile }

export function BuilderLibrary({ levels, level, dirty, saving, message, campaign = null, onSave, onChoose, onClose }: {
  levels: BuiltInLevels; level: JumpLevel; campaign?: Campaign | null
  dirty: boolean; saving: boolean; message: string
  onSave: () => Promise<LevelFile | undefined>; onChoose: (choice: LibraryChoice) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null)
  const [binOpen, setBinOpen] = useState(false)
  const deleting = useRef(false)
  const [pending, setPending] = useState<LibraryChoice | null>(null)
  const grid = useRef<HTMLDivElement>(null), dragging = useRef<string | null>(null), writingOrder = useRef(false)
  const orderFocus = useRef<HTMLButtonElement | null>(null)
  const [dragged, setDragged] = useState<string | null>(null), [dropSlot, setDropSlot] = useState<number | null>(null)
  const [orderSaving, setOrderSaving] = useState(false), [orderMessage, setOrderMessage] = useState(''), [orderError, setOrderError] = useState('')
  const canReorder = levels.canWrite && !levels.busy && !orderSaving && levels.entries.length > 1
  useLayoutEffect(() => {
    if (orderSaving || levels.busy) return
    const focus = orderFocus.current
    orderFocus.current = null
    // Wait for React to re-enable the card before restoring keyboard focus.
    // A user who has already focused another action keeps that selection.
    const active = document.activeElement
    if (focus?.isConnected && (active === document.body || active === dialog.current || active === focus)) {
      focus.focus({ preventScroll: true }); focus.scrollIntoView({ block: 'nearest' })
    }
  }, [orderSaving, levels.busy])
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  useLayoutEffect(() => { (pending ? cancel : close).current?.focus() }, [pending])
  function choose(choice: LibraryChoice) {
    if (dirty) setPending(choice)
    else onChoose(choice)
  }
  async function deleteFile(file: LocalLevelEntry) {
    if (deleting.current || levels.busy) return
    deleting.current = true; setOrderError(''); setOrderMessage('')
    try { await levels.remove(file) }
    catch (error) { setOrderError((error as Error).message) }
    finally { deleting.current = false }
  }
  const byName = sortLevelEntriesByName(levels.entries)
  const sortedByName = byName.every((file, i) => file.fileName === levels.entries[i].fileName)
  // The order the facility plays it (libraryOrder.ts): each facility area before the courses behind its doors, the
  // wings in the order the concourse opens them, then the final course and its route on, and last the levels the
  // campaign never reaches. Offered only when it places every file.
  const byCampaign = (() => {
    if (!campaign) return null
    const ordered = librarySections(levels.entries, file => 'level' in file ? file.level : undefined, campaign)
      .flatMap(section => [...section.hub && section.kind !== 'dispatch' ? [section.hub] : [], ...section.entries])
    return ordered.length === levels.entries.length ? ordered : null
  })()
  const sortedByCampaign = !!byCampaign && byCampaign.every((file, i) => file.fileName === levels.entries[i].fileName)
  async function saveOrder(files: LocalLevelEntry[], order: 'filename' | 'listed', moved?: string, done?: string) {
    if (writingOrder.current || !levels.canWrite || levels.busy) return
    writingOrder.current = true; setOrderSaving(true); setOrderError(''); setOrderMessage('Saving order…')
    const focus = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    try {
      await levels.reorder(files, order)
      setOrderMessage(done ?? `${moved ? `${moved} moved. ` : ''}Order saved.`)
    } catch (error) { setOrderError((error as Error).message); setOrderMessage('') }
    finally {
      writingOrder.current = false; orderFocus.current = focus; setOrderSaving(false)
    }
  }
  function move(from: number, to: number) {
    if (!canReorder || from < 0 || from === to || to < 0 || to >= levels.entries.length || 'missing' in levels.entries[from]) return
    const files = [...levels.entries], [file] = files.splice(from, 1)
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
  return <dialog ref={dialog} className="builder-library studio-dialog" aria-label={pending ? 'Unsaved changes' : 'Level library'}
    aria-modal="true" role={pending ? 'alertdialog' : 'dialog'} onCancel={event => {
      event.preventDefault()
      if (dragging.current) { endDrag(); return }
      if (!saving && !orderSaving && !levels.busy) { if (pending) setPending(null); else if (binOpen) setBinOpen(false); else onClose() }
    }} onKeyDown={event => {
      event.currentTarget.dataset.inputMethod = 'keyboard'
      event.stopPropagation()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') event.preventDefault()
    }} onPointerDownCapture={event => { event.currentTarget.dataset.inputMethod = 'pointer' }}>
    <header className="builder-library-header flex flex-none flex-wrap items-center gap-2 border-b border-border px-6 py-3">
      <div className="min-w-0 flex-1"><h2 className="m-0 text-lg leading-tight font-semibold tracking-tight">{pending ? 'Unsaved changes' : binOpen ? 'Recycle bin' : 'Library'}</h2></div>
      <div className="builder-library-actions flex flex-wrap gap-1.5 empty:hidden">
        {!pending && !binOpen && <Button size="sm" className="builder-play" disabled={levels.busy} onClick={() => choose({ kind: 'new' })}><PlusIcon aria-hidden="true" />New level</Button>}
        {!pending && !binOpen && levels.canWrite && <Button size="sm" variant="outline" disabled={levels.busy} onClick={() => { setBinOpen(true); void levels.loadDeleted() }}>Recycle bin</Button>}
        {binOpen && <Button size="sm" variant="outline" disabled={levels.busy} onClick={() => setBinOpen(false)}>Back to levels</Button>}
      </div>
      <Button size="sm" variant="ghost" className="builder-library-close" ref={close} aria-label="Close library" disabled={saving || orderSaving || levels.busy} onClick={onClose}><XIcon aria-hidden="true" />Close</Button>
    </header>
    {binOpen ? <RecycleBin levels={levels} /> : pending ? <div className="builder-library-confirm">
      <div className="builder-library-confirm-copy">
      <h3 className="m-0 mb-2 text-base font-semibold">Save your changes?</h3>
      <p className="m-0 text-sm leading-relaxed">“{level.name}” has unsaved changes. {pending.kind === 'new' ? 'Creating a new level' : pending.kind === 'open' ? `Opening “${pending.file.level.name}”` : `Using “${pending.file.level.name}” as a template`} will replace this draft.</p>
      {message && <p className="builder-library-message" role="status">{message}</p>}
      </div>
      <div className="builder-library-confirm-actions mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" ref={cancel} disabled={saving} onClick={() => setPending(null)}>Cancel</Button>
        <Button variant="destructive" className="builder-delete" disabled={saving || levels.busy} onClick={() => onChoose(pending)}>Discard changes</Button>
        <Button className="builder-play" disabled={saving || levels.busy || !levels.canWrite} aria-busy={saving} onClick={async () => {
          const saved = await onSave()
          if (saved) onChoose(pending.kind === 'open' && pending.file.level.id === saved.level.id ? { ...pending, file: saved } : pending)
        }}>Save and continue</Button>
      </div>
    </div> : <>
      <div className="builder-library-folder flex flex-none flex-wrap items-center gap-x-4 gap-y-2 bg-muted px-6 py-2 text-xs">
        <p className="m-0">Built-in levels · Saved in this checkout</p>
        <Button size="sm" variant="outline" disabled={levels.busy || orderSaving} onClick={() => void levels.refresh()}><RefreshCwIcon aria-hidden="true" />Refresh built-in levels</Button>
        {levels.errors.map(error => <p key={error} role="alert">{error}</p>)}
        {message && <p className="builder-library-message" role="status">{message}</p>}
        {orderError && <p className="builder-library-message" role="alert">{orderError}</p>}
      </div>
      <p className="jumping-visually-hidden" role="status" aria-label="Level order">{orderMessage}</p>
      <div className="builder-library-content">
        <div className="builder-local-heading flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 text-sm font-semibold">Built-in levels</h3>
          {levels.entries.length > 0 && <div className="builder-library-sorts flex flex-wrap justify-end gap-1.5">
            {byCampaign && <Button size="sm" variant="outline" disabled={!levels.canWrite || levels.busy || orderSaving || sortedByCampaign} onClick={() => void saveOrder(byCampaign, 'listed', undefined, 'Sorted by campaign order.')}>Sort by campaign order</Button>}
            <Button size="sm" variant="outline" disabled={!levels.canWrite || levels.busy || orderSaving || sortedByName} onClick={() => void saveOrder(byName, 'listed', undefined, 'Sorted by level name.')}>Sort by level name</Button>
          </div>}
        </div>
        <p className="jumping-visually-hidden" id="library-order-help">Open a level to edit it, or use it as a template.{levels.entries.length > 1 && (levels.canWrite ? ' Drag to reorder, or focus a level and use Alt + Arrow keys. Order saves automatically.' : ' Enable saving to reorder levels.')}</p>
        {levels.entries.length ? <div ref={grid} className="builder-local-files" role="group" aria-label="Built-in level files" aria-describedby="library-order-help"
          onDragOver={event => {
            if (!dragging.current || !canReorder) return
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'
            setDropSlot(slotAt(event.clientX, event.clientY))
          }} onDrop={event => {
            if (!dragging.current || !canReorder) return
            event.preventDefault()
            const from = levels.entries.findIndex(file => file.fileName === dragging.current), slot = slotAt(event.clientX, event.clientY)
            endDrag(); move(from, slot > from ? slot - 1 : slot)
          }}>{levels.entries.map((file, index) => <div
          className={cn('builder-local-file', dragged === file.fileName && 'is-dragging', dropSlot === index && 'drop-before', dropSlot === levels.entries.length && index === levels.entries.length - 1 && 'drop-after')}
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
            move(index, Math.max(0, Math.min(levels.entries.length - 1, index + delta)))
          }}>
          {'missing' in file ? <>
            <MissingLevelNotice fileName={file.fileName} />
            <DeleteLevelButton fileName={file.fileName} disabled={levels.busy || !levels.canWrite} primary onClick={() => void deleteFile(file)} />
          </> : <>
          <Button variant="ghost" className="builder-file-preview" disabled={levels.busy} aria-label={`Open ${file.fileName}`}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
            onClick={() => choose({ kind: 'open', file })}>
            <LevelThumbnail level={file.level} /><span><strong>{file.level.name}</strong><small title={file.fileName}>{file.fileName}</small>
            </span>
          </Button>
          <div className="builder-file-actions"><Button size="sm" variant="secondary" className="builder-use-template" disabled={levels.busy} aria-label={`Use ${file.fileName} as template`} onClick={() => choose({ kind: 'template', file })}>Use as template</Button>
          <DeleteLevelButton fileName={file.fileName} disabled={levels.busy || !levels.canWrite} onClick={() => void deleteFile(file)} /></div>
          </>}
        </div>)}</div> : <p className="builder-library-empty">{levels.restoring ? 'Loading built-in levels…' : 'Create a new level to start this collection.'}</p>}

      </div>
    </>}
  </dialog>
}
