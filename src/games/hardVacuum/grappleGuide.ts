import type { Expedition, ExpeditionRuntime } from './expedition'
import type { Harpoon, Ship, TetherBody } from './types'
import type { CavernMap } from './worldGeometry'
import { raycastCavern } from './worldGeometry.ts'
import { HARPOON_CABLE_LENGTH } from './tuning.ts'
import { tetherReachMultiplier } from './upgrades.ts'
import { TERMINALS, terminalVisible } from './terminals.ts'

/** A short lesson at the object, remembered after the pilot makes a connection. */
export function stepGrappleGuide(s: Expedition, rt: ExpeditionRuntime, ship: Ship, hook: Harpoon, bodies: TetherBody[], map: CavernMap, dt: number, aboard=false) {
  rt.grappleHint = ''
  if (aboard) return
  if (hook.state === 'attached' && hook.rock.terminalId) return
  const reach = HARPOON_CABLE_LENGTH * tetherReachMultiplier(s)
  if (!s.campaign.terminalLinked && hook.state === 'idle' && TERMINALS.some(body =>
    Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y)<reach+40 && terminalVisible(ship.pos,body,map))) {
    rt.grappleHint = 'Point the ship’s nose at the terminal’s blue socket and press F to download its recording. F releases the cable.'
    return
  }
  if (!s.campaign.grappleLearned && hook.state === 'attached') {
    s.campaign.grappleLearned = true
    rt.grappleLesson = { remaining:12, cell:!!hook.rock.sourceId }
  }
  if (rt.grappleLesson) {
    rt.grappleLesson.remaining -= dt
    if (rt.grappleLesson.remaining <= 0) { delete rt.grappleLesson; return }
    rt.grappleHint = hook.state === 'attached'
      ? `Connected. Fly to tow; F releases the cable. ${rt.grappleLesson.cell ? 'Guide the cell between the blue power receiver’s plates.' : 'Bring cargo and ore inside Haven for recovery.'}`
      : 'Cable released. Point the nose at an object and press F to reconnect.'
    return
  }
  if (s.campaign.grappleLearned) return
  if (hook.state === 'deployed') { rt.grappleHint = 'No connection. Press F to recall the hook, then aim from the ship’s nose and try again.'; return }
  if (hook.state !== 'idle') return
  const target = bodies.filter(b => !b.socketId).map(body => ({ body, distance:Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y) }))
    .filter(({body,distance}) => distance < reach+90 && raycastCavern(ship.pos,{x:body.pos.x-ship.pos.x,y:body.pos.y-ship.pos.y},distance,map) >= distance-1)
    .sort((a,b) => Number(!!b.body.sourceId)-Number(!!a.body.sourceId) || a.distance-b.distance)[0]
  if (!target) return
  rt.grappleHint = target.distance-target.body.radius > reach
    ? 'Move closer, point the ship’s nose at the object, then press F to grapple.'
    : 'Point the ship’s nose at the object and press F to grapple. Fly to tow; F releases.'
}
