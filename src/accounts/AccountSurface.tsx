import { useLayoutEffect, useRef } from 'react'
import { registerAccountSurface } from './runtime'

/** The persistent account controls appear only in an active menu or editor. */
export function AccountSurface({ active = true, compact = true }: { active?: boolean; compact?: boolean }) {
  const node = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (active && node.current) return registerAccountSurface({ node: node.current, compact })
  }, [active, compact])
  return <div ref={node} className="account-surface" />
}
