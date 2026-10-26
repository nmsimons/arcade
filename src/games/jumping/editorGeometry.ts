import type { JumpLevel, Pusher } from './level.ts'
import { levelTerrain } from './level.ts'
import type { Selection } from './editor.ts'
import { createFloatSwitch } from './floatSwitch.ts'
import { ballShape, boxShape } from './propGeometry.ts'
import { robotPreviewPose } from './robotPhysics.ts'

/** Static solids shared by placement, ghost drawing and selection geometry. */
export function editorSolids(level: JumpLevel, selection?: Selection) {
  const props = (level.props ?? []).flatMap((p, i) => selection?.kind === 'prop' && i === selection.index ? []
    : [p.kind === 'ball' ? ballShape(p) : boxShape({ ...p, angle: 0 })])
  return [...levelTerrain(level).filter(b => selection?.kind !== 'platform' || b !== level.platforms[selection.index]),
    ...(level.mechanisms ?? []).filter((_, i) => selection?.kind !== 'mechanism' || i !== selection.index),
    ...(!selection || ['prop', 'robot', 'mechanism'].includes(selection.kind)
      ? (level.forceFields ?? []).filter(f => f.mode === 'objects' && f.power !== 'switched').map(({ x, y, w, h }) => ({ x, y, w, h })) : []),
    ...props, ...(level.floatSwitches ?? []).flatMap((f, i) => selection?.kind === 'float-switch' && selection.index === i ? [] : [ballShape(createFloatSwitch(f).prop)])]
}

export function editorRobotPose(level: JumpLevel, robot: Pusher) {
  return robot.kind === 'repulsor' ? { x: robot.x, y: robot.y, angle: 0 } : robotPreviewPose(editorSolids(level), robot)
}
