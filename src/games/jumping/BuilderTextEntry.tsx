import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pressedStyle } from './StudioFields'

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '.,-_/:!?']

/** Text entry also works when the controller is the only editing device. */
export function BuilderTextEntry({ input, onClose }: { input: HTMLInputElement | HTMLTextAreaElement; onClose: () => void }) {
  const [text, setText] = useState(input.value), [shift, setShift] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const name = input.getAttribute('aria-label') ?? input.labels?.[0]?.textContent?.trim() ?? 'Text'
  const limit = input.maxLength < 0 ? 1000 : input.maxLength
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal(); node.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus()
    return () => { node.close(); if (input.isConnected) input.focus({ preventScroll: true }) }
  }, [input])
  function apply() {
    onClose()
    // Use the native setter so React receives the same change as normal typing.
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    requestAnimationFrame(() => {
      if (!input.isConnected) return
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      input.blur(); input.focus({ preventScroll: true })
    })
  }
  const append = (value: string) => setText(previous => (previous + value).slice(0, limit))
  return <dialog ref={dialog} className="builder-text-entry studio-dialog" aria-label={`Edit ${name}`} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }}>
    <h2 className="m-0 mb-3 text-base font-semibold">{name}</h2>
    <output className="builder-text-preview" aria-label="Text entry preview">{text || ' '}</output>
    <div className="builder-text-keys" role="group" aria-label="Characters">
      {ROWS.map((row, index) => <div key={row}>{[...row].map((character, i) => {
        const value = shift ? character.toUpperCase() : character
        return <Button key={character} variant="secondary" size="sm" className="h-9 min-w-0 px-0 font-mono text-sm" data-initial-focus={index === 0 && i === 0 ? '' : undefined} aria-label={`Type ${value}`} onClick={() => append(value)}>{value}</Button>
      })}</div>)}
    </div>
    <div className="builder-text-actions">
      <Button variant="outline" size="sm" className={cn(pressedStyle)} aria-pressed={shift} onClick={() => setShift(previous => !previous)}>Shift</Button>
      <Button variant="outline" size="sm" onClick={() => append(' ')}>Space</Button>
      {input instanceof HTMLTextAreaElement && <Button variant="outline" size="sm" onClick={() => append('\n')}>New line</Button>}
      <Button variant="outline" size="sm" onClick={() => setText(previous => previous.slice(0, -1))}>Backspace</Button>
      <Button variant="outline" size="sm" onClick={() => setText('')}>Clear</Button>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>Cancel</Button>
      <Button size="sm" onClick={apply}>Done</Button>
    </div>
  </dialog>
}
