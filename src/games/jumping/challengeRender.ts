import { gravityPlateActive } from './gravity.ts'
import { drawForceField } from './forceFieldRender.ts'
import { drawGravityDust, drawGravityPlate, drawGravityRegion, drawWaterRegion } from './gravityRender.ts'
import { drawLevelBackdrop, drawMovementEffects } from './render.ts'
import { drawAthlete, drawCheckpointMarkers, drawClimbables, drawTerrain } from './render.ts'
import type { Prop, RobotState, Run, MechanismState } from './challenge.ts'
import type { Goal } from './goal.ts'
import { GOAL_LIGHT_HEIGHT, GOAL_OPEN_SECONDS, goalDoor, goalEase, goalPoleX } from './goal.ts'
import { drawWallTimer } from './wallTimer.ts'
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
import { drawWallLight } from './wallLight.ts'
import { nightModeEnabled } from './ambientLight.ts'

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
  const r = b.size / 2, x = b.x - r, y = b.y - b.size
  if (b.kind === 'box') {
    ctx.save(); ctx.translate(b.x, b.y - r); ctx.rotate(b.angle); ctx.translate(-b.x, -b.y + r)
    ctx.fillStyle = '#b3a28d'; rounded(ctx, x, y, b.size, b.size, 2); ctx.fill()
    ctx.fillStyle = '#938777'
    const seam = Math.max(1, b.size * .025), inset = b.size * .12
    for (const fraction of [1 / 3, 2 / 3]) {
      ctx.fillRect(x + inset, y + b.size * fraction - seam / 2, b.size - inset * 2, seam)
    }
    ctx.restore()
  } else {
    const cy = b.y - r
    ctx.fillStyle = BALL_COLOR; ctx.beginPath(); ctx.arc(b.x, cy, r, 0, Math.PI * 2); ctx.fill()
    // A flat marking makes rolling visible without suggesting a shaded sphere.
    ctx.fillStyle = '#667b72'; ctx.beginPath()
    ctx.arc(b.x + Math.cos(b.angle) * r * .52, cy + Math.sin(b.angle) * r * .52, r * .12, 0, Math.PI * 2); ctx.fill()
  }
}
export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotState, elapsed: number, angry = false, powered = true, paint: WorldPaint = paintNormally, headlightFade = 0) {
  ctx.save(); ctx.translate(r.x, r.y - 9); ctx.rotate(r.angle); ctx.translate(0, 9); ctx.scale(r.facing, 1)
  const top = robotTop(r)
  paint(ctx, 0, () => {
    for (const x of [-17, 17]) {
      ctx.fillStyle = '#68736e'; ctx.beginPath(); ctx.arc(x, -9, 9, 0, Math.PI * 2); ctx.fill()
      const angle = r.x / 9
      ctx.strokeStyle = '#a5afa8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + Math.cos(angle) * 5, -9 + Math.sin(angle) * 5); ctx.stroke()
    }
    ctx.fillStyle = '#b3a28d'; rounded(ctx, -26, top, 51, -12 - top, 4); ctx.fill()
    ctx.fillStyle = '#687b71'; rounded(ctx, -2, top + 8, 21, 9, 2); ctx.fill()
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
    for (let y = top + 13; y <= top + 23; y += 5) { ctx.fillStyle = '#938777'; ctx.fillRect(-19, y, 9, 1.5) }
    if (powered && r.phase === 'recover') { ctx.strokeStyle = '#859384'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -55, 10, elapsed * 9, elapsed * 9 + 2); ctx.stroke() }
  })
  ctx.restore()
}
export function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, complete = false, paint: WorldPaint = paintNormally) {
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
  const door = goalDoor(goal), width = door.w * goalEase(opening)
  if (width > 0) {
    ctx.fillStyle = '#000000'; ctx.fillRect(door.x + (door.w - width) / 2, door.y, width, door.h)
  } else if (editor) {
    ctx.save(); ctx.strokeStyle = '#8a938b'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.strokeRect(door.x, door.y, door.w, door.h); ctx.restore()
  }
}
/** Shared world renderer for play and editor previews; wall text is drawn with the backdrop. */
export function drawPuzzleWorld(ctx: CanvasRenderingContext2D, run: Run, editor = false, paint: WorldPaint = paintNormally, playerInk?: string, lights: readonly LightSource[] = [], layer: WorldLayer = 'all', playerExposure: Exposure = 0) {
  const { level, player: p } = run
  if (layer !== 'objects') {
    const wallPaint = ambientPaint(paint)
    for (const plate of level.gravityPlates ?? []) drawGravityRegion(ctx, plate, run.empRemaining === 0 && gravityPlateActive(plate, run.switchStates), editor, wallPaint)
    drawGravityDust(ctx, level.gravityPlates ?? [], run.gravityField, run.activeTime, paint, nightModeEnabled(level.lighting))
    drawLightFixtures(ctx, lights, wallPaint)
    for (const light of level.wallLights ?? []) drawWallLight(ctx, light, !!run.switchStates.get(light.id), paint)
    wallPaint(ctx, 0, () => drawGoalDoor(ctx, level.goal, run.goalElapsed / GOAL_OPEN_SECONDS, editor))
    // Wall displays sit behind solid terrain and actors, and have no physics shape.
    const clockFinished = run.exit !== null, clockStopped = !clockFinished && run.timeStopRemaining > 0
    const clockFast = !clockFinished && !clockStopped && run.timeFastRemaining > 0
    const clockStatus = clockFinished ? 'finished' : clockStopped ? 'pause' : clockFast ? 'fast' : undefined
    for (const timer of level.timers ?? []) drawWallTimer(ctx, timer, run.elapsed, clockStatus, paint)
    for (const [i, trigger] of level.triggers.entries()) if (trigger.mode === 'coins') drawCoinSwitch(ctx, trigger, run.coinsCollected, run.triggers[i].active, paint)
    // Collectibles receive the light field without casting shadows. Keep their
    // artwork and collection effects behind terrain and movable objects.
    paint(ctx, 0, () => { for (const pickup of run.pickups) drawPickup(ctx, pickup, run.pickupTime) })
  }
  if (layer === 'wall') return
  paint(ctx, 0, () => {
    drawTerrain(ctx, run.terrain, level.platforms)
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
  for (const plate of level.gravityPlates ?? []) drawGravityPlate(ctx, plate, run.empRemaining === 0 && gravityPlateActive(plate, run.switchStates), paint)
  for (const field of run.forceFields) drawForceField(ctx, field.definition, field.active, run.activeTime, editor, field.pending, paint)
  drawGoal(ctx, level.goal, run.goalLit, paint)
  paint(ctx, 0, () => {
    if (editor) drawCheckpointMarkers(ctx, p, level)
    for (const b of run.props) drawProp(ctx, b)
    drawClimbables(ctx, p, level.climbables)
  })
  for (const [i, r] of run.robots.entries()) drawRobot(ctx, r, run.activeTime, r.seesPlayer, run.empRemaining === 0, paint, lights.find(light => light.robot === i)?.fade ?? 0)
  if (run.exit) {
    ctx.save(); ctx.globalAlpha = 1 - goalEase((run.exit.elapsed - .25) / .5)
    paint(ctx, playerExposure, () => drawAthlete(ctx, p, playerInk)); ctx.restore()
  }
  else {
    drawMovementEffects(ctx, p, paint)
    paint(ctx, playerExposure, () => drawAthlete(ctx, p, playerInk))
  }
  for (const plate of level.gravityPlates ?? []) drawWaterRegion(ctx, plate, run.empRemaining === 0 && gravityPlateActive(plate, run.switchStates), editor, paint)
}
export function drawChallenge(ctx: CanvasRenderingContext2D, width: number, height: number, run: Run, view = gameCamera(width, height, run.player, run.level, true)) {
  const { level } = run
  ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, width, height)
  const { zoom, x: left, y: top } = view
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-left, -top)
  drawLevelBackdrop(ctx, level, { x: left, y: top, w: width / zoom, h: height / zoom }, zoom)
  drawPuzzleWorld(ctx, run)
  ctx.restore()
}
