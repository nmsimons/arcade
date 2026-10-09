import {athletePose,traceAthlete,withAthletePose} from '../../src/games/jumping/athlete.ts'

const tolerance=.0025
const middle=(a,b)=>a.map((value,i)=>(value+b[i])/2)

/** Sample the renderer's complete curves, including both shoe contours. */
export function athleteSkin(player){
 return withAthletePose(player,()=>sampleSkin(player))
}

function sampleSkin(player){
 const pose=athletePose(player),names=[]
 for(const name of ['backLeg','frontLeg']){
  names.push(name+':upper',name+':knee',name+':lower',name+':ankle')
  if(pose[name].rear)names.push(name+':rear-shoe')
  if((pose[name].rear??0)<1)names.push(name+':heel',name+':toe')
 }
 for(const name of ['backArm','frontArm'])names.push(name+':root',name+':upper',name+':elbow',name+':lower',name+':palm')
 names.push('torso','neck','head')
 const shapes=[]
 let points=[]
 const line=point=>{
  const previous=points.at(-1)
  if(previous){
   const count=Math.max(1,Math.ceil(Math.hypot(...point.map((v,i)=>v-previous[i]))/.25))
   for(let i=1;i<=count;i++)points.push(previous.map((v,axis)=>v+(point[axis]-v)*i/count))
  }else points.push(point)
 }
 const close=()=>{
  if(points.length>2){
   line(points[0])
   shapes.push({name:names[shapes.length],points:points.map(([x,y])=>[
    player.x+x*player.facing,player.y+y*(player.inverted?-1:1),
   ])})
  }
  points=[]
 }
 const curve=(control,depth=0)=>{
  const a=control[0],b=control.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)
  const flat=control.slice(1,-1).every(p=>(length>1e-8
   ?Math.abs(dy*(p[0]-a[0])-dx*(p[1]-a[1]))/length
   :Math.hypot(p[0]-a[0],p[1]-a[1]))<=tolerance)
  if(flat||depth>=12){line(b);return}
  const left=[a],right=[b]
  let row=control
  while(row.length>1){
   row=row.slice(1).map((p,i)=>middle(row[i],p))
   left.push(row[0]);right.unshift(row.at(-1))
  }
  curve(left,depth+1);curve(right,depth+1)
 }
 traceAthlete({
  moveTo(x,y){close();points.push([x,y])},
  lineTo(x,y){line([x,y])},
  quadraticCurveTo(cx,cy,x,y){curve([points.at(-1),[cx,cy],[x,y]])},
  bezierCurveTo(ax,ay,bx,by,x,y){curve([points.at(-1),[ax,ay],[bx,by],[x,y]])},
  ellipse(x,y,rx,ry,angle){
   close()
   const steps=Math.max(16,Math.ceil(Math.PI/Math.acos(1-Math.min(1,tolerance/Math.max(rx,ry)))))
   const cos=Math.cos(angle),sin=Math.sin(angle)
   for(let i=0;i<steps;i++){
    const t=-i*Math.PI*2/steps,u=rx*Math.cos(t),v=ry*Math.sin(t)
    line([x+u*cos-v*sin,y+u*sin+v*cos])
   }
  },
  closePath:close,
 },player)
 close()
 return shapes
}
