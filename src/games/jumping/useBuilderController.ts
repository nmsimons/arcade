import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isVisibleControl, topDialog } from '../hardVacuum/dialogNavigation'
import type { ControllerNavigation } from '../hardVacuum/controllerInput'
import { createBuilderControllerReader, moveBuilderCursor } from './builderController'
import { builderControls as controls, focusBuilderControl as focus, navigateBuilder as navigate,
  isBuilderField, editingBuilderField, startBuilderFieldEdit } from './builderNavigation'

const key = (element: HTMLElement, value: string, fine = false) => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, altKey: fine, shiftKey: fine }))
const directionKey: Record<string, ControllerNavigation> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
function scroll(root: HTMLElement, amount: number) {
  if (!amount) return
  let element = document.activeElement instanceof HTMLElement ? document.activeElement : null
  while (element && root.contains(element)) {
    if (element.scrollHeight > element.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) {
      element.scrollBy({ top: amount, behavior: 'instant' }); return
    }
    element = element.parentElement
  }
  const area = [...root.querySelectorAll<HTMLElement>('.builder-help-content, [data-controller-scroll], .builder-inspector, .builder-tools')]
    .find(item => isVisibleControl(item) && item.scrollHeight > item.clientHeight + 1)
  const target = area ?? root
  target.scrollBy({ top: amount, behavior: 'instant' })
}
function back(root: HTMLElement) {
  if (root instanceof HTMLDialogElement) root.dispatchEvent(new Event('cancel', { cancelable: true }))
  else key(root, 'Escape')
}

export function useBuilderController({ active, root, canvas, onPan, onZoom, onUndo, onRedo, onDuplicate, onLibrary, onTest, onEditText }: {
  active: boolean; root: RefObject<HTMLElement | null>; canvas: RefObject<HTMLCanvasElement | null>
  onPan: (x: number, y: number) => void; onZoom: (factor: number) => void
  onUndo: () => void; onRedo: () => void; onDuplicate: () => void; onLibrary: () => void; onTest: () => void
  onEditText: (input: HTMLInputElement | HTMLTextAreaElement) => void
}) {
  const [connected, setConnected] = useState(false)
  const cursorElement = useRef<HTMLDivElement>(null), reader = useRef(createBuilderControllerReader())
  const cursor = useRef<{ x: number; y: number } | null>(null), dragging = useRef(false)
  const previousSurface = useRef<HTMLElement | null>(null), previousControl = useRef<HTMLElement | null>(null)
  const previousControlPanel = useRef<HTMLElement | null>(null), restoreRequest = useRef(0)
  const restoreControl = useEffectEvent(() => {
    const node = root.current, control = previousControl.current, panel = previousControlPanel.current
    if (!node) return
    cancelAnimationFrame(restoreRequest.current)
    const restore = () => {
      // Object changes can remount a field; restore its equivalent in the same panel.
      const label = control?.getAttribute('aria-label')
      const target = control?.isConnected ? control : control && label && panel?.isConnected
        ? panel.querySelector<HTMLElement>(`${control.localName}[aria-label="${CSS.escape(label)}"]`) : null
      const items = controls(node)
      focus(target && items.includes(target) ? target : items.find(item => panel?.contains(item)) ?? items[0])
    }
    if (panel?.isConnected && panel.hidden) {
      const tabId = panel.getAttribute('aria-labelledby')
      const tab = tabId && node.querySelector<HTMLElement>(`#${CSS.escape(tabId)}`)
      if (tab) {
        tab.click()
        restoreRequest.current = requestAnimationFrame(() => {
          restoreRequest.current = 0
          if (document.activeElement === canvas.current && !topDialog()?.dataset.globalMenu) restore()
        })
        return
      }
    }
    restore()
  })
  const pointer = (type: string, fine = false) => {
    const node = canvas.current, point = cursor.current
    if (!node || !point) return
    const rect = node.getBoundingClientRect()
    node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: -1, pointerType: 'gamepad',
      clientX: rect.left + point.x, clientY: rect.top + point.y, button: 0, buttons: dragging.current ? 1 : 0, altKey: fine }))
  }
  const cancel = useEffectEvent(() => {
    if (dragging.current) { dragging.current = false; pointer('pointercancel') }
    if (cursorElement.current && !cursorElement.current.hidden) { pointer('pointerout'); cursorElement.current.hidden = true }
  })
  const frame = useEffectEvent((now: number, dt: number) => {
    const node = root.current, board = canvas.current
    if (!node || !board) return
    // Account panels are portals with their own app-level controller handler.
    if (topDialog()?.dataset.globalMenu) {
      reader.current.reset(); previousSurface.current = null; cancel(); return
    }
    const modal = [...node.querySelectorAll<HTMLElement>('dialog[open], [role=dialog], [role=alertdialog]')].filter(isVisibleControl).at(-1)
    const scope = modal ?? node, focused = document.hasFocus() && !document.hidden
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onCanvas = !modal && current === board
    const popup = current?.getAttribute('role') === 'combobox' && current.getAttribute('aria-expanded') === 'true'
    const editing = editingBuilderField(current)
    const context = popup ? `popup:${current?.getAttribute('aria-controls')}` : editing ? `edit:${current?.getAttribute('aria-label')}`
      : modal ? `dialog:${modal.getAttribute('aria-label')}` : onCanvas ? 'canvas' : 'controls'
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Other input methods remain available. */ }
    const input = reader.current.sample(pads, context, now, focused)
    setConnected(previous => previous === input.connected ? previous : input.connected)
    if (!focused || !input.connected || input.disconnected || previousSurface.current !== scope || !onCanvas && dragging.current) cancel()
    previousSurface.current = scope
    if (!focused || !input.connected || input.disconnected) return
    const used = input.pressed.length || input.navigation || input.direction.x || input.direction.y || input.right.x || input.right.y || input.zoom
    if (used && onCanvas && node.dataset.inputMethod !== 'controller') pointer('pointercancel')
    if (used) { node.setAttribute('data-input-method', 'controller'); scope.setAttribute('data-input-method', 'controller') }
    if (!modal && !popup && input.pressed.includes(3)) {
      cancel()
      if (onCanvas) restoreControl()
      else board.focus({ preventScroll: true })
      return
    }
    if (!modal && !popup) {
      if (input.pressed.includes(4)) { cancel(); onUndo(); return }
      if (input.pressed.includes(5)) { cancel(); onRedo(); return }
      if (input.pressed.includes(8)) { cancel(); onLibrary(); return }
      if (input.pressed.includes(9)) {
        // Cancel a pending preview first; saving in this frame would read it.
        if (dragging.current) cancel()
        else onTest()
        return
      }
    }
    if (!onCanvas) {
      if (cursorElement.current && !cursorElement.current.hidden) { pointer('pointerout'); cursorElement.current.hidden = true }
      if (input.pressed.includes(1)) {
        if (popup) key(current!, 'Escape')
        else if (editing) key(current!, 'Escape')
        else if (modal) back(modal)
        else { if (current?.matches('input, textarea')) key(current, 'Escape'); board.focus({ preventScroll: true }) }
        return
      }
      if (input.navigation) {
        if (popup) key(current!, input.navigation === 'up' || input.navigation === 'left' ? 'ArrowUp' : 'ArrowDown')
        else if (editing && current instanceof HTMLInputElement && current.type === 'number') key(current, ['left', 'down'].includes(input.navigation) ? 'ArrowDown' : 'ArrowUp', input.fine)
        else if (editing) key(current!, `Arrow${input.navigation[0].toUpperCase()}${input.navigation.slice(1)}`)
        else navigate(scope, input.navigation)
      }
      if (input.pressed.includes(0)) {
        if (!current || !scope.contains(current)) { if (controls(scope)[0]) focus(controls(scope)[0]); return }
        if (current.getAttribute('role') === 'combobox') key(current, 'Enter')
        else if (current instanceof HTMLTextAreaElement || current instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel'].includes(current.type)) onEditText(current)
        else if (isBuilderField(current)) key(current, 'Enter')
        else if (!current.matches(':disabled, [aria-disabled=true]')) current.click()
      }
      if (!popup) scroll(scope, input.right.y * 600 * dt)
      return
    }
    // An idle connected pad must not move the mouse's drag or hover position.
    if (!used && node.dataset.inputMethod !== 'controller') { if (cursorElement.current) cursorElement.current.hidden = true; return }
    const rect = board.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    cursor.current = moveBuilderCursor(cursor.current ?? { x: rect.width / 2, y: rect.height / 2 }, input.direction, dt, rect, input.fine)
    if (input.navigation && input.held.some(button => button >= 12 && button <= 15)) {
      if (!dragging.current) key(board, `Arrow${input.navigation[0].toUpperCase()}${input.navigation.slice(1)}`, input.fine)
      else cursor.current = moveBuilderCursor(cursor.current, { x: input.navigation === 'left' ? -1 : input.navigation === 'right' ? 1 : 0,
        y: input.navigation === 'up' ? -1 : input.navigation === 'down' ? 1 : 0 }, .05, rect, true)
    }
    if (cursorElement.current) {
      cursorElement.current.hidden = node.dataset.inputMethod !== 'controller'
      cursorElement.current.style.transform = `translate(${cursor.current.x}px, ${cursor.current.y}px)`
      cursorElement.current.dataset.dragging = String(dragging.current)
    }
    if (input.pressed.includes(1)) {
      if (dragging.current) cancel()
      else { cancel(); restoreControl() }
      return
    }
    if (input.pressed.includes(2) && !dragging.current) { onDuplicate(); return }
    if (!dragging.current) {
      if (input.right.x || input.right.y) onPan(input.right.x * 480 * dt, input.right.y * 480 * dt)
      if (input.zoom) onZoom(Math.exp(input.zoom * dt * 1.5))
    }
    if (input.pressed.includes(0) && board.getAttribute('aria-busy') !== 'true') { dragging.current = true; pointer('pointerdown', input.fine) }
    pointer('pointermove', input.fine)
    if (dragging.current && !input.held.includes(0)) { dragging.current = false; pointer('pointerup', input.fine) }
  })
  useEffect(() => {
    if (!active) return
    reader.current.reset(); previousSurface.current = null
    let request = 0, previous = 0
    const tick = (now: number) => {
      frame(now, previous ? Math.min(.05, (now - previous) / 1000) : 0); previous = now
      request = requestAnimationFrame(tick)
    }
    const pointerInput = (event: PointerEvent) => {
      if (!event.isTrusted) return
      cancel(); root.current?.setAttribute('data-input-method', 'pointer')
      if (event.type === 'pointerdown' && event.target instanceof HTMLElement && isBuilderField(event.target)) startBuilderFieldEdit(event.target, false)
    }
    const blur = () => { reader.current.reset(); previous = 0; cancel() }
    const keyboardInput = (event: KeyboardEvent) => {
      const node = root.current
      if (!node || topDialog()?.dataset.globalMenu) return
      if (event.isTrusted) { cancel(); node.setAttribute('data-input-method', 'keyboard') }
      const current = event.target instanceof HTMLElement ? event.target : null
      if (!current || current === canvas.current || event.ctrlKey || event.metaKey || event.altKey) return
      if (isBuilderField(current)) {
        // Once editing, multiline fields keep Enter for line breaks.
        if (current.dataset.builderFinishing || current instanceof HTMLTextAreaElement && event.key === 'Enter' && editingBuilderField(current)) return
        if (event.key === 'Enter' || event.key === 'Escape' && editingBuilderField(current)) {
          event.preventDefault(); event.stopPropagation()
          if (!editingBuilderField(current)) {
            startBuilderFieldEdit(current)
          } else {
            // Apply/cancel through the field handler while keeping native focus.
            // Blurring and refocusing can queue a scroll into the next popup.
            current.dataset.builderFinishing = 'true'
            key(current, event.key)
            delete current.dataset.builderFinishing
            delete current.dataset.builderEditing
          }
          return
        }
        if (editingBuilderField(current)) return
        if (event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key)) startBuilderFieldEdit(current, false)
      }
      if (!directionKey[event.key] || current.getAttribute('aria-expanded') === 'true') return
      event.preventDefault(); event.stopPropagation()
      const modal = [...node.querySelectorAll<HTMLElement>('dialog[open], [role=dialog], [role=alertdialog]')].filter(isVisibleControl).at(-1)
      navigate(modal ?? node, directionKey[event.key])
    }
    const fieldInput = (event: Event) => { if (event.target instanceof HTMLElement && isBuilderField(event.target)) startBuilderFieldEdit(event.target, false) }
    const fieldBlur = (event: FocusEvent) => { if (event.target instanceof HTMLElement) delete event.target.dataset.builderEditing }
    const controlFocus = (event: FocusEvent) => {
      const node = root.current, target = event.target
      // Dialogs own their return focus; they must not replace the canvas bookmark.
      if (!node || !(target instanceof HTMLElement) || target.closest('dialog, [role=dialog], [role=alertdialog]') || !controls(node).includes(target)) return
      previousControl.current = target
      previousControlPanel.current = target.closest<HTMLElement>('[role=tabpanel]')
    }
    const element = root.current!
    element.addEventListener('pointerdown', pointerInput, true); element.addEventListener('pointermove', pointerInput, true)
    element.addEventListener('keydown', keyboardInput, true)
    element.addEventListener('input', fieldInput, true); element.addEventListener('focusout', fieldBlur, true)
    element.addEventListener('focusin', controlFocus, true)
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', blur)
    request = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(request); cancelAnimationFrame(restoreRequest.current); cancel()
      element.removeEventListener('pointerdown', pointerInput, true); element.removeEventListener('pointermove', pointerInput, true)
      element.removeEventListener('keydown', keyboardInput, true)
      element.removeEventListener('input', fieldInput, true); element.removeEventListener('focusout', fieldBlur, true)
      element.removeEventListener('focusin', controlFocus, true)
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', blur)
    }
  }, [active, root, canvas])
  return { connected, cursorElement }
}
