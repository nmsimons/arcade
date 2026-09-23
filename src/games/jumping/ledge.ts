type Point = [number, number]
type LedgeFrame = { time: number; root: Point; hip: Point; waist: Point; shoulder: Point; head: Point; frontFoot: Point; backFoot: Point }
export const LEDGE_CATCH_TIME = .14
export const ROPE_LEDGE_CATCH_TIME = .24
export const LEDGE_CLIMB_TIME = .82
export const FRONT_GRIP: Point = [2, -1.3]
export const BACK_GRIP: Point = [-.5, -1.3]
export const FRONT_WRIST: Point = [-.3, 0]
export const BACK_WRIST: Point = [-2, 0]
export const KNEE_CONTACT: Point = [2, -1.7]
const kneeAnkle: Point = [-11, -1.7 + Math.sqrt(14.5 ** 2 - 13 ** 2)]
const restHip = -1 - 2.8 - Math.sqrt(29 ** 2 - 2 ** 2)
const frames: LedgeFrame[] = [
  { time: 0, root: [-14, 74], hip: [-8.3, 33], waist: [-8.3, 26.5], shoulder: [-8.3, 16], head: [-9, 8.7], frontFoot: [-8.3, 63.45], backFoot: [-9.3, 63.3] },
  { time: .23, root: [-17, 48], hip: [-19, 14], waist: [-17, 7.5], shoulder: [-13, -2], head: [-12.5, -9.5], frontFoot: [-14, 40], backFoot: [-28, 38] },
  { time: .44, root: [-11, 29], hip: [-14, -4], waist: [-9, -8.5], shoulder: [-1, -13], head: [2, -20.5], frontFoot: [-24, 12], backFoot: [-22, 21] },
  { time: .5, root: [-8, 23], hip: [-9, -15], waist: [-3.5, -16], shoulder: [4, -15], head: [7, -22.5], frontFoot: [-22, 6], backFoot: [-22, 10] },
  { time: .54, root: [-5, 21], hip: [-7.5, -17.5], waist: [-2, -17.5], shoulder: [6, -17.4], head: [9, -24.9], frontFoot: [-16, 3], backFoot: [-23, 6] },
  { time: .56, root: [-4, 21], hip: [-7, -14.7], waist: [-1, -17], shoulder: [7, -17.7], head: [10, -25.2], frontFoot: kneeAnkle, backFoot: [-23, 4] },
  { time: .6, root: [-2, 20], hip: [-1, -2.7 - Math.sqrt(216)], waist: [5, -19], shoulder: [13, -21], head: [16, -28.5], frontFoot: kneeAnkle, backFoot: [-23, -5] },
  { time: .62, root: [-1, 19.5], hip: [2, -17.7], waist: [8, -20], shoulder: [16, -22], head: [19, -29.5], frontFoot: kneeAnkle, backFoot: [-20, -4.5] },
  { time: .64, root: [0, 19], hip: [2, -17.7], waist: [8, -20], shoulder: [16, -23], head: [19, -30.5], frontFoot: kneeAnkle, backFoot: [-12, -3.5] },
  { time: .73, root: [5, 17], hip: [2, -17.7], waist: [7, -22.5], shoulder: [14, -29], head: [15, -36.3], frontFoot: kneeAnkle, backFoot: [18, -2.8] },
  { time: .81, root: [12, 9], hip: [5, -25], waist: [7.5, -30.3], shoulder: [12, -39], head: [13, -46.3], frontFoot: [-9, -9], backFoot: [18, -2.8] },
  { time: .9, root: [18, 3], hip: [15, -31], waist: [15.8, -37.4], shoulder: [17, -47], head: [17.5, -54.5], frontFoot: [22, -9], backFoot: [18, -2.8] },
  { time: .96, root: [20, 0], hip: [20, restHip], waist: [20, restHip - 6.5], shoulder: [20, restHip - 16.6], head: [20.45, restHip - 23.9], frontFoot: [22, -2.8], backFoot: [18, -2.8] },
  { time: 1, root: [20, 0], hip: [20, restHip], waist: [20, restHip - 6.5], shoulder: [20, restHip - 16.6], head: [20.45, restHip - 23.9], frontFoot: [22, -2.8], backFoot: [18, -2.8] },
]
const bracedFrames: LedgeFrame[] = [{ ...frames[0], hip: [-18, 32], waist: [-14, 26], frontFoot: [-2.8, 58], backFoot: [-2.8, 55] }, ...frames.slice(1)]
export const ledgeEase = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

/** Clear an overhang sideways before lifting from a rope into the ledge hang. */
export function ropeCatchRoot(from: Point, progress: number): Point {
  const underLip = from[0] > -14 && from[1] > 74
  const x = ledgeEase(underLip ? progress / .5 : progress)
  const y = ledgeEase(underLip ? (progress - .5) / .5 : progress)
  return [from[0] + (-14 - from[0]) * x, from[1] + (74 - from[1]) * y]
}

/** Edge-relative choreography: pull, knee support, trailing foot, then stand. */
export function climbFrame(progress: number, braced = false) {
  const t = Math.max(0, Math.min(1, progress))
  const poses = braced ? bracedFrames : frames
  const index = Math.max(1, poses.findIndex((frame, i) => i > 0 && frame.time >= t))
  const a = poses[index - 1], b = poses[index], span = b.time - a.time, u = (t - a.time) / span
  const sample = (key: Exclude<keyof LedgeFrame, 'time'>): Point => [0, 1].map(axis => {
    const tangent = (i: number) => {
      if (i === 0 || i === poses.length - 1) return 0
      const before = poses[i - 1], value = poses[i], after = poses[i + 1]
      const incoming = (value[key][axis] - before[key][axis]) / (value.time - before.time)
      const outgoing = (after[key][axis] - value[key][axis]) / (after.time - value.time)
      return incoming * outgoing <= 0 ? 0 : 2 * incoming * outgoing / (incoming + outgoing)
    }
    return (2 * u ** 3 - 3 * u ** 2 + 1) * a[key][axis] + (u ** 3 - 2 * u ** 2 + u) * span * tangent(index - 1)
      + (-2 * u ** 3 + 3 * u ** 2) * b[key][axis] + (u ** 3 - u ** 2) * span * tangent(index)
  }) as Point
  const hip = sample('hip')
  if (t >= .56 && t <= .73) {
    const dx = hip[0] - KNEE_CONTACT[0], dy = hip[1] + 1 - KNEE_CONTACT[1], length = Math.hypot(dx, dy)
    hip[0] = KNEE_CONTACT[0] + dx / length * 15; hip[1] = KNEE_CONTACT[1] + dy / length * 15 - 1
  }
  return { root: sample('root'), hip, waist: sample('waist'), shoulder: sample('shoulder'), head: sample('head'),
    frontFoot: sample('frontFoot'), backFoot: sample('backFoot'),
    frontRelease: ledgeEase((t - .56) / .15), backRelease: ledgeEase((t - .54) / .14),
    frontPlanted: t >= .96, backPlanted: t >= .73, kneePlanted: t >= .56 && t <= .73 }
}
