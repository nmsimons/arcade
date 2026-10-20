import type { Run } from './challenge.ts'
import type { Platform, Player } from './model.ts'
import { STEP, TUNING } from './model.ts'
import { lineBlocked } from './geometry.ts'

/** Aim the hands at a visible, moving part of the selected rope. The graph keeps
 * its stable topology; only the final approach follows the simulated rope. */
export function botRopeApproach(run: Run, actor: Player, waypoint: { x: number; y: number; climb?: string }, barriers: readonly Platform[]) {
  if (actor.climbing || !waypoint.climb?.startsWith('rope:')) return undefined
  const rope = run.player.ropes?.[Number(waypoint.climb.split(':')[1])]
  if (!rope) return undefined
  let best: { x: number; y: number; time: number; score: number } | undefined
  const solids = [...run.terrain, ...barriers]
  const stride = Math.max(1, Math.floor(rope.nodes.length / 24))
  for (let i = 1; i < rope.nodes.length; i += stride) {
    const node = rope.nodes[i], rootY = node.y + 56
    if (Math.abs(rootY - waypoint.y) > 220 || rootY < actor.y - 210 || rootY > actor.y + 150) continue
    const gap = Math.abs(node.x - actor.x)
    const time = Math.min(.35, Math.max(.08, gap / Math.max(160, Math.abs(actor.vx) + 120)))
    const vx = Math.max(-500, Math.min(500, (node.x - node.oldX) / STEP)), vy = Math.max(-350, Math.min(350, (node.y - node.oldY) / STEP))
    const x = node.x + vx * time, y = node.y + vy * time + 56
    const side = Math.sign(x - actor.x) || actor.facing
    const score = Math.abs(x - actor.x) + Math.max(0, actor.y - y) * .8 + Math.abs(y - waypoint.y) * .25
    if (best && score >= best.score || lineBlocked([actor.x, actor.y - 44], [node.x, node.y], solids)) continue
    best = { x: x - side * 10, y, time, score }
  }
  return best && { ...waypoint, x: best.x, y: best.y, time: best.time,
    strength: [0, .5, 1].find(strength => (TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * strength) ** 2 / (2 * TUNING.gravity) >= Math.max(0, actor.y - best!.y) + 10) ?? 1 }
}
