import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPuzzleLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { recordReviewClip, REVIEW_FPS, reviewBounds, reviewFrameAt, reviewLevelUrl } from '../src/games/jumping/modelReview.ts'

const catalog = JSON.parse(readFileSync(new URL('../dev/model-review/clips.json', import.meta.url), 'utf8'))
const required = { stride: ['Moving', 'Standing'], jump: ['Rising', 'Falling'], crouch: ['Crouched', 'Standing'],
  ledge: ['Braced hang', 'Pull-up'], ladder: ['ladder grip'], rope: ['rope grip', 'Falling'], slide: ['Sliding', 'Standing'],
  swim: ['Swimming', 'Floating'], 'water-push': ['Standing push', 'Swimming push'] }

for (const clip of catalog.clips) test(`model review records real ${clip.id} states and independent frames`, async () => {
  const source = JSON.parse(readFileSync(new URL(`..${reviewLevelUrl(clip)}`, import.meta.url), 'utf8'))
  const level = parseLevel(source)
  assert.ok(isPuzzleLevel(level)); assert.deepEqual(levelProblems(level), [])
  const recording = await recordReviewClip(clip, source), states = new Set(recording.frames.map(f => f.state))
  for (const state of required[clip.id]) assert.ok(states.has(state), `${clip.id} must actually reach ${state}`)
  const bounds = reviewBounds(recording.frames)
  assert.ok(bounds.w > 20 && bounds.h > 30 && bounds.w < 200 && bounds.h < 200, 'the capture fits a complete native rig')
  const sample = recording.frames[5], copy = structuredClone(sample)
  recording.run.player.x += 100
  assert.deepEqual(sample, copy, 'later simulation changes cannot edit recorded frames')
  for (const [i, frame] of recording.frames.entries()) {
    assert.equal(reviewFrameAt(frame.time, recording.frames.length), i)
    assert.ok(Math.abs(frame.time - i / REVIEW_FPS) < 1e-8)
    assert.ok([frame.player.x, frame.player.y, ...frame.pose.head, ...frame.pose.shoulder].every(Number.isFinite))
  }
})

test('model review sampling clamps both ends and cancellation stops preparation', async () => {
  assert.equal(reviewFrameAt(-1, 10), 0); assert.equal(reviewFrameAt(100, 10), 9)
  const clip = catalog.clips[0], source = JSON.parse(readFileSync(new URL(`..${reviewLevelUrl(clip)}`, import.meta.url), 'utf8'))
  const controller = new AbortController(); controller.abort()
  await assert.rejects(recordReviewClip(clip, source, controller.signal), { name: 'AbortError' })
})
