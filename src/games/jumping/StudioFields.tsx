import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/* Level studio compositions of shadcn/ui parts. Native semantics stay intact:
   labels wrap their controls, so a field's text is also its accessible name. */

/** A stacked caption and control: `<Field>Width<NumberField … /></Field>`. */
export function Field({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label className={cn('flex-col items-stretch gap-1.5 text-xs leading-snug font-medium', className)} {...props} />
}

/** A checkbox and its caption; the whole row toggles it. */
export function CheckField({ checked, onCheckedChange, disabled, title, className, children }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean
  title?: string; className?: string; children: ReactNode
}) {
  return <Label title={title} className={cn('min-h-8 gap-2 py-1 text-sm leading-snug font-normal', className)}>
    <Checkbox className="bg-background" checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} />
    <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
  </Label>
}

/** Pressed toggles read as selected without changing size. */
export const pressedStyle = 'aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground'

/** Full-width property actions in the inspector. */
export function InspectorButton({ className, variant = 'outline', ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant={variant} size="sm" className={cn('w-full', pressedStyle, className)} {...props} />
}

