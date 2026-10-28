import { createRun, stepRun } from './challenge.ts'
import type { Prop, Run } from './challenge.ts'
import { entranceDuration } from './goal.ts'
import { isPuzzleLevel, parseLevel } from './level.ts'
import { NEUTRAL_INPUT, STEP } from './model.ts'
import type { JumpInput, Player } from './model.ts'
import { presentedAthletePose } from './athlete.ts'
import type { AthletePose } from './athlete.ts'

export const REVIEW_FPS = 60
export interface ReviewClip {
  id: string; title: string; group: string; focus: string; scene?: string; level?: string
  phases: { seconds: number; label: string; input: Partial<JumpInput> }[]
}
export interface ReviewFrame {
  player: Player; pose: AthletePose; props: Prop[]; label: string; time: number; state: string
}
export interface ReviewRecording { clip: ReviewClip; frames: ReviewFrame[]; run: Run; signature: string; bounds: ReviewBounds }
export interface ReviewBounds { x: number; y: number; w: number; h: number }
export interface ReviewBaseline {
  signature: string; frames: number; columns: number; ratio: number; bounds: ReviewBounds
  image: string; poster: number
  samples: { x: number; y: number; facing: number; inverted: boolean; pose: AthletePose; props: Prop[]; label: string; state: string }[]
}
export interface ReviewBaselineIndex { version: number; revision: string; captured: string; clips: Record<string, ReviewBaseline> }

export const reviewLevelUrl = (clip: ReviewClip) => clip.level ?? `/dev/model-review/scenes/${clip.scene}.jump-level.json`

export function reviewState(p: Player): string {
  return p.mantle ? 'Pull-up' : p.hang ? 'Braced hang' : p.climbing ? `${p.climbing.kind} grip`
    : p.contacts?.push ? p.contacts.push.swimming ? 'Swimming push' : 'Standing push'
    : p.sliding?.active ? 'Sliding' : p.waterMotion && !p.grounded ? p.waterMotion.amount > .5 ? 'Swimming' : 'Floating'
    : !p.grounded ? p.vy < 0 ? 'Rising' : 'Falling' : p.crouching ? 'Crouched' : Math.abs(p.vx) > 5 ? 'Moving' : 'Standing'
}

/** FNV-1a identifies the exact level and input tape, not just a clip's title. */
export function reviewSignature(clip: ReviewClip, source: unknown): string {
  let hash = 2166136261
  for (const c of JSON.stringify([clip, source])) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Fresh starts and ordinary inputs produce every pose; no hand-placed joints
 * or simulation-state edits. Sampling happens after the complete game step. */
export async function recordReviewClip(clip: ReviewClip, source: unknown, signal?: AbortSignal): Promise<ReviewRecording> {
  const level = parseLevel(source)
  if (!isPuzzleLevel(level)) throw new Error('Model review requires a puzzle level.')
  const run = createRun(level), frames: ReviewFrame[] = []
  if (run.entrance) stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
  for (let i = 0; i < 24; i++) stepRun(run, NEUTRAL_INPUT)
  let tick = 0
  const sample = (label: string) => frames.push({ player: structuredClone(run.player), pose: structuredClone(presentedAthletePose(run.player)),
    props: structuredClone(run.props), label, time: tick * STEP, state: reviewState(run.player) })
  sample(clip.phases[0].label)
  for (const phase of clip.phases) {
    for (let i = 0; i < Math.round(phase.seconds / STEP); i++) {
      if (signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
      stepRun(run, { ...NEUTRAL_INPUT, ...phase.input })
      tick++
      if (tick % 2 === 0) sample(phase.label)
      // Yield while preparing longer contact recordings so the page can cancel
      // or navigate away without waiting for the entire input tape.
      if (tick % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  return { clip, frames, run, signature: reviewSignature(clip, source), bounds: reviewBounds(frames) }
}

export function reviewBounds(frames: readonly ReviewFrame[]): ReviewBounds {
  const points = frames.flatMap(({ pose, player }) => [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
    .map(([x, y]) => [x * player.facing, y * (player.inverted ? -1 : 1)]))
  const x = Math.floor(Math.min(...points.map(p => p[0])) - 12), y = Math.floor(Math.min(...points.map(p => p[1])) - 12)
  return { x, y, w: Math.ceil(Math.max(...points.map(p => p[0])) + 12 - x), h: Math.ceil(Math.max(...points.map(p => p[1])) + 12 - y) }
}

export function reviewPoster(recording: ReviewRecording) {
  const state = ({ stride: 'Moving', jump: 'Rising', crouch: 'Crouched', ledge: 'Braced hang', ladder: 'ladder grip',
    rope: 'rope grip', slide: 'Sliding', swim: 'Swimming', 'water-push': 'Swimming push' } as Record<string, string>)[recording.clip.id]
  const candidates = recording.frames.flatMap((frame, i) => frame.state === state ? [i] : [])
  return candidates[Math.floor(candidates.length / 2)] ?? Math.floor(recording.frames.length / 2)
}

export function reviewFrameAt(time: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.floor(time * REVIEW_FPS + 1e-6)))
}
