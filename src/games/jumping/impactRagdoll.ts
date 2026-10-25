import type { AthletePose } from './athlete.ts'

export type ImpactKind = 'landing' | 'repulsor'
export type ImpactJoint = 'body' | 'neck' | 'frontShoulder' | 'frontElbow' | 'backShoulder' | 'backElbow'
  | 'frontHip' | 'frontKnee' | 'backHip' | 'backKnee'
type Spring = { angle: number; speed: number }
export interface ImpactRagdoll {
  kind: ImpactKind; time: number; duration: number; facing: number; source: AthletePose
  joints: Record<ImpactJoint, Spring>
}
export const IMPACT_RAGDOLL_SECONDS = .55

// Joint limits keep the recoil articulated rather than letting elbows or knees
// turn inside out. Different inertia lets the extremities follow the torso.
const joints: Record<ImpactJoint, { inertia: number; limit: number; kick: number }> = {
  body: { inertia: 1, limit: .3, kick: .7 }, neck: { inertia: .65, limit: .4, kick: -.8 },
  frontShoulder: { inertia: 1.2, limit: .9, kick: -1.8 }, frontElbow: { inertia: .7, limit: .7, kick: 1.1 },
  backShoulder: { inertia: 1.35, limit: 1, kick: -1.3 }, backElbow: { inertia: .8, limit: .75, kick: .8 },
  frontHip: { inertia: 1.45, limit: .65, kick: .9 }, frontKnee: { inertia: .85, limit: .85, kick: -1.5 },
  backHip: { inertia: 1.6, limit: .7, kick: .65 }, backKnee: { inertia: 1, limit: .9, kick: -1.2 },
}

export function createImpactRagdoll(source: AthletePose, facing: number, kind: ImpactKind, vx: number, vy: number): ImpactRagdoll {
  const strength = Math.min(1, Math.hypot(vx, vy) / 1500)
  const direction = kind === 'landing' ? 1 : Math.sign(vx * facing) || 1
  return { source, facing, kind, time: 0, duration: IMPACT_RAGDOLL_SECONDS,
    joints: Object.fromEntries(Object.entries(joints).map(([name, joint]) => [name,
      { angle: 0, speed: joint.kick * strength * direction * 13 }])) as Record<ImpactJoint, Spring> }
}

/** Simulation only: damped angular momentum, bounded joints and a soft return
 * to the active rig. Substeps keep the response stable at any render rate. */
export function stepImpactRagdoll(motion: ImpactRagdoll, dt: number) {
  const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps
  for (let step = 0; step < steps; step++) for (const name of Object.keys(joints) as ImpactJoint[]) {
    const spring = motion.joints[name], joint = joints[name]
    spring.speed += (-100 * spring.angle - 11 * spring.speed) / joint.inertia * h
    spring.angle += spring.speed * h
    if (Math.abs(spring.angle) > joint.limit) {
      spring.angle = Math.sign(spring.angle) * joint.limit
      if (spring.speed * spring.angle > 0) spring.speed *= -.15
    }
  }
  motion.time += dt
}
