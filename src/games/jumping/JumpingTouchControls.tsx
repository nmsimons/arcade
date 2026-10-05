import { useEffect, useEffectEvent, useState } from 'react'
import type { RefObject } from 'react'
import type { JumpTouch, TouchFeedback } from './touchInput'

export function JumpingTouchControls({ canvasRef, reader, active, onTouch, onPause }: {
  canvasRef: RefObject<HTMLCanvasElement | null>; reader: JumpTouch; active: boolean
  onTouch: () => void; onPause: () => void
}) {
  const [feedback, setFeedback] = useState<TouchFeedback[]>([])
  const reportTouch = useEffectEvent(onTouch)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!active || !canvas) return
    const captured = new Set<number>()
    let frame = 0
    const paint = () => {
      const next = reader.feedback(performance.now())
      setFeedback(before => before.length === next.length && before.every((p, i) =>
        p.id === next[i].id && p.x === next[i].x && p.y === next[i].y && p.label === next[i].label) ? before : next)
      frame = reader.active ? requestAnimationFrame(paint) : 0
    }
    const refresh = () => { if (!frame) paint() }
    const point = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: bounds.width }
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      event.preventDefault()
      const p = point(event)
      if (!reader.down(event.pointerId, p.x, p.y, performance.now(), p.width)) return
      reportTouch(); canvas.focus({ preventScroll: true })
      // Synthetic regression events do not have an active browser pointer to capture.
      if (event.isTrusted) { canvas.setPointerCapture(event.pointerId); captured.add(event.pointerId) }
      refresh()
    }
    const move = (event: PointerEvent) => {
      if (!reader.has(event.pointerId)) return
      event.preventDefault(); const p = point(event)
      reader.move(event.pointerId, p.x, p.y, performance.now()); refresh()
    }
    const up = (event: PointerEvent) => {
      if (!reader.has(event.pointerId)) return
      event.preventDefault(); const p = point(event)
      reader.up(event.pointerId, p.x, p.y, performance.now()); captured.delete(event.pointerId); refresh()
    }
    const cancel = (event: PointerEvent) => {
      if (!reader.has(event.pointerId)) return
      reader.reset(); refresh()
    }
    const contextMenu = (event: Event) => event.preventDefault()
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel); canvas.addEventListener('contextmenu', contextMenu)
    return () => {
      cancelAnimationFrame(frame); reader.reset()
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel); canvas.removeEventListener('contextmenu', contextMenu)
      for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    }
  }, [active, canvasRef, reader])
  return active && <>
    <button className="jumping-touch-pause" aria-label="Pause game" onClick={onPause}>Pause</button>
    <div className="jumping-touch-feedback" aria-hidden="true">
      {feedback.map(p => <div className="jumping-touch-contact" key={p.id} style={{ left: p.x, top: p.y }}><span>{p.label}</span></div>)}
    </div>
  </>
}
