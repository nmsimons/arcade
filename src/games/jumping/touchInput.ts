import { NEUTRAL_INPUT, TUNING } from './model.ts'
import type { JumpInput } from './model.ts'

export const TOUCH_TIMING = { hold: 150, verticalHold: 120, tapSlop: 10, swipe: 24 } as const
type Contact = {
  id: number; x: number; y: number; anchorX: number; anchorY: number; started: number
  movement: boolean; side: number; direction: number; running: boolean; vertical: number
  tap: boolean; settled: boolean; stroke?: { direction: number; started: number; x: number; y: number }
}
type Action = { kind: 'jump'; strength: number } | { kind: 'detach' }
export interface TouchFeedback { id: number; x: number; y: number; label: string }

/** Screen-space gestures produce ordinary inputs, independent of the camera or physics. */
export function createJumpTouch() {
  const contacts = new Map<number, Contact>(), actions: Action[] = []
  let releaseJump = false
  function update(now: number) {
    for (const c of contacts.values()) {
      if (c.stroke) {
        if (now - c.stroke.started >= TOUCH_TIMING.verticalHold) {
          c.vertical = c.stroke.direction; c.stroke = undefined; c.settled = true
          c.anchorX = c.x; c.anchorY = c.y
        }
      } else if (!c.settled && now - c.started >= TOUCH_TIMING.hold) {
        c.tap = false; c.settled = true
        if (c.movement) c.direction = c.side
      }
    }
  }
  return {
    get active() { return contacts.size > 0 },
    has: (id: number) => contacts.has(id),
    reset() { contacts.clear(); actions.length = 0; releaseJump = false },
    down(id: number, x: number, y: number, now: number, width: number) {
      if (contacts.has(id) || contacts.size >= 2) return false
      const movement = ![...contacts.values()].some(c => c.movement)
      contacts.set(id, { id, x, y, anchorX: x, anchorY: y, started: now, movement,
        side: x < width * .42 ? -1 : x > width * .58 ? 1 : 0,
        direction: 0, running: false, vertical: 0, tap: true, settled: false })
      return true
    },
    move(id: number, x: number, y: number, now: number) {
      const c = contacts.get(id)
      if (!c) return
      update(now)
      c.x = x; c.y = y
      const dx = x - c.anchorX, dy = y - c.anchorY
      if (Math.hypot(dx, dy) > TOUCH_TIMING.tapSlop) c.tap = false
      if (c.stroke && -dy * c.stroke.direction < TOUCH_TIMING.swipe / 2) {
        c.stroke = undefined; c.settled = true
      }
      if (c.stroke && Math.hypot(x - c.stroke.x, y - c.stroke.y) > TOUCH_TIMING.tapSlop / 2) {
        c.stroke.started = now; c.stroke.x = x; c.stroke.y = y
      }
      if (Math.abs(dx) >= TOUCH_TIMING.swipe && Math.abs(dx) > Math.abs(dy) * 1.25) {
        c.tap = false; c.settled = true; c.stroke = undefined; c.vertical = 0
        if (c.movement) { c.direction = Math.sign(dx); c.running = true }
        c.anchorX = x; c.anchorY = y
      } else if (!c.stroke && Math.abs(dy) >= TOUCH_TIMING.swipe && Math.abs(dy) > Math.abs(dx) * 1.25) {
        c.tap = false
        const direction = dy < 0 ? 1 : -1
        if (c.vertical === direction) { c.anchorX = x; c.anchorY = y }
        else { c.vertical = 0; c.stroke = { direction, started: now, x, y } }
      }
    },
    up(id: number, x: number, y: number, now: number) {
      if (!contacts.has(id)) return
      // The final position may arrive without a preceding pointermove.
      this.move(id, x, y, now)
      const c = contacts.get(id)!
      update(now)
      if (c.stroke) actions.push(c.stroke.direction > 0 ? { kind: 'jump', strength: 1 } : { kind: 'detach' })
      else if (c.tap && !c.settled && now - c.started < TOUCH_TIMING.hold) actions.push({ kind: 'jump', strength: 0 })
      contacts.delete(id)
    },
    /** Consume one pulse per simulation step, with a released step between jumps. */
    sample(now: number): JumpInput {
      update(now)
      const values = [...contacts.values()], mover = values.find(c => c.movement)
      const climb = values.some(c => c.vertical > 0), descend = !climb && values.some(c => c.vertical < 0)
      const move = (mover?.direction ?? 0) * (mover?.running || descend ? 1 : TUNING.walkSpeed / TUNING.runSpeed)
      const input = { ...NEUTRAL_INPUT, move, climb, descend, drop: descend, crouch: descend }
      if (releaseJump) { releaseJump = false; return input }
      const action = actions.shift()
      if (action?.kind === 'jump') { releaseJump = true; return { ...input, jump: true, jumpStrength: action.strength } }
      return action ? { ...input, drop: true, detach: true } : input
    },
    feedback(now: number): TouchFeedback[] {
      update(now)
      return [...contacts.values()].map(c => ({ id: c.id, x: c.x, y: c.y,
        label: c.stroke ? c.stroke.direction > 0 ? '↑' : '↓'
          : c.vertical ? c.vertical > 0 ? 'Up ↑' : 'Down ↓'
            : c.direction ? `${c.running ? 'Run' : 'Walk'} ${c.direction > 0 ? '→' : '←'}` : c.settled ? 'Swipe' : 'Tap / hold' }))
    },
  }
}
export type JumpTouch = ReturnType<typeof createJumpTouch>
