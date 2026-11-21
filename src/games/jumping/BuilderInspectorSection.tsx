import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'

/** Native disclosures keep the inspector usable with a mouse, keyboard or controller. */
export function BuilderInspectorSection({ title, children, open = true, reveal = false }: { title: string; children: ReactNode; open?: boolean; reveal?: boolean }) {
  const section = useRef<HTMLDetailsElement>(null)
  useLayoutEffect(() => { if (reveal && section.current) section.current.open = true }, [reveal])
  return <details ref={section} className="builder-inspector-section group/section min-w-0 border-t border-border" open={open}>
    <summary aria-label={title} className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-sm font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
      {title}<ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 -rotate-90 opacity-70 group-open/section:rotate-0" />
    </summary>
    <div className="builder-inspector-section-content grid gap-3 pb-3">{children}</div>
  </details>
}
