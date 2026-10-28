import { gravityPlateActive } from './gravity.ts'
import { drawForceField } from './forceFieldRender.ts'
import { drawGravityDust, drawGravityPlate, drawGravityRegion, drawWaterRegion, drawWaterSurfaceDetails } from './gravityRender.ts'
import { drawLevelBackdrop, drawMovementEffects } from './render.ts'
import { drawWallWiring } from './wallWiring.ts'
import { drawWallTexts } from './wallText.ts'
import { drawAthlete, drawCheckpointMarkers, drawClimbables, drawTerrain } from './render.ts'
import type { Prop, RobotState, Run, MechanismState } from './challenge.ts'
import type { Goal } from './goal.ts'
import { GOAL_LIGHT_HEIGHT, GOAL_OPEN_SECONDS, awakeningProgress, chargingBayOpening, drawChargingBayCover, drawDoorway, entranceDoor, entranceOpening, entranceVisibility, goalDoor, goalEase, goalPoleX, ROBOT_BAY_WIDTH_SCALE } from './goal.ts'
import { awakeningPose } from './athlete.ts'
import type { AndroidAppearance } from './androidArtwork.ts'
import { drawWallTimer } from './wallTimer.ts'
import { gradeClock } from './grading.ts'
import { drawPickup, TIME_PENALTY_COLOR } from './pickups.ts'
import { drawCoinSwitch } from './coins.ts'
import { gameCamera } from './camera.ts'
import { isHorizontalGate } from './mechanisms.ts'
import { mechanismCornerRadii } from './mechanismAppearance.ts'
import type { CornerRadii } from './mechanismAppearance.ts'
import { robotTop } from './robotPhysics.ts'
import { robotHeadlightY, ROBOT_HEADLIGHT_X } from './robotHeadlight.ts'
import { ambientPaint, paintNormally } from './worldPaint.ts'
import type { Exposure, WorldLayer, WorldPaint } from './worldPaint.ts'
import { drawLightFixtures } from './lightFixture.ts'
import type { LightSource } from './lightingModel.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { drawFloatSwitchArm } from './floatSwitch.ts'
import { drawWallLight } from './wallLight.ts'
import { nightModeEnabled } from './ambientLight.ts'
import { drawLabLogo, LAB_LOGO_HEIGHT, LAB_LOGO_WIDTH } from '../../branding/lab.ts'
import { drawGadgets, drawLooseGadget } from './gadgetRender.ts'
import { drawRepulsorBot } from './repulsorBotRender.ts'
import { EMP_PALETTE, ROBOT_PALETTE } from './equipmentPalette.ts'

const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius) }
export const BALL_COLOR = '#8f9e98'
export function drawPressurePlate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, active: boolean, depression: number, ceiling = false) {
  ctx.fillStyle = '#738575'; ctx.fillRect(x - 3, ceiling ? y : y - 3, width + 6, 3)
  ctx.fillStyle = active ? '#9bb878' : '#c4a66b'; ctx.fillRect(x, ceiling ? y + 4 - depression * 4 : y - 7 + depression * 4, width, 3)
}
export function drawMechanism(ctx: CanvasRenderingContext2D, m: Pick<MechanismState, 'x' | 'y' | 'definition'>, corners: CornerRadii) {
  const d = m.definition
  const body = () => { ctx.beginPath(); ctx.roundRect(m.x, m.y, d.w, d.h, corners); ctx.fill() }
  if (d.kind === 'gate') {
    ctx.fillStyle = '#8f9e98'; body()
    ctx.fillStyle = '#667b72'
    if (isHorizontalGate(d)) {
      for (let x = m.x + 16; x < m.x + d.w - 8; x += 24) ctx.fillRect(x, m.y + 5, 2, d.h - 10)
    } else for (let y = m.y + 16; y < m.y + d.h - 8; y += 24) ctx.fillRect(m.x + 5, y, d.w - 10, 2)
  } else {
    ctx.fillStyle = '#b3a28d'; body()
    ctx.fillStyle = '#938777'
    for (let x = m.x + 12; x < m.x + d.w - 8; x += 16) ctx.fillRect(x, m.y + d.h * .35, 3, d.h * .3)
  }
}
export function drawProp(ctx: CanvasRenderingContext2D, b: Prop) {
  if (b.gadget) { drawLooseGadget(ctx, b); return }
  const r = b.size / 2, x = b.x - r, y = b.y - b.size
  if (b.kind === 'box') {
    ctx.save(); ctx.translate(b.x, b.y - r); ctx.rotate(b.angle); ctx.translate(-b.x, -b.y + r)
    ctx.fillStyle = b.weight === 'heavy' ? '#6b777d' : '#b3a28d'
    rounded(ctx, x, y, b.size, b.size, 2); ctx.fill()
    ctx.save(); ctx.clip()
    ctx.fillStyle = '#ffffff30'; ctx.fillRect(x, y, b.size, 2); ctx.fillRect(x, y, 1.5, b.size)
    ctx.fillStyle = '#26382d24'; ctx.fillRect(x, y + b.size - 3, b.size, 3); ctx.fillRect(x + b.size - 2, y, 2, b.size)
    ctx.restore()
    const seam = Math.max(1, b.size * .025), inset = b.size * .12
    if (b.weight === 'heavy') {
      ctx.fillStyle = '#4d5b62'
      for (const fraction of [1 / 3, 2 / 3]) ctx.fillRect(x + b.size * fraction - seam, y + inset, seam * 2, b.size - inset * 2)
      ctx.fillStyle = '#b6c1c5'; ctx.beginPath()
      for (const dx of [inset, b.size - inset]) for (const dy of [inset, b.size - inset]) {
        ctx.moveTo(x + dx + seam, y + dy); ctx.arc(x + dx, y + dy, seam, 0, Math.PI * 2)
      }
      ctx.fill()
    } else {
      ctx.fillStyle = '#938777'
      for (const fraction of b.branded ? [.16, .84] : [1 / 3, 2 / 3]) ctx.fillRect(x + inset, y + b.size * fraction - seam / 2, b.size - inset * 2, seam)
    }
    if (b.branded) {
      const width = b.size * .76, height = width * LAB_LOGO_HEIGHT / LAB_LOGO_WIDTH
      drawLabLogo(ctx, x + (b.size - width) / 2, y + (b.size - height) / 2, width, b.weight === 'heavy' ? '#b6c1c5' : '#625746')
    }
    ctx.restore()
  } else {
    const cy = b.y - r
    ctx.fillStyle = b.weight === 'heavy' ? '#6b777d' : BALL_COLOR
    ctx.beginPath(); ctx.arc(b.x, cy, r, 0, Math.PI * 2); ctx.fill()
    // One subtle offset dot gives the sphere its familiar cue and reveals rolling.
    ctx.fillStyle = b.weight === 'heavy' ? '#4d5b62' : '#667b72'; ctx.beginPath()
    ctx.arc(b.x + Math.cos(b.angle) * r * .52, cy + Math.sin(b.angle) * r * .52, r * .12, 0, Math.PI * 2); ctx.fill()
    if (b.weight === 'heavy') {
      // Two smaller highlights follow the dark dot's arc around the sphere.
      ctx.fillStyle = '#b6c1c5'; ctx.beginPath()
      for (const offset of [-.65, .65]) {
        const angle = b.angle + offset, dotX = b.x + Math.cos(angle) * r * .52, dotY = cy + Math.sin(angle) * r * .52
        ctx.moveTo(dotX + r * .065, dotY); ctx.arc(dotX, dotY, r * .065, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }
}
export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotState, elapsed: number, angry = false, powered = true, paint: WorldPaint = paintNormally, headlightFade = 0) {
  if (r.actor) { drawRepulsorBot(ctx, r, powered, paint, headlightFade); return }
  ctx.save(); ctx.translate(r.x, r.y - 9); ctx.rotate(r.angle); ctx.translate(0, 9); ctx.scale(r.facing, 1)
  const top = robotTop(r)
  const colors = r.definition.mode === 'emp' ? EMP_PALETTE : ROBOT_PALETTE
  angry ||= r.phase === 'chase' || r.phase === 'windup' || r.phase === 'charge'
  paint(ctx, 0, () => {
    for (const x of [-17, 17]) {
      ctx.fillStyle = '#68736e'; ctx.beginPath(); ctx.arc(x, -9, 9, 0, Math.PI * 2); ctx.fill()
      const angle = r.x / 9
      ctx.strokeStyle = '#a5afa8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + Math.cos(angle) * 5, -9 + Math.sin(angle) * 5); ctx.stroke()
    }
    ctx.fillStyle = colors.body; rounded(ctx, -26, top, 51, -12 - top, 4); ctx.fill()
    ctx.fillStyle = colors.edge; rounded(ctx, -2, top + 8, 21, 9, 2); ctx.fill()
    if (r.definition.mode === 'emp') {
      ctx.fillStyle = colors.light; ctx.beginPath(); ctx.moveTo(-11, top + 6); ctx.lineTo(-17, top + 17)
      ctx.lineTo(-12, top + 17); ctx.lineTo(-16, top + 27); ctx.lineTo(-6, top + 13)
      ctx.lineTo(-12, top + 13); ctx.closePath(); ctx.fill()
    }
  })
  if (powered) paint(ctx, 1, () => { ctx.fillStyle = angry ? TIME_PENALTY_COLOR : '#a5b3a7'; ctx.fillRect(11, top + 10, 5, 5) }, true,
    { x: 11, y: top + 10, w: 5, h: 5 })
  if (r.definition.headlight) {
    const y = robotHeadlightY(r)
    paint(ctx, 0, () => {
      ctx.fillStyle = '#687b71'; ctx.fillRect(ROBOT_HEADLIGHT_X - 4, y - 6, 4, 12)
      ctx.fillStyle = '#9aa38e'; ctx.fillRect(ROBOT_HEADLIGHT_X - 2, y - 4, 2, 8)
    })
    if (headlightFade > 0) {
      ctx.save(); ctx.globalAlpha *= headlightFade
      paint(ctx, 1, () => { ctx.fillStyle = '#f4f2e9'; ctx.fillRect(ROBOT_HEADLIGHT_X - 2, y - 4, 2, 8) }, true,
        { x: ROBOT_HEADLIGHT_X - 2, y: y - 4, w: 2, h: 8 })
      ctx.restore()
    }
  }
  paint(ctx, 0, () => {
    if (r.definition.mode !== 'emp') for (let y = top + 13; y <= top + 23; y += 5) { ctx.fillStyle = colors.edge; ctx.fillRect(-19, y, 9, 1.5) }
    if (powered && r.phase === 'recover') { ctx.strokeStyle = '#859384'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -55, 10, elapsed * 9, elapsed * 9 + 2); ctx.stroke() }
  })
  ctx.restore()
}
export function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, complete = false, paint: WorldPaint = paintNormally) {
  if (goal.kind === 'overlook') {
    paint(ctx, 0, () => {
      ctx.save()
      ctx.fillStyle = '#8b9687'; ctx.fillRect(goal.x - 3, goal.y - 34, 6, 34)
      ctx.fillStyle = '#bbc1ac'; ctx.beginPath(); ctx.moveTo(goal.x - 15, goal.y - 34)
      ctx.lineTo(goal.x + 15, goal.y - 34); ctx.lineTo(goal.x + 11, goal.y - 26); ctx.lineTo(goal.x - 11, goal.y - 26); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#4c5e50'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('HOLD UP TO FINISH', goal.x, goal.y - 54)
      ctx.restore()
    })
    return
  }
  const pole = goalPoleX(goal), lamp = goal.y - GOAL_LIGHT_HEIGHT
  paint(ctx, 0, () => {
    ctx.fillStyle = '#738575'
    ctx.fillRect(pole - 2, lamp, 4, GOAL_LIGHT_HEIGHT)
  })
  paint(ctx, complete ? 1 : 0, () => {
    ctx.fillStyle = complete ? '#a9d56b' : '#9aa38e'
    ctx.beginPath(); ctx.arc(pole, lamp, 11, 0, Math.PI * 2); ctx.fill()
  }, true, { x: pole - 11, y: lamp - 11, w: 22, h: 22 })
}
export function drawGoalDoor(ctx: CanvasRenderingContext2D, goal: Goal, opening: number, editor = false) {
  if (goal.kind === 'overlook') return
  drawDoorway(ctx, goalDoor(goal), opening, editor)
}
/** Editor and placement show the full doorway, including starts awaiting manual repair. */
export function drawRobotPortal(ctx: CanvasRenderingContext2D, robot: RobotState, editor = false, paint: WorldPaint = paintNormally) {
  if (robot.definition.kind !== 'repulsor' || robot.definition.chargingBay || !editor && !robot.entrance) return
  ambientPaint(paint)(ctx, 0, () => drawDoorway(ctx, entranceDoor(robot.definition), editor ? 1 : entranceOpening(robot.entrance!.elapsed)))
}
/** Air and water need different depth layers: a transparent water tint alone
 * exposes the hard sky/cave wall boundary beneath a continuous pool. */
export function drawWaterBackdrop(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally) {
  if (run.level.environment?.kind !== 'landscape') return
  const surface = run.waterSurface?.enabled === false ? undefined : run.waterSurface
  for (const plate of run.water.plates) drawWaterRegion(ctx, plate, paint, surface, run.waterSpaces.get(plate), 'background')
}

/** Shared world renderer for play and editor previews; wall text is drawn with the backdrop. */
export function drawPuzzleWorld(ctx: CanvasRenderingContext2D, run: Run, editor = false, paint: WorldPaint = paintNormally, playerInk?: AndroidAppearance, lights: readonly LightSource[] = [], layer: WorldLayer = 'all', playerExposure: Exposure = 0, terrainArtwork?: (ctx: CanvasRenderingContext2D) => void) {
  const { level, player: p } = run
  if (layer !== 'objects') {
    const wallPaint = ambientPaint(paint)
    for (const plate of level.gravityPlates ?? []) drawGravityRegion(ctx, plate, !run.gadgets.disabled.has(plate) && gravityPlateActive(plate, run.switchStates, run.empRemaining === 0), editor, wallPaint)
    drawGravityDust(ctx, level.gravityPlates ?? [], run.gravityField, run.activeTime, paint, nightModeEnabled(level.lighting))
    drawLightFixtures(ctx, lights, wallPaint)
    for (const light of level.wallLights ?? []) drawWallLight(ctx, light, !!run.switchStates.get(light.id), paint)
    wallPaint(ctx, 0, () => drawGoalDoor(ctx, level.goal, run.goalElapsed / GOAL_OPEN_SECONDS, editor))
    if (level.entrance.kind !== 'charging-bay' && (editor || !run.started && run.entrance)) wallPaint(ctx, 0, () =>
      drawDoorway(ctx, entranceDoor(level.entrance), editor ? 1 : entranceOpening(run.entrance!.elapsed)))
    for (const robot of run.robots) drawRobotPortal(ctx, robot, editor, paint)
    // Wall displays sit behind solid terrain and actors, and have no physics shape.
    const clockFinished = run.exit !== null, clockStopped = !clockFinished && run.timeStopRemaining > 0
    const clockFast = !clockFinished && !clockStopped && run.timeFastRemaining > 0
    const clockStatus = clockFinished ? 'finished' : clockStopped ? 'pause' : clockFast ? 'fast' : undefined
    const clock = gradeClock(level, run.elapsed, run.failed)
    for (const timer of level.timers ?? []) drawWallTimer(ctx, timer, level.timing === 'untimed' ? 0 : clock.remaining, clockStatus, paint,
      level.timing === 'untimed' ? undefined : clock.grade)
    for (const [i, trigger] of level.triggers.entries()) if (trigger.mode === 'coins') drawCoinSwitch(ctx, trigger, run.coinsCollected, run.triggers[i].active, paint)
    // Collectibles receive the light field without casting shadows. Keep their
    // artwork and collection effects behind terrain and movable objects.
    paint(ctx, 0, () => { for (const pickup of run.pickups) drawPickup(ctx, pickup, run.pickupTime, run.failed) })
  }
  if (layer === 'wall') return
  paint(ctx, 0, () => {
    if (terrainArtwork) terrainArtwork(ctx)
    else drawTerrain(ctx, run.terrain, level.platforms, level)
    const corners = mechanismCornerRadii(run)
    for (const [i, m] of run.mechanisms.entries()) drawMechanism(ctx, m, corners[i])
  }, false)
  paint(ctx, 0, () => {
    for (const [i, plate] of level.triggers.entries()) {
      if (plate.mode === 'coins') continue
      const position = pressurePlatePosition(plate, run.mechanisms)
      drawPressurePlate(ctx, position.x, position.y, plate.w, run.triggers[i].active, run.triggers[i].depression, plate.ceiling)
    }
  })
  for (const plate of level.gravityPlates ?? []) drawGravityPlate(ctx, plate, !run.gadgets.disabled.has(plate) && gravityPlateActive(plate, run.switchStates, run.empRemaining === 0), paint)
  for (const field of run.forceFields) drawForceField(ctx, field.definition, field.active, run.activeTime, editor, field.pending, paint)
  drawGoal(ctx, level.goal, run.goalLit, paint)
  for (const state of run.floatSwitches) drawFloatSwitchArm(ctx, state, paint)
  paint(ctx, 0, () => {
    if (editor) drawCheckpointMarkers(ctx, p, level)
    for (const b of run.props) drawProp(ctx, b)
    drawClimbables(ctx, p, level.climbables)
  })
  for (const [i, r] of run.robots.entries()) drawRobot(ctx, r, run.activeTime, r.seesPlayer, run.empRemaining === 0 && !r.deactivated && !run.gadgets.disabled.has(r), paint, lights.find(light => light.robot === i)?.fade ?? 0)
  for (const r of run.robots) if (r.definition.kind === 'repulsor' && r.definition.chargingBay)
    drawChargingBayCover(ctx, r.definition, r.awakening?.elapsed ?? 0, paint, nightModeEnabled(level.lighting), ROBOT_BAY_WIDTH_SCALE)
  if (!run.started && run.entrance && !editor) {
    const entrance = run.entrance, waking = entrance.kind === 'charging-bay'
    ctx.save(); ctx.globalAlpha *= waking ? .45 + .55 * chargingBayOpening(entrance.elapsed) : entranceVisibility(entrance.elapsed)
    paint(ctx, playerExposure, () => drawAthlete(ctx, entrance.player, playerInk, waking ? awakeningPose(entrance.player, awakeningProgress(entrance.elapsed)) : undefined)); ctx.restore()
  }
  else if (run.exit) {
    ctx.save(); ctx.globalAlpha = 1 - goalEase((run.exit.elapsed - .25) / .5)
    paint(ctx, playerExposure, () => drawAthlete(ctx, p, playerInk)); ctx.restore()
  }
  else {
    drawMovementEffects(ctx, p, paint)
    paint(ctx, playerExposure, () => drawAthlete(ctx, p, playerInk))
  }
  if (level.entrance.kind === 'charging-bay')
    drawChargingBayCover(ctx, level.entrance, editor ? undefined : run.entrance?.elapsed, paint, nightModeEnabled(level.lighting))
  if (!editor) drawGadgets(ctx, run, paint, playerExposure)
  const waterSurface = run.waterSurface?.enabled === false ? undefined : run.waterSurface
  for (const plate of run.water.plates) drawWaterRegion(ctx, plate, paint, waterSurface, run.waterSpaces.get(plate))
  if (waterSurface) drawWaterSurfaceDetails(ctx, waterSurface, paint)
}
export function drawChallenge(ctx: CanvasRenderingContext2D, width: number, height: number, run: Run, view = gameCamera(width, height, run.player, run.level, true)) {
  const { level } = run
  ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, width, height)
  const { zoom, x: left, y: top } = view
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-left, -top)
  drawLevelBackdrop(ctx, level, { x: left, y: top, w: width / zoom, h: height / zoom }, zoom, false)
  drawWaterBackdrop(ctx, run)
  drawWallWiring(ctx, level, run)
  drawWallTexts(ctx, level.texts ?? [])
  drawPuzzleWorld(ctx, run)
  ctx.restore()
}
