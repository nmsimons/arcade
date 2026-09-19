/** Separate gameplay randomness from particles, meshes, sound, and render frequency. */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return Object.assign(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }, { reset: () => { state = seed >>> 0 }, state: () => state })
}
