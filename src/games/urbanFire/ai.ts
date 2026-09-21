import { FIELD } from './types.ts'
import type { Helicopter, Jeep, Tank, Vector2, Wall } from './types'
import { angleDelta, clamp, clear, distance, openPoint } from './navigation.ts'

export type TankBrain = { goal: Vector2 | null; path: Vector2[]; replan: number }
export const createTankBrain = (): TankBrain => ({ goal: null, path: [], replan: 0 })
export type Contact = { pos: Vector2; vel: Vector2; age: number; time: number }
export const createContact = (): Contact => ({ pos: { x: 800, y: 800 }, vel: { x: 0, y: 0 }, age: 0, time: 0 })
export function observe(contact: Contact, jeep: Jeep, enemies: { pos: Vector2; state: string }[], walls: Wall[], dt: number) {
  contact.age += dt; contact.time += dt
  if (enemies.some(e => e.state === 'active' && distance(e.pos, jeep.pos) < 560 && clear(e.pos, jeep.pos, walls))) {
    contact.pos = { ...jeep.pos }; contact.vel = { ...jeep.vel }; contact.age = 0
  }
}

/** Intercept a moving target, bounded to avoid impossible long-range predictions. */
export function intercept(origin: Vector2, target: Vector2, velocity: Vector2, speed: number) {
  const dx = target.x - origin.x, dy = target.y - origin.y
  const a = velocity.x ** 2 + velocity.y ** 2 - speed ** 2
  const b = 2 * (dx * velocity.x + dy * velocity.y), c = dx ** 2 + dy ** 2
  let t = Math.sqrt(c) / speed
  if (Math.abs(a) < 1e-6) { if (b < 0) t = -c / b }
  else if (b * b - 4 * a * c >= 0) {
    const root = Math.sqrt(b * b - 4 * a * c)
    const times = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(n => n > 0)
    if (times.length) t = Math.min(...times)
  }
  t = clamp(t, 0, 1.3)
  return { x: target.x + velocity.x * t, y: target.y + velocity.y * t }
}

type Route = (start: Vector2, goal: Vector2) => Vector2[]
export function planTank(tank: Tank, squad: Tank[], contact: Contact, walls: Wall[], route: Route) {
  const fresh = contact.age < 4
  const patrol = [{ x: 800, y: 900 }, { x: 300, y: 550 }, { x: 800, y: 200 }, { x: 1300, y: 550 }]
  const target = contact.age > 8 ? patrol[(Math.floor((contact.age - 8) / 18) + tank.role) % patrol.length] : contact.pos
  const candidates: { pos: Vector2; score: number }[] = []
  // Separate attack bearings establish crossfire instead of a single-file chase.
  const bearing = tank.role * Math.PI * .65 + Math.PI * .25
  for (const radius of fresh ? [200, 280, 340] : [80, 220, 380]) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8
    const pos = { x: target.x + Math.cos(a) * radius, y: target.y + Math.sin(a) * radius }
    if (!openPoint(pos, walls)) continue
    const lane = clear(pos, target, walls)
    const crowd = squad.filter(other => other !== tank && other.state === 'active').reduce((sum, other) =>
      sum + Math.max(0, 140 - distance(pos, other.brain.goal ?? other.pos)), 0)
    const facing = Math.abs(angleDelta(a, bearing))
    const continuity = tank.brain.goal ? distance(pos, tank.brain.goal) * .16 : 0
    candidates.push({ pos, score: distance(tank.pos, pos) * .35 + facing * 65 + crowd * 2 + continuity + (lane ? 0 : 350) })
  }
  candidates.sort((a, b) => a.score - b.score)
  for (const candidate of candidates.slice(0, 16)) {
    const path = route(tank.pos, candidate.pos)
    if (path.length) return { goal: candidate.pos, path }
  }
  return { goal: null, path: [] }
}

export function driveTank(tank: Tank, squad: Tank[], contact: Contact, walls: Wall[], route: Route, dt: number) {
  const brain = tank.brain
  brain.replan -= dt
  if (brain.replan <= 0) {
    const plan = planTank(tank, squad, contact, walls, route)
    brain.goal = plan.goal; brain.path = plan.path; brain.replan = .8 + tank.role * .09
  }
  while (brain.path.length && distance(tank.pos, brain.path[0]) < 3 &&
    (brain.path.length === 1 || clear(tank.pos, brain.path[1], walls, 30))) brain.path.shift()
  const waypoint = brain.path[0]
  let speed = 0
  if (waypoint) {
    let desired = Math.atan2(waypoint.y - tank.pos.y, waypoint.x - tank.pos.x)
    const reverse = Math.abs(angleDelta(desired, tank.angle)) > Math.PI * .7 && distance(tank.pos, waypoint) < 100
    if (reverse) desired += Math.PI
    const diff = angleDelta(desired, tank.angle)
    tank.angle += clamp(diff, -.95 * dt, .95 * dt)
    // Pivot before entering a corner. Never shortcut a route through cover.
    const remaining = distance(tank.pos, waypoint)
    speed = Math.abs(angleDelta(desired, tank.angle)) < .001 ? Math.min(reverse ? 36 : 55, remaining / Math.max(dt, .001)) * (reverse ? -1 : 1) : 0
    const probe = Math.sign(speed) * Math.min(Math.abs(speed) * dt * 3, remaining)
    const next = { x: tank.pos.x + Math.cos(tank.angle) * probe, y: tank.pos.y + Math.sin(tank.angle) * probe }
    if (!clear(tank.pos, next, walls, 30)) speed = 0
    const blocker = squad.find(other => other !== tank && other.state === 'active' && distance(next, other.pos) < 57 &&
      distance(next, other.pos) < distance(tank.pos, other.pos))
    if (blocker) {
      speed = 0
      // One unit holds while the other clears the lane, avoiding head-on deadlock.
      if (tank.role > blocker.role) for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const side = { x: tank.pos.x + Math.cos(tank.angle + turn) * 72, y: tank.pos.y + Math.sin(tank.angle + turn) * 72 }
        if (!openPoint(side, walls) || !clear(tank.pos, side, walls, 30) ||
          squad.some(other => other !== tank && distance(side, other.pos) < 60)) continue
        brain.path.unshift(side); brain.replan = 3; break
      }
    }
  }
  tank.vel = { x: Math.cos(tank.angle) * speed, y: Math.sin(tank.angle) * speed }
  tank.pos.x = clamp(tank.pos.x + tank.vel.x * dt, 30, FIELD.width - 30)
  tank.pos.y = clamp(tank.pos.y + tank.vel.y * dt, 30, FIELD.height - 30)
  tank.trackOffset += speed * dt * .5
  tank.recoil = Math.max(0, tank.recoil - dt * 5)
}

export function aimTank(tank: Tank, jeep: Jeep, squad: Tank[], walls: Wall[], dt: number) {
  const range = distance(tank.pos, jeep.pos)
  const visible = range < 400 && clear(tank.pos, jeep.pos, walls)
  tank.losTimeMs = visible ? Math.min(2000, tank.losTimeMs + dt * 1000) : 0
  tank.shootCooldown -= dt * 1000
  if (!visible) return null
  const target = intercept(tank.pos, jeep.pos, jeep.vel, 250)
  const desired = Math.atan2(target.y - tank.pos.y, target.x - tank.pos.x)
  tank.turretAngle += clamp(angleDelta(desired, tank.turretAngle), -1.1 * dt, 1.1 * dt)
  const muzzle = { x: tank.pos.x + Math.cos(tank.turretAngle) * 28, y: tank.pos.y + Math.sin(tank.turretAngle) * 28 }
  if (tank.shootCooldown > 0 || tank.losTimeMs < 450 || Math.abs(angleDelta(desired, tank.turretAngle)) > .085 ||
      !clear(tank.pos, muzzle, walls) || !clear(muzzle, target, walls)) return null
  // Don't waste a shell into another tank's silhouette.
  const friendWalls = squad.filter(t => t !== tank && t.state === 'active').map(t => ({ x: t.pos.x - 25, y: t.pos.y - 25, width: 50, height: 50 }))
  return clear(muzzle, target, friendWalls) ? muzzle : null
}

export function flyHelicopter(heli: Helicopter, jeep: Jeep, contact: Contact, walls: Wall[], dt: number) {
  const radial = Math.atan2(heli.pos.y - contact.pos.y, heli.pos.x - contact.pos.x)
  let goal = { x: contact.pos.x + Math.cos(radial + heli.orbit * .6) * 220, y: contact.pos.y + Math.sin(radial + heli.orbit * .6) * 220 }
  // Orbit toward an open firing lane when a building shields the target.
  for (let i = 0; i < 10; i++) {
    const a = radial + heli.orbit * (.6 + i * .3)
    const candidate = { x: clamp(contact.pos.x + Math.cos(a) * 220, 40, FIELD.width - 40), y: clamp(contact.pos.y + Math.sin(a) * 220, 40, FIELD.height - 40) }
    goal = candidate
    if (clear(candidate, contact.pos, walls)) break
  }
  const dist = Math.max(1, distance(heli.pos, goal)), blend = 1 - Math.exp(-dt * 1.4)
  heli.vel.x += ((goal.x - heli.pos.x) / dist * 82 - heli.vel.x) * blend
  heli.vel.y += ((goal.y - heli.pos.y) / dist * 82 - heli.vel.y) * blend
  heli.pos.x = clamp(heli.pos.x + heli.vel.x * dt, 20, FIELD.width - 20)
  heli.pos.y = clamp(heli.pos.y + heli.vel.y * dt, 20, FIELD.height - 20)
  const visible = distance(heli.pos, jeep.pos) < 340 && clear(heli.pos, jeep.pos, walls)
  heli.losTimeMs = visible ? heli.losTimeMs + dt * 1000 : 0
  const target = visible ? intercept(heli.pos, jeep.pos, jeep.vel, 220) : goal
  const desired = Math.atan2(target.y - heli.pos.y, target.x - heli.pos.x)
  heli.angle += clamp(angleDelta(desired, heli.angle), -1.5 * dt, 1.5 * dt)
  heli.rotorAngle += dt * 24; heli.recoil = Math.max(0, heli.recoil - dt * 5)
  heli.shootCooldown -= dt * 1000
  return heli.shootCooldown <= 0 && heli.losTimeMs > 650 && distance(heli.pos, jeep.pos) > 100 &&
    Math.abs(angleDelta(desired, heli.angle)) < .1 && clear(heli.pos, target, walls)
}
