import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isVisibleControl, topDialog } from '../hardVacuum/dialogNavigation'
import type { ControllerNavigation } from '../hardVacuum/controllerInput'
import { createBuilderControllerReader, moveBuilderCursor } from './builderController'

const controls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button, input:not([readonly]), textarea:not([readonly]), summary, a[href], canvas[tabindex], [role=tabpanel][tabindex]')]
  .filter(element => isVisibleControl(element) && !element.matches(':disabled, [aria-disabled=true]'))
function focus(element: HTMLElement) {
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}
const key = (element: HTMLElement, value: string, fine = false) => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, altKey: fine, shiftKey: fine }))

function navigate(root: HTMLElement, direction: ControllerNavigation) {
  const items = controls(root), current = document.activeElement
  if (!(current instanceof HTMLElement) || !items.includes(current)) { if (items[0]) focus(items[0]); return }
  const from = current.getBoundingClientRect(), vertical = direction === 'up' || direction === 'down'
  const sign = direction === 'up' || direction === 'left' ? -1 : 1
  const candidates = items.filter(item => item !== current).map(item => {
    const to = item.getBoundingClientRect(), dx = to.x + to.width / 2 - from.x - from.width / 2, dy = to.y + to.height / 2 - from.y - from.height / 2
    return { item, advance: sign * (vertical ? dy : dx), offset: Math.abs(vertical ? dx : dy) }
  }).filter(candidate => candidate.advance > 2 && candidate.offset < candidate.advance)
    .sort((a, b) => a.advance + a.offset * 3 - b.advance - b.offset * 3)
  focus(candidates[0]?.item ?? items[(items.indexOf(current) + sign + items.length) % items.length])
}
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
  const pointer = (type: string, fine = false) => {
    const node = canvas.current, point = cursor.current
    if (!node || !point) return
    const rect = node.getBoundingClientRect()
    node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: -1, pointerType: 'gamepad',
      clientX: rect.left + point.x, clientY: rect.top + point.y, button: 0, buttons: dragging.current ? 1 : 0, altKey: fine }))
  }
  const cancel = useEffectEvent(() => {
    if (dragging.current) { dragging.current = false; pointer('pointercancel') }
    if (cursorElement.current) cursorElement.current.hidden = true
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
    const context = modal ? `dialog:${modal.getAttribute('aria-label')}` : popup ? `popup:${current?.getAttribute('aria-controls')}` : onCanvas ? 'canvas' : 'controls'
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
      if (onCanvas) focus(previousControl.current?.isConnected && isVisibleControl(previousControl.current) ? previousControl.current : controls(node)[0])
      else { if (current && node.contains(current)) previousControl.current = current; board.focus({ preventScroll: true }) }
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
      if (cursorElement.current) cursorElement.current.hidden = true
      if (input.pressed.includes(1)) {
        if (popup) key(current!, 'Escape')
        else if (modal) back(modal)
        else { if (current?.matches('input, textarea')) key(current, 'Escape'); board.focus({ preventScroll: true }) }
        return
      }
      if (input.navigation) {
        if (popup) key(current!, input.navigation === 'up' || input.navigation === 'left' ? 'ArrowUp' : 'ArrowDown')
        else if (current instanceof HTMLInputElement && current.type === 'number' && ['left', 'right'].includes(input.navigation)) key(current, input.navigation === 'left' ? 'ArrowDown' : 'ArrowUp', input.fine)
        else if (current?.getAttribute('role') === 'tab' && ['left', 'right'].includes(input.navigation)) key(current, input.navigation === 'left' ? 'ArrowLeft' : 'ArrowRight')
        else navigate(scope, input.navigation)
      }
      if (input.pressed.includes(0)) {
        if (!current || !scope.contains(current)) { if (controls(scope)[0]) focus(controls(scope)[0]); return }
        if (current.getAttribute('role') === 'combobox') key(current, 'Enter')
        else if (current instanceof HTMLTextAreaElement || current instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel'].includes(current.type)) onEditText(current)
        else if (!current.matches(':disabled, [aria-disabled=true], input[type=number]')) current.click()
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
      else { key(board, 'Escape'); focus(previousControl.current?.isConnected && isVisibleControl(previousControl.current) ? previousControl.current : controls(node)[0]) }
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
    }
    const blur = () => { reader.current.reset(); previous = 0; cancel() }
    const keyboardInput = (event: KeyboardEvent) => {
      if (!event.isTrusted) return
      cancel(); root.current?.setAttribute('data-input-method', 'keyboard')
    }
    const element = root.current!
    element.addEventListener('pointerdown', pointerInput, true); element.addEventListener('pointermove', pointerInput, true)
    element.addEventListener('keydown', keyboardInput, true)
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', blur)
    request = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(request); cancel()
      element.removeEventListener('pointerdown', pointerInput, true); element.removeEventListener('pointermove', pointerInput, true)
      element.removeEventListener('keydown', keyboardInput, true)
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', blur)
    }
  }, [active, root])
  return { connected, cursorElement }
}
