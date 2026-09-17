import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

const enabledButtons = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))

/** Use actual DOM focus as the selection, shared by mouse, Tab and arrow keys. */
export function KeyboardDialog({ children, label, focusKey, onClose, className, confirmation = false }: {
  children: ReactNode
  label: string
  focusKey: string
  onClose: () => void
  className: string
  confirmation?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastScreenRef = useRef('')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const changed = lastScreenRef.current !== focusKey
    const active = document.activeElement
    // A purchase can disable the focused button. Move to another available
    // action immediately instead of leaving keyboard input on a dead control.
    if (changed || !root.contains(active) || (active instanceof HTMLButtonElement && active.disabled)) {
      const buttons = enabledButtons(root)
      const initial = changed ? root.querySelector<HTMLButtonElement>('[data-initial-focus]:not(:disabled)') : null
      ;(initial ?? buttons[0])?.focus({ preventScroll: true })
    }
    lastScreenRef.current = focusKey
  }, [focusKey, children])

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
    const buttons = enabledButtons(event.currentTarget)
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = key === 'home' ? 0 : key === 'end' ? buttons.length - 1 : (index + (backward ? -1 : 1) + buttons.length) % buttons.length
    buttons[next].focus()
  }

  return <div ref={rootRef} role={confirmation ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={label} className={className} onKeyDown={navigate}>
    {children}
  </div>
}
