import { REGIONS } from './campaignWorld.ts'
import { CHAMBERS, STATION_TERRAIN } from './stationLayout.ts'
import type { Vector2 } from './types'

type RegionId = typeof REGIONS[number]['id']
type View = { x: number; y: number; w: number; h: number }
type Material = { floor: string; rock: string; seam: string }

// Near-black materials, not equipment colors. The wide feather keeps a change
// of district attached to the world, without a hard stripe across its tunnel.
const MATERIALS: Record<RegionId, Material> = {
  breach: { floor: '11,20,20', rock: '6,10,11', seam: 'rgba(120,147,146,.13)' },
  freight: { floor: '11,20,28', rock: '6,9,14', seam: 'rgba(129,154,177,.13)' },
  works: { floor: '24,19,15', rock: '11,9,7', seam: 'rgba(170,143,116,.13)' },
  ring: { floor: '18,18,30', rock: '8,8,14', seam: 'rgba(146,140,180,.14)' },
  refuge: { floor: '12,24,22', rock: '5,11,10', seam: 'rgba(139,167,159,.10)' },
  heart: { floor: '28,21,14', rock: '12,9,6', seam: 'rgba(177,148,105,.14)' },
}

const visible = ([x,y,w,h]: readonly number[], view: View) =>
  x < view.x + view.w && x + w > view.x && y < view.y + view.h && y + h > view.y

function tint(ctx: CanvasRenderingContext2D, layer: 'floor' | 'rock', view: View) {
  for (const region of REGIONS) {
    if (!visible(region.bounds, view)) continue
    const [x,y,w,h] = region.bounds, rgb = MATERIALS[region.id][layer]
    ctx.save()
    ctx.translate(x+w/2,y+h/2); ctx.scale(w/2,h/2)
    const wash = ctx.createRadialGradient(0,0,0,0,0,1)
    wash.addColorStop(0,`rgb(${rgb})`)
    wash.addColorStop(.65,`rgb(${rgb})`)
    wash.addColorStop(1,`rgba(${rgb},0)`)
    ctx.fillStyle = wash; ctx.fillRect(-1,-1,2,2)
    ctx.restore()
  }
}

export function drawRegionFloor(ctx: CanvasRenderingContext2D, view: View) {
  // The caller already clips this wash to the station floor.
  tint(ctx,'floor',view)
}

const point = (x: number, y: number): Vector2 => ({x,y})
function seams(id: RegionId, shape: Vector2[]): Vector2[][] {
  const left = Math.min(...shape.map(p=>p.x)), right = Math.max(...shape.map(p=>p.x))
  const top = Math.min(...shape.map(p=>p.y)), bottom = Math.max(...shape.map(p=>p.y))
  const cx = (left+right)/2, cy = (top+bottom)/2, w = right-left
  const extend = (p: Vector2, distance: number, sideways = 0) => {
    const dx=p.x-cx,dy=p.y-cy,length=Math.hypot(dx,dy)
    return point(p.x+(dx*distance-dy*sideways)/length,p.y+(dy*distance+dx*sideways)/length)
  }
  switch (id) {
    case 'breach':
      return [0,Math.floor(shape.length/2)].flatMap(i=>{
        const p=shape[i]
        return [[extend(p,18),extend(p,65,12),extend(p,110,-8),extend(p,180,14)],
          [extend(p,65,12),extend(p,100,50)]]
      })
    case 'freight':
      return [24,43].flatMap(offset=>[
        [point(left+w*.17,top-offset),point(left+w*.64,top-offset)],
        [point(left+w*.36,bottom+offset),point(left+w*.83,bottom+offset)],
      ])
    case 'works':
      return [24,45].flatMap(offset=>[
        [point(left-offset,cy-35),point(left-offset,top-offset),point(cx-35,top-offset)],
        [point(right+offset,cy+35),point(right+offset,bottom+offset),point(cx+35,bottom+offset)],
      ])
    case 'ring':
      return [30,65].flatMap(offset=>[0,1,2].map(part=>{
        const start=Math.floor(part*shape.length/3), count=Math.max(2,Math.floor(shape.length/4))
        return Array.from({length:count},(_,i)=>extend(shape[(start+i)%shape.length],offset))
      }))
    case 'refuge':
      return [
        [point(left-24,top+115),point(left-24,top+40),point(left+40,top-24),point(left+145,top-24)],
        [point(right+24,bottom-115),point(right+24,bottom-40),point(right-40,bottom+24),point(right-145,bottom+24)],
      ]
    case 'heart':
      return [0,1,2,3].map(part=>{
        const p=shape[Math.floor(part*shape.length/4)]
        return [extend(p,24),extend(p,78),extend(p,110,16),extend(p,160,16)]
      })
  }
}

// Static, sparse cuts in solid rock. No moving particles, floor noise, new
// obstacles, or shapes that could be mistaken for something collectible.
const ROCK_SEAMS = REGIONS.map(region=>({
  ...region, lines:region.rooms.filter(room=>room!=='arrival').flatMap(room=>seams(region.id,CHAMBERS[room])),
}))

export function drawRegionRock(ctx: CanvasRenderingContext2D, view: View) {
  ctx.save()
  ctx.beginPath(); ctx.rect(view.x,view.y,view.w,view.h)
  for (const contour of [STATION_TERRAIN.boundary,...STATION_TERRAIN.islands]) {
    contour.forEach((p,i)=>i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y))
    ctx.closePath()
  }
  // Invert the actual walkable terrain, including the rock islands. Seams
  // disappear at every corridor mouth and cannot masquerade as extra walls.
  ctx.clip('evenodd')
  tint(ctx,'rock',view)
  ctx.lineWidth=1.2; ctx.lineJoin='round'; ctx.lineCap='round'
  for (const region of ROCK_SEAMS) {
    if (!visible(region.bounds,view)) continue
    ctx.strokeStyle=MATERIALS[region.id].seam
    ctx.beginPath()
    for (const line of region.lines) line.forEach((p,i)=>i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y))
    ctx.stroke()
  }
  ctx.restore()
}
