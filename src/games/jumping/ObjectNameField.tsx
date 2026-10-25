import { useRef, useState } from 'react'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames'

export function ObjectNameField({ value, placeholder, onCommit, label = 'Object name', title = 'Name this object. Leave blank to use its default name. Enter applies; Esc cancels.' }: {
  value: string; placeholder: string; onCommit: (value: string) => void; label?: string; title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null), cancelled = useRef(false)
  function apply() {
    if (!cancelled.current && draft !== null) onCommit(draft)
    cancelled.current = false; setDraft(null)
  }
  return <input aria-label={label} value={draft ?? value} placeholder={placeholder} maxLength={OBJECT_NAME_MAX_LENGTH}
    title={title}
    onChange={event => setDraft(event.target.value)} onBlur={apply} onKeyDown={event => {
      if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation()
        if (event.currentTarget.dataset.builderFinishing) apply(); else event.currentTarget.blur()
      }
      else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); cancelled.current = true
        if (event.currentTarget.dataset.builderFinishing) apply(); else event.currentTarget.blur()
      }
    }} />
}
