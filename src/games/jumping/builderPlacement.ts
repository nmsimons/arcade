import { drawForceField } from './forceFieldRender.ts'
import { drawGravityPlate, drawGravityRegion } from './gravityRender.ts'
import { addItem, itemOutline } from './editor.ts'
import type { Selection, Tool } from './editor.ts'
import { levelHeight, levelTerrain } from './level.ts'
import { toolGridSize } from './builderSnap.ts'
import type { JumpLevel } from './level.ts'
import { placeOnSurface } from './editorPlacement.ts'
import { createPlayer } from './model.ts'
import { drawAthlete, drawClimbables, drawTerrain } from './render.ts'
import { drawGoal, drawGoalDoor, drawMechanism, drawPressurePlate, drawProp, drawRobot } from './challengeRender.ts'
import { mechanismCornerRadii } from './mechanismAppearance.ts'
import { drawCoinSwitch } from './coins.ts'
import { drawPickup } from './pickups.ts'
import { drawWallTimer } from './wallTimer.ts'
import { drawWallTexts } from './wallText.ts'
import { drawLightFixtures } from './lightFixture.ts'
import { drawWallLight } from './wallLight.ts'
import { drawLogicRelay } from './logicRelay.ts'
import { editorRobotPose } from './editorGeometry.ts'

export type PlacementPreview = { level: JumpLevel; selection: Selection }

/** A click-sized candidate uses the editor's placement rules without editing its draft. */
export function placementPreview(level: JumpLevel, tool: Tool, point: { x: number; y: number; free?: boolean }, snap: boolean, zoom: number): PlacementPreview | null {
  if (tool === 'select' || tool === 'node') return null
  const grid = toolGridSize(tool)
  const quantize = (value: number) => snap ? Math.round(value / grid) * grid : Math.round(value)
  const bottom = levelHeight(level)
  const position = point.free ? point : { x: quantize(point.x), y: bottom - quantize(bottom - point.y) }
  try {
    const added = addItem(level, tool, position, position)
    return added && { ...added, level: snap && !point.free ? placeOnSurface(added.level, added.selection, 12 / zoom) : added.level }
  } catch { return null } // Full object collections still report their error on placement.
}

/** Draw only the candidate, using the same artwork as an authored object. */
export function drawPlacementPreview(ctx: CanvasRenderingContext2D, { level, selection }: PlacementPreview, zoom: number) {
  const i = selection.index
  ctx.save(); ctx.globalAlpha = .65
  switch (selection.kind) {
    case 'platform': drawTerrain(ctx, [level.platforms[i]]); break
    case 'prop': drawProp(ctx, { ...level.props![i], vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: true }); break
    case 'robot': {
      const definition = level.robots![i]
      drawRobot(ctx, { definition, ...editorRobotPose(level, definition), vx: 0, facing: -1, phase: 'patrol', time: 0, seesPlayer: false }, 0)
      break
    }
    case 'mechanism': {
      const mechanisms = level.mechanisms!.map(definition => ({ definition, x: definition.x, y: definition.y }))
      drawMechanism(ctx, mechanisms[i], mechanismCornerRadii({ terrain: levelTerrain(level), mechanisms })[i]); break
    }
    case 'trigger': {
      const trigger = level.triggers![i]
      if (trigger.mode === 'coins') drawCoinSwitch(ctx, trigger, 0, false)
      else drawPressurePlate(ctx, trigger.x, trigger.y, trigger.w, false, 0, trigger.ceiling)
      break
    }
    case 'rope': drawClimbables(ctx, createPlayer(level.spawn), { ropes: [level.climbables.ropes[i]], ladders: [] }); break
    case 'ladder': drawClimbables(ctx, createPlayer(level.spawn), { ropes: [], ladders: [level.climbables.ladders[i]] }); break
    case 'light': drawLightFixtures(ctx, [{ ...level.lighting!.lights[i], fade: 1 }]); break
    case 'force-field': drawForceField(ctx, level.forceFields![i], true); break
    case 'gravity-plate': drawGravityRegion(ctx, level.gravityPlates![i], false, true); drawGravityPlate(ctx, level.gravityPlates![i], false); break
    case 'wall-light': drawWallLight(ctx, level.wallLights![i], false); break
    case 'logic-relay': drawLogicRelay(ctx, level.logicRelays![i], false); break
    case 'timer': drawWallTimer(ctx, level.timers![i], 0); break
    case 'text': drawWallTexts(ctx, [level.texts![i]]); break
    case 'pickup': drawPickup(ctx, { definition: level.pickups![i], collectedAge: null }); break
    case 'goal': drawGoalDoor(ctx, level.goal!, 1, true); drawGoal(ctx, level.goal!, true); break
    case 'spawn': case 'checkpoint': drawAthlete(ctx, createPlayer(selection.kind === 'spawn' ? level.spawn : level.checkpoints[i])); break
  }
  const outline = itemOutline(level, selection)
  if (outline) {
    ctx.globalAlpha = 1; ctx.strokeStyle = '#c65231'; ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom])
    const pad = 3 / zoom
    ctx.strokeRect(outline.x - pad, outline.y - pad - (outline.h ? 0 : 62), Math.max(8, outline.w + pad * 2), Math.max(8, outline.h + pad * 2 + (outline.h ? 0 : 62)))
  }
  ctx.restore()
}
