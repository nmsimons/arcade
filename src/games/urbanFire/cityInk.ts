import type { Wall } from './types'

// Matte materials under soft northwest light. Raised cover has a shaded face,
// tight contact shadow and broad cast shadow; drivable surfaces stay flat.
export const CITY_INK = {
  ground: '#353e38', pavement: '#343f44', cover: '#343b34',
  face: '#494e45', marking: '#9baba6', detail: '#697868',
  court: '#454b43', sidewalk: '#a1a295', sidewalkFill: '#737b76',
  plaza: '#666e67', grass: '#4a5b3c', grassLight: '#526346',
  earth: '#645e49', ruinFloor: '#58584c', roadPaint: '#d0cdb7', lanePaint: '#c5af78',
} as const

type Shape=readonly (readonly [number,number])[]
function trace(ctx:CanvasRenderingContext2D,points:Shape){
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()
}
export function castShadow(ctx:CanvasRenderingContext2D,points:Shape,height=8){
  ctx.save();ctx.translate(height*.65,height*.9)
  ctx.shadowColor='#0a100f60';ctx.shadowBlur=Math.min(8,height*.55)
  ctx.fillStyle='#0a100f50';trace(ctx,points);ctx.fill();ctx.restore()
  ctx.save();ctx.translate(1,1.5);ctx.shadowBlur=2;ctx.shadowColor='#050b0a75'
  ctx.fillStyle='#050b0a65';trace(ctx,points);ctx.fill();ctx.restore()
}
const tone=(color:string,factor:number)=>'#'+[1,3,5].map(i=>Math.round(Math.min(255,parseInt(color.slice(i,i+2),16)*factor)).toString(16).padStart(2,'0')).join('')
export function matte(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){
  const shade=ctx.createLinearGradient(x,y,x+w*.65,y+h)
  shade.addColorStop(0,tone(color,1.08));shade.addColorStop(.48,color);shade.addColorStop(1,tone(color,.9))
  return shade
}

export function outlineCover(ctx:CanvasRenderingContext2D,points:readonly (readonly [number,number])[]){
  ctx.save();ctx.lineJoin='round';ctx.setLineDash([])
  trace(ctx,points);ctx.strokeStyle='#141c1880';ctx.lineWidth=.8;ctx.stroke();ctx.restore()
}
export function outlineRect(ctx:CanvasRenderingContext2D,{x,y,width:w,height:h}:Wall){
  outlineCover(ctx,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]])
}

// Loose terrain receives only a quiet material edge, with no hard-cover halo.
export function outlineTerrain(ctx:CanvasRenderingContext2D,points:readonly (readonly [number,number])[]){
  ctx.save();ctx.lineJoin='round';ctx.lineWidth=.6;ctx.setLineDash([])
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()
  ctx.strokeStyle='#4b473e60';ctx.stroke();ctx.restore()
}
