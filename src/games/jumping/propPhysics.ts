import Matter from 'matter-js'
import type { Prop, Run } from './challenge.ts'
import type { Platform } from './model.ts'
import type { PlayerContacts } from './playerContacts.ts'
import { TUNING } from './model.ts'
import { bodyPolygon, convexParts, lineBlocked, moveBody, polygonIntersects, polygonPoints } from './geometry.ts'
import { ballShape, boxShape, propLoadsPlate } from './propGeometry.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { playerTurnAngle } from './ropeGravity.ts'
import { playerContactBody, translatePlayer } from './playerContacts.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { mechanismShape } from './mechanisms.ts'
import { flatBoxSupport } from './boxSupport.ts'
import { moveRobot, robotDrive, robotHulls, robotPlatforms } from './robotPhysics.ts'
import type { Vec } from './geometry.ts'

import { propGravity } from './gravity.ts'

const { Bodies, Body, Bounds, Collision, Composite, Engine, Events, Query, Sleeping, Vertices } = Matter
interface PropWorld { engine: Matter.Engine; bodies: Map<Prop, Matter.Body>; terrain: Matter.Body[]; mechanisms: Matter.Body[]; gravity: Map<Matter.Body, number>; driven: Set<Matter.Body> }
const worlds = new WeakMap<Run, PropWorld>()
const approach = (from: number, to: number, delta: number) => from + Math.max(-delta, Math.min(delta, to - from))
const material = { friction: .55, frictionStatic: 1.4, frictionAir: 0, restitution: 0, slop: .0001 }
const PLAYER_MASS = 2.5

function controlledHull(points: readonly Vec[]) {
  const vertices = points.map(([x, y]) => ({ x, y }))
  return Body.create({ isStatic: true, vertices, position: Vertices.centre(vertices) })
}

/** Query near-touching faces without moving a body. */
function contactProbe(body: Matter.Body, padding = .001): Matter.Body {
  const center = body.position
  const scale = 1 + padding / Math.max(1, Math.min(body.bounds.max.x - body.bounds.min.x, body.bounds.max.y - body.bounds.min.y) / 2)
  return { ...body,
    bounds: { min: { x: body.bounds.min.x - padding, y: body.bounds.min.y - padding }, max: { x: body.bounds.max.x + padding, y: body.bounds.max.y + padding } },
    vertices: body.vertices.map(v => ({ ...v, x: center.x + (v.x - center.x) * scale, y: center.y + (v.y - center.y) * scale })) }
}

function terrainBodies(s: Platform, run: Run) {
  // Bound the room's half-spaces to keep the solver's broad phase well-scaled.
  if (s.w > 1e6 || s.h > 1e6) {
    const x = Math.max(-2048, s.x), y = Math.max(-2048, s.y)
    s = { x, y, w: Math.min(run.level.width + 2048, s.x + s.w) - x, h: Math.min(run.level.floor + 2048, s.y + s.h) - y }
  }
  return convexParts(s).map(piece => {
    const vertices = piece.map(([x, y]) => ({ x, y })), position = Vertices.centre(vertices)
    return Body.create({ ...material, isStatic: true, vertices, position })
  })
}

function makeProp(b: Prop) {
  const r = b.size / 2, options = { ...material, density: b.kind === 'box' ? .002 : .001, sleepThreshold: 45 }
  const body = b.kind === 'box' ? Bodies.rectangle(b.x, b.y - r, b.size, b.size, options)
    // Circumscribe the visible circle so even the spaces between hull vertices
    // cannot clip terrain. The maximum clearance is under .13 units at size 200.
    : Body.create({ ...options, friction: 0, position: { x: b.x, y: b.y - r }, vertices: Array.from({ length: 64 }, (_, i) => {
      const angle = (i + .5) * Math.PI / 32, radius = r / Math.cos(Math.PI / 64)
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    }) })
  Body.setInertia(body, b.kind === 'box' ? body.mass * b.size ** 2 / 6 : Infinity)
  if (b.kind === 'box') Body.setAngle(body, b.angle)
  return body
}

function worldFor(run: Run) {
  const cached = worlds.get(run)
  if (cached) return cached
  const engine = Engine.create({ enableSleeping: true, positionIterations: 24, velocityIterations: 16 })
  engine.gravity.y = 1; engine.gravity.scale = TUNING.gravity / 1e6
  const terrain = run.terrain.flatMap(s => terrainBodies(s, run))
  const mechanisms = run.mechanisms.map(m => Bodies.rectangle(m.x + m.definition.w / 2, m.y + m.definition.h / 2, m.definition.w, m.definition.h, { ...material, isStatic: true }))
  const bodies = new Map(run.props.map(b => [b, makeProp(b)]))
  Composite.add(engine.world, [...terrain, ...mechanisms, ...bodies.values()])
  const world: PropWorld = { engine, terrain, mechanisms, bodies, gravity: new Map<Matter.Body, number>(), driven: new Set() }; worlds.set(run, world)
  // Correct only gravitational integration after Matter's sleeping decision,
  // before collision detection/solving. A persistent applied force would wake
  // every resting field prop forever, even when pinned against a ceiling.
  Events.on(engine, 'beforeSolve', () => {
    if (run.gravityField.strips.length) for (const body of bodies.values()) {
      if (body.isSleeping) continue
      const dy = ((world.gravity.get(body) ?? TUNING.gravity) - TUNING.gravity) * (engine.timing.lastDelta * body.timeScale / 1000) ** 2
      if (!dy) continue
      Body.translate(body, { x: 0, y: dy })
      // Translate the integrated position, preserving its pre-step position.
      const previous = (body as Matter.Body & { positionPrev: Matter.Vector }).positionPrev
      previous.y -= dy; body.velocity.y += dy
      Bounds.update(body.bounds, body.vertices, body.velocity)
    }
    // Speed-based waking cannot propagate a gentle shove into a sleeping chain:
    // the first body is stopped by its sleeping neighbor before gaining speed.
    // Wake the connected prop contacts after integration and before solving.
    engine.velocityIterations = 16
    if (!world.driven.size) return
    const queue = [...world.driven], reached = new Set(world.driven), props = [...bodies.values()]
    for (let i = 0; i < queue.length; i++) {
      const body = queue[i], probe = contactProbe(body)
      for (const hit of Query.collides(probe, props.filter(b => !reached.has(b)))) {
        const other = hit.parentA === body ? hit.parentB : hit.parentA
        reached.add(other); queue.push(other)
        if (other.isSleeping) Sleeping.set(other, false)
      }
    }
    // Woken chains have coupled constraints. Resolve their transmitted load
    // tightly enough that a blocked chain does not retain velocity into a wall.
    if (queue.length > 1) engine.velocityIterations = 32
  })
  return world
}

/** Repair placed/imported overlaps before the first rendered frame, without
 * advancing the clock, moving the player, or letting props fall in the editor. */
export function prepareProps(run: Run) {
  if (!run.props.length) return
  const world = worldFor(run), solids = [...world.terrain, ...world.mechanisms]
  for (const [prop, body] of world.bodies) {
    for (let pass = 0; pass < 32; pass++) {
      const hits = Query.collides(body, solids)
      const hit = hits.sort((a, b) => a.depth - b.depth)[0]
      if (!hit || hit.depth < 1e-7) break
      const sign = hit.bodyA === body ? 1 : -1
      let x = hit.normal.x * sign * (hit.depth + .0001), y = hit.normal.y * sign * (hit.depth + .0001)
      // Preserve authored horizontal placement when a corner clips its support.
      if (hit.normal.y * sign < -.2) { y = -(hit.depth + .0001) / Math.abs(hit.normal.y); x = 0 }
      Body.translate(body, { x, y })
    }
    prop.x = body.position.x; prop.y = body.position.y + prop.size / 2
  }
}

/** Rigid corners, angular momentum and Coulomb contact friction are resolved
 * together for terrain, moving platforms, balls and boxes. */
export function stepPropPhysics(run: Run, playerContact: PlayerContacts, dt: number, powered = run.empRemaining === 0) {
  const world = worldFor(run), push = playerContact.push
  const barriers = [...run.terrain, ...run.mechanisms.map(mechanismShape)]
  const driven = world.driven
  driven.clear()
  const robots = run.robots.map(robot => ({ robot, hulls: robotHulls(robot).map(controlledHull) }))
  const robotProbes = run.robots.filter(robot => powered && robotDrive(robot)).map(robot => ({ robot,
    hulls: robotHulls({ ...robot, x: robot.x + robot.facing * 3 }).map(controlledHull) }))
  run.mechanisms.forEach((m, i) => {
    if (Math.hypot(world.mechanisms[i].position.x - m.x - m.definition.w / 2, world.mechanisms[i].position.y - m.y - m.definition.h / 2) > 1e-7) {
      // Moving a static support must also wake its sleeping passengers.
      for (const body of world.bodies.values()) Sleeping.set(body, false)
      Body.setPosition(world.mechanisms[i], { x: m.x + m.definition.w / 2, y: m.y + m.definition.h / 2 })
    }
  })
  for (const [b, body] of world.bodies) {
    const velocity = Body.getVelocity(body), angle = b.kind === 'box' ? b.angle : 0
    const moved = Math.hypot(body.position.x - b.x, body.position.y - b.y + b.size / 2) > 1e-7 || Math.abs(body.angle - angle) > 1e-7
    const accelerated = Math.abs(velocity.x * 60 - b.vx) + Math.abs(velocity.y * 60 - b.vy) > 1e-5
    if (moved) { Body.setPosition(body, { x: b.x, y: b.y - b.size / 2 }); Body.setAngle(body, angle) }
    if (moved || accelerated) Sleeping.set(body, false)
    const gravity = propGravity(run.gravityField, b)
    if (Math.abs(gravity - (world.gravity.get(body) ?? TUNING.gravity)) > 1e-7) Sleeping.set(body, false)
    world.gravity.set(body, gravity)
    // Motors push only at an actual forward contact, using the same bounded
    // forces as the player. A charge has a faster target, never a velocity reset.
    for (const { robot, hulls } of robotProbes) {
      const touching = hulls.some(hull => {
        if (!Bounds.overlaps(body.bounds, hull.bounds)) return false
        const hit = Collision.collides(body, hull)
        const point = hit?.supports[0]
        return hit && point && hit.normal.x * (hit.bodyA === body ? 1 : -1) * robot.facing > .2
          && !lineBlocked([robot.x, robot.y - 23], [point.x, point.y], barriers)
      })
      if (!touching) continue
      driven.add(body); Sleeping.set(body, false)
      const target = robot.facing * (robot.phase === 'charge' ? (b.kind === 'ball' ? 500 : 280) : 90)
      const maximum = b.kind === 'ball' ? 3800 : 1900, response = b.kind === 'ball' ? 70 : 35
      const acceleration = Math.max(-maximum, Math.min(maximum, (target - b.vx) * response))
      Body.applyForce(body, body.position, { x: body.mass * acceleration / 1e6, y: 0 })
    }
    const contact = playerContact.body.find(c => c.collider.prop === b)
    const braced = push && playerContact.support?.collider.prop === b && push.collider.prop !== b
    if (push?.collider.prop === b || braced || contact) {
      driven.add(body)
      Sleeping.set(body, false)
    }
    if (contact?.impactSpeed) {
      // A free-flight bump exchanges normal momentum; an off-center box hit
      // also receives angular momentum. The controlled player supplies recoil.
      const [nx, ny] = contact.normal, [x, y] = contact.point
      const rx = x - body.position.x, ry = y - body.position.y
      const lever = rx * ny - ry * nx
      // Contacts are shared by solver substeps. Recompute the remaining closing
      // speed so a resolved impact cannot add the original impulse again.
      const closing = Math.max(0, -(nx * (run.player.vx - b.vx + b.angularVelocity * ry)
        + ny * (run.player.vy - b.vy - b.angularVelocity * rx)))
      const impulse = closing / (1 / PLAYER_MASS + body.inverseMass + lever * lever * body.inverseInertia)
      b.vx -= nx * impulse * body.inverseMass; b.vy -= ny * impulse * body.inverseMass
      b.angularVelocity -= lever * impulse * body.inverseInertia
      run.player.vx += nx * impulse / PLAYER_MASS; run.player.vy += ny * impulse / PLAYER_MASS
    }
    if (push?.collider.prop === b) {
      const target = push.direction * push.effort * 90
      const maximum = b.kind === 'ball' ? 3800 : 1900
      // Keep a ball's push force when a load resists it, despite its lower
      // walking-speed target. A loaded chain must not stall below that target.
      const response = b.kind === 'ball' ? 70 : 35
      const acceleration = Math.max(-maximum, Math.min(maximum, (target - b.vx) * response))
      Body.applyForce(body, body.position, { x: body.mass * acceleration / 1e6, y: 0 })
    } else if (b.kind === 'ball' && gravity !== 0 && b.grounded && !driven.has(body)) {
      // Settling drag is for an unloaded ball. Applying it during a body load
      // or braced shove cancels the player's force on large balls every step,
      // pinning the player beside walls (especially over a pressure plate).
      const onPlate = run.level.triggers.some(t => {
        if (t.mode === 'coins') return false
        const position = pressurePlatePosition(t, run.mechanisms)
        return propLoadsPlate(b, position.x, position.y, t.w, t.ceiling)
      })
      b.vx = approach(b.vx, 0, (onPlate ? 350 : 65) * dt)
    }
    if (braced) {
      // A shove needs footing. When that footing is loose, the opposite force
      // goes into it rather than treating the player's feet as a fixed anchor.
      const target = -push.direction * push.effort * 90
      const acceleration = Math.max(-900, Math.min(900, (target - b.vx) * 20))
      Body.applyForce(body, { x: run.player.x, y: run.player.y }, { x: body.mass * acceleration / 1e6, y: 0 })
    }
    if (contact && push?.collider.prop !== b) {
      // The player is a controlled body, but its normal load still belongs in
      // the prop solver. Otherwise an airborne body wedged beside a ball can
      // never separate it from a wall and keeps falling against a fixed sphere.
      const force = PLAYER_MASS * contact.load / 1e6
      Body.applyForce(body, { x: contact.point[0], y: contact.point[1] }, { x: -contact.normal[0] * force, y: -contact.normal[1] * force })
    }
    Body.setVelocity(body, { x: b.vx / 60, y: Math.max(-1000, Math.min(1000, b.vy)) / 60 })
    if (b.kind === 'box' && Math.abs(Body.getAngularVelocity(body) * 60 - b.angularVelocity) > 1e-5) Body.setAngularVelocity(body, b.angularVelocity / 60)
  }
  Engine.update(world.engine, dt * 1000)
  const p = run.player, height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const grip = p.hang ?? (p.mantle?.step ? null : p.mantle)
  const heldBox = grip ? run.props.filter(b => b.kind === 'box')[grip.platform! - run.terrain.length - run.mechanisms.length] : undefined
  const propShapes = (except: Matter.Body) => [...world.bodies].filter(([, body]) => body !== except).map(([prop, body]) => {
    const moved = { ...prop, x: body.position.x, y: body.position.y + prop.size / 2, angle: body.angle }
    return prop.kind === 'box' ? boxShape(moved) : ballShape(moved)
  })
  const transport = (x: number, y: number, source: Matter.Body) => {
    // Contact corrections change props during this solve. Sweep against their
    // current hulls, so separating one contact cannot bury the player in the
    // next prop or bot. The source receives any blocked travel below.
    const safe = moveBody([p.x, p.y], [x, y], [...barriers, ...forceFieldPlatforms(run.forceFields), ...propShapes(source), ...run.robots.flatMap(robotPlatforms)], height, p.inverted ? -1 : 1, playerTurnAngle(p))
    translatePlayer(p, safe.x - p.x, safe.y - p.y)
  }
  for (const [b, body] of world.bodies) {
    const riding = playerContact.support?.collider.prop === b
    const holding = b === heldBox
    if (!riding && !holding) continue
    const angle = b.kind === 'box' ? body.angle - b.angle : 0, x = p.x - b.x, y = p.y - b.y + b.size / 2
    transport(body.position.x + x * Math.cos(angle) - y * Math.sin(angle), body.position.y + x * Math.sin(angle) + y * Math.cos(angle), body)
  }
  const contactBody = playerContactBody(p)
  const playerHull = controlledHull(bodyPolygon(contactBody.x, contactBody.y, contactBody.height, p.inverted ? -1 : 1, playerTurnAngle(p)))
  // Props may displace the controlled player only along a clear sweep. Any
  // blocked part of that displacement is resolved back into the prop, in the
  // same iterations as prop/terrain and prop/prop contacts.
  const resolveActor = (body: Matter.Body, hull: Matter.Body, actor: { x: number; y: number }, transportActor: (x: number, y: number) => void) => {
    // Collision.collides performs SAT directly; unlike Query.collides it has no
    // broad phase. Distant 64-sided balls must not enter every correction pass.
    if (!Bounds.overlaps(body.bounds, hull.bounds)) return false
    const hit = Collision.collides(body, hull)
    if (!hit || hit.depth < 1e-7) return false
    const sign = hit.bodyA === hull ? 1 : -1
    const nx = hit.normal.x * sign, ny = hit.normal.y * sign, depth = hit.depth + .00001
    const startX = actor.x, startY = actor.y
    let blocked = depth, dx = nx * depth, dy = ny * depth
    for (let pass = 0; pass < 8; pass++) {
      const x = actor.x, y = actor.y
      transportActor(x + dx, y + dy)
      const movedX = actor.x - x, movedY = actor.y - y, separated = movedX * nx + movedY * ny
      blocked -= separated
      if (blocked <= 1e-7 || separated <= 1e-7) break
      // A floor may remove the downward component of a tilted face's push.
      // Finish separating along the available surface before treating the
      // player as pinned and transferring an impulse back to the prop.
      dx = movedX * blocked / separated; dy = movedY * blocked / separated
    }
    Body.translate(hull, { x: actor.x - startX, y: actor.y - startY })
    if (blocked > 1e-7) {
      Sleeping.set(body, false)
      Body.translate(body, { x: -nx * blocked, y: -ny * blocked })
      const point = hit.supports[0]!
      const lever = (point.x - body.position.x) * ny - (point.y - body.position.y) * nx
      const velocity = Body.getVelocity(body), angular = Body.getAngularVelocity(body)
      const into = velocity.x * nx + velocity.y * ny + angular * lever
      if (into > 0) {
        const impulse = into / (body.inverseMass + lever * lever * body.inverseInertia)
        Body.setVelocity(body, { x: velocity.x - nx * impulse * body.inverseMass, y: velocity.y - ny * impulse * body.inverseMass })
        Body.setAngularVelocity(body, angular - lever * impulse * body.inverseInertia)
      }
    }
    return true
  }
  const solids = [...world.terrain, ...world.mechanisms, ...world.bodies.values()]
  const candidates = new Map([...world.bodies.values()].map(body => [body, solids.filter(other => other !== body)]))
  // Recompute normals at joins after the solver's position iterations. A ball
  // reaching the flat floor can have a new contact that the old ramp normal
  // alone cannot separate, even with more iterations of that old contact.
  for (let pass = 0; pass < 32; pass++) {
    let corrected = false
    for (const body of world.bodies.values()) for (const hit of Query.collides(body, candidates.get(body)!)) {
      if (hit.depth < .001) continue
      const a = hit.bodyA, b = hit.bodyB, wa = a.isStatic || a.isSleeping ? 0 : a.inverseMass, wb = b.isStatic || b.isSleeping ? 0 : b.inverseMass
      if (!wa && !wb) continue
      const distance = (hit.depth - .0001) / (wa + wb)
      if (wa) Body.translate(a, { x: hit.normal.x * distance * wa, y: hit.normal.y * distance * wa })
      if (wb) Body.translate(b, { x: -hit.normal.x * distance * wb, y: -hit.normal.y * distance * wb })
      corrected = true
    }
    for (const [prop, body] of world.bodies) {
      // The authored climb clears its supporting top, just as ledgeObstacles
      // does for terrain. It cannot exert a separating force on its own support.
      if (prop !== heldBox) corrected = resolveActor(body, playerHull, p, (x, y) => {
        // Only the held support can carry a grip (above). Other bodies resolve
        // against it, just as a bot does, rather than relocating the anchor.
        if (!p.hang && (!p.mantle || p.mantle.step) && !p.climbing) transport(x, y, body)
      }) || corrected
      for (const { robot, hulls } of robots) for (const hull of hulls) {
        const moved = resolveActor(body, hull, robot, x => {
          if (!powered) return // The unpowered chassis stays solid without its motor or yielding motion.
          const props = propShapes(body)
          const oldX = p.x, oldY = p.y
          // The contacted prop can also be under a wheel. Keep it in the
          // support query so yielding does not drive the bot down through it.
          const prop = [...world.bodies].find(([, candidate]) => candidate === body)![0]
          const movedProp = { ...prop, x: body.position.x, y: body.position.y + prop.size / 2, angle: body.angle }
          const footing = prop.kind === 'box' ? boxShape(movedProp) : ballShape(movedProp)
          moveRobot([...barriers, ...props], robot, x, props, p, footing, forceFieldPlatforms(run.forceFields))
          Body.translate(playerHull, { x: p.x - oldX, y: p.y - oldY })
        })
        if (moved) {
          // Contact can change wheel height and tilt as well as position.
          robotHulls(robot).forEach((points, i) => {
            const vertices = points.map(([x, y]) => ({ x, y }))
            Body.setPosition(hulls[i], Vertices.centre(vertices)); Body.setVertices(hulls[i], vertices)
          })
          corrected = true
        }
      }
    }
    if (!corrected) break
  }
  const byBody = new Map([...world.bodies].map(([prop, body]) => [body, prop]))
  const supports = new Map<Matter.Body, Matter.Vector>()
  const contacts: Matter.Collision[] = world.engine.pairs.list.filter((pair: Matter.Pair) => pair.isActive).map((pair: Matter.Pair) => pair.collision)
  for (const body of world.bodies.values()) contacts.push(...Query.collides(body, candidates.get(body)!))
  // Validate sleeping support separately, keeping the solver's original
  // contact ordering and friction normals for awake objects. Sleep can leave
  // inactive cached pairs, so check the current hulls with a small tolerance.
  const liveContacts = contacts.filter(c => !c.bodyA.isSleeping && !c.bodyB.isSleeping)
  for (const body of world.bodies.values()) if (body.isSleeping) {
    liveContacts.push(...Query.collides(contactProbe(body, .01), candidates.get(body)!).map(hit => ({ ...hit, bodyA: hit.parentA, bodyB: hit.parentB })))
  }
  const supported = new Set<Matter.Body>()
  for (let pass = 0; pass <= run.props.length; pass++) {
    const count = supported.size
    for (const c of liveContacts) {
      const a = c.bodyA, b = c.bodyB
      const directionA = (world.gravity.get(a) ?? TUNING.gravity) < 0 ? -1 : 1
      const directionB = (world.gravity.get(b) ?? TUNING.gravity) < 0 ? -1 : 1
      if (byBody.has(a) && c.normal.y * directionA < -.3 && (b.isStatic || supported.has(b))) supported.add(a)
      if (byBody.has(b) && c.normal.y * directionB > .3 && (a.isStatic || supported.has(a))) supported.add(b)
    }
    if (supported.size === count) break
  }
  for (const [b, body] of world.bodies) if (!body.isSleeping || !supported.has(body)) b.grounded = false
  for (let pass = 0; pass <= run.props.length; pass++) {
    let changed = false
    for (const contact of contacts) {
      const a = byBody.get(contact.bodyA), b = byBody.get(contact.bodyB), ny = contact.normal.y
      const directionA = (world.gravity.get(contact.bodyA) ?? TUNING.gravity) < 0 ? -1 : 1
      const directionB = (world.gravity.get(contact.bodyB) ?? TUNING.gravity) < 0 ? -1 : 1
      if (a && ny * directionA < -.3 && (contact.bodyB.isStatic || b?.grounded) && !a.grounded) {
        a.grounded = true; changed = true; supports.set(contact.bodyA, contact.normal)
      }
      if (b && ny * directionB > .3 && (contact.bodyA.isStatic || a?.grounded) && !b.grounded) {
        b.grounded = true; changed = true; supports.set(contact.bodyB, { x: -contact.normal.x, y: -ny })
      }
    }
    if (!changed) break
  }
  for (const [b, body] of world.bodies) {
    // Low acceleration can look stationary to Matter's speed-only sleep test.
    // A body under gravity may sleep only while a real support carries it.
    const gravity = Math.abs(world.gravity.get(body) ?? TUNING.gravity)
    const falling = !b.grounded && gravity > 1e-7
    body.sleepThreshold = falling && gravity < TUNING.gravity * .05 ? 0 : 45
    if (falling && body.isSleeping) Sleeping.set(body, false)
    const normal = supports.get(body)
    // Static friction holds a settled face on a moderate slope. Checking face
    // alignment keeps corners free to tip; steep slopes keep their momentum.
    if (b.kind === 'box' && normal && !driven.has(body) && Math.abs(normal.x) > .02 && Math.abs(normal.x) < .65 * Math.abs(normal.y)
      && Math.abs(Math.sin(2 * (body.angle - Math.atan2(normal.x, -normal.y)))) < .02
      && Body.getSpeed(body) * 60 < 25 && Math.abs(Body.getAngularVelocity(body)) * 60 < .08) Sleeping.set(body, true)
    const oldX = b.x, velocity = Body.getVelocity(body)
    b.x = body.position.x; b.y = body.position.y + b.size / 2
    b.vx = velocity.x * 60; b.vy = velocity.y * 60
    if (b.kind === 'box') { b.angle = body.angle; b.angularVelocity = Body.getAngularVelocity(body) * 60 }
    else b.angle += (b.x - oldX) / (b.size / 2)
  }
  // A solver's sub-pixel resting tilt must not turn a flat box top into a slope.
  // Square only settled faces with two flat supports, without disturbing tilted
  // boxes, motion, or neighboring bodies. Keep Matter and player geometry equal.
  for (const [b, body] of world.bodies) {
    if (b.kind !== 'box' || !b.grounded || Math.hypot(b.vx, b.vy) > .5 || Math.abs(b.angularVelocity) > .005) continue
    const angle = Math.round(b.angle / (Math.PI / 2)) * (Math.PI / 2)
    if (Math.abs(b.angle - angle) > .001) continue
    const solids = [...barriers, ...run.props.filter(other => other !== b).map(other => other.kind === 'box' ? boxShape(other) : ballShape(other))]
    const y = flatBoxSupport(b, solids)
    if (y === null) continue
    const shape = boxShape({ ...b, angle, y })
    if (solids.some(s => polygonIntersects(polygonPoints(shape), s, .0001))) continue
    b.angle = angle; b.y = y
    Body.setAngle(body, angle); Body.setPosition(body, { x: b.x, y: y - b.size / 2 })
  }
}

/** A mechanism can slide along a touching prop. Only increasing penetration
 * blocks it, so rounded contacts do not act like the ball's bounding square. */
export function propBlocksMechanism(prop: Prop, before: Platform, after: Platform) {
  const body = makeProp(prop)
  const obstacles = before.profile || before.polygon ? convexParts(before).map(piece => {
    const vertices = piece.map(([x, y]) => ({ x, y }))
    return Body.create({ vertices, position: Vertices.centre(vertices) })
  }) : [Bodies.rectangle(before.x + before.w / 2, before.y + before.h / 2, before.w, before.h)]
  return obstacles.some(obstacle => {
    const previous = Collision.collides(body, obstacle)?.depth ?? 0
    Body.translate(obstacle, { x: after.x - before.x, y: after.y - before.y })
    const next = Collision.collides(body, obstacle)?.depth ?? 0
    return next > Math.max(.01, previous + .002)
  })
}

/** Smallest translation satisfying the current fixed contact normals. Solving
 * them together lets a ball roll along its floor instead of oscillating between
 * a floor correction and a nearly vertical platform correction. */
function contactTranslation(body: Matter.Body, hits: Matter.Collision[]) {
  const constraints = hits.map(hit => {
    const sign = hit.bodyA === body ? 1 : -1
    return { x: hit.normal.x * sign, y: hit.normal.y * sign, depth: Math.max(0, hit.depth + .0001) }
  })
  let best: Matter.Vector | null = null, distance = Infinity
  const consider = (x: number, y: number) => {
    const length = x * x + y * y
    if (length < distance && constraints.every(c => x * c.x + y * c.y >= c.depth - 1e-7)) {
      best = { x, y }; distance = length
    }
  }
  for (const [i, a] of constraints.entries()) {
    consider(a.x * a.depth, a.y * a.depth)
    for (const b of constraints.slice(i + 1)) {
      const determinant = a.x * b.y - a.y * b.x
      if (Math.abs(determinant) > 1e-7) consider((a.depth * b.y - a.y * b.depth) / determinant, (a.x * b.depth - a.depth * b.x) / determinant)
    }
  }
  return best
}

/** Try a mechanism step against the same hulls used by prop physics.
 * Nothing is committed until the entire contact chain has room to separate. */
export function planMechanismMotion(run: Run, index: number, next: Platform, passengers: readonly Prop[], riding: boolean, support: Prop | undefined, dt: number, boarding = false) {
  const m = run.mechanisms[index], dx = next.x - m.x, dy = next.y - m.y
  const shapes = run.mechanisms.map((other, i) => i === index ? next : mechanismShape(other))
  const fixed = [...worldFor(run).terrain, ...shapes.flatMap(s => terrainBodies(s, run))]
  const bodies = new Map(run.props.map(prop => {
    const body = makeProp(prop)
    if (passengers.includes(prop)) Body.translate(body, { x: dx, y: dy })
    // Carried objects can be stripped off by an obstacle. Uncarried boxes
    // remain obstructions; balls retain their existing rolling response.
    if (prop.kind !== 'ball' && !passengers.includes(prop)) Body.setStatic(body, true)
    return [prop, body] as const
  }))
  const movable = [...bodies].filter(([, body]) => !body.isStatic)
  const p = run.player, height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const propShapes = () => run.props.filter(prop => prop !== support).map(prop => {
    const body = bodies.get(prop)!, moved = { ...prop, x: body.position.x, y: body.position.y + prop.size / 2 }
    return prop.kind === 'ball' ? ballShape(moved) : boxShape(moved)
  })
  const playerPosition = () => {
    let position = { x: p.x + (riding ? dx : 0), y: boarding ? Math.min(p.y, next.y) : p.y + (riding ? dy : 0) }
    if (support) {
      const body = bodies.get(support)!
      position = { x: p.x + body.position.x - support.x, y: p.y + body.position.y - support.y + support.size / 2 }
    }
    if (!riding && !boarding && !support) return position
    // Carry is a requested motion, not a rigid attachment. Clip it against
    // obstacles, then check the actual mechanism contact below. A wall can
    // leave the rider behind; a ceiling/platform squeeze must still reject.
    return moveBody([p.x, p.y], [position.x, position.y],
      [...run.terrain, ...shapes.filter((_, i) => i !== index), ...forceFieldPlatforms(run.forceFields), ...propShapes()], height, p.inverted ? -1 : 1, playerTurnAngle(p))
  }
  const vertices = bodyPolygon(p.x, p.y, height, p.inverted ? -1 : 1, playerTurnAngle(p)).map(([x, y]) => ({ x, y }))
  const playerHull = Body.create({ isStatic: true, vertices, position: Vertices.centre(vertices) })
  const playerCenter = { ...playerHull.position }
  const updatePlayer = () => {
    const position = playerPosition()
    Body.setPosition(playerHull, { x: playerCenter.x + position.x - p.x, y: playerCenter.y + position.y - p.y })
  }
  const candidates = new Map(movable.map(([prop, body]) => [body,
    [...fixed, ...[...bodies.values()].filter(other => other !== body), ...(prop === support ? [] : [playerHull])]]))
  // Limit the ball's contact-driven speed. The lift can shorten its stroke
  // instead of launching a ball when it meets a nearly horizontal tangent.
  const limit = 260 * dt
  for (let pass = 0; pass < 96; pass++) {
    let corrected = false
    updatePlayer()
    for (const [prop, body] of movable) {
      const hits = Query.collides(body, candidates.get(body)!)
      const fixedHits = hits.filter(hit => hit.bodyA.isStatic || hit.bodyB.isStatic)
      if (fixedHits.some(hit => hit.depth > .001)) {
        const shift = contactTranslation(body, fixedHits)
        if (!shift) return null
        Body.translate(body, shift); corrected = true
      }
      for (const hit of Query.collides(body, [...bodies.values()].filter(other => other !== body && !other.isStatic))) {
        if (hit.depth <= .001) continue
        const a = hit.bodyA, b = hit.bodyB, wa = a.isStatic ? 0 : a.inverseMass, wb = b.isStatic ? 0 : b.inverseMass
        const distance = (hit.depth + .0001) / (wa + wb)
        if (wa) Body.translate(a, { x: hit.normal.x * distance * wa, y: hit.normal.y * distance * wa })
        if (wb) Body.translate(b, { x: -hit.normal.x * distance * wb, y: -hit.normal.y * distance * wb })
        corrected = true
      }
      if (Math.hypot(body.position.x - prop.x, body.position.y - prop.y + prop.size / 2) > limit) return null
    }
    if (!corrected) break
  }
  updatePlayer()
  // Every final hull must fit, including the rider against its own support.
  // An impossible squeeze rejects the trial instead of leaking through a wall.
  for (const [prop, body] of bodies) {
    const obstacles = candidates.get(body) ?? [...fixed, ...[...bodies.values()].filter(other => other !== body), ...(prop === support ? [] : [playerHull])]
    if (Query.collides(body, obstacles).some(hit => hit.depth > .002)) return null
  }
  if (Query.collides(playerHull, [...fixed, ...bodies.values()]).some(hit => hit.depth > .002)) return null
  const position = playerPosition(), barriers = [...run.terrain, ...shapes, ...forceFieldPlatforms(run.forceFields), ...propShapes()]
  const safe = moveBody([p.x, p.y], [position.x, position.y], barriers, height, p.inverted ? -1 : 1)
  if (Math.hypot(safe.x - position.x, safe.y - position.y) > .01) return null
  return { player: position, props: movable.map(([prop, body]) => ({ prop, x: body.position.x, y: body.position.y + prop.size / 2 })) }
}
