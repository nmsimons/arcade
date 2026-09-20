import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { dialogButtons, dialogButtonKey, isVisibleControl, moveDialogSelection, restoreDialogSelection } from './dialogNavigation'

/** Use actual DOM focus as the selection, shared by mouse, Tab and arrow keys. */
export function KeyboardDialog({ children, label, focusKey, onClose, className, confirmation = false, controllerMode = 'menu' }: {
  children: ReactNode
  label: string
  focusKey: string
  onClose: () => void
  className: string
  confirmation?: boolean
  controllerMode?: 'menu' | 'map'
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastScreenRef = useRef('')
  const selections = useRef(new Map<string, string>())
  const lastFocused = useRef<HTMLButtonElement | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !isVisibleControl(root)) return
    const scope = root.closest('.hard-vacuum') ?? root.parentElement
    const top = [...scope?.querySelectorAll<HTMLElement>('.game-dialog') ?? []].filter(isVisibleControl).at(-1)
    if (top && top !== root) return
    const changed = lastScreenRef.current !== focusKey
    const active = document.activeElement
    // A purchase can disable the focused button. Move to another available
    // action immediately instead of leaving keyboard input on a dead control.
    if (changed || !dialogButtons(root).includes(active as HTMLButtonElement)) {
      // Reopening a destructive confirmation always defaults to Cancel, even
      // if the pilot highlighted the destructive choice on an earlier visit.
      restoreDialogSelection(root, changed && confirmation ? '' : selections.current.get(focusKey), changed ? undefined : lastFocused.current)
    }
    lastScreenRef.current = focusKey
  }, [focusKey, children, confirmation])

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const key = event.key.toLowerCase()
    if (key === 'escape') {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) onClose()
      return
    }
    if (event.repeat && (key === 'enter' || key === ' ')) {
      event.preventDefault(); event.stopPropagation()
      return
    }
    const backward = ['arrowup', 'arrowleft', 'w'].includes(key) || (key === 'tab' && event.shiftKey)
    const forward = ['arrowdown', 'arrowright', 's'].includes(key) || (key === 'tab' && !event.shiftKey)
    if (!backward && !forward && key !== 'home' && key !== 'end') return
    event.preventDefault(); event.stopPropagation()
    moveDialogSelection(event.currentTarget, key === 'home' ? 'first' : key === 'end' ? 'last'
      : key === 'arrowleft' ? 'left' : key === 'arrowright' ? 'right' : backward ? 'up' : 'down')
  }

  return <div ref={rootRef} role={confirmation ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={label}
    data-dialog-screen={focusKey} data-controller-mode={controllerMode} className={`game-dialog ${className}`} onKeyDown={navigate}
    onFocusCapture={event => {
      if (!(event.target instanceof HTMLButtonElement)) return
      const key = dialogButtonKey(event.target)
      selections.current.set(focusKey, key); event.currentTarget.dataset.selectionKey = key; lastFocused.current = event.target
    }}>
    {children}
  </div>
}
