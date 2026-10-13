import { lineBlocked } from '../../src/games/jumping/geometry.ts'
import { boxShape, ballShape } from '../../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../../src/games/jumping/mechanisms.ts'

/** Untimed checks of the actual fine path, including retained corner bends. */
export function ropeQuality(run) {
  const groups = [run.terrain, run.mechanisms.map(mechanismShape),
    run.props.map(p => p.kind === 'box' ? boxShape(p) : ballShape(p))]
  const solids = groups.flat(), blockedByGroup = [0, 0, 0]
  let maxAnchorDrift = 0, maxLocalStretch = 1, maxTotalStretch = 1, blockedSpans = 0
  for (const rope of run.player.ropes ?? []) {
    maxAnchorDrift = Math.max(maxAnchorDrift, Math.hypot(rope.nodes[0].x - rope.definition.x, rope.nodes[0].y - rope.definition.y))
    let length = 0
    for (let i = 1; i < rope.nodes.length; i++) {
      const a = [rope.nodes[i - 1].x, rope.nodes[i - 1].y], b = [rope.nodes[i].x, rope.nodes[i].y]
      const bend = rope.bends[i - 1], path = bend ? [a, bend, b] : [a, b]
      let span = 0
      for (let j = 1; j < path.length; j++) {
        span += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1])
        if (lineBlocked(path[j - 1], path[j], solids)) blockedSpans++
        groups.forEach((group, k) => { if (lineBlocked(path[j - 1], path[j], group)) blockedByGroup[k]++ })
      }
      const rest = Math.min(rope.definition.length, i * 8) - Math.min(rope.definition.length, (i - 1) * 8)
      maxLocalStretch = Math.max(maxLocalStretch, span / rest); length += span
    }
    maxTotalStretch = Math.max(maxTotalStretch, length / rope.definition.length)
  }
  return { maxAnchorDrift, maxLocalStretch, maxTotalStretch, blockedSpans,
    blockedTerrainSpans: blockedByGroup[0], blockedMechanismSpans: blockedByGroup[1], blockedPropSpans: blockedByGroup[2] }
}
