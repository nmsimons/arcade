import { drawAthlete } from './athlete.ts'
import type { AthletePose } from './athlete.ts'
import { createPlayer } from './model.ts'
import { drawLandscape } from './environment.ts'
import type { JumpLevel } from './level.ts'
import { goalEase } from './goal.ts'
import type { Goal } from './goal.ts'
import { busEndingCamera, busEndingFrame, BUS_REAR_PIVOT_Y, BUS_REAR_WHEEL_BOTTOM_Y } from './busEnding.ts'
import type { BusEnding, EndingCamera } from './busEnding.ts'

const path = (ctx: CanvasRenderingContext2D, points: number[][]) => {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill()
}
// The rear-window passenger uses the game's head, neck, shoulders, and hands.
// The seat and window sill cover the lower body; proportions stay unchanged.
const passenger = createPlayer()
const seatedPose: AthletePose = {
  hip: [0, -20], waist: [0, -31], shoulder: [0, -44], head: [0, -58],
  frontArm: { root: [7, -43], joint: [10, -31], end: [8, -20] },
  backArm: { root: [-7, -43], joint: [-10, -31], end: [-8, -20] },
  frontLeg: { root: [5, -20], joint: [6, -5], end: [5, 14], footAngle: 0, toeAngle: 0, footFacing: 1, planted: false },
  backLeg: { root: [-5, -20], joint: [-6, -5], end: [-5, 14], footAngle: 0, toeAngle: 0, footFacing: 1, planted: false },
}

function drawBusRear(ctx: CanvasRenderingContext2D, door: number, passengerAlpha: number) {
  // A narrow side doorway lets the robot step around the bus's left side.
  ctx.fillStyle = '#303b35'
  ctx.fillRect(-65, -22, 15, BUS_REAR_WHEEL_BOTTOM_Y + 22); ctx.fillRect(50, -22, 15, BUS_REAR_WHEEL_BOTTOM_Y + 22)
  if (door > 0) {
    ctx.fillStyle = '#31463e'; ctx.fillRect(-79, -109, 12 * door, 94)
    ctx.fillStyle = '#b1b39d'; ctx.fillRect(-87, -16, 20 * door, 5)
  }
  ctx.fillStyle = '#d3cfb8'; ctx.beginPath(); ctx.roundRect(-72, -166, 144, 151, [13, 13, 4, 4]); ctx.fill()
  ctx.fillStyle = '#748878'; ctx.fillRect(-72, -65, 144, 45)
  ctx.fillStyle = '#9caa98'; ctx.fillRect(-72, -65, 144, 4)
  ctx.fillStyle = '#334b4a'; ctx.beginPath(); ctx.roundRect(-59, -142, 118, 60, 4); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.roundRect(-57, -140, 114, 56, 3); ctx.clip()
  ctx.fillStyle = '#50655a'; ctx.fillRect(-49, -111, 34, 34); ctx.fillRect(15, -111, 34, 34)
  if (passengerAlpha > 0) {
    ctx.save(); ctx.globalAlpha *= passengerAlpha; ctx.translate(25, -57)
    drawAthlete(ctx, passenger, '#303c36', seatedPose); ctx.restore()
  }
  ctx.fillStyle = '#465d52'; ctx.fillRect(-52, -92, 104, 12)
  ctx.restore()
  ctx.strokeStyle = '#80918a'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, -141); ctx.lineTo(0, -83); ctx.stroke()
  ctx.fillStyle = '#b3c6bf55'; path(ctx, [[-56, -139], [-22, -139], [-56, -119]])
  ctx.fillStyle = '#405448'; ctx.fillRect(-34, -158, 68, 9)
  ctx.fillStyle = '#e2e0c4'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('OUTBOUND', 0, -151)
  ctx.fillStyle = '#9b6557'; ctx.fillRect(-64, -50, 11, 17); ctx.fillRect(53, -50, 11, 17)
  ctx.fillStyle = '#bd9a68'; ctx.fillRect(-64, -56, 11, 5); ctx.fillRect(53, -56, 11, 5)
  ctx.fillStyle = '#aab0a0'; ctx.fillRect(-17, -40, 34, 10)
  ctx.fillStyle = '#647366'; ctx.fillRect(-10, -37, 20, 3)
  ctx.fillStyle = '#53665b'
  for (let i = 0; i < 3; i++) ctx.fillRect(-26, -71 + i * 3, 52, 1)
  ctx.fillStyle = '#596a5d'; ctx.fillRect(-76, -21, 152, 7)
}

function drawBusStop(ctx: CanvasRenderingContext2D, busX: number, ground: number, bench = true) {
  const stop = busX - 164
  ctx.fillStyle = '#697a6d'; ctx.fillRect(stop - 2, ground - 128, 4, 128)
  ctx.save(); ctx.translate(stop, ground - 143)
  ctx.fillStyle = '#e7e5d8'; ctx.beginPath(); ctx.roundRect(-19, 0, 38, 44, 3); ctx.fill()
  ctx.strokeStyle = '#456359'; ctx.lineWidth = 1.5; ctx.stroke()
  // A front-facing bus pictogram carries the meaning even when the label is
  // too small to read: windshield, headlights, and two distinct wheels.
  ctx.fillStyle = '#456359'; ctx.beginPath(); ctx.roundRect(-11, 6, 22, 25, 4); ctx.fill()
  ctx.fillRect(-8, 29, 4, 5); ctx.fillRect(4, 29, 4, 5)
  ctx.fillStyle = '#e7e5d8'; ctx.fillRect(-8, 10, 16, 10)
  ctx.fillStyle = '#456359'; ctx.fillRect(-.7, 10, 1.4, 10)
  ctx.fillStyle = '#e7e5d8'
  for (const x of [-7, 7]) { ctx.beginPath(); ctx.arc(x, 26, 1.5, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#456359'; ctx.font = '6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BUS STOP', 0, 40)
  ctx.restore()
  if (bench) {
    ctx.fillStyle = '#798174'; ctx.fillRect(stop - 110, ground - 23, 67, 6)
    ctx.fillRect(stop - 104, ground - 17, 4, 17); ctx.fillRect(stop - 53, ground - 17, 4, 17)
  }
}

/** The actual level goal: ordinary gameplay, followed by the shared departure. */
export function drawBusGoal(ctx: CanvasRenderingContext2D, goal: Goal, ending?: BusEnding, boarding = 0) {
  const frame = ending ? busEndingFrame(ending) : undefined
  ctx.save(); drawBusStop(ctx, goal.x, goal.y, false)
  if (!frame || frame.busVisible) {
    ctx.save()
    if (frame?.beyondHorizon) {
      ctx.beginPath(); ctx.rect(goal.x - 1000, goal.y - 1200, 2000, 1200); ctx.clip()
    }
    ctx.translate(frame?.busX ?? goal.x, frame?.busY ?? goal.y + 24 + BUS_REAR_PIVOT_Y)
    ctx.scale(frame?.busScale ?? 1, frame?.busScale ?? 1); ctx.translate(0, -BUS_REAR_PIVOT_Y)
    const closing = goalEase((boarding - .55) / .3)
    drawBusRear(ctx, frame?.door ?? 1 - closing, frame?.passengerAlpha ?? closing)
    ctx.restore()
  }
  ctx.restore()
}

/** The callback paints the retained level only on its side of the boundary. */
export function drawBusEnding(ctx: CanvasRenderingContext2D, ending: BusEnding, level: JumpLevel, width: number, height: number,
  paintLevel?: (camera: EndingCamera) => void) {
  const camera = busEndingCamera(ending, width, height), frame = busEndingFrame(ending)
  const { edge, ground } = ending
  const world = () => { ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y) }
  ctx.save(); world()
  drawLandscape(ctx, { kind: 'landscape', horizon: level.environment?.horizon ?? ground, walls: [] },
    { x: camera.x, y: camera.y, w: width / camera.zoom, h: height / camera.zoom })
  ctx.fillStyle = '#a79b83'; ctx.fillRect(camera.x, ground, width / camera.zoom, height / camera.zoom)
  ctx.restore()
  if (paintLevel && camera.x < edge - 6) {
    const ratio = ctx.getTransform().a
    const right = Math.max(0, Math.floor((edge - 6 - camera.x) * camera.zoom * ratio) / ratio)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, right, height); ctx.clip()
    paintLevel(camera); ctx.restore()
  }
  ctx.save(); world()
  // The flat ground line is the horizon; no separate hill or road plane.
  ctx.fillStyle = '#a79b83'; ctx.fillRect(camera.x, ground, width / camera.zoom, height / camera.zoom)
  ctx.strokeStyle = '#87906a'; ctx.lineWidth = 2
  for (let x = Math.floor(camera.x / 15) * 15; x < camera.x + width / camera.zoom; x += 15) {
    const n = Math.sin(x * .173)
    ctx.beginPath(); ctx.moveTo(x - 3, ground - 3 - n * 2); ctx.lineTo(x, ground); ctx.lineTo(x + 3, ground - 4 + n); ctx.stroke()
  }
  drawBusStop(ctx, edge + 640, ground)
  // The rear of the parked bus occludes the actor as they step around its side.
  if (frame.playerAlpha > 0) {
    ctx.save(); ctx.globalAlpha = frame.playerAlpha; drawAthlete(ctx, ending.player, '#303c36'); ctx.restore()
  }
  if (frame.busVisible) {
    ctx.save()
    if (frame.beyondHorizon) {
      ctx.beginPath(); ctx.rect(camera.x, camera.y, width / camera.zoom, Math.max(0, frame.horizonY - camera.y)); ctx.clip()
    }
    // Keep the center fixed until the wheel bottoms meet the horizon, then
    // lower the bus while it keeps shrinking. The passenger shares both.
    ctx.translate(frame.busX, frame.busY); ctx.scale(frame.busScale, frame.busScale)
    ctx.translate(0, -BUS_REAR_PIVOT_Y)
    drawBusRear(ctx, frame.door, frame.passengerAlpha); ctx.restore()
  }
  ctx.restore()
}
