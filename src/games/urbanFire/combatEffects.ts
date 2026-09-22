import type { Bullet, Debris, Vector2 } from './types'
import type { DamageSmoke, Spark } from './appearance'
import { variation } from './sceneryGeometry.ts'

function puff(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,core:string,edge:string){
  if(r<=0)return
  const gradient=ctx.createRadialGradient(x-r*.18,y-r*.22,0,x,y,r)
  gradient.addColorStop(0,core);gradient.addColorStop(.45,edge);gradient.addColorStop(1,edge.slice(0,7)+'00')
  ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2)
}

/** Warm ballistic rounds with a solid nose and a short, soft motion smear.
 * All drawing stays anchored to the exact collision position. */
export function drawProjectile(ctx:CanvasRenderingContext2D,bullet:Bullet){
  const enemy=bullet.isEnemy,length=enemy?7.5:5.5,width=enemy?2.5:1.7
  ctx.save();ctx.translate(bullet.pos.x,bullet.pos.y);ctx.rotate(Math.atan2(bullet.vel.y,bullet.vel.x))
  const trail=ctx.createLinearGradient(-length-9,0,-length+1,0)
  trail.addColorStop(0,enemy?'#c4915400':'#d6cc9900');trail.addColorStop(1,enemy?'#df9b584a':'#e4d7a342')
  ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(-length-9,0);ctx.lineTo(-length,width*.45);ctx.lineTo(-length,-width*.45);ctx.closePath();ctx.fill()
  ctx.fillStyle='#11181450';ctx.beginPath();ctx.ellipse(-length*.5+1,2,length*.6,width*.75,0,0,Math.PI*2);ctx.fill()
  ctx.fillStyle=enemy?'#b57949':'#b8b194'
  ctx.beginPath();ctx.moveTo(1,0);ctx.lineTo(-1,-width/2);ctx.lineTo(-length,-width/2);ctx.lineTo(-length,width/2);ctx.lineTo(-1,width/2);ctx.closePath();ctx.fill()
  // A single lit top face keeps tiny rounds readable at the wider camera scale.
  ctx.fillStyle=enemy?'#f0bd79':'#e6dfbb';ctx.fillRect(-length+.7,-width*.42,length-1.2,width*.42)
  ctx.fillStyle=enemy?'#ffd19a':'#f5edcf';ctx.beginPath();ctx.ellipse(-.2,0,1.2,width*.6,0,0,Math.PI*2);ctx.fill()
  ctx.restore()
}

export function drawMuzzleBurst(ctx:CanvasRenderingContext2D,point:Vector2,angle:number,strength:number){
  if(strength<=.02)return
  ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle)
  const age=1-strength
  if(strength>.48){
    ctx.globalAlpha=Math.min(1,(strength-.48)*2.6)
    puff(ctx,4,0,10,'#f7c97690','#db914330')
    const fire=ctx.createLinearGradient(0,0,9,0)
    fire.addColorStop(0,'#fff0c7');fire.addColorStop(.38,'#f4c272');fire.addColorStop(1,'#bf683d00')
    ctx.fillStyle=fire;ctx.beginPath();ctx.ellipse(4,0,6,2.6,0,0,Math.PI*2);ctx.fill()
    ctx.fillStyle='#fff3d7';ctx.beginPath();ctx.ellipse(1.5,0,2.5,1.4,0,0,Math.PI*2);ctx.fill()
  }
  ctx.globalAlpha=Math.sin(age*Math.PI)*.35
  puff(ctx,4+age*7,-age*2,3+age*6,'#b7b29880','#777e7050')
  ctx.restore()
}

export function drawExplosion(ctx:CanvasRenderingContext2D,pos:Vector2,remaining:number,duration=1000){
  if(remaining<=0)return
  const age=Math.max(0,Math.min(1,1-remaining/duration)),spread=1-Math.exp(-age*6)
  ctx.save()
  // Ground-level dust spreads under a small rising cluster, never a shock ring.
  ctx.save();ctx.translate(pos.x,pos.y+3);ctx.scale(1,.65);ctx.globalAlpha=(1-age)*.48
  puff(ctx,0,0,12+spread*29,'#ada08070','#857b6140');ctx.restore()
  for(let i=0;i<6;i++){
    const a=i*2.4,reach=spread*(9+i*1.8)
    const x=pos.x+Math.cos(a)*reach+age*7,y=pos.y+Math.sin(a)*reach*.7-age*(9+i*2)
    ctx.globalAlpha=Math.sin(Math.min(1,age*2.8)*Math.PI/2)*(1-age)*.82
    puff(ctx,x,y,6+spread*(10+i),'#666b5bd0','#3c443cca')
  }
  if(age<.42){
    ctx.globalAlpha=Math.pow(1-age/.42,1.3)
    for(let i=0;i<4;i++){
      const a=i*2.1,r=5+spread*17
      puff(ctx,pos.x+Math.cos(a)*spread*9,pos.y+Math.sin(a)*spread*7,r,'#fff0ba','#d99a43b0')
    }
  }
  ctx.restore()
}

/** Soft engine smoke expands and rises. Worse damage makes it darker, denser
 * and longer-lived without obscuring the jeep's silhouette or its heading. */
export function drawDamageSmoke(ctx:CanvasRenderingContext2D,smoke:readonly DamageSmoke[]){
  ctx.save()
  for(const p of smoke){
    const age=p.age/p.life,fade=Math.min(1,p.age*14)*Math.pow(1-age,.9)
    const x=p.pos.x,y=p.pos.y-p.age*(10+p.severity*5),r=p.radius+p.age*(3+p.severity*3)
    ctx.globalAlpha=fade*(.5+p.severity*.4)
    puff(ctx,x,y,r,p.severity>.5?'#737667e0':'#aaa994c0',p.severity>.5?'#343d38c0':'#626f6280')
    ctx.globalAlpha*=.35
    puff(ctx,x-r*.25,y-r*.22,r*.6,'#a2a18e90','#747c6740')
  }
  ctx.restore()
}

/** Small hot fragments cool into dark flecks, rather than glowing line art. */
export function drawDamageParticles(ctx:CanvasRenderingContext2D,sparks:readonly Spark[]){
  ctx.save()
  for(const spark of sparks){
    const age=spark.age/spark.life,size=Math.max(.7,spark.length*.27)
    ctx.save();ctx.translate(spark.pos.x,spark.pos.y);ctx.rotate(Math.atan2(spark.vel.y,spark.vel.x))
    ctx.globalAlpha=1-age
    if(age<.3)puff(ctx,0,0,size*2.6,'#e9ba6260','#bb7f3e10')
    ctx.fillStyle=age<.25?'#f1d092':age<.6?'#b38950':'#5a5947'
    ctx.beginPath();ctx.ellipse(0,0,size*1.3,size*.7,0,0,Math.PI*2);ctx.fill();ctx.restore()
  }
  ctx.restore()
}

/** Effect-local deterministic variation does not consume combat randomness. */
export function createImpactDebris(x:number,y:number,count:number,seed:number,material:Debris['material']='metal',direction?:number):Debris[]{
  return Array.from({length:count+Math.ceil(count*.5)},(_,i)=>{
    const kind=i%3===0?'dust':material==='metal'&&i%4===1?'ember':'chip'
    const random=(j:number)=>variation(seed+i*43,j)
    const angle=direction===undefined?i*2.4+random(1):direction+(random(1)-.5)*2.5
    const speed=(count>=8?40:18)+random(2)*(count>=8?85:48)
    const duration=kind==='dust'?.6+random(3)*.45:kind==='ember'?.2+random(3)*.22:.85+random(3)*.6
    return {pos:{x,y},vel:{x:Math.cos(angle)*speed,y:Math.sin(angle)*speed},angle:random(4)*Math.PI*2,
      rotSpeed:(random(5)-.5)*12,life:duration*1000,duration,age:0,length:kind==='dust'?4+random(6)*3:1.5+random(6)*(count>=8?4:2),
      kind,material,height:kind==='dust'?0:2,rise:kind==='dust'?3:25+random(7)*40}
  })
}

export function stepImpactDebris(particles:Debris[],dt:number){
  if(dt<=0)return particles
  for(const p of particles){
    p.age+=dt;p.life=Math.max(0,(p.duration-p.age)*1000)
    for(let remaining=dt;remaining>1e-8;){
      const step=Math.min(remaining,1/120);remaining-=step
      const drag=p.kind==='dust'?3:p.height<=0?9:2.7
      const damping=Math.exp(-drag*step)
      p.pos.x+=p.vel.x*(1-damping)/drag;p.pos.y+=p.vel.y*(1-damping)/drag
      p.vel.x*=damping;p.vel.y*=damping
      p.angle+=p.rotSpeed*step;p.rotSpeed*=Math.exp(-(p.height<=0?8:1)*step)
      if(p.kind==='dust'){p.height+=p.rise*step;continue}
      p.height+=p.rise*step-90*step*step;p.rise-=180*step
      if(p.height<0){p.height=0;p.rise=p.rise< -15?-p.rise*.28:0}
    }
  }
  return particles.filter(p=>p.life>0)
}

export function drawImpactDebris(ctx:CanvasRenderingContext2D,particles:readonly Debris[]){
  ctx.save()
  for(const p of particles){
    const age=p.age/p.duration,fade=Math.min(1,(1-age)*3)
    ctx.save();ctx.globalAlpha=fade
    if(p.kind==='dust'){
      ctx.globalAlpha*=Math.sin(age*Math.PI)*.48
      puff(ctx,p.pos.x,p.pos.y-p.height, p.length+age*12,'#a9a28a90','#7b816b40')
    }else if(p.kind==='ember'){
      ctx.translate(p.pos.x,p.pos.y-p.height*.65);ctx.rotate(p.angle)
      ctx.fillStyle=age<.4?'#f3ce83':'#b99155';ctx.beginPath();ctx.ellipse(0,0,p.length*.55,p.length*.35,0,0,Math.PI*2);ctx.fill()
    }else{
      ctx.fillStyle='#0a140f48';ctx.beginPath();ctx.ellipse(p.pos.x+1,p.pos.y+1,p.length*.55,p.length*.3,p.angle,0,Math.PI*2);ctx.fill()
      ctx.translate(p.pos.x,p.pos.y-p.height*.65);ctx.rotate(p.angle)
      const s=p.length
      ctx.fillStyle=p.material==='masonry'?'#5d6150':'#414c3e'
      ctx.beginPath();ctx.moveTo(-s*.6,-s*.25);ctx.lineTo(s*.45,-s*.3);ctx.lineTo(s*.65,s*.35);ctx.lineTo(-s*.35,s*.48);ctx.closePath();ctx.fill()
      ctx.fillStyle=p.material==='masonry'?'#a9a48c':'#89957b'
      ctx.beginPath();ctx.moveTo(-s*.6,-s*.25);ctx.lineTo(s*.45,-s*.3);ctx.lineTo(s*.38,s*.13);ctx.lineTo(-s*.44,s*.25);ctx.closePath();ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}
