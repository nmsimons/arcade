import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handGeometry, pushPalmFrame } from '../src/games/jumping/androidHand.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { recordReviewClip, reviewLevelUrl } from '../src/games/jumping/modelReview.ts'
import { crouchedPushScenario } from './helpers/jumpingCrouchedPushScenarios.mjs'
import { stepRun } from './helpers/jumping-active-run.mjs'

test('a working palm retains its contact plane and joins its wrist below the finger pad', () => {
  for (const angle of [Math.PI, Math.PI - .3, Math.PI + .3, 0]) {
    const normal = [Math.cos(angle), Math.sin(angle)], point = [10, 20], frame = pushPalmFrame(point, normal)
    const fingers = [Math.cos(frame.angle), Math.sin(frame.angle)]
    assert.ok(Math.abs((frame.palm[0] - point[0]) * normal[0] + (frame.palm[1] - point[1]) * normal[1] - 1.6) < 1e-8)
    assert.ok(Math.abs(fingers[0] * normal[0] + fingers[1] * normal[1]) < 1e-8, 'fingers lie along the surface')
    assert.ok((frame.wrist[0] - frame.palm[0]) * fingers[0] + (frame.wrist[1] - frame.palm[1]) * fingers[1] < -.5,
      'the wrist joins the heel instead of the middle of the hand')
  }
  assert.ok(Math.sin(pushPalmFrame([0, 0], [-1, 0]).angle) < -.99, 'an ordinary push points the fingers up')
})

test('ordinary crouching keeps both forearms raised with relaxed hands and fixed bone lengths', async () => {
  const clip = JSON.parse(readFileSync(new URL('../dev/model-review/clips.json', import.meta.url), 'utf8')).clips.find(c => c.id === 'crouch')
  const recording = await recordReviewClip(clip, JSON.parse(readFileSync(new URL(`..${reviewLevelUrl(clip)}`, import.meta.url), 'utf8')))
  const frozen = JSON.parse(readFileSync(new URL('../dev/model-review/baseline/index.json', import.meta.url), 'utf8')).clips.crouch.samples[73].pose
  for (const name of ['frontArm', 'backArm']) {
    const arm = recording.frames[73].pose[name], previous = frozen[name]
    assert.deepEqual(arm.root, previous.root); assert.deepEqual(arm.joint, previous.joint)
    if (name === 'frontArm') assert.deepEqual(arm.end, previous.end)
    assert.ok(arm.handOpen > .2 && arm.handOpen < .8, 'the hand is relaxed rather than a rigid fist or loaded palm')
    const wrist = handGeometry(arm).angle - Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
    assert.ok(wrist > .1 && wrist < .45, 'the wrist has a small relaxed bend')
  }
  for (const index of [30, 73, 125]) {
    const { pose } = recording.frames[index]
    const palms = [pose.frontArm, pose.backArm].map(handGeometry)
    assert.ok(Math.abs(palms[0].palm[1] - palms[1].palm[1]) < 3, 'the far hand stays raised beside the near hand')
    for (const arm of [pose.frontArm, pose.backArm]) {
      assert.ok(arm.end[1] - arm.joint[1] < 4, 'the forearm remains close to level instead of hanging between the legs')
      assert.ok(Math.abs(Math.hypot(...arm.joint.map((v, j) => v - arm.root[j]), arm.jointDepth ?? 0) - 10) < 1e-5)
      assert.ok(Math.abs(Math.hypot(...arm.end.map((v, j) => v - arm.joint[j]), (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-5)
    }
  }
})

for (const inverted of [false, true]) for (const facing of [-1, 1]) for (const size of [30, 80]) {
  test(`crouched ${size}-unit crate palms stay open and attached: facing=${facing}, inverted=${inverted}`, () => {
    const run = crouchedPushScenario({ name: 'working palms', kind: 'box', size, blocked: true }, facing, inverted)
    for (let i = 0; i < 240; i++) stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch: true })
    const p = run.player, before = structuredClone(p), pose = athletePose(p)
    assert.ok(p.contacts?.push?.hands && p.pushing?.palms, 'normal input establishes loaded hands')
    for (const [i, name] of ['frontArm', 'backArm'].entries()) {
      const arm = pose[name], palm = p.pushing.palms[i], world = [p.x + arm.hand[0] * p.facing, p.y + arm.hand[1] * (p.inverted ? -1 : 1)]
      assert.ok(Math.hypot(world[0] - palm.x - palm.nx * 1.6, world[1] - palm.y - palm.ny * 1.6) < .5, 'the force-bearing palm keeps its real surface contact')
      assert.ok(arm.handOpen > .99 && Math.sin(arm.handAngle) < -.9, 'the open fingers point up the crate')
      assert.ok(arm.end[1] > arm.hand[1] + .5, 'the wrist remains below the palm center')
      assert.ok(Math.abs(Math.hypot(...arm.joint.map((v, j) => v - arm.root[j]), arm.jointDepth ?? 0) - 10) < 1e-5)
      assert.ok(Math.abs(Math.hypot(...arm.end.map((v, j) => v - arm.joint[j]), (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-5)
    }
    assert.deepEqual(p, before, 'the pose cannot move the player or contacts')
  })
}
