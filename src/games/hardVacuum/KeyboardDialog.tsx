import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { DIALOG_CONTROL_SELECTOR, dialogButtons, dialogButtonKey, isDialogControl, isVisibleControl, moveDialogSelection, restoreDialogSelection, scrollDialog, topDialog } from './dialogNavigation'
import type { DialogControl } from './dialogNavigation'

/** Use actual DOM focus as the selection, shared by mouse, Tab and arrow keys. */
export function KeyboardDialog({ children, label, focusKey, onClose, className = 'menu-overlay', confirmation = false, controllerMode = 'menu', globalMenu = false }: {
  children: ReactNode
  label: string
  focusKey: string
  onClose: () => void
  className?: string
  globalMenu?: boolean
  confirmation?: boolean
  controllerMode?: 'menu' | 'map'
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastScreenRef = useRef('')
  const selections = useRef(new Map<string, string>())
  const lastFocused = useRef<DialogControl | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !isVisibleControl(root)) return
    const top = topDialog()
    if (top && top !== root) return
    const changed = lastScreenRef.current !== focusKey
    const active = document.activeElement
    // A purchase can disable the focused button. Move to another available
    // action immediately instead of leaving keyboard input on a dead control.
    if (changed || !dialogButtons(root).includes(active as DialogControl)) {
      // Reopening a destructive confirmation always defaults to Cancel, even
      // if the pilot highlighted the destructive choice on an earlier visit.
      restoreDialogSelection(root, changed && confirmation ? '' : selections.current.get(focusKey), changed ? undefined : lastFocused.current)
    }
    lastScreenRef.current = focusKey
  }, [focusKey, children, confirmation])

  useEffect(() => {
    const keepFocusInside = () => {
      const root = rootRef.current
      if (root && topDialog() === root && !root.contains(document.activeElement)) restoreDialogSelection(root)
    }
    document.addEventListener('focusin', keepFocusInside)
    return () => document.removeEventListener('focusin', keepFocusInside)
  }, [])

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || topDialog() !== event.currentTarget) return
    event.currentTarget.dataset.inputMethod = 'keyboard'
    const key = event.key.toLowerCase()
    if (key === 'escape') {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) onClose()
      return
    }
    // Preserve native slider adjustment, including Home/End and key repeat.
    // Tab and up/down still use the dialog's shared focus navigation.
    if (event.target instanceof HTMLInputElement && event.target.type === 'range'
      && ['arrowleft', 'arrowright', 'home', 'end'].includes(key)) return
    if (key === 'enter' || key === ' ') {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) {
        const active = document.activeElement
        if (isDialogControl(active) && dialogButtons(event.currentTarget).includes(active)) active.click()
        else restoreDialogSelection(event.currentTarget)
      }
      return
    }
    if (key === 'pageup' || key === 'pagedown') {
      event.preventDefault(); event.stopPropagation()
      scrollDialog(event.currentTarget, (key === 'pageup' ? -1 : 1) * Math.max(120, window.innerHeight * .65))
      return
    }
    if (key === 'tab') {
      event.preventDefault(); event.stopPropagation()
      moveDialogSelection(event.currentTarget, event.shiftKey ? 'previous' : 'next')
      return
    }
    const backward = ['arrowup', 'arrowleft', 'w', 'a'].includes(key)
    const forward = ['arrowdown', 'arrowright', 's', 'd'].includes(key)
    if (!backward && !forward && key !== 'home' && key !== 'end') return
    event.preventDefault(); event.stopPropagation()
    moveDialogSelection(event.currentTarget, key === 'home' ? 'first' : key === 'end' ? 'last'
      : key === 'arrowleft' || key === 'a' ? 'left' : key === 'arrowright' || key === 'd' ? 'right' : backward ? 'up' : 'down')
  }

  return <div ref={rootRef} tabIndex={-1} role={confirmation ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={label}
    data-global-menu={globalMenu || undefined} data-dialog-screen={focusKey} data-controller-mode={controllerMode} className={`game-dialog ${className}`} onKeyDown={navigate}
    onPointerDownCapture={event => {
      event.currentTarget.dataset.inputMethod = 'pointer'
      const button = (event.target as HTMLElement).closest<DialogControl>(DIALOG_CONTROL_SELECTOR)
      if (button && dialogButtons(event.currentTarget).includes(button)) button.focus({ preventScroll: true })
    }}
    onFocusCapture={event => {
      if (!isDialogControl(event.target)) return
      const key = dialogButtonKey(event.target)
      selections.current.set(focusKey, key); event.currentTarget.dataset.selectionKey = key; lastFocused.current = event.target
    }}>
    {children}
  </div>
}
