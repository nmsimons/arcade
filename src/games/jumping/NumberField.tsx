import { useRef, useState } from 'react'

const display = (value: number) => String(Math.round(value))
const complete = (text: string) => /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text))

/** Preview complete numbers while typing; Enter or blur commits one undoable edit. */
export function NumberField({ value, onCommit, onPreview, label, step = 1, min, max, disabled = false }: {
  value: number; onCommit: (value: number) => void; onPreview: (value: number | null) => void; label: string
  step?: number; min?: number; max?: number; disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null), cancelled = useRef(false)
  const limit = (n: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Math.round(n)))
  function apply() {
    if (!cancelled.current && draft !== null && complete(draft)) onCommit(limit(Number(draft)))
    else onPreview(null)
    cancelled.current = false; setDraft(null)
  }
  return <input className="builder-number" type="number" aria-label={label} title="Live preview · Enter to apply · Esc to cancel · ↑ ↓ to step · Shift for larger steps"
    min={min} max={max} step={step} disabled={disabled} value={draft ?? display(value)}
    onFocus={event => event.currentTarget.select()} onChange={event => {
      const text = event.target.value
      if (text !== '' && !complete(text)) return
      setDraft(text); onPreview(complete(text) ? limit(Number(text)) : null)
    }} onBlur={apply}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur() }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); event.stopPropagation()
        const from = draft !== null && complete(draft) ? Number(draft) : Math.round(value)
        const next = limit(from + (event.key === 'ArrowUp' ? 1 : -1) * (event.altKey ? 1 : step * (event.shiftKey ? 10 : 1)))
        setDraft(null); onCommit(Number(display(next)))
      }
      else if (!event.ctrlKey && !event.metaKey && ['.', ',', 'e', 'E', '+'].includes(event.key)) event.preventDefault()
    }} />
}
