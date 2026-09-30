import { TANK_DROP } from './reinforcements.ts'
import { drawTankModel, drawVehicleShadow } from './vehicleModels.ts'
import { drawArmorUpgrade, drawRepairKit } from './pickupModel.ts'
import { SUPPLY_DROP } from './supplies.ts'
import type { VehicleVisuals } from './appearance'
import type { ArmorUpgrade, RepairKit, Tank, Vector2 } from './types'

function puff(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,core:string,edge:string){
  const gradient=ctx.createRadialGradient(x-r*.2,y-r*.2,0,x,y,r)
  gradient.addColorStop(0,core);gradient.addColorStop(.55,edge);gradient.addColorStop(1,edge.slice(0,7)+'00')
  ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2)
}

function landingSmoke(ctx:CanvasRenderingContext2D,tank:Tank){
  const a=tank.arrival!,time=a.elapsed+TANK_DROP.warning
  const fade=Math.min(1,time*3)*(a.landed?Math.max(0,1-(a.elapsed-TANK_DROP.descent)/TANK_DROP.settle):1)
  if(fade<=0)return
  ctx.save();ctx.translate(tank.pos.x+32,tank.pos.y+24);ctx.globalAlpha=fade
  ctx.fillStyle='#3d4038';ctx.fillRect(-2,-2,4,5)
  ctx.fillStyle='#e28a5e';ctx.fillRect(-1.5,-2,3,2)
  for(let i=0;i<7;i++){
    const age=((time*.48+i/7)%1),r=3+age*9
    ctx.globalAlpha=fade*Math.sin(age*Math.PI)*.38
    puff(ctx,age*10+Math.sin(i*2.4)*2,-age*25,r,'#b76b4ea0','#7f4d3d80')
  }
  ctx.restore()
}

function landingDust(ctx:CanvasRenderingContext2D,pos:Vector2,age:number,duration:number,size=1){
  if(age<0||age>duration)return
  const spread=1-Math.exp(-age*8)
  ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(size,size*.7)
  for(let i=0;i<9;i++){
    const angle=i*2.4,reach=12+spread*(15+i%3*4)
    ctx.globalAlpha=(1-age/duration)*.48
    puff(ctx,Math.cos(angle)*reach,Math.sin(angle)*reach,4+spread*10,'#b8ac87a0','#8d8c7160')
  }
  ctx.restore()
}

function roundCanopy(ctx:CanvasRenderingContext2D,radius:number,phase:number){
  ctx.save();ctx.rotate(Math.sin(phase)*.045)
  const fabric=ctx.createRadialGradient(-radius*.3,-radius*.35,0,0,0,radius*1.1)
  fabric.addColorStop(0,'#d5cfb0');fabric.addColorStop(.55,'#b5b59a');fabric.addColorStop(1,'#74846b')
  ctx.fillStyle=fabric;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill()
  // Eight broad fabric gores radiate from a small center vent. Subtle seams
  // and fixed northwest lighting describe a round canopy seen from overhead.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,b=a+Math.PI/4
    ctx.fillStyle=i%2?'#e5dcc619':'#3f5b4915'
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,a,b);ctx.closePath();ctx.fill()
    ctx.strokeStyle='#4f624b35';ctx.lineWidth=.65
    ctx.beginPath();ctx.moveTo(Math.cos(a)*3,Math.sin(a)*3)
    ctx.quadraticCurveTo(Math.cos(a+.05)*radius*.55,Math.sin(a+.05)*radius*.55,Math.cos(a)*radius,Math.sin(a)*radius);ctx.stroke()
  }
  ctx.strokeStyle='#56685080';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke()
  ctx.fillStyle='#626f5a';ctx.beginPath();ctx.arc(0,0,Math.max(1.5,radius*.06),0,Math.PI*2);ctx.fill()
  ctx.restore()
}

/** A shaded cargo canopy and real suspension lines make the descent legible
 * above the miniature city. On contact the fabric slackens, drifts and fades. */
export function drawTankCanopy(ctx:CanvasRenderingContext2D,tank:Tank){
  if(!tank.arrival||tank.arrival.elapsed<0)return
  const a=tank.arrival!,settle=Math.max(0,(a.elapsed-TANK_DROP.descent)/TANK_DROP.settle)
  const alpha=Math.min(1,a.elapsed/.22)*Math.max(0,1-settle)
  if(alpha<=0)return
  const height=a.height*.8,cx=tank.pos.x+Math.sin(a.elapsed*1.9+tank.role)*5+settle*24
  const cy=tank.pos.y-height-63+settle*29,sx=1+settle*.3,sy=1-settle*.8
  ctx.save();ctx.globalAlpha=alpha
  ctx.strokeStyle='#b9b7a090';ctx.lineWidth=.8
  const c=Math.cos(tank.angle),s=Math.sin(tank.angle)
  for(const [x,y] of [[-14,-11],[14,-11],[-14,11],[14,11]]){
    const tx=tank.pos.x+x*c-y*s,ty=tank.pos.y+x*s+y*c-height
    const side=Math.sign(tx-tank.pos.x)||1
    ctx.beginPath();ctx.moveTo(tx,ty)
    ctx.quadraticCurveTo((tx+cx+side*34*sx)/2,cy+40+settle*20,cx+side*34*sx,cy+30*sy);ctx.stroke()
  }
  ctx.translate(cx,cy);ctx.scale(sx,sy)
  roundCanopy(ctx,46,a.elapsed+tank.role)
  ctx.restore()
}

export function drawTankArrivalGround(ctx:CanvasRenderingContext2D,tank:Tank){
  const arrival=tank.arrival
  if(!arrival||arrival.elapsed< -TANK_DROP.warning)return
  landingSmoke(ctx,tank)
  if(arrival.elapsed<0)return
  landingDust(ctx,tank.pos,arrival.elapsed-TANK_DROP.descent,TANK_DROP.settle)
}

export function drawTankArrival(ctx:CanvasRenderingContext2D,tank:Tank,visuals:VehicleVisuals){
  drawTankArrivalGround(ctx,tank);drawVehicleShadow(ctx,tank,'tank')
  drawTankModel(ctx,tank,visuals,false);drawTankCanopy(ctx,tank)
}

export function drawSupplyArrivalGround(ctx:CanvasRenderingContext2D,item:ArmorUpgrade|RepairKit){
  const a=item.arrival
  if(!a||a.elapsed<0)return
  const fade=Math.min(1,a.elapsed/.16),height=a.height*.8
  landingDust(ctx,item.pos,a.elapsed-SUPPLY_DROP.descent,SUPPLY_DROP.settle,.45)
  ctx.save();ctx.globalAlpha=fade
  if(height>0){
    ctx.save();ctx.globalAlpha*=.65-a.height/300;ctx.fillStyle='#111b1780';ctx.shadowBlur=3+a.height*.02;ctx.shadowColor='#111b1740'
    ctx.beginPath();ctx.ellipse(item.pos.x+a.height*.2,item.pos.y+a.height*.15,15,12,.12,0,Math.PI*2);ctx.fill();ctx.restore()
  }
  ctx.restore()
}

export function drawSupplyCargo(ctx:CanvasRenderingContext2D,item:ArmorUpgrade|RepairKit,kind:'health'|'armor'){
  const a=item.arrival
  if(!a||a.elapsed<0)return
  const height=a.height*.8
  ctx.save();ctx.globalAlpha=Math.min(1,a.elapsed/.16)
  ctx.translate(item.pos.x,item.pos.y-height);ctx.scale(1+a.height*.001,1+a.height*.001)
  if(kind==='health')drawRepairKit(ctx,{...(item as RepairKit),pos:{x:0,y:0}},height===0)
  else drawArmorUpgrade(ctx,{...item,pos:{x:0,y:0}},height===0)
  ctx.restore()
}

export function drawSupplyCanopy(ctx:CanvasRenderingContext2D,item:ArmorUpgrade|RepairKit){
  const a=item.arrival
  if(!a||a.elapsed<0)return
  const settle=Math.max(0,(a.elapsed-SUPPLY_DROP.descent)/SUPPLY_DROP.settle),height=a.height*.8
  ctx.save();ctx.globalAlpha=Math.min(1,a.elapsed/.16)*Math.max(0,1-settle)
  if(ctx.globalAlpha<=0){ctx.restore();return}
  const cx=item.pos.x+Math.sin(a.elapsed*2)*3+settle*17,cy=item.pos.y-height-35+settle*15
  ctx.strokeStyle='#b9b7a090';ctx.lineWidth=.6
  for(const side of [-1,1])for(const y of [-7,7]){
    ctx.beginPath();ctx.moveTo(item.pos.x+side*10,item.pos.y+y-height)
    ctx.quadraticCurveTo(cx+side*13,cy+28,cx+side*17,cy+15);ctx.stroke()
  }
  ctx.translate(cx,cy);ctx.scale(1+settle*.3,1-settle*.8)
  roundCanopy(ctx,24,a.elapsed)
  ctx.restore()
}

export function drawSupplyArrival(ctx:CanvasRenderingContext2D,item:ArmorUpgrade|RepairKit,kind:'health'|'armor'){
  drawSupplyArrivalGround(ctx,item);drawSupplyCargo(ctx,item,kind);drawSupplyCanopy(ctx,item)
}
