import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type Option = { value: string; label: string }
function popupPosition(rect: DOMRect, count: number): CSSProperties {
  const gap = 4, margin = 8
  const below = window.innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin
  const downward = below >= Math.min(320, count * 44) || below >= above
  const width = Math.min(rect.width, window.innerWidth - margin * 2)
  return {
    width, left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
    maxHeight: Math.min(320, Math.max(0, downward ? below : above)),
    ...(downward ? { top: rect.bottom + gap } : { bottom: window.innerHeight - rect.top + gap }),
  }
}

/** A select-only combobox with an app-styled popup, independent of the OS menu. */
export function BuilderSelect({ label, accessibleLabel = label, title, value, options, onChange }: {
  label: string; accessibleLabel?: string; title?: string; value: string
  options: readonly Option[]; onChange: (value: string) => void
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<{ style: CSSProperties; active: number; container: Element } | null>(null)
  const search = useRef({ text: '', time: 0 })
  const selected = Math.max(0, options.findIndex(option => option.value === value))

  function show(active = selected) {
    setPopup({ active, container: trigger.current!.closest('.jumping-builder')!,
      style: popupPosition(trigger.current!.getBoundingClientRect(), options.length) })
  }
  function choose(index: number) {
    setPopup(null); search.current = { text: '', time: 0 }
    if (options[index] && options[index].value !== value) onChange(options[index].value)
  }
  const open = popup !== null
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setPopup(null)
    }
    let anchor = trigger.current!.getBoundingClientRect()
    const scroll = (event: Event) => {
      if (list.current?.contains(event.target as Node)) return
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) { setPopup(null); return }
      if (rect.top === anchor.top && rect.left === anchor.left) return
      const panel = trigger.current?.closest('.builder-inspector')?.getBoundingClientRect()
      if (rect.bottom <= (panel?.top ?? 0) || rect.top >= (panel?.bottom ?? window.innerHeight)) { setPopup(null); return }
      // Browser focus/scroll anchoring can settle after the menu opens. Follow
      // a visible trigger instead of losing the option the user is choosing.
      anchor = rect
      setPopup(current => current && { ...current, style: popupPosition(rect, options.length) })
    }
    const close = () => setPopup(null)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close); window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close); window.removeEventListener('blur', close)
    }
  }, [open, options.length])
  useEffect(() => {
    if (!popup) return
    const option = list.current?.children[popup.active] as HTMLElement | undefined
    if (!option || !list.current) return
    // Scroll only the list, never the inspector or canvas behind the popup.
    const top = option.offsetTop, bottom = top + option.offsetHeight
    if (top < list.current.scrollTop) list.current.scrollTop = top
    else if (bottom > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = bottom - list.current.clientHeight
  }, [popup])

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'F1') { setPopup(null); return }
    // Editor shortcuts belong to the surrounding studio, even while this list has focus.
    if (event.ctrlKey || event.metaKey || event.altKey) return
    event.stopPropagation()
    if (event.key === 'Tab') { if (popup) choose(popup.active); return }
    if (event.key === 'Escape') { event.preventDefault(); setPopup(null); search.current.text = ''; return }
    const active = popup?.active ?? selected
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); search.current.text = ''
      if (event.key === 'Enter' || event.key === ' ') { if (popup) choose(active); else show(); return }
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : popup ? Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))) : selected
      if (popup) setPopup({ ...popup, active: next }); else show(next)
    } else if (event.key.length === 1) {
      event.preventDefault()
      const now = Date.now(), previous = now - search.current.time < 700 ? search.current.text : ''
      const text = previous + event.key.toLocaleLowerCase()
      const repeated = [...text].every(character => character === text[0]), prefix = repeated ? text[0] : text
      search.current = { text, time: now }
      const start = previous && !repeated ? active : active + 1
      const match = options.findIndex((_, offset) => options[(start + offset) % options.length].label.toLocaleLowerCase().startsWith(prefix))
      const next = match < 0 ? active : (start + match) % options.length
      if (popup) setPopup({ ...popup, active: next }); else show(next)
    }
  }

  return <div className="builder-select-field">
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="builder-select" role="combobox" aria-label={accessibleLabel}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={popup ? `${id}-option-${popup.active}` : undefined} data-value={value}
      title={title ?? options[selected]?.label} onKeyDown={keyDown} onBlur={() => setPopup(null)}
      onClick={() => { search.current.text = ''; if (popup) setPopup(null); else show() }}>
      <span>{options[selected]?.label}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {popup && createPortal(<div ref={list} id={`${id}-list`} className="builder-select-options" role="listbox" aria-label={accessibleLabel}
      style={popup.style} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
        data-value={option.value} data-active={index === popup.active} onPointerMove={() => setPopup(current => current && current.active !== index ? { ...current, active: index } : current)}
        onClick={() => choose(index)}>
        <span>{option.label}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"><path d="m5 12 4 5L19 6" /></svg>
      </div>)}
    </div>, popup.container)}
  </div>
}
