import { useRef, useState } from 'react'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames'

export function ObjectNameField({ value, placeholder, onCommit }: {
  value: string; placeholder: string; onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null), cancelled = useRef(false)
  return <input aria-label="Object name" value={draft ?? value} placeholder={placeholder} maxLength={OBJECT_NAME_MAX_LENGTH}
    title="Name this object. Leave blank to use its default name. Enter applies; Esc cancels."
    onChange={event => setDraft(event.target.value)} onBlur={() => {
      if (!cancelled.current && draft !== null) onCommit(draft)
      cancelled.current = false; setDraft(null)
    }} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur() }
    }} />
}
