import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { advanceCharacterAnimation, setAnimationCadence } from '../src/games/jumping/characterAnimation.ts'

// The game animates once per drawn frame. At 30, 60 and 144 Hz the rig keeps
// exact bones and gains no larger per-frame jump than animating every physics
// step, sampled at the same frames, would show. (Physics is the same in both;
// the golden traces check that.) The ordinary pose tests animate every step.
const medals = JSON.parse(readFileSync(new URL('./fixtures/jumping-builtin-medal-runs.json', import.meta.url), 'utf8'))
const ROUTES = ['LAB1.jump-level.json', '03.json', 'Coins.jump-level.json', 'Lock Out 2.jump-level.json', 'Drain.json']
const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.joint, limb.end])]
const local = (p, pose) => points(pose).map(([x, y]) => [x * p.facing, y])
const jump = (now, before) => before ? Math.max(...now.map((q, i) => Math.hypot(q[0] - before[i][0], q[1] - before[i][1]))) : 0

for (const file of ROUTES) for (const fps of [30, 60, 144]) test(`${file} keeps a continuous rig animated once per frame at ${fps} Hz`, () => {
  const recording = medals.runs.find(run => run.file === file)
  const level = parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${file}`, import.meta.url), 'utf8')))
  const everyStep = createRun(level), perFrame = createRun(level)
  setAnimationCadence(perFrame.player, 'frame')
  const inputs = recording.trace.flatMap(({ frames, input }) => Array(frames).fill({ ...NEUTRAL_INPUT, ...input }))
  let clock = 0, tick = 0, frames = 0, before, beforeEveryStep, worst = 0, worstEveryStep = 0
  while (tick < inputs.length) {
    clock += 1 / fps
    let stepped = false
    while (tick < inputs.length && clock >= (tick + 1) * STEP - 1e-9) { stepRun(everyStep, inputs[tick]); stepRun(perFrame, inputs[tick]); tick++; stepped = true }
    if (!stepped) continue
    advanceCharacterAnimation(perFrame.player); frames++
    const pose = presentedAthletePose(perFrame.player)
    for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
      const leg = 'footAngle' in limb
      assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5, `tick ${tick}: upper bone`)
      assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5, `tick ${tick}: lower bone`)
    }
    const now = local(perFrame.player, pose), nowEveryStep = local(everyStep.player, presentedAthletePose(everyStep.player))
    assert.ok(now.flat().every(Number.isFinite), `tick ${tick}: finite rig`)
    worst = Math.max(worst, jump(now, before)); worstEveryStep = Math.max(worstEveryStep, jump(nowEveryStep, beforeEveryStep))
    before = now; beforeEveryStep = nowEveryStep
  }
  assert.equal(perFrame.finished, true, 'the recorded route still completes')
  // A frame without a physics step has nothing to animate, so faster displays animate at most 120 Hz.
  assert.ok(frames > inputs.length * Math.min(fps, 120) / 120 * .9)
  assert.ok(worst <= worstEveryStep * 1.25 + 3, `largest per-frame joint jump ${worst.toFixed(1)} against ${worstEveryStep.toFixed(1)} when animating every step`)
})

test('frame cadence animates only when a drawn frame asks, and resumes from rest after being off', () => {
  const p = createPlayer({ x: 100, y: 920 })
  assert.equal(p.anim.cadence, undefined, 'animation runs every step by default')
  setAnimationCadence(p, 'frame')
  p.anim.stride = 3
  advanceCharacterAnimation(p)
  assert.equal(p.anim.stride, 3, 'no recorded steps, no animation')
  setAnimationCadence(p, 'off')
  p.anim.stride = 5
  setAnimationCadence(p, 'frame')
  assert.equal(p.anim.stride, 0, 'stale animation is reset when it resumes')
  assert.equal(p.anim.cadence, 'frame')
  const run = createRun(parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/LAB1.jump-level.json', import.meta.url), 'utf8'))))
  setAnimationCadence(run.player, 'off')
  for (let i = 0; i < 120; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(run.player.anim.pending ?? null, null, 'an unanimated player records nothing')
  setAnimationCadence(run.player, 'frame')
  for (let i = 0; i < 2; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(Math.abs(run.player.anim.pending.dt - 2 * STEP) < 1e-12, 'a drawn frame receives every step since the last one')
  advanceCharacterAnimation(run.player)
  assert.equal(run.player.anim.pending, null)
  assert.ok(run.player.anim.footwork, 'the frame animated the feet')
})

test('physics without animation solves no rig on a dry pushing level; animating every step does', async () => {
  const { athletePoseSolves } = await import('../src/games/jumping/athletePose.ts')
  const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Boxes.jump-level.json', import.meta.url), 'utf8')))
  const route = medals.runs.find(run => run.file === 'Boxes.jump-level.json').trace
  const solvesFor = cadence => {
    const run = createRun(level)
    setAnimationCadence(run.player, cadence)
    const before = athletePoseSolves()
    for (const { frames, input } of route) for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
    assert.equal(run.finished, true)
    return athletePoseSolves() - before
  }
  // Counting work is stable across machines, unlike timing it.
  assert.equal(solvesFor('off'), 0, 'headless physics and off-screen robots skip every pose solve')
  assert.ok(solvesFor('tick') > 100, 'animating every step captures its turns and pushes')
})
