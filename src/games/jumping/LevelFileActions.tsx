import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { moveDialogSelection } from '../hardVacuum/dialogNavigation'
import { Button } from '@/components/ui/button'
import './levelFiles.css'

export function SaveFailureDialog({ fileName, reason, returnFocus, onClose }: {
  fileName: string; reason: string; returnFocus: HTMLElement | null; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null)
  const descriptionId = useId()
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal(); close.current?.focus()
    return () => {
      node.close()
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [returnFocus])
  return <dialog ref={dialog} className="game-dialog studio-dialog level-file-dialog jumping-save-failure" role="alertdialog"
    aria-modal="true" aria-label="Save failed" aria-describedby={descriptionId}
    data-dialog-screen="level-save-failed" data-controller-mode="menu"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onKeyDown={event => {
      event.currentTarget.dataset.inputMethod = 'keyboard'
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      else if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') event.preventDefault()
    }} onPointerDownCapture={event => { event.currentTarget.dataset.inputMethod = 'pointer' }}>
    <div className="level-file-body">
      <h2>Save failed</h2>
      <div className="level-file-copy" id={descriptionId}>
        <p>Could not save <strong>{fileName}</strong>.</p>
        <p className="level-file-error">{reason}</p>
        <p>Your changes are still in the editor.</p>
      </div>
    </div>
    <div className="level-file-actions"><Button ref={close} type="button" variant="outline" data-initial-focus onClick={onClose}>Close</Button></div>
  </dialog>
}

export function FileActionDialog({ title, children, confirmLabel, destructive = false, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; destructive?: boolean
  onConfirm: () => Promise<void>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), pending = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useLayoutEffect(() => { const node = dialog.current!; node.showModal(); cancel.current?.focus(); return () => node.close() }, [])
  async function confirm() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await onConfirm(); onClose() }
    catch (error) { setError((error as Error).message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className={`game-dialog studio-dialog level-file-dialog${destructive ? ' is-destructive' : ''}`} role="alertdialog" aria-modal="true" aria-label={title}
    data-dialog-screen="level-file-action" data-controller-mode="menu" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!pending.current) onClose() }}
    onKeyDown={event => {
      event.currentTarget.dataset.inputMethod = 'keyboard'
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); if (!pending.current) onClose() }
      else if (event.target instanceof HTMLButtonElement && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); moveDialogSelection(event.currentTarget, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? 'previous' : 'next')
      }
    }} onPointerDownCapture={event => { event.currentTarget.dataset.inputMethod = 'pointer' }}>
    <form onSubmit={event => { event.preventDefault(); void confirm() }}>
      <div className="level-file-body">
        <h2>{title}</h2>
        <fieldset className="level-file-copy" disabled={busy}>{children}</fieldset>
        {error && <p role="alert" className="level-file-error">{error}</p>}
      </div>
      <div className="level-file-actions">
        <Button ref={cancel} type="button" variant="outline" data-initial-focus disabled={busy} onClick={onClose}>Cancel</Button>
        <Button className={destructive ? 'level-file-danger bg-destructive text-primary-foreground hover:bg-destructive/90' : 'level-file-primary'} type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Working…' : confirmLabel}</Button>
      </div>
    </form>
  </dialog>
}

export function DeleteLevelButton({ fileName, disabled, onClick, primary = false, permanent = false }: {
  fileName: string; disabled: boolean; onClick: () => void; primary?: boolean; permanent?: boolean
}) {
  return <button className={`level-file-delete${primary ? ' level-file-delete-labeled' : ''}`} type="button" aria-label={`${permanent ? 'Delete permanently' : 'Delete'} ${fileName}`} title={permanent ? 'Delete permanently' : 'Delete level'} disabled={disabled} onClick={onClick}
    data-menu-primary={primary || undefined} data-menu-secondary={!primary || undefined}>
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><path d="M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8l.5 6M12 8l-.5 6" /></svg>
    {primary && <span>Delete</span>}
  </button>
}

export function MissingLevelNotice({ fileName, compact = false }: { fileName: string; compact?: boolean }) {
  if (compact) return <><div className="level-thumbnail level-file-placeholder" aria-hidden="true"><span>Missing file</span></div><strong>{fileName}</strong></>
  return <div className="level-file-missing builder-file-preview"><div className="level-thumbnail level-file-placeholder" aria-hidden="true">—</div><span><strong>{fileName}</strong><small>Missing file</small></span></div>
}
