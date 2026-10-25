import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'

/** Native disclosures keep the inspector usable with a mouse, keyboard or controller. */
export function BuilderInspectorSection({ title, children, open = true, reveal = false }: { title: string; children: ReactNode; open?: boolean; reveal?: boolean }) {
  const section = useRef<HTMLDetailsElement>(null)
  useLayoutEffect(() => { if (reveal && section.current) section.current.open = true }, [reveal])
  return <details ref={section} className="builder-inspector-section" open={open}>
    <summary aria-label={title}>{title}<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 8 4 4 4-4" /></svg></summary>
    <div className="builder-inspector-section-content">{children}</div>
  </details>
}
