import type { Expedition, ExpeditionRuntime } from './expedition'
import { identifyBody } from './bodyDefinitions.ts'

export const HAVEN_LINK_RETRACT_SECONDS = 1.2
/** The commissioning socket sits in the center of Haven's deployed ring. */
export const havenLinkPosition = (s: Expedition) => ({...s.campaign.haven})
export const havenLinkDeployment = (s: Expedition, rt: Pick<ExpeditionRuntime,'havenLinkRetraction'>) =>
  !s.campaign.havenActivated || s.campaign.havenLinkPending ? 1 :
    rt.havenLinkRetraction === undefined ? 0 : Math.max(0,1-rt.havenLinkRetraction/HAVEN_LINK_RETRACT_SECONDS)

export function havenLinkTargets(s: Expedition, rt: ExpeditionRuntime) {
  if (s.campaign.havenActivated && !s.campaign.havenLinkPending) return []
  rt.havenLink ??= identifyBody({pos:havenLinkPosition(s),vel:{x:0,y:0},radius:16},{type:'haven-link'})
  rt.havenLink.pos=havenLinkPosition(s)
  return [rt.havenLink]
}

/** Commit retirement on disconnect, not on activation or a presentation timer. */
export function retireHavenLink(s: Expedition, rt: ExpeditionRuntime) {
  if (!s.campaign.havenActivated || !s.campaign.havenLinkPending) return false
  delete s.campaign.havenLinkPending
  rt.havenLinkRetraction=0
  if (rt.connectedTerminal==='first-light') delete rt.connectedTerminal
  return true
}

export function stepHavenLinkRetraction(rt: ExpeditionRuntime, dt: number) {
  if (rt.havenLinkRetraction === undefined) return
  rt.havenLinkRetraction+=dt
  if (rt.havenLinkRetraction>=HAVEN_LINK_RETRACT_SECONDS) delete rt.havenLinkRetraction
}
