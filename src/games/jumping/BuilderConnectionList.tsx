import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { CheckField } from './StudioFields'

interface Connection { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }

/** Large levels get a bounded, searchable list without hiding current connections. */
export function BuilderConnectionList({ label, items, empty }: { label: string; items: Connection[]; empty: string }) {
  const [query, setQuery] = useState('')
  const shown = items.filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="builder-connection-list grid min-w-0 gap-2">
    {(items.length > 8 || query) && <>
      <Input type="search" aria-label={`Filter ${label}`} placeholder="Filter connections…" value={query} onChange={event => setQuery(event.target.value)} />
      <span className="builder-hint">{items.filter(item => item.checked).length} of {items.length} connected</span>
    </>}
    <div className="builder-connection-options max-h-60 overflow-y-auto rounded-lg border border-border px-2 py-0.5 empty:hidden">
      {shown.map(item => <CheckField key={item.id} checked={item.checked} onCheckedChange={item.onChange}>{item.label}</CheckField>)}
      {!shown.length && <span className="builder-hint block py-1.5">{items.length ? 'No matching connections' : empty}</span>}
    </div>
  </div>
}
