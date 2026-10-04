import type { ControllerNavigation } from '../hardVacuum/controllerInput'
import { isVisibleControl } from '../hardVacuum/dialogNavigation.ts'

type Rect = { x: number; y: number; width: number; height: number }

/** Prefer controls directly ahead, then nearby diagonals; an edge never wraps. */
export function directionalNeighbor<T>(from: Rect, items: readonly { item: T; rect: Rect; preferred?: boolean }[], direction: ControllerNavigation): T | undefined {
  const vertical = direction === 'up' || direction === 'down'
  const sign = direction === 'up' || direction === 'left' ? -1 : 1
  const primary = (rect: Rect) => vertical ? rect.y + rect.height / 2 : rect.x + rect.width / 2
  const cross = (rect: Rect) => vertical ? rect.x + rect.width / 2 : rect.y + rect.height / 2
  const halfCross = (rect: Rect) => (vertical ? rect.width : rect.height) / 2
  const candidates = items.map(({ item, rect, preferred }) => {
    const advance = sign * (primary(rect) - primary(from)), offset = Math.abs(cross(rect) - cross(from))
    const gap = Math.max(0, offset - halfCross(from) - halfCross(rect))
    return { item, advance, offset, gap, preferred, aligned: gap === 0 }
  }).filter(candidate => candidate.advance > 2 && (candidate.aligned || candidate.offset < candidate.advance))
  candidates.sort((a, b) => Number(b.aligned) - Number(a.aligned)
    || (a.advance + a.offset * (a.aligned ? .1 : 3)) - (b.advance + b.offset * (b.aligned ? .1 : 3))
    || Number(!!b.preferred) - Number(!!a.preferred))
  return candidates[0]?.item
}

// Canvas entry is explicit (Y or Tab); focusing it starts cursor movement.
export const builderControls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button, input:not([readonly]), textarea:not([readonly]), summary, a[href], [role=tabpanel][tabindex]')]
  .filter(element => isVisibleControl(element) && !element.matches(':disabled, [aria-disabled=true]'))

export function focusBuilderControl(element: HTMLElement | undefined) {
  if (!element) return
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}

function reachable(element: HTMLElement, current: HTMLElement) {
  const rect = element.getBoundingClientRect()
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), clipX = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)
    const clipY = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)
    // Reveal the next row in the current scroll panel; other panels must offer
    // a visible destination rather than a field far outside the viewport.
    if ((!clipX && !clipY) || parent.contains(current)) continue
    const clip = parent.getBoundingClientRect()
    if (clipX && (rect.right <= clip.left || rect.left >= clip.right)
      || clipY && (rect.bottom <= clip.top || rect.top >= clip.bottom)) return false
  }
  return true
}

export function navigateBuilder(root: HTMLElement, direction: ControllerNavigation) {
  const items = builderControls(root), current = document.activeElement
  if (!(current instanceof HTMLElement) || !items.includes(current)) { focusBuilderControl(items[0]); return }
  // Horizontal tabs follow their own order and stop at either end, regardless
  // of toolbar controls beside or above them. Up/down still navigate spatially.
  const tablist = current.getAttribute('role') === 'tab' ? current.closest('[role=tablist]') : null
  if (tablist && tablist.getAttribute('aria-orientation') !== 'vertical' && (direction === 'left' || direction === 'right')) {
    const tabs = items.filter(item => item.getAttribute('role') === 'tab' && item.closest('[role=tablist]') === tablist)
    const index = Math.max(0, Math.min(tabs.length - 1, tabs.indexOf(current) + (direction === 'left' ? -1 : 1)))
    const next = tabs[index]
    focusBuilderControl(next)
    if (next !== current) next.click()
    return
  }
  const next = directionalNeighbor(current.getBoundingClientRect(), items.filter(item => item !== current && reachable(item, current))
    .map(item => ({ item, rect: item.getBoundingClientRect(), preferred: item.getAttribute('aria-selected') === 'true' })), direction)
  if (!next) return
  focusBuilderControl(next)
  if (next.getAttribute('role') === 'tab') next.click()
}

export function isBuilderField(element: HTMLElement | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement && !element.readOnly || element instanceof HTMLInputElement
    && ['text', 'number', 'search', 'email', 'url', 'tel'].includes(element.type) && !element.readOnly
}

export const editingBuilderField = (element: HTMLElement | null) => isBuilderField(element) && element.dataset.builderEditing === 'true'
export function startBuilderFieldEdit(element: HTMLInputElement | HTMLTextAreaElement, select = true) {
  element.dataset.builderEditing = 'true'
  if (select) element.select()
}
