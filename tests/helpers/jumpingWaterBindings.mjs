import { blankTrial } from '../../src/games/jumping/level.ts'
import { createJumpController } from '../../src/games/jumping/input.ts'
import { createJumpTouch } from '../../src/games/jumping/touchInput.ts'
import { STEP } from '../../src/games/jumping/model.ts'

/** Parsed regression maps only; these never alter a built-in/local collection. */
export function waterBindingLevel(kind = 'clear', direction = 1) {
  const level = { ...blankTrial(), id: `water-bindings-${kind}-${direction}`, name: `Water ${kind} ${direction}`,
    spawn: { x: 500, y: 920 }, platforms: [], props: [],
    goal: { id: 'exit', x: 1500, y: 920, power: 'switched' },
    gravityPlates: [{ id: 'water', x: 200, y: 400, w: 1000, h: 520, gravity: -1, effect: 'water', power: 'always' }] }
  if (kind === 'float') level.props = [{ kind: 'box', x: 560, y: 920, size: 80 }]
  if (kind === 'grip') {
    level.spawn.x = 516
    level.props = [{ kind: 'box', x: 570, y: 430, size: 80 }]
    // Both base contacts support the stable crate. The inset plinth cannot be
    // mistaken for the crate's higher lip when the swimmer reaches from below.
    level.platforms = [{ x: 536, y: 430, w: 68, h: 490 }]
  }
  if (kind === 'bank') {
    level.spawn.x = 610; level.goal.x = 400
    level.platforms = [{ x: 640, y: 380, w: 1160, h: 540 }]
    level.gravityPlates[0].w = 440
  }
  if (direction < 0) {
    level.spawn.x = level.width - level.spawn.x; level.goal.x = level.width - level.goal.x
    level.props = level.props.map(p => ({ ...p, x: level.width - p.x }))
    level.platforms = level.platforms.map(p => ({ ...p, x: level.width - p.x - p.w }))
    level.gravityPlates = level.gravityPlates.map(p => ({ ...p, x: level.width - p.x - p.w }))
  }
  return level
}

/** Exercise the production translators, not independently invented motor flags. */
export function waterBindings(device) {
  let now = 0, intent = {}, key = ''
  const pad = { index: 0, id: 'Water acceptance', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
  const controller = createJumpController(), touch = createJumpTouch()
  controller.sample([pad], 'playing', now)
  return {
    set(next = {}) {
      const nextKey = JSON.stringify(next)
      if (nextKey === key) return
      intent = next; key = nextKey
      if (device !== 'touch') return
      touch.reset()
      if (next.move) { touch.down(1, 500, 250, now, 1000); touch.move(1, 500 + next.move * 40, 250, now) }
      if (next.vertical) {
        touch.down(2, 500, 250, now, 1000); touch.move(2, 500, 250 - next.vertical * 40, now)
      }
      if (next.jump) {
        if (next.move && next.vertical) throw new Error('A touch jump must use one of its two actual fingers')
        touch.down(3, 500, 250, now, 1000); touch.up(3, 500, 250, now)
      }
    },
    sample() {
      now += STEP * 1000
      if (device === 'touch') return touch.sample(now)
      const buttons = [intent.move > 0 ? 15 : intent.move < 0 ? 14 : -1,
        intent.vertical > 0 ? 12 : intent.vertical < 0 ? 13 : -1, intent.jump ? 0 : -1]
      pad.buttons.forEach((button, i) => { button.pressed = buttons.includes(i); button.value = Number(button.pressed) })
      return controller.sample([pad], 'playing', now)
    },
  }
}
