import { bevel, drawModel } from '../model3d.ts'
import type { Outline, Part } from '../model3d'
import type { ArmorUpgrade, RepairKit, Vector2 } from './types'

const box=(w:number,h:number,corner:number):Outline=>[[-w/2+corner,-h/2],[w/2-corner,-h/2],[w/2,-h/2+corner],
  [w/2,h/2-corner],[w/2-corner,h/2],[-w/2+corner,h/2],[-w/2,h/2-corner],[-w/2,-h/2+corner]]
const smallPlate=(x:number,y:number,w:number,h:number,z:number,color:string):Part=>({
  ...bevel(box(w,h,.3),box(w-.3,h-.3,.2),color,z+.7,z),at:[x,y,0],
})
const body=bevel(box(24,19,2),box(22,17,1.5),'#7e8d69',1,-4)
const lid=bevel(box(24,19,2),box(22,17,1.5),'#dad6b6',-3.2,-6.2)
lid.markings=[{face:1,color:'#b55442',verts:[[-1.7,-5.6,-6.3],[1.7,-5.6,-6.3],[1.7,-1.7,-6.3],
  [5.6,-1.7,-6.3],[5.6,1.7,-6.3],[1.7,1.7,-6.3],[1.7,5.6,-6.3],[-1.7,5.6,-6.3],
  [-1.7,1.7,-6.3],[-5.6,1.7,-6.3],[-5.6,-1.7,-6.3],[-1.7,-1.7,-6.3]]}]
const parts:Part[]=[body,lid,
  smallPlate(-7,8,2.6,3,-4.5,'#5d6857'),smallPlate(7,8,2.6,3,-4.5,'#5d6857'),
  smallPlate(-3,-10,1.4,3,-2.8,'#495545'),smallPlate(3,-10,1.4,3,-2.8,'#495545'),
  smallPlate(0,-11,7,1.4,-2.8,'#495545')]

const armorPlate=bevel(box(25,21,3),box(23,19,2.5),'#9dabb0',-3.5,-6)
armorPlate.markings=[{face:1,color:'#ede4bd',verts:[[-4.5,-5,-6.1],[4.5,-5,-6.1],[4,1.5,-6.1],
  [0,5.5,-6.1],[-4,1.5,-6.1]]}]
const armorParts:Part[]=[
  bevel(box(27,23,1.5),box(25,21,1),'#596a60',1,-2.2),
  bevel(box(25,21,3),box(23,19,2.5),'#617b87',-1.8,-3.8),armorPlate,
  smallPlate(-8,0,2.8,22,-6.3,'#c2ae7e'),smallPlate(8,0,2.8,22,-6.3,'#c2ae7e'),
]

function drawSupply(ctx:CanvasRenderingContext2D,pos:Vector2,model:Part[],angle:number,width:number,height:number,shadow:boolean){
  ctx.save();ctx.translate(pos.x,pos.y)
  if(shadow){
    ctx.save();ctx.translate(3,4);ctx.rotate(angle)
    ctx.shadowColor='#11181180';ctx.shadowBlur=3;ctx.fillStyle='#11181170'
    ctx.beginPath();ctx.roundRect(-width/2,-height/2,width,height,2);ctx.fill();ctx.restore()
  }
  ctx.rotate(angle);drawModel(ctx,{x:0,y:0},model,[.035,-.025,0],0,1,0,'solid',angle)
  ctx.restore()
}

/** A grounded field medical case. Its painted lid is the pickup cue, with no
 * hovering icon, wire outline, pulse or light halo. */
export function drawRepairKit(ctx:CanvasRenderingContext2D,kit:RepairKit,shadow=true){
  drawSupply(ctx,kit.pos,parts,-.12,24,19,shadow)
}

/** Strapped steel armor plates, with a pale painted shield on the top plate. */
export function drawArmorUpgrade(ctx:CanvasRenderingContext2D,upgrade:ArmorUpgrade,shadow=true){
  drawSupply(ctx,upgrade.pos,armorParts,.12,27,23,shadow)
}
