import type { Expedition, ExpeditionRuntime } from './expedition'
import { CACHES, CORE_POSITION, GATES, PICKUPS, SECTORS, SOCKETS, doorProgress, expeditionMap } from './expedition'
import { moduleInstalled } from './equipment'
import { coreReleased, havenPosition, havenReady, outerLockOpen } from './campaign'
import { BERTHS, OUTER_LOCK, REGIONS, outerLockProgress } from './campaignWorld'
import { SURVIVAL_PODS, WARD_POD_BERTHS, WARD_POD_HOUSINGS, podReleased } from './survivalPods'
import type { Ship, Vector2 } from './types'
import { drawExpeditionObject } from './objectModels'
import { drawCargo } from './cargoRender'
import { drawGateFoundations, drawGateObject } from './gateRender'
import { RADIATION_SOURCES, radiationFootprint } from './radiation'
import { drawRadiationFields, drawRadiationSources } from './radiationRender'
import { drawStationInfrastructure } from './stationDetails'
import { SURVEY_CELL, surveyPoint } from './survey'
import { drawReceiverCurrent } from './powerRender'
import { drawTerminals } from './terminalRender'
import { surveyView } from './surveyView'
import { drawIgnitionCradle } from './ignitionCradleRender'
import { drawAccessTunnel } from './accessTunnelRender'

const SURVEY_LABEL_POSITIONS: Record<string, Vector2> = {
  ...Object.fromEntries(SECTORS.map(r => [r.id,{ x:r.x+r.w/2,y:r.y+r.h*.27 }])),
  haven: { x: 1470, y: 945 }, salvage: { x: 490, y: 1230 }, foundry: { x: 500, y: 430 },
  archive: { x: 1470, y: 400 }, reactor: { x: 2480, y: 1280 }, engine: { x: 2500, y: 1940 }, vault: { x: 1430, y: 1910 },
}

export function drawExpeditionDoorFoundations(ctx: CanvasRenderingContext2D, state: Expedition) {
  for (const gate of GATES) drawGateFoundations(ctx, gate, doorProgress(state, gate.id))
  drawGateFoundations(ctx,OUTER_LOCK,outerLockProgress(outerLockOpen(state)))
}

export function drawExpeditionWorld(ctx: CanvasRenderingContext2D, s: Expedition, rt: ExpeditionRuntime, ship: Ship) {
  ctx.save()
  drawStationInfrastructure(ctx, s, rt.elapsed)
  drawAccessTunnel(ctx,outerLockOpen(s))
  for (const housing of WARD_POD_HOUSINGS) {
    ctx.fillStyle='#0b1712';ctx.strokeStyle='#708f82';ctx.lineWidth=1
    ctx.beginPath();housing.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke()
  }
  for (const [i,berth] of WARD_POD_BERTHS.entries()) {
    const locked = !podReleased(s,berth.id) && !s.rescuedPods.includes(berth.id)
    ctx.strokeStyle=locked ? '#c4ac74' : '#547d6b';ctx.lineWidth=1.5
    for(const side of [-1,1]) {
      ctx.beginPath();ctx.moveTo(berth.x+side*29,berth.y);ctx.lineTo(berth.x+side*(locked ? 16 : 28),berth.y);ctx.stroke()
    }
    ctx.font='8px monospace';ctx.textAlign='center';ctx.fillStyle=locked ? '#c4ac74' : '#789b89'
    ctx.fillText(String(i+1).padStart(2,'0'),berth.x,berth.y-berth.facing*44+3)
  }
  drawRadiationFields(ctx, expeditionMap(s), rt.elapsed, ship)
  if (rt.docking?.id === 'haven') {
    const docking = rt.docking, t = Math.min(1, docking.time / 0.7)
    const reach = 10 + 25 * (docking.phase === 'out' ? t : 1 - t)
    ctx.save(); ctx.translate(havenPosition(s).x, havenPosition(s).y); ctx.rotate(docking.targetAngle)
    ctx.strokeStyle = '#65efb2'; ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const sign of [-1, 1]) { ctx.moveTo(-9, sign * reach); ctx.lineTo(4, sign * reach); ctx.lineTo(4, sign * (reach + 6)) }
    ctx.stroke(); ctx.restore()
  }
  for (const berth of BERTHS) {
    if (berth.id === s.campaign.berth && havenReady(s)) continue
    const active = s.campaign.berths.includes(berth.id)
    ctx.save(); ctx.translate(berth.pos.x,berth.pos.y)
    ctx.strokeStyle = active ? '#67a28d' : '#394b47'; ctx.lineWidth = 1.4
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.moveTo(-12,-140); ctx.lineTo(-12,-149); ctx.lineTo(12,-149); ctx.lineTo(12,-140); ctx.stroke()
    }
    if (Math.hypot(ship.pos.x-berth.pos.x,ship.pos.y-berth.pos.y) < 500) {
      ctx.font='10px monospace'; ctx.textAlign='center'; ctx.fillStyle = active ? '#78ae9a' : '#57625f'
      ctx.fillText(active ? 'SERVICE BERTH' : 'BERTH · NO POWER',0,175)
    }
    ctx.restore()
  }
  drawTerminals(ctx,s,rt,ship)
  drawRadiationSources(ctx, ship, rt.elapsed, expeditionMap(s))
  for (const gate of GATES) {
    const progress = doorProgress(s, gate.id)
    if (progress >= 1 && gate.kind === 'rubble') continue
    drawGateObject(ctx, gate, progress)
  }
  for (const socket of SOCKETS) {
    const powered = !!s.power[socket.id]
    drawExpeditionObject(ctx, 'socket', socket.pos, { active: powered, time: rt.elapsed })
    if (powered) drawReceiverCurrent(ctx, socket.pos, rt.elapsed)
  }
  drawIgnitionCradle(ctx,s,rt)
  for (const item of PICKUPS) {
    if (moduleInstalled(s, item.id) || rt.recovery?.id === item.id) continue
    const pos = rt.objects[item.id]?.pos ?? item.pos
    drawCargo(ctx,item.id,pos,{time:rt.elapsed,laserGlow:rt.objects[item.id]?.laserGlow})
  }
  CACHES.forEach(cache => {
    if (s.caches.includes(cache.id) || rt.recovery?.id === cache.id) return
    const pos = rt.objects[cache.id]?.pos ?? cache.pos
    drawCargo(ctx,cache.id,pos,{time:rt.elapsed,laserGlow:rt.objects[cache.id]?.laserGlow})
  })
  for (const pod of SURVIVAL_PODS) {
    if (s.rescuedPods.includes(pod.id) || rt.recovery?.id===pod.id) continue
    const body=rt.objects[pod.id], released=podReleased(s,pod.id)
    drawCargo(ctx,pod.id,body?.pos ?? pod.pos,{time:released ? rt.elapsed : 0,laserGlow:body?.laserGlow})
  }
  if (!s.core) {
    const pos = rt.objects.core?.pos ?? CORE_POSITION
    drawCargo(ctx,'core',pos,{active:coreReleased(s),time:rt.coreLatch?.cargoTime ?? rt.elapsed,laserGlow:rt.objects.core?.laserGlow})
  }
  ctx.restore()
}

export function drawExpeditionMap(ctx: CanvasRenderingContext2D, s: Expedition, ship: Ship, width: number, height: number, expanded: boolean, overview = false, revealed = false, zoom = 1, focus?: Vector2) {
  const compact = width < 700
  const { region,w,h,x,y,scale,point } = surveyView(ship.pos,width,height,overview,zoom,focus)
  ctx.save()
  if (expanded) { ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, width, height) }
  ctx.fillStyle = '#040e10ed'; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#377669'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = '#99c9bd'; ctx.textAlign = 'left'; ctx.font = `${expanded ? 12 : 9}px monospace`
  const title = overview ? 'ORISON / STATION SURVEY' : region.name.toUpperCase()
  ctx.fillText(revealed ? `${title} / DEV REVEAL` : title, x + 10, y + 16)
  ctx.beginPath(); ctx.rect(x+1,y+23,w-2,h-24); ctx.clip()
  const map = expeditionMap(s)
  const trace = (shape: readonly Vector2[]) => {
    shape.forEach((p, i) => { const q = point(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y) }); ctx.closePath()
  }
  // Round survey footprints reveal actual traversed geometry, with no room
  // boxes, route graph or hints about unseen rooms behind closed passages.
  ctx.save()
  if (!revealed) {
    ctx.beginPath()
    for (const id of s.surveyed ?? []) {
      const p = point(surveyPoint(id)), radius = SURVEY_CELL * 1.25 * scale
      ctx.moveTo(p.x + radius, p.y); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    }
    ctx.clip()
  }
  ctx.beginPath(); trace(map.boundary)
  ctx.fillStyle = '#10241c'; ctx.fill()
  ctx.strokeStyle = '#668d7d'; ctx.lineWidth = 1.2; ctx.stroke()
  for (const shape of map.obstacles) {
    ctx.beginPath(); trace(shape); ctx.fillStyle = '#040e10'; ctx.fill()
    ctx.strokeStyle = '#668d7d'; ctx.lineWidth = 1; ctx.stroke()
  }
  for (const source of RADIATION_SOURCES) {
    if (map.containedRadiation?.includes(source.id)) continue
    const footprint = radiationFootprint(source, map).map(point)
    ctx.beginPath(); footprint.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath()
    ctx.fillStyle = '#b8a0ff40'; ctx.fill()
    const p = point(source.pos); ctx.strokeStyle = '#c1adff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 4); ctx.lineTo(p.x - 4, p.y); ctx.closePath(); ctx.stroke()
  }
  for (const berth of BERTHS) {
    const active = s.campaign.berths.includes(berth.id)
    if (!revealed && !active) continue
    const p = point(berth.pos); ctx.strokeStyle = active ? '#65ab91' : '#394b47'; ctx.strokeRect(p.x-3,p.y-3,6,6)
  }
  // These contacts respect the same survey clip as the walls; never reveal an
  // unexplored room, but make a missed pod recognizable when returning later.
  for (const pod of SURVIVAL_PODS) {
    if (s.rescuedPods.includes(pod.id)) continue
    const p=point(s.cargo?.[pod.id]?.pos ?? pod.pos)
    ctx.strokeStyle=podReleased(s,pod.id) ? '#a0ffd0' : '#c4ac74';ctx.lineWidth=1
    ctx.strokeRect(p.x-2,p.y-3,4,6)
  }
  ctx.restore()
  if (expanded && !overview) for (const room of SECTORS) {
    if (!revealed && !s.visited.includes(room.id)) continue
    const p = point(SURVEY_LABEL_POSITIONS[room.id]); ctx.fillStyle = room.color
    ctx.font = `${compact ? 8 : 10}px monospace`; ctx.textAlign = 'center'; ctx.fillText(room.name.toUpperCase(), p.x, p.y)
  }
  if (overview) for (const region of REGIONS) {
    if (!revealed && !region.rooms.some(id => s.visited.includes(id))) continue
    const p = point({x:region.bounds[0]+region.bounds[2]/2,y:region.bounds[1]+80})
    ctx.fillStyle='#8ab8a7'; ctx.font=`${compact ? 8 : 11}px monospace`; ctx.textAlign='center'; ctx.fillText(region.name.toUpperCase(),p.x,p.y)
  }
  const base = point(havenPosition(s)); ctx.fillStyle='#00ff88'; ctx.beginPath(); ctx.arc(base.x,base.y,4,0,Math.PI*2); ctx.fill()
  const p = point(ship.pos)
  ctx.translate(p.x, p.y); ctx.rotate(ship.angle)
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill()
  ctx.restore()
}
