import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openAnkle } from '../src/games/jumping/limbPose.ts'
import { recordReviewClip, reviewLevelUrl } from '../src/games/jumping/modelReview.ts'
import { footPoint } from '../src/games/jumping/footwork.ts'

const catalog = JSON.parse(readFileSync(new URL('../dev/model-review/clips.json', import.meta.url), 'utf8')).clips
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
const flex = leg => wrap(leg.footAngle - Math.atan2(leg.end[1] - leg.joint[1], leg.end[0] - leg.joint[0]) + Math.PI / 2) * leg.footFacing
const bones = leg => {
  assert.ok(Math.abs(Math.hypot(...leg.joint.map((v, i) => v - leg.root[i]), leg.jointDepth ?? 0) - 15) < 1e-6, 'the thigh keeps its full length through depth')
  assert.ok(Math.abs(Math.hypot(...leg.end.map((v, i) => v - leg.joint[i]), (leg.endDepth ?? 0) - (leg.jointDepth ?? 0)) - 14.5) < 1e-6, 'the shin keeps its full length through depth')
}

test('opening a supported ankle retains the hip, ankle and both bones in reflected and rotated poses', () => {
  const original = { root: [-3, -17], joint: [.7079535706214859, -2.4655209822259074], end: [-13.539425752673765, -5.160364654526575] }
  for (const facing of [-1, 1]) for (const angle of [-2.8, -.4, 0, 1.9, 3.1]) {
    const transform = ([x, y]) => [x * facing * Math.cos(angle) - y * Math.sin(angle), x * facing * Math.sin(angle) + y * Math.cos(angle)]
    const source = { root: transform(original.root), joint: transform(original.joint), end: transform(original.end) }
    const before = structuredClone(source), result = openAnkle(source, angle, facing)
    assert.ok(result && (result.jointDepth ?? 0) > 5, 'the knee opens through depth rather than rotating the planted foot')
    assert.deepEqual(source, before, 'the query is read-only')
    assert.deepEqual(result.root, source.root); assert.deepEqual(result.end, source.end)
    bones(result)
    assert.ok(flex({ ...result, footAngle: angle, footFacing: facing }) >= -55 * Math.PI / 180)
  }
})

for (const clip of catalog) test(`final ${clip.id} poses keep visible ankles open without losing foot contacts`, async () => {
  const recording = await recordReviewClip(clip, JSON.parse(readFileSync(new URL(`..${reviewLevelUrl(clip)}`, import.meta.url), 'utf8')))
  for (const [frame, sample] of recording.frames.entries()) for (const [i, name] of ['frontLeg', 'backLeg'].entries()) {
    const leg = sample.pose[name]
    bones(leg)
    if ((leg.rear ?? 0) > .5) continue // A back-facing shoe has no side-profile ankle plane.
    const wall = (sample.player.wallBrace?.feet[i] ?? 0) > 0
    // A long leg against a steep wall can exhaust its bend-plane travel. Its
    // sole remains on the wall; it still must not fold flat against the calf.
    assert.ok(flex(leg) >= -(wall ? 66 : 55) * Math.PI / 180, `${clip.id}/${frame}/${name}: folded ankle ${flex(leg)}`)
    const foot = sample.player.footwork?.feet[i]
    if (clip.id === 'crouch' && leg.planted && foot?.planted) {
      assert.ok(Math.hypot(sample.player.x + leg.end[0] * sample.player.facing - foot.x,
        sample.player.y + leg.end[1] - foot.y) < 1e-6, 'opening the knee does not slide its motor ankle')
      assert.ok(Math.abs(wrap(leg.footAngle - foot.angle * leg.footFacing)) < 1e-6, 'the loaded sole keeps its motor angle')
    }
  }
  if (clip.id === 'ledge') {
    const saved = JSON.parse(readFileSync(new URL('../dev/model-review/baseline/index.json', import.meta.url), 'utf8')).clips.ledge
    for (const name of ['frontLeg', 'backLeg']) {
      const before = saved.samples[80].pose[name], after = recording.frames[80].pose[name]
      assert.deepEqual(after.end, before.end, 'the approved toe brace keeps its ankle position')
      assert.equal(after.footAngle, before.footAngle); assert.equal(after.toeAngle, before.toeAngle)
      for (const point of [[-1.8, 2.8], [2.2, 2.8], [4.5, 2.8], [6, 1.5]]) {
        assert.deepEqual(footPoint(point, after.footAngle, after.toeAngle), footPoint(point, before.footAngle, before.toeAngle),
          'the native foot proportions and toe pad have not changed')
      }
    }
    for (let i = 126; i <= 140; i++) {
      const a = recording.frames[i - 1].pose.backLeg.footAngle, b = recording.frames[i].pose.backLeg.footAngle
      assert.ok(Math.abs(wrap(b - a)) < Math.PI / 3, 'the trailing shoe no longer spins through the angle-wrap boundary')
    }
  }
})
