import { useState } from 'react'

interface Connection { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }

/** Large levels get a bounded, searchable list without hiding current connections. */
export function BuilderConnectionList({ label, items, empty }: { label: string; items: Connection[]; empty: string }) {
  const [query, setQuery] = useState('')
  const shown = items.filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="builder-connection-list">
    {(items.length > 8 || query) && <>
      <input type="search" aria-label={`Filter ${label}`} placeholder="Filter connections…" value={query} onChange={event => setQuery(event.target.value)} />
      <span className="builder-hint">{items.filter(item => item.checked).length} of {items.length} connected</span>
    </>}
    <div className="builder-connection-options">
      {shown.map(item => <label key={item.id}><input type="checkbox" checked={item.checked} onChange={event => item.onChange(event.target.checked)} />{item.label}</label>)}
      {!shown.length && <span className="builder-hint">{items.length ? 'No matching connections' : empty}</span>}
    </div>
  </div>
}
