import type { Expedition, ExpeditionRuntime } from './expedition'
import type { Harpoon, Ship, TetherBody } from './types'
import type { CavernMap } from './worldGeometry'
import { raycastCavern } from './worldGeometry.ts'
import { HARPOON_CABLE_LENGTH } from './tuning.ts'
import { TERMINALS, terminalVisible } from './terminals.ts'
import { POD_RESCUE_CREDITS_LABEL, SURVIVAL_PODS, podReleased, survivalPod } from './survivalPods.ts'

/** A short lesson at the object, remembered after the pilot makes a connection. */
export function stepGrappleGuide(s: Expedition, rt: ExpeditionRuntime, ship: Ship, hook: Harpoon, bodies: TetherBody[], map: CavernMap, dt: number, aboard=false) {
  rt.grappleHint = ''
  if (aboard) return
  if (!s.campaign.havenActivated) {
    rt.grappleHint=!s.visited.includes('breach')
      ? 'Follow the tunnel left to Haven in the Breach. Connect your tether to wake her and enable recovery. Until then, death restarts the expedition. Fly gently; S brakes or reverses.'
      : hook.state==='deployed' ? 'The hook missed. Press F to recall it, then aim at the blue socket in Haven’s center. Until you connect, there is no recovery.'
      : hook.state==='attached' ? 'That is not Haven’s activation socket. F releases the cable. Aim at the blue socket in her center and press F to connect.'
      : 'Haven is dormant. Point your nose at the blue socket in her center and press F to connect your tether. This activates Haven and enables recovery if your ship is lost.'
    return
  }
  // Connected recordings own the message panel for as long as the cable stays on.
  if (hook.state === 'attached' && (hook.rock.terminalId || rt.connectedTerminal==='first-light')) return
  if (s.campaign.havenLinkPending && hook.state!=='attached' && Math.hypot(ship.pos.x-s.campaign.haven.x,ship.pos.y-s.campaign.haven.y)<400) {
    rt.grappleHint='Haven is online. Point your nose at the blue socket in her center and press F to reconnect and hear her message. Disconnect when finished to retract the link permanently.'
    return
  }
  const reach = HARPOON_CABLE_LENGTH
  const impactModule = bodies.find(body => body.cargoId === 'impact')
  if (!s.impactShieldInstalled && impactModule && (Math.hypot(impactModule.pos.x-ship.pos.x,impactModule.pos.y-ship.pos.y)<600 || rt.recovery?.id==='impact')) {
    if (rt.recovery?.id === 'impact') rt.grappleHint = 'Haven is installing the impact shield. Wait for the recovery shutters to seal.'
    else if (hook.state === 'attached' && hook.rock === impactModule) {
      s.campaign.grappleLearned = true
      rt.grappleHint = 'Impact shield connected. Fly slowly to tow it back to Haven; S brakes or reverses. Keep the green module close while Haven takes it in. F releases the cable.'
    } else if (hook.state === 'deployed') rt.grappleHint = 'The hook missed. Press F to recall it, then point the nose at the green impact-shield module and try again.'
    else if (hook.state === 'attached') rt.grappleHint = 'This is not the impact shield. F releases the cable. Bring the green shield module to Haven to install it first.'
    else rt.grappleHint = impactModule.tethered
      ? 'Impact shield released. Point the nose at the green module and press F to reconnect, then tow it close to Haven for installation.'
      : 'Recover the green module from the rescue locker west of Haven. Point the ship’s nose at it and press F to grapple. Fly gently; S brakes or reverses.'
    return
  }
  if (!s.impactShieldInstalled && impactModule && !impactModule.tethered && hook.state === 'idle') {
    rt.grappleHint = 'Your impact shield is in the rescue locker. Fly through the passage west of Haven to find the green module. Fly gently; S brakes or reverses.'
    return
  }
  if (hook.state === 'attached' && survivalPod(hook.rock.cargoId)) {
    rt.grappleHint = `Survival pod connected. Tow it close and slow to Haven. Wait for the shutters to seal: one survivor aboard, one berth light, ${POD_RESCUE_CREDITS_LABEL} credits. F releases the cable.`
    return
  }
  if (hook.state === 'idle') {
    const locked = SURVIVAL_PODS.some(pod => !podReleased(s,pod.id) && Math.hypot(pod.pos.x-ship.pos.x,pod.pos.y-ship.pos.y)<160)
    const nearby = bodies.some(body => survivalPod(body.cargoId) && !body.retrieving && Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y)<220 && raycastCavern(ship.pos,{x:body.pos.x-ship.pos.x,y:body.pos.y-ship.pos.y},Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y),map)>=Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y)-1)
    if (locked) { rt.grappleHint = 'Survival pods locked in their cradles. Power the ward receiver to release them and open the direct return to Haven.'; return }
    if (nearby && s.rescuedPods.length===0) { rt.grappleHint = `Life sign detected. Point the nose at the survival pod and press F to grapple. Tow it to Haven to rescue its occupant and bank ${POD_RESCUE_CREDITS_LABEL} credits.`; return }
  }
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
