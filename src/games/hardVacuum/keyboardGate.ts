/** A held key must return to neutral before acting on a different screen. */
export function createKeyboardGate() {
  const held = new Set<string>(), blocked = new Set<string>()
  let context: string | undefined
  const enter = (screen: string) => {
    if (screen === context) return
    context = screen
    for (const key of held) blocked.add(key)
  }
  return {
    enter,
    press(key: string, screen: string, repeat = false) {
      enter(screen)
      if (repeat && !held.has(key)) blocked.add(key)
      held.add(key)
      return !blocked.has(key)
    },
    release(key: string) { held.delete(key); blocked.delete(key) },
    reset() { context = undefined; held.clear(); blocked.clear() },
  }
}
