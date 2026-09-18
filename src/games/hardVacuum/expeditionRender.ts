import type { Expedition, ExpeditionRuntime } from './expedition'
import { CACHES, CORE_POSITION, EXPEDITION_WALLS, GATES, PICKUPS, SECTORS, SOCKETS, doorProgress, expeditionMap, sectorAt } from './expedition'
import { coreReleased, havenPosition, havenReady, regionForRoom } from './campaign'
import { BERTHS, REGIONS, STATION_HEIGHT, STATION_WIDTH, WARD_BANKS } from './campaignWorld'
import type { Ship, Vector2 } from './types'
import { drawExpeditionObject } from './objectModels'
import { drawGateFoundations, drawGateObject } from './gateRender'
import { RADIATION_SOURCES, radiationFootprint } from './radiation'
import { drawRadiationFields, drawRadiationSources } from './radiationRender'
import { drawStationInfrastructure } from './stationDetails'
import { SURVEY_CELL, surveyPoint } from './survey'
import { RECEIVER_HALF_GAP } from './receivers'
import { drawTerminals } from './terminalRender'

const LABEL_POSITIONS: Record<string, Vector2> = {
  ...Object.fromEntries(SECTORS.map(r => [r.id,{ x:r.x+r.w/2,y:r.y+r.h*.27 }])),
  haven: { x: 1470, y: 945 }, salvage: { x: 490, y: 1230 }, foundry: { x: 500, y: 430 },
  archive: { x: 1470, y: 400 }, reactor: { x: 2480, y: 1280 }, engine: { x: 2500, y: 1940 }, vault: { x: 1430, y: 1910 },
}

export function drawExpeditionWalls(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  for (const [a, b] of EXPEDITION_WALLS) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y) }
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(70, 100, 86, 0.4)'; ctx.lineWidth = 5; ctx.stroke()
  ctx.strokeStyle = 'rgba(174, 197, 181, 0.52)'; ctx.lineWidth = 1.4; ctx.stroke()
  ctx.restore()
}

export function drawExpeditionDoorFoundations(ctx: CanvasRenderingContext2D, state: Expedition) {
  for (const gate of GATES) drawGateFoundations(ctx, gate, doorProgress(state, gate.id))
}

function drawReceiverCurrent(ctx: CanvasRenderingContext2D, pos: Vector2, time: number) {
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const side of [-1, 1]) {
    const phase = time + side * 1.7 + pos.x * 0.013 + pos.y * 0.009
    // The contacts stay fixed while a narrow electrical arc moves between them.
    ctx.beginPath()
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      const x = side * (12 + (RECEIVER_HALF_GAP - 12) * u)
      const y = Math.sin(Math.PI * u) * (Math.sin(u * 39 - phase * 14) * 2.3 + Math.sin(u * 73 + phase * 21) * 1.2)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#65efb230'; ctx.lineWidth = 3; ctx.stroke()
    const pulse = (phase * 0.8) % 1
    const current = ctx.createLinearGradient(side * 12, 0, side * RECEIVER_HALF_GAP, 0)
    current.addColorStop(0, '#65efb2b0')
    current.addColorStop(Math.max(0, pulse - 0.18), '#65efb2b0')
    current.addColorStop(pulse, '#dcfff0')
    current.addColorStop(Math.min(1, pulse + 0.18), '#65efb2b0')
    current.addColorStop(1, '#65efb2b0')
    ctx.strokeStyle = current; ctx.lineWidth = 1.1; ctx.stroke()
  }
  ctx.restore()
}

export function drawExpeditionWorld(ctx: CanvasRenderingContext2D, s: Expedition, rt: ExpeditionRuntime, ship: Ship) {
  ctx.save()
  drawStationInfrastructure(ctx, s, rt.elapsed)
  for (const bank of WARD_BANKS) {
    const x = bank.x-bank.w/2, y = bank.y-bank.h/2
    ctx.fillStyle='#081310'; ctx.strokeStyle='#708f82'; ctx.lineWidth=1.2
    ctx.beginPath(); ctx.moveTo(x,y+6); ctx.lineTo(x+6,y); ctx.lineTo(x+bank.w-6,y); ctx.lineTo(x+bank.w,y+6); ctx.lineTo(x+bank.w,y+bank.h); ctx.lineTo(x,y+bank.h); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x+6,y+6); ctx.lineTo(x+bank.w-6,y+6); ctx.lineTo(x+bank.w-6,y+bank.h-6); ctx.stroke()
    ctx.fillStyle=s.complete ? '#a5ffe0' : s.power['ward-power'] ? '#65be9f' : '#827c55'
    for (let i=0;i<3;i++) ctx.fillRect(x+11+i*14,y+15,3,8)
    ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText('078',bank.x,y+39)
  }
  drawRadiationFields(ctx, expeditionMap(s), rt.elapsed)
  if (rt.docking?.id === 'haven') {
    const docking = rt.docking, t = Math.min(1, docking.time / 0.7)
    const reach = 10 + 25 * (docking.phase === 'out' ? t : 1 - t)
    ctx.save(); ctx.translate(havenPosition(s).x, havenPosition(s).y); ctx.rotate(docking.targetAngle)
    ctx.strokeStyle = '#65efb2'; ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const sign of [-1, 1]) { ctx.moveTo(-9, sign * reach); ctx.lineTo(4, sign * reach); ctx.lineTo(4, sign * (reach + 6)) }
    ctx.stroke(); ctx.restore()
  }
  for (const room of SECTORS) {
    const label = LABEL_POSITIONS[room.id]
    ctx.fillStyle = room.color + '55'; ctx.font = '13px monospace'; ctx.textAlign = 'center'
    ctx.fillText(room.name.toUpperCase(), label.x, label.y)
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
  drawRadiationSources(ctx, ship, rt.elapsed)
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
  for (const item of PICKUPS) {
    if (s.upgrades.includes(item.id) || rt.recovery?.id === item.id) continue
    const pos = rt.objects[item.id]?.pos ?? item.pos
    if (item.id === 'radiation') drawExpeditionObject(ctx, item.id, pos, {time:rt.elapsed})
  }
  CACHES.forEach((cache, variant) => {
    if (s.caches.includes(cache.id) || rt.recovery?.id === cache.id) return
    const pos = rt.objects[cache.id]?.pos ?? cache.pos
    drawExpeditionObject(ctx, 'cache', pos, { variant, time:rt.elapsed })
  })
  if (!s.core && rt.recovery?.id !== 'core') {
    const pos = rt.objects.core?.pos ?? CORE_POSITION
    drawExpeditionObject(ctx, 'core', pos, { active: coreReleased(s), time:rt.elapsed })
  }
  if (s.core && !s.complete && rt.recovery?.id !== 'core') {
    drawExpeditionObject(ctx, 'core', { x: havenPosition(s).x, y: havenPosition(s).y - 48 }, { active: true, scale: 0.6, time: rt.elapsed })
  }
  ctx.restore()
}

export function drawExpeditionMap(ctx: CanvasRenderingContext2D, s: Expedition, ship: Ship, width: number, height: number, expanded: boolean, overview = false) {
  const compact = width < 700
  const region = regionForRoom(sectorAt(ship.pos)?.id) ?? [...REGIONS].sort((a,b) => Math.hypot(ship.pos.x-a.bounds[0]-a.bounds[2]/2,ship.pos.y-a.bounds[1]-a.bounds[3]/2)-Math.hypot(ship.pos.x-b.bounds[0]-b.bounds[2]/2,ship.pos.y-b.bounds[1]-b.bounds[3]/2))[0]
  const bounds = overview ? [0,0,STATION_WIDTH,STATION_HEIGHT] : region.bounds
  const w = Math.min(width-24,960), availableHeight = Math.max(150,height-240)
  const scale = Math.min((w-20)/bounds[2],(availableHeight-35)/bounds[3])
  const h = bounds[3]*scale+35, x = (width-w)/2, y = Math.max(150,(height-h)/2)
  const point = (p: Vector2) => ({ x:width/2+(p.x-bounds[0]-bounds[2]/2)*scale,y:y+26+(p.y-bounds[1])*scale })
  ctx.save()
  if (expanded) { ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, width, height) }
  ctx.fillStyle = '#040e10ed'; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#377669'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = '#99c9bd'; ctx.textAlign = 'left'; ctx.font = `${expanded ? 12 : 9}px monospace`
  ctx.fillText(overview ? 'ORISON / STATION SURVEY' : region.name.toUpperCase(), x + 10, y + 16)
  ctx.beginPath(); ctx.rect(x+1,y+23,w-2,h-24); ctx.clip()
  const map = expeditionMap(s)
  const trace = (shape: readonly Vector2[]) => {
    shape.forEach((p, i) => { const q = point(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y) }); ctx.closePath()
  }
  // Round survey footprints reveal actual traversed geometry, with no room
  // boxes, route graph or hints about unseen rooms behind closed passages.
  ctx.save(); ctx.beginPath()
  for (const id of s.surveyed ?? []) {
    const p = point(surveyPoint(id)), radius = SURVEY_CELL * 1.25 * scale
    ctx.moveTo(p.x + radius, p.y); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
  }
  ctx.clip()
  ctx.beginPath(); trace(map.boundary)
  ctx.fillStyle = '#10241c'; ctx.fill()
  ctx.strokeStyle = '#668d7d'; ctx.lineWidth = 1.2; ctx.stroke()
  for (const shape of map.obstacles) {
    ctx.beginPath(); trace(shape); ctx.fillStyle = '#040e10'; ctx.fill()
    ctx.strokeStyle = '#668d7d'; ctx.lineWidth = 1; ctx.stroke()
  }
  for (const source of RADIATION_SOURCES) {
    const footprint = radiationFootprint(source, map).map(point)
    ctx.beginPath(); footprint.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath()
    ctx.fillStyle = '#b8a0ff40'; ctx.fill()
    const p = point(source.pos); ctx.strokeStyle = '#c1adff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 4); ctx.lineTo(p.x - 4, p.y); ctx.closePath(); ctx.stroke()
  }
  for (const berth of BERTHS) {
    if (!s.campaign.berths.includes(berth.id)) continue
    const p = point(berth.pos); ctx.strokeStyle = '#65ab91'; ctx.strokeRect(p.x-3,p.y-3,6,6)
  }
  ctx.restore()
  if (expanded && !overview) for (const room of SECTORS) {
    if (!s.visited.includes(room.id)) continue
    const p = point(LABEL_POSITIONS[room.id]); ctx.fillStyle = room.color
    ctx.font = `${compact ? 8 : 10}px monospace`; ctx.textAlign = 'center'; ctx.fillText(room.name.toUpperCase(), p.x, p.y)
  }
  if (overview) for (const region of REGIONS) {
    if (!region.rooms.some(id => s.visited.includes(id))) continue
    const p = point({x:region.bounds[0]+region.bounds[2]/2,y:region.bounds[1]+80})
    ctx.fillStyle='#8ab8a7'; ctx.font=`${compact ? 8 : 11}px monospace`; ctx.textAlign='center'; ctx.fillText(region.name.toUpperCase(),p.x,p.y)
  }
  const base = point(havenPosition(s)); ctx.fillStyle='#00ff88'; ctx.beginPath(); ctx.arc(base.x,base.y,4,0,Math.PI*2); ctx.fill()
  const p = point(ship.pos)
  ctx.translate(p.x, p.y); ctx.rotate(ship.angle)
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill()
  ctx.restore()
}
