import type { ControllerNavigation } from './controllerInput'

export function isVisibleControl(element: HTMLElement) {
  return !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}
export const dialogButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button')]
  .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true' && isVisibleControl(button))
export const dialogButtonKey = (button: HTMLButtonElement) => button.dataset.menuId ?? button.getAttribute('aria-label') ?? button.textContent ?? ''
export function focusDialogButton(button: HTMLButtonElement) {
  button.focus({ preventScroll: true })
  button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
export function restoreDialogSelection(root: HTMLElement, key = root.dataset.selectionKey, previous?: HTMLButtonElement | null) {
  const buttons = dialogButtons(root)
  let selected = buttons.find(button => dialogButtonKey(button) === key)
  if (!selected && previous && root.contains(previous)) {
    const all = [...root.querySelectorAll<HTMLButtonElement>('button')], index = all.indexOf(previous)
    selected = [...all.slice(index + 1), ...all.slice(0, index)].find(button => buttons.includes(button))
  }
  selected ??= buttons.find(button => button.hasAttribute('data-initial-focus')) ?? buttons[0]
  if (selected) focusDialogButton(selected)
  return selected
}

/** Linear menus visit every action. Explicit grids also respect their visual columns. */
export function moveDialogSelection(root: HTMLElement, direction: ControllerNavigation | 'first' | 'last') {
  const buttons = dialogButtons(root), current = document.activeElement as HTMLButtonElement
  if (!buttons.length) return
  if (direction === 'first' || direction === 'last') { focusDialogButton(buttons[direction === 'first' ? 0 : buttons.length - 1]); return }
  if (!buttons.includes(current)) { restoreDialogSelection(root); return }
  const grid = current.closest('[data-menu-grid]')
  if (grid && root.contains(grid)) {
    const from = current.getBoundingClientRect(), vertical = direction === 'up' || direction === 'down'
    const sign = direction === 'up' || direction === 'left' ? -1 : 1
    const candidates = buttons.filter(button => button !== current && grid.contains(button)).map(button => {
      const to = button.getBoundingClientRect(), dx = to.x + to.width / 2 - from.x - from.width / 2, dy = to.y + to.height / 2 - from.y - from.height / 2
      return { button, advance: sign * (vertical ? dy : dx), offset: Math.abs(vertical ? dx : dy) }
    }).filter(candidate => candidate.advance > 2 && candidate.offset < candidate.advance)
      .sort((a, b) => a.advance + a.offset * 3 - b.advance - b.offset * 3)
    if (candidates[0]) { focusDialogButton(candidates[0].button); return }
  }
  const step = direction === 'up' || direction === 'left' ? -1 : 1
  focusDialogButton(buttons[(buttons.indexOf(current) + step + buttons.length) % buttons.length])
}

export function scrollDialog(root: HTMLElement, delta: number) {
  if (!delta) return
  const nested = [...root.querySelectorAll<HTMLElement>('[data-controller-scroll]')]
  for (const element of [root, ...nested]) {
    const remaining = delta > 0 ? element.scrollHeight - element.clientHeight - element.scrollTop : element.scrollTop
    if (isVisibleControl(element) && remaining > 1) { element.scrollBy({ top: delta, behavior: 'instant' }); return }
  }
}
