export const FLIGHT_KEYS = ['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','o','k','l',';'] as const

/** Physics, hull banking, thruster visuals and audio share the same controls. */
export function flightInput(keys: ReadonlySet<string>) {
  return {
    left: keys.has('a') || keys.has('k') || keys.has('arrowleft'),
    right: keys.has('d') || keys.has(';') || keys.has('arrowright'),
    forward: keys.has('w') || keys.has('o') || keys.has('arrowup'),
    reverse: keys.has('s') || keys.has('l') || keys.has('arrowdown'),
  }
}
