import { OUTER_LOCK } from './campaignWorld.ts'
import type { BerthId } from './campaignWorld'
import type { Vector2 } from './types'

export interface WayfindingSign {
  region: BerthId
  lines: readonly string[]
  pos: Vector2
  direction: Vector2
}

export const BREACH_ANCHORAGE_SIGN: WayfindingSign = {
  region:'breach',lines:['BREACH ANCHORAGE'],pos:{x:(8670+OUTER_LOCK.x)/2,y:2900},direction:{x:-1,y:0},
}

/** One destination stencil per primary regional approach, not every room or puzzle. */
export const REGION_ENTRY_SIGNS: readonly WayfindingSign[] = [
  {region:'freight',lines:['FREIGHT','GALLERIES'],pos:{x:8000,y:2940},direction:{x:0,y:-1}},
  {region:'works',lines:['THE WORKS'],pos:{x:6600,y:1150},direction:{x:-1,y:0}},
  {region:'ring',lines:['THE BROKEN RING'],pos:{x:3300,y:660},direction:{x:-1,y:0}},
  {region:'refuge',lines:['REFUGE','APPROACH'],pos:{x:1500,y:2050},direction:{x:0,y:1}},
  {region:'heart',lines:['THE HEART'],pos:{x:2930,y:3500},direction:{x:1,y:0}},
]

export const WAYFINDING_STYLE = {font:'600 20px monospace',color:'#9bb6a7',lineHeight:24} as const
const ARROW = [[-40,0],[-16,-20],[-16,-6],[40,-6],[40,6],[-16,6],[-16,20]] as const

/** Keep lettering upright and center the complete sign, including a rotated arrow. */
export function wayfindingLayout(sign: WayfindingSign) {
  const angle=Math.atan2(sign.direction.y,sign.direction.x)-Math.PI
  const cos=Math.cos(angle),sin=Math.sin(angle)
  const arrow=ARROW.map(([x,y])=>({x:x*cos-y*sin,y:x*sin+y*cos}))
  const top=Math.min(...arrow.map(p=>p.y)),bottom=Math.max(...arrow.map(p=>p.y))
  const textHeight=20+(sign.lines.length-1)*WAYFINDING_STYLE.lineHeight
  const height=textHeight+6+bottom-top
  const textY=1-height/2+10,arrowY=1+height/2-bottom
  return {textY,arrow:arrow.map(p=>({x:p.x,y:p.y+arrowY}))}
}

export function drawWayfindingSign(ctx: CanvasRenderingContext2D, sign: WayfindingSign) {
  const layout=wayfindingLayout(sign)
  ctx.save();ctx.translate(sign.pos.x,sign.pos.y)
  ctx.font=WAYFINDING_STYLE.font;ctx.fillStyle=WAYFINDING_STYLE.color
  ctx.textAlign='center';ctx.textBaseline='middle'
  sign.lines.forEach((line,i)=>ctx.fillText(line,0,layout.textY+i*WAYFINDING_STYLE.lineHeight))
  ctx.beginPath()
  layout.arrow.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y))
  ctx.closePath();ctx.fill();ctx.restore()
}
