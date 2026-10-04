import type { JumpLevel, Pusher } from './level.ts'
import { levelTerrain } from './level.ts'
import type { Selection } from './editor.ts'
import { ballShape } from './propGeometry.ts'
import { robotPreviewPose } from './robotPhysics.ts'

/** Static solids shared by placement, ghost drawing and selection geometry. */
export function editorSolids(level: JumpLevel, selection?: Selection) {
  const props = (level.props ?? []).flatMap((p, i) => selection?.kind === 'prop' && i === selection.index ? []
    : [p.kind === 'ball' ? ballShape(p) : { x: p.x - p.size / 2, y: p.y - p.size, w: p.size, h: p.size }])
  return [...levelTerrain(level).filter(b => selection?.kind !== 'platform' || b !== level.platforms[selection.index]),
    ...(level.mechanisms ?? []).filter((_, i) => selection?.kind !== 'mechanism' || i !== selection.index),
    ...props]
}

export function editorRobotPose(level: JumpLevel, robot: Pusher) {
  return robotPreviewPose(editorSolids(level), robot)
}
