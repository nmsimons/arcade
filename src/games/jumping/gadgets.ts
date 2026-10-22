import type { Prop, Run } from './challenge.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { lineBlocked, nearestBoundary, polygonIntersects, polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { ballShape, boxShape, propHeight } from './propGeometry.ts'
import { athletePose } from './athlete.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { mechanismShape } from './mechanisms.ts'
import { faceRobotToward, repulseRobot, robotPlatforms } from './robotPhysics.ts'
import { setPropCarried, repulseProp } from './propPhysics.ts'
import { rightArmAnimating, rightArmSupporting } from './armSupport.ts'

export type GadgetKind = 'emp' | 'repulsor'
export const GADGET_SIZE = 40
export const GADGET_REACH = 60
export const REPULSOR_RANGE = 1500
export const REPULSOR_COOLDOWN = .4
export const REPULSOR_BEAM_SECONDS = .025
export const REPULSOR_IMPACT_SECONDS = .09
export const EMP_RANGE = 900
export const EMP_BOLT_SPEED = 1200
export const EMP_COOLDOWN = 1
export const EMP_DISABLE_SECONDS = 5
export const gadgetLabel = (kind: GadgetKind) => kind === 'emp' ? 'Carried EMP' : 'Repulsor rifle'
export interface HeldTool {
  kind: GadgetKind; size: number; angle: number; aiming: boolean; blocked: boolean
  presentation?: { forearm: number; upper: number; climbAim?: number; firing?: boolean }
}
export interface ToolFrame { x: number; y: number; angle: number; size: number }
export interface GadgetState {
  held: Prop | null; nearby: Prop | null; aiming: boolean; angle: number; blocked: boolean
  previousUse: boolean; previousInteract: boolean
  feedback: string; feedbackTime: number; serial: number; shots: number
  lastShotKind?: GadgetKind
  pulses: { from: Vec; to: Vec; age: number; kind?: GadgetKind }[]
  bolts: { position: Vec; direction: Vec; remaining: number; sourceX: number }[]
  disabled: Map<object, number>
}
export const createGadgetState = (): GadgetState => ({ held: null, nearby: null, aiming: false, angle: 0, blocked: false,
  previousUse: false, previousInteract: false,
  feedback: '', feedbackTime: 0, serial: 0, shots: 0, pulses: [], bolts: [], disabled: new Map() })

/** Device timers use gameplay time, independent of pickup/drop or global power. */
export function advanceGadgetDisables(run: Run, dt: number) {
  for (const [device, time] of run.gadgets.disabled) {
    if (time <= dt + 1e-9) run.gadgets.disabled.delete(device)
    else run.gadgets.disabled.set(device, time - dt)
  }
}

/** The same sleeve hull and forearm axis drive artwork, clearance and firing. */
export function heldToolFrame(p: Player, tool = p.heldTool): ToolFrame | null {
  if (!tool) return null
  const pose = athletePose(tool === p.heldTool ? p : { ...p, heldTool: tool })
  const arm = p.facing < 0 ? pose.backArm : pose.frontArm
  const flip = p.inverted ? -1 : 1
  const dx = (arm.end[0] - arm.joint[0]) * p.facing, dy = (arm.end[1] - arm.joint[1]) * flip
  return { x: p.x + (arm.joint[0] + arm.end[0]) * .5 * p.facing,
    y: p.y + (arm.joint[1] + arm.end[1]) * .5 * flip, angle: Math.atan2(dy, dx), size: tool.size }
}
function armAngles(p: Player) {
  const pose = athletePose(p), arm = p.facing < 0 ? pose.backArm : pose.frontArm, flip = p.inverted ? -1 : 1
  const angle = (a: Vec, b: Vec) => Math.atan2((b[1] - a[1]) * flip, (b[0] - a[0]) * p.facing)
  return { forearm: angle(arm.joint, arm.end), upper: angle(arm.root, arm.joint) }
}
function easeArm(p: Player, previous: HeldTool['presentation'], dt: number) {
  const target = armAngles(p)
  // Up/Down already choreograph a climbing stroke. Only a direction away from
  // the climb asks the unloaded hand to leave that stroke and point the rifle.
  const pointingAway = !!p.climbing && p.heldTool!.aiming && Math.abs(Math.cos(p.heldTool!.angle)) > .01
  const climbAim = (previous?.climbAim ?? 0) + (Number(pointingAway) - (previous?.climbAim ?? 0)) * (1 - Math.exp(-24 * dt))
  if (!previous || rightArmSupporting(p) || !p.heldTool!.aiming && rightArmAnimating(p)) return { ...target, climbAim }
  const ease = (from: number, to: number) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
    return Math.abs(delta) < .001 ? to : from + delta * (1 - Math.exp(-35 * dt))
  }
  return { forearm: ease(previous.forearm, target.forearm), upper: ease(previous.upper, target.upper), climbAim }
}
export function toolShape(frame: ToolFrame): Platform {
  return boxShape({ x: frame.x, y: frame.y + frame.size * .1, size: frame.size, angle: frame.angle, gadget: 'repulsor' })
}
export function gadgetSolids(run: Run, except?: Prop, includeLooseEquipment = false): Platform[] {
  return [...run.terrain, ...run.mechanisms.map(mechanismShape), ...forceFieldPlatforms(run.forceFields, 'objects'),
    ...run.props.filter(p => p !== except && (includeLooseEquipment || !p.gadget)).map(p => p.kind === 'ball' ? ballShape(p) : boxShape(p)), ...run.robots.flatMap(robotPlatforms)]
}
function feedback(run: Run, message: string) { run.gadgets.feedback = message; run.gadgets.feedbackTime = 1.1 }
function legal(frame: ToolFrame, solids: readonly Platform[]) {
  const points = polygonPoints(toolShape(frame))
  return !solids.some(s => polygonIntersects(points, s, .02))
}
function firstBlockedFrame(from: ToolFrame, to: ToolFrame, solids: readonly Platform[]) {
  const rotation = Math.atan2(Math.sin(to.angle - from.angle), Math.cos(to.angle - from.angle))
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3 + Math.abs(rotation) / .1))
  const at = (t: number): ToolFrame => ({ ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle: from.angle + rotation * t })
  for (let i = 1; i <= steps; i++) {
    if (legal(at(i / steps), solids)) continue
    let low = (i - 1) / steps, high = i / steps
    for (let pass = 0; pass < 8; pass++) {
      const middle = (low + high) / 2
      if (legal(at(middle), solids)) low = middle; else high = middle
    }
    return { clear: at(low), blocked: at(high) }
  }
  return null
}
const framePathClear = (from: ToolFrame, to: ToolFrame, solids: readonly Platform[]) => !firstBlockedFrame(from, to, solids)
export function cancelGadgetInput(run: Run) {
  const state = run.gadgets
  state.previousUse = true; state.previousInteract = true; state.aiming = false
  if (run.player.heldTool) run.player.heldTool.aiming = false
}
function candidate(run: Run) {
  const p = run.player, y = p.y - (p.inverted ? -1 : 1) * (p.crouching ? 20 : 30)
  if (p.hang || p.climbing || p.mantle || p.releaseTurn) return null
  return run.props.filter(prop => prop.gadget && Math.hypot(prop.x - p.x, prop.y - propHeight(prop) / 2 - y) <= GADGET_REACH + prop.size * .2)
    .map((prop, index) => ({ prop, index, distance: Math.hypot(prop.x - p.x, prop.y - propHeight(prop) / 2 - y) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .find(({ prop }) => {
      const solids = gadgetSolids(run, prop, true)
      const tool: HeldTool = { kind: prop.gadget!, size: prop.size, angle: p.facing < 0 ? Math.PI : 0, aiming: false, blocked: false }
      const to = heldToolFrame(p, tool)!
      return !lineBlocked([p.x, y], [prop.x, prop.y - propHeight(prop) / 2], solids)
        && framePathClear({ x: prop.x, y: prop.y - propHeight(prop) / 2, angle: prop.angle, size: prop.size }, to, solids)
    })?.prop ?? null
}
function drop(run: Run) {
  const state = run.gadgets, prop = state.held!, p = run.player, from = heldToolFrame(p)!
  // Move outward from the held side, never across a wall to the far side.
  const dx = Math.cos(from.angle), dy = Math.sin(from.angle)
  const solids = gadgetSolids(run, undefined, true)
  for (const offset of [0, 4, 8, 12, 16, 20]) {
    const to = { ...from, x: from.x + dx * offset, y: from.y + dy * offset }
    if (!legal(to, solids) || !framePathClear(from, to, solids)) continue
    Object.assign(prop, { x: to.x, y: to.y + propHeight(prop) / 2, angle: to.angle, vx: p.vx, vy: p.vy, angularVelocity: 0, grounded: false })
    setPropCarried(run, prop, false); state.held = null; state.aiming = false; state.serial++
    feedback(run, 'Dropped'); return true
  }
  feedback(run, 'No room to drop'); return false
}

/** Device-independent intent. No special rules are applied to worlds without tools. */
export function prepareGadgets(run: Run, input: JumpInput, dt: number): JumpInput {
  const state = run.gadgets, p = run.player
  state.feedbackTime = Math.max(0, state.feedbackTime - dt)
  state.pulses = state.pulses.filter(pulse => (pulse.age += dt) < REPULSOR_IMPACT_SECONDS)
  advanceEmpBolts(run, dt)
  for (const prop of [...run.props, ...(state.held ? [state.held] : [])]) if (prop.gadgetCooldown)
    prop.gadgetCooldown = prop.gadgetCooldown <= dt + 1e-9 ? 0 : prop.gadgetCooldown - dt
  if (!state.held && !run.props.some(prop => prop.gadget)) { delete p.heldTool; return input }
  const use = !!input.use && !state.previousUse, interact = !!input.interact && !state.previousInteract
  state.previousUse = !!input.use; state.previousInteract = !!input.interact
  if (!state.held) delete p.heldTool
  state.nearby = state.held ? null : candidate(run)
  if (interact) {
    if (state.held) drop(run)
    else if (state.nearby) {
      state.held = state.nearby; setPropCarried(run, state.held, true); state.nearby = null
      state.aiming = false; state.blocked = false; state.serial++
      feedback(run, gadgetLabel(state.held.gadget!))
    }
  }
  const prop = state.held
  if (prop) {
    const previousPresentation = p.heldTool?.presentation
    const supporting = rightArmSupporting(p)
    const ax = input.aimX ?? Math.sign(input.move), ay = input.aimY ?? (Number(!!input.descend) - Number(input.climb))
    const aiming = !supporting && Math.hypot(ax, ay) > .001
    const angle = aiming ? Math.round(Math.atan2(ay, ax) / (Math.PI / 4)) * (Math.PI / 4) : p.facing < 0 ? Math.PI : 0
    const facing = aiming && Math.abs(Math.cos(angle)) > .01 ? Math.sign(Math.cos(angle)) : p.facing
    const turnSupported = aiming && rightArmSupporting({ ...p, facing })
    const tool: HeldTool = { kind: prop.gadget!, size: prop.size, angle, aiming, blocked: false }
    const before = heldToolFrame(p), after = heldToolFrame({ ...p, facing }, tool)!, solids = gadgetSolids(run)
    state.blocked = turnSupported || !legal(after, solids) || !!before && !framePathClear(before, after, solids)
    if (supporting || !aiming && rightArmAnimating(p) || !state.blocked || !p.heldTool) {
      if (p.facing !== facing) { p.facing = facing; p.dryTurn = null }
      p.heldTool = tool; state.angle = angle; state.aiming = aiming
    }
    else { p.heldTool.blocked = true; state.aiming = aiming }
    p.heldTool!.presentation = easeArm(p, previousPresentation, dt)
    if (use && !interact) {
      if (supporting || turnSupported) feedback(run, 'Right arm supporting')
      else if (run.empRemaining > 0) feedback(run, 'Power off')
      else if (state.blocked) feedback(run, 'Barrel blocked')
      else if (prop.gadgetCooldown) feedback(run, 'Cooling')
      else if (prop.gadget === 'emp') fireEmp(run)
      else fireRepulsor(run)
    }
  } else state.aiming = false
  return input
}

/** A red field strips off the sleeve at the first swept contact. The player
 * keeps the normal movement result, including grip progress and support travel. */
export function finishGadgetMotion(run: Run, from: ToolFrame | null) {
  const state = run.gadgets, prop = state.held, p = run.player, to = heldToolFrame(p)
  if (!prop || !from || !to) return
  const fields = forceFieldPlatforms(run.forceFields, 'objects')
  if (!fields.length) return
  const hit = firstBlockedFrame(from, to, fields)
  if (!hit) return
  const points = polygonPoints(toolShape(hit.blocked))
  const field = fields.find(field => polygonIntersects(points, field, .02))!
  const normal = nearestBoundary(field, hit.clear.x, hit.clear.y)
  const solids = gadgetSolids(run, undefined, true)
  // A cuff may have been touching a wall as part of a legal grip. Give the
  // detached physical prop a little outward room, always on the arrival side.
  let placement = { ...hit.clear, x: hit.clear.x + normal.nx * .1, y: hit.clear.y + normal.ny * .1 }
  for (const offset of [0, 2, 4, 8, 12, 16, 20]) {
    const candidate = { ...hit.clear, x: hit.clear.x + normal.nx * (offset + .1), y: hit.clear.y + normal.ny * (offset + .1) }
    if (legal(candidate, solids) && framePathClear(hit.clear, candidate, fields)) { placement = candidate; break }
  }
  const into = Math.min(0, p.vx * normal.nx + p.vy * normal.ny)
  Object.assign(prop, { x: placement.x, y: placement.y + propHeight(prop) / 2, angle: placement.angle,
    vx: p.vx - into * normal.nx, vy: p.vy - into * normal.ny, angularVelocity: 0, grounded: false })
  setPropCarried(run, prop, false)
  state.held = null; state.nearby = null; state.aiming = false
  state.serial++
  delete p.heldTool
  feedback(run, 'Red field · tool detached')
}

/** Segment/polygon intersection; nearest surface wins independently of object order. */
export function pulseHit(from: Vec, direction: Vec, shapes: readonly Platform[], range = REPULSOR_RANGE) {
  let distance = range, index = -1
  for (const [i, shape] of shapes.entries()) {
    const points = polygonPoints(shape)
    for (let j = 0; j < points.length; j++) {
      const a = points[j], b = points[(j + 1) % points.length], ex = b[0] - a[0], ey = b[1] - a[1]
      const cross = direction[0] * ey - direction[1] * ex
      if (Math.abs(cross) < 1e-9) continue
      const rx = a[0] - from[0], ry = a[1] - from[1]
      const t = (rx * ey - ry * ex) / cross, u = (rx * direction[1] - ry * direction[0]) / cross
      if (t >= 0 && t <= distance && u >= 0 && u <= 1) { distance = t; index = i }
    }
  }
  return { distance, index, point: [from[0] + direction[0] * distance, from[1] + direction[1] * distance] as Vec }
}
function fireRepulsor(run: Run) {
  const state = run.gadgets, p = run.player, frame = heldToolFrame(p)!, direction: Vec = [Math.cos(frame.angle), Math.sin(frame.angle)]
  // A fresh shot is immediate and the displayed emitter must match its ray.
  p.heldTool!.presentation = { ...armAngles(p), climbAim: p.climbing ? 1 : 0, firing: true }
  const from: Vec = [frame.x + direction[0] * frame.size * .2, frame.y + direction[1] * frame.size * .2]
  const blockers = [...run.terrain, ...run.mechanisms.map(mechanismShape), ...forceFieldPlatforms(run.forceFields, 'objects')]
  const targets = [...blockers.map(shape => ({ shape, prop: null as Prop | null, robot: -1 })),
    ...run.props.map(prop => ({ shape: prop.kind === 'box' ? boxShape(prop) : ballShape(prop), prop, robot: -1 })),
    ...run.robots.flatMap((robot, index) => robotPlatforms(robot).map(shape => ({ shape, prop: null, robot: index })))]
  const hit = pulseHit(from, direction, targets.map(t => t.shape)), target = targets[hit.index]
  state.held!.gadgetCooldown = REPULSOR_COOLDOWN; state.serial++; state.shots++; state.lastShotKind = 'repulsor'
  state.pulses.push({ from, to: hit.point, age: 0 })
  if (target?.prop) repulseProp(run, target.prop, direction)
  if (target && target.robot >= 0) {
    repulseRobot(run.robots[target.robot], direction[0], p.x)
  }
  feedback(run, target?.prop || target && target.robot >= 0 ? 'Hit' : 'Pulse')
}

function fireEmp(run: Run) {
  const state = run.gadgets, p = run.player, frame = heldToolFrame(p)!
  const direction: Vec = [Math.cos(frame.angle), Math.sin(frame.angle)]
  p.heldTool!.presentation = { ...armAngles(p), climbAim: p.climbing ? 1 : 0, firing: true }
  state.bolts.push({ position: [frame.x + direction[0] * frame.size * .2, frame.y + direction[1] * frame.size * .2],
    direction, remaining: EMP_RANGE, sourceX: p.x })
  state.held!.gadgetCooldown = EMP_COOLDOWN; state.serial++; state.shots++; state.lastShotKind = 'emp'
  feedback(run, 'EMP · fired')
}

function advanceEmpBolts(run: Run, dt: number) {
  const state = run.gadgets
  if (!state.bolts.length || !(dt > 0)) return
  const targets: { shape: Platform; device?: object; robot?: Run['robots'][number] }[] = [
    ...run.terrain.map(shape => ({ shape })),
    ...run.mechanisms.map(device => ({ shape: mechanismShape(device), device })),
    ...run.props.map(prop => ({ shape: prop.kind === 'box' ? boxShape(prop) : ballShape(prop) })),
    ...run.robots.flatMap(robot => robotPlatforms(robot).map(shape => ({ shape, device: robot, robot }))),
  ]
  for (const field of run.forceFields) {
    if (field.active && field.definition.mode === 'objects') targets.push({ shape: field.platform, device: field })
    const { x, y, w, h, orientation } = field.definition
    // Blue beams pass projectiles; either emitter can still be targeted.
    for (const end of [0, 1]) targets.push({ device: field, shape: orientation === 'vertical'
      ? { x: x - 2, y: y + h * end - 4, w: w + 4, h: 8 }
      : { x: x + w * end - 4, y: y - 2, w: 8, h: h + 4 } })
  }
  for (const plate of run.water.plates) if (plate.effect !== 'water') targets.push({ device: plate,
    shape: { x: plate.x, y: plate.ceiling ? plate.y : plate.y + plate.h - 7, w: plate.w, h: 7 } })
  state.bolts = state.bolts.filter(bolt => {
    const distance = Math.min(bolt.remaining, EMP_BOLT_SPEED * dt)
    const hit = pulseHit(bolt.position, bolt.direction, targets.map(target => target.shape), distance)
    bolt.remaining -= distance
    if (hit.index < 0) { bolt.position = hit.point; return bolt.remaining > 1e-6 }
    const target = targets[hit.index]
    if (target.device) {
      state.disabled.set(target.device, EMP_DISABLE_SECONDS)
      if (target.robot) {
        faceRobotToward(target.robot, bolt.sourceX); target.robot.vx = 0; target.robot.recoilVx = 0
        if (target.robot.actor) { target.robot.phase = 'recover'; target.robot.time = 0; target.robot.actor.vx = 0; target.robot.actor.vy = 0 }
      }
      feedback(run, 'EMP · disabled')
    } else feedback(run, 'EMP · blocked')
    state.pulses.push({ from: hit.point, to: hit.point, age: 0, kind: 'emp' })
    return false
  })
}

export function gadgetStatus(run: Run, device: 'keyboard' | 'controller' | 'touch') {
  const state = run.gadgets, interact = device === 'controller' ? 'X / Square' : device === 'touch' ? 'Pick up' : 'E'
  if (!state.held) return state.feedbackTime && state.feedback ? state.feedback
    : state.nearby ? `${interact} · ${gadgetLabel(state.nearby.gadget!)}` : ''
  const use = device === 'controller' ? 'RT' : device === 'touch' ? 'Use' : 'F'
  return `${gadgetLabel(state.held.gadget!)} · ${use} fire · ${interact} drop${rightArmSupporting(run.player) ? ' · right arm supporting' : run.empRemaining ? ' · power off' : state.held.gadgetCooldown ? ' · cooling' : state.feedbackTime && state.blocked ? ' · blocked' : ''}`
}
