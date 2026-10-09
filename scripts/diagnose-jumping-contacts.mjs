import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { movingStepPropFixture } from '../tests/helpers/jumpingStepProps.mjs'

// Measurements are diagnostics, not visual acceptance or a passing test suite.
// These real contact sequences catch regressions hidden by head-only smoothing.
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
const world = (p, point) => [p.x + point[0] * p.facing, p.y + point[1] * (p.inverted ? -1 : 1)]

function measure(run, inputs) {
  const result = { frames: 0, firstHeadStep: 0, maximumHead: { value: 0, tick: 0 },
    maximumShoulder: { value: 0, tick: 0 }, maximumWrist: { value: 0, tick: 0 },
    maximumFirstForceWrist: { value: 0, tick: 0 }, minimumPelvis: Infinity, minimumChest: Infinity,
    minimumSpineSpan: Infinity, maximumNeck: 0, unownedPlantedFeet: 0,
    maximumBoneError: 0, maximumPlantedAnkleError: 0, maximumForcedPalmError: 0,
    missingPalms: 0, forceFrames: 0, interruptionTick: null }
  let previous, previousForce = false
  function record(tick) {
    const p = run.player, pose = athletePose(p)
    const force = !!p.contacts?.push?.hands
    const points = { head: world(p, pose.head), shoulder: world(p, pose.shoulder),
      wrists: [pose.frontArm, pose.backArm].map(arm => world(p, arm.end)) }
    if (previous) {
      for (const name of ['head', 'shoulder']) {
        const value = distance(previous[name], points[name])
        const key = name === 'head' ? 'maximumHead' : 'maximumShoulder'
        if (value > result[key].value) result[key] = { value, tick }
        if (tick === 0 && name === 'head') result.firstHeadStep = value
      }
      const wrist = Math.max(...points.wrists.map((point, i) => distance(previous.wrists[i], point)))
      if (wrist > result.maximumWrist.value) result.maximumWrist = { value: wrist, tick }
      if (force && !previousForce && wrist > result.maximumFirstForceWrist.value) result.maximumFirstForceWrist = { value: wrist, tick }
    }
    result.minimumPelvis = Math.min(result.minimumPelvis, distance(pose.hip, pose.waist))
    result.minimumChest = Math.min(result.minimumChest, distance(pose.waist, pose.shoulder))
    result.minimumSpineSpan = Math.min(result.minimumSpineSpan, distance(pose.hip, pose.shoulder))
    result.maximumNeck = Math.max(result.maximumNeck, distance(pose.shoulder, pose.head))
    for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
      const leg = 'footAngle' in limb
      result.maximumBoneError = Math.max(result.maximumBoneError,
        Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)),
        Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)))
    }
    for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) if (leg.planted && p.footwork && !p.mantle && !p.hang && !p.climbing) {
      const foot = p.footwork.feet[i]
      if (!foot.planted) result.unownedPlantedFeet++
      result.maximumPlantedAnkleError = Math.max(result.maximumPlantedAnkleError, distance(world(p, leg.end), [foot.x, foot.y]))
    }
    if (p.contacts?.push?.hands && p.pushing?.palms) {
      result.forceFrames++
      for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
        if (!arm.hand) { result.missingPalms++; continue }
        const palm = p.pushing.palms[i]
        result.maximumForcedPalmError = Math.max(result.maximumForcedPalmError,
          distance(world(p, arm.hand), [palm.x + palm.nx * 1.6, palm.y + palm.ny * 1.6]))
      }
    }
    previous = points
    previousForce = force
    result.frames++
  }
  record(-1)
  for (const [tick, input] of inputs.entries()) {
    const returning = run.player.mantle?.returning, time = run.player.mantle?.time
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    if (returning && time > 1 / 120 && !run.player.mantle) result.interruptionTick = tick
    record(tick)
  }
  stepRun(run, { ...NEUTRAL_INPUT, jump: true })
  result.freshJumpDeparts = run.player.vy < 0
  return result
}

const reports = []
for (const side of [-1, 1]) for (const kind of ['box', 'ball']) for (const size of [30, 80]) {
  for (const crouch of [false, true]) {
    const root = 474.5, offset = size / 2 + 25.5
    const level = { ...blankTrial(), spawn: { x: root, y: 920 },
      props: [{ kind, x: root + offset, y: 920, size }, { kind, x: root - offset, y: 920, size }],
      platforms: [{ x: root + 25.5 + size, y: 650, w: 120, h: 270 },
        { x: root - 25.5 - size - 120, y: 650, w: 120, h: 270 }] }
    const run = createRun(level)
    for (let i = 0; i < 360; i++) stepRun(run, { ...NEUTRAL_INPUT, move: side, crouch })
    const inputs = [[120, -side], [2, side], [2, -side], [120, side], [120, 0]]
      .flatMap(([ticks, move]) => Array.from({ length: ticks }, () => ({ move, crouch })))
    reports.push({ scenario: 'opposed braces', side, kind, size, crouch, ...measure(run, inputs) })
  }
  const { level } = movingStepPropFixture(side, kind, size), run = createRun(level)
  run.props[0].vx = side * 480
  const inputs = Array.from({ length: 180 }, (_, tick) => ({ move: tick < 38 ? side : tick < 150 ? -side : 0 }))
  reports.push({ scenario: 'moving step interruption', side, kind, size, ...measure(run, inputs) })
}
console.log(JSON.stringify(reports, null, 2))
