import Matter from 'matter-js'
import type { FloatSwitch } from './floatSwitch.ts'
import { floatBallCenter, floatTravel } from './floatSwitch.ts'

/** Project onto the rigid arm, preserving tangential momentum. Travel stops
 * absorb outward motion; water and gravity still supply the ordinary forces. */
export function constrainFloatSwitch(body: Matter.Body, definition: FloatSwitch) {
  const direction = definition.flipX ? -1 : 1, travel = floatTravel(definition)
  const raw = Math.atan2(body.position.y - definition.y, direction * (body.position.x - definition.x))
  const angle = Math.max(-travel, Math.min(travel, raw)), center = floatBallCenter(definition, angle)
  const distance = Math.hypot(body.position.x - center.x, body.position.y - center.y)
  const velocity = Matter.Body.getVelocity(body), tx = -direction * Math.sin(angle), ty = Math.cos(angle)
  let speed = velocity.x * tx + velocity.y * ty
  if (angle >= travel - 1e-8 && speed > 0 || angle <= -travel + 1e-8 && speed < 0) speed = 0
  Matter.Body.setPosition(body, center)
  Matter.Body.setVelocity(body, { x: tx * speed, y: ty * speed })
  return distance > .00001
}

export function floatSwitchConstraint(body: Matter.Body, definition: FloatSwitch) {
  return Matter.Constraint.create({ pointA: { x: definition.x, y: definition.y }, bodyB: body,
    pointB: { x: 0, y: 0 }, length: definition.armLength, stiffness: 1, damping: .04 })
}
