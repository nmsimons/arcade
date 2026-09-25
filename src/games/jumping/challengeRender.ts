import { drawLevelBackdrop, drawMovementEffects, LEVEL_BOTTOM_PADDING } from './render.ts'
import { drawAthlete, drawClimbables, drawTerrain } from './render.ts'
import type { Prop, RobotState, Run } from './challenge.ts'
import { formatTime } from './challenge.ts'
import type { Goal } from './goal.ts'
import { GOAL_LIGHT_HEIGHT, GOAL_PLATE_WIDTH, GOAL_POLE_OFFSET, GOAL_OPEN_SECONDS, goalDoor, goalEase, goalPoleX } from './goal.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import { drawPickup } from './pickups.ts'
import { levelHeight } from './level.ts'
import { isHorizontalGate, mechanismAnchor, mechanismRopeEnd } from './mechanisms.ts'

const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius) }
function drawPressurePlate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, active: boolean, depression: number) {
  ctx.fillStyle = '#738575'; ctx.fillRect(x - 3, y - 3, width + 6, 3)
  ctx.fillStyle = active ? '#9bb878' : '#c4a66b'; ctx.fillRect(x, y - 7 + depression * 4, width, 3)
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
    ctx.fillStyle = '#8f9e98'; ctx.beginPath(); ctx.arc(b.x, cy, r, 0, Math.PI * 2); ctx.fill()
    // A flat marking makes rolling visible without suggesting a shaded sphere.
    ctx.fillStyle = '#667b72'; ctx.beginPath()
    ctx.arc(b.x + Math.cos(b.angle) * r * .52, cy + Math.sin(b.angle) * r * .52, r * .12, 0, Math.PI * 2); ctx.fill()
  }
}
export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotState, elapsed: number) {
  const brace = r.phase === 'windup', charge = r.phase === 'charge', hunting = r.phase === 'chase'
  ctx.save(); ctx.translate(r.x, r.y - 9); ctx.rotate(r.angle); ctx.translate(0, 9); ctx.scale(r.facing, 1)
  for (const x of [-17, 17]) {
    ctx.fillStyle = '#68736e'; ctx.beginPath(); ctx.arc(x, -9, 9, 0, Math.PI * 2); ctx.fill()
    const angle = r.x / 9
    ctx.strokeStyle = '#a5afa8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + Math.cos(angle) * 5, -9 + Math.sin(angle) * 5); ctx.stroke()
  }
  const top = brace ? -39 : -46
  ctx.fillStyle = '#b3a28d'; rounded(ctx, -26, top, 51, -12 - top, 4); ctx.fill()
  ctx.fillStyle = '#687b71'; rounded(ctx, -2, top + 8, 21, 9, 2); ctx.fill()
  ctx.fillStyle = brace || charge ? '#c68d78' : hunting ? '#c7bc9e' : '#a5b3a7'; ctx.fillRect(11, top + 10, 5, 5)
  for (let y = top + 13; y <= top + 23; y += 5) { ctx.fillStyle = '#938777'; ctx.fillRect(-19, y, 9, 1.5) }
  const reach = charge ? 42 : brace ? 29 : 33
  ctx.strokeStyle = '#7e8b7e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, -23); ctx.lineTo(reach, -23); ctx.stroke()
  ctx.fillStyle = '#687b71'; rounded(ctx, reach, -38, 8, 31, 2); ctx.fill()
  if (r.phase === 'recover') { ctx.strokeStyle = '#859384'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -55, 10, elapsed * 9, elapsed * 9 + 2); ctx.stroke() }
  ctx.restore()
}
export function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, complete = false, depression = 0) {
  const half = GOAL_PLATE_WIDTH / 2, pole = goalPoleX(goal), lamp = goal.y - GOAL_LIGHT_HEIGHT
  ctx.fillStyle = '#738575'
  ctx.fillRect(goal.flipX ? pole : goal.x + half, goal.y - 2, GOAL_POLE_OFFSET - half, 2)
  ctx.fillRect(pole - 2, lamp, 4, GOAL_LIGHT_HEIGHT)
  ctx.fillStyle = complete ? '#a9d56b' : '#9aa38e'
  ctx.beginPath(); ctx.arc(pole, lamp, 11, 0, Math.PI * 2); ctx.fill()
  drawPressurePlate(ctx, goal.x - half, goal.y, GOAL_PLATE_WIDTH, complete, depression)
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
export function drawPuzzleWorld(ctx: CanvasRenderingContext2D, run: Run, editor = false) {
  const { level, player: p } = run
  drawGoalDoor(ctx, level.goal, run.goalElapsed / GOAL_OPEN_SECONDS, editor)
  // Wall displays sit behind solid terrain and actors, and have no physics shape.
  ctx.save(); ctx.font = '500 28px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const clockFinished = run.exit !== null, clockStopped = !clockFinished && run.timeStopRemaining > 0
  for (const timer of level.timers ?? []) {
    ctx.fillStyle = clockStopped ? '#eee3ce' : '#e2e7da'; ctx.fillRect(timer.x, timer.y, WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT)
    ctx.fillStyle = clockFinished ? '#66844e' : clockStopped ? '#91652f' : '#40574a'
    ctx.fillText(formatTime(run.elapsed), timer.x + WALL_TIMER_WIDTH / 2, timer.y + WALL_TIMER_HEIGHT / 2 + 1)
    if (clockStopped) {
      ctx.fillRect(timer.x + 9, timer.y + 22, 3, 10)
      ctx.fillRect(timer.x + 15, timer.y + 22, 3, 10)
    }
  }
  ctx.restore()
  for (const m of run.mechanisms) {
    const anchor = mechanismAnchor(m.definition), end = mechanismRopeEnd(m.definition, m)
    ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.8
    ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y); ctx.lineTo(end.x, end.y); ctx.stroke()
  }
  drawTerrain(ctx, run.terrain)
  for (const m of run.mechanisms) {
    const d = m.definition, anchor = mechanismAnchor(d)
    if (d.kind === 'gate') {
      ctx.fillStyle = '#8f9e98'; rounded(ctx, m.x, m.y, d.w, d.h, 2); ctx.fill()
      ctx.fillStyle = '#667b72'
      if (isHorizontalGate(d)) {
        for (let x = m.x + 16; x < m.x + d.w - 8; x += 24) ctx.fillRect(x, m.y + 5, 2, d.h - 10)
      } else for (let y = m.y + 16; y < m.y + d.h - 8; y += 24) ctx.fillRect(m.x + 5, y, d.w - 10, 2)
    } else {
      ctx.fillStyle = '#b3a28d'; rounded(ctx, m.x, m.y, d.w, d.h, 2); ctx.fill()
      ctx.fillStyle = '#938777'
      for (let x = m.x + 12; x < m.x + d.w - 8; x += 16) ctx.fillRect(x, m.y + d.h * .35, 3, d.h * .3)
    }
    ctx.fillStyle = '#697d72'; ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 5, 0, Math.PI * 2); ctx.fill()
  }
  for (const [i, plate] of level.triggers.entries()) {
    drawPressurePlate(ctx, plate.x, plate.y, plate.w, run.triggers[i].active, run.triggers[i].depression)
  }
  drawGoal(ctx, level.goal, run.goalLit, run.goalDepression)
  for (const b of run.props) drawProp(ctx, b)
  drawClimbables(ctx, p, level.climbables)
  for (const r of run.robots) drawRobot(ctx, r, run.activeTime)
  for (const pickup of run.pickups) drawPickup(ctx, pickup)
  if (run.exit) {
    ctx.save(); ctx.globalAlpha = 1 - goalEase((run.exit.elapsed - .25) / .5)
    drawAthlete(ctx, p); ctx.restore()
  }
  else { drawMovementEffects(ctx, p); drawAthlete(ctx, p) }
}
export function drawChallenge(ctx: CanvasRenderingContext2D, width: number, height: number, run: Run) {
  const { level, player: p } = run
  ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, width, height)
  const zoom = Math.max(.42, Math.min(1.3, height / 850, width / Math.min(1800, level.width + 80)))
  const half = width / zoom / 2
  const focusX = p.x, focusY = p.y - 31
  const cameraX = level.width < half * 2 - 80 ? level.width / 2 : Math.max(half - 40, Math.min(level.width - half + 40, focusX))
  const cameraY = Math.min(focusY, levelHeight(level) + (LEVEL_BOTTOM_PADDING - height / 2) / zoom)
  ctx.save(); ctx.translate(width / 2 - cameraX * zoom, height / 2 - cameraY * zoom); ctx.scale(zoom, zoom)
  const left = cameraX - half, top = cameraY - height / zoom / 2
  drawLevelBackdrop(ctx, level, { x: left, y: top, w: width / zoom, h: height / zoom }, zoom)
  drawPuzzleWorld(ctx, run)
  ctx.restore()
}
