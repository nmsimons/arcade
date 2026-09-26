import { useRef, useState } from 'react'

const display = (value: number) => String(Math.round(value * 100) / 100)

/** Keep incomplete typing out of the level and commit one edit on Enter or blur. */
export function NumberField({ value, onCommit, label, step = 1, min, max, disabled = false }: {
  value: number; onCommit: (value: number) => void; label: string
  step?: number; min?: number; max?: number; disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null), cancelled = useRef(false)
  const limit = (n: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n))
  function apply() {
    if (!cancelled.current && draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onCommit(limit(Number(draft)))
    cancelled.current = false; setDraft(null)
  }
  return <input className="builder-number" type="number" aria-label={label} title="Enter to apply · Esc to cancel · ↑ ↓ to step · Shift for larger steps"
    min={min} max={max} step={step} disabled={disabled} value={draft ?? display(value)}
    onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onBlur={apply}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur() }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); event.stopPropagation()
        const from = draft !== null && draft.trim() && Number.isFinite(Number(draft)) ? Number(draft) : value
        const next = limit(from + (event.key === 'ArrowUp' ? 1 : -1) * (event.altKey ? 1 : step * (event.shiftKey ? 10 : 1)))
        setDraft(null); onCommit(Number(display(next)))
      }
    }} />
}
