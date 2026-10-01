/** Repeatable electrical stutters, with quiet stretches between short faults.
 * The stable lamp ID separates lamps; visual time keeps pause and restart exact. */
export function lightFlicker(id: string, time: number): number {
  let seed = 2166136261
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619)
  const noise = (cycle: number, salt: number) => {
    let n = seed ^ Math.imul(cycle + 1, 374761393) ^ Math.imul(salt + 1, 668265263)
    n = Math.imul(n ^ n >>> 13, 1274126177)
    return ((n ^ n >>> 16) >>> 0) / 4294967296
  }
  const period = 3.2 + (seed >>> 0) % 1400 / 1000
  const cycle = Math.floor(time / period), phase = time - cycle * period
  const start = .8 + noise(cycle, 0) * 1.4, duration = .35 + noise(cycle, 1) * .45
  if (phase < start || phase >= start + duration) return 1
  const pulse = Math.floor((phase - start) / (.08 + noise(cycle, 2) * .04))
  const value = noise(cycle, pulse + 3)
  return value < .25 ? 0 : value < .75 ? .15 + value * .4 : 1
}
