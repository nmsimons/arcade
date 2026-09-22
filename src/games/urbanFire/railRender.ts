import { FIELD } from './types.ts'
import { ROADS } from './cityPlan.ts'
import { SCENERY_MARGIN } from './perimeter.ts'
import { line, polygon, variation } from './sceneryGeometry.ts'

type Cargo = 'box' | 'tank' | 'flat' | 'gondola'
const RAIL={edge:'#8e9d82',line:'#566e5d',dark:'#101e19',steel:'#344a3c'}

function chassis(ctx:CanvasRenderingContext2D,length:number){
  // Bogies project beyond the body, so these read as rail vehicles from above.
  ctx.save();ctx.shadowColor='#080f0c65';ctx.shadowBlur=5
  ctx.fillStyle='#080f0c60';ctx.fillRect(5,-8,length,30);ctx.restore()
  ctx.fillStyle='#203027';ctx.fillRect(0,-13,length,26)
  ctx.strokeStyle='#76836c';ctx.lineWidth=.8
  for(const x of [13,length-20]){
    ctx.fillStyle='#0b1511';ctx.fillRect(x-5,-17,18,34)
    for(const dx of [0,9])for(const y of [-18,14]){
      ctx.fillStyle='#23372c';ctx.fillRect(x+dx-3,y,6,4)
      line(ctx,x+dx-2,y+1,x+dx+2,y+1)
    }
  }
  ctx.strokeStyle='#839076';ctx.lineWidth=2
  line(ctx,-5,0,0,0);line(ctx,length,0,length+5,0)
  ctx.fillStyle='#52654f';ctx.fillRect(-6,-2,3,4);ctx.fillRect(length+3,-2,3,4)
}

function locomotive(ctx:CanvasRenderingContext2D){
  chassis(ctx,102)
  ctx.lineWidth=1
  // Clipped nose, forward cab, long engine hood, and side running boards.
  polygon(ctx,[[0,-8],[6,-15],[96,-15],[102,-10],[102,10],[96,15],[6,15],[0,8]],'#5b6d58',RAIL.edge)
  ctx.fillStyle='#111f18';ctx.fillRect(29,-12,64,24)
  polygon(ctx,[[31,-10],[90,-10],[94,-6],[94,8],[31,8]],'#819173',RAIL.line)
  polygon(ctx,[[31,8],[94,8],[94,12],[31,12]],'#172b21')
  // One radiator grille and two roof fans, contained on the engine hood.
  ctx.fillStyle='#182c20';ctx.fillRect(73,-7,14,12)
  ctx.strokeStyle='#82957475';ctx.lineWidth=.6
  for(let x=76;x<87;x+=3)line(ctx,x,-6,x,4)
  for(const x of [43,60]){
    ctx.fillStyle='#22362a';ctx.beginPath();ctx.arc(x,-1,5,0,Math.PI*2);ctx.fill();ctx.stroke()
    line(ctx,x-3,-1,x+3,-1);line(ctx,x,-4,x,2)
  }
  polygon(ctx,[[8,-13],[25,-13],[30,-9],[30,11],[8,11],[5,6],[5,-7]],'#a1a588','#9ba385')
  polygon(ctx,[[5,-7],[8,-11],[11,-8],[11,6],[8,9],[5,6]],'#527779','#a9bbae70')
  ctx.fillStyle='#172d27';ctx.fillRect(23,-9,5,6);ctx.fillRect(23,3,5,6)
  ctx.strokeStyle='#93a485';line(ctx,32,-13,95,-13)
  ctx.strokeStyle='#a5a77b';ctx.lineWidth=1
  for(const y of [-10,10])line(ctx,0,y,5,y)
  ctx.fillStyle='#d0c39a';ctx.fillRect(1,-4,2,2);ctx.fillRect(1,3,2,2)
}

function freightCar(ctx:CanvasRenderingContext2D,kind:Cargo,index:number){
  chassis(ctx,78);ctx.lineWidth=.8
  if(kind==='tank'){
    // Rounded tank ends, a lit central barrel, saddles, and a single access dome.
    ctx.fillStyle='#516b5c';ctx.strokeStyle=RAIL.edge
    ctx.beginPath();ctx.roundRect(2,-13,74,26,12);ctx.fill();ctx.stroke()
    ctx.fillStyle='#83967b';ctx.beginPath();ctx.roundRect(5,-10,68,14,7);ctx.fill()
    ctx.strokeStyle='#82967c';line(ctx,14,-11,63,-11)
    ctx.strokeStyle='#152e24';ctx.lineWidth=2
    for(const x of [17,60])line(ctx,x,-12,x,12)
    ctx.lineWidth=.8;ctx.fillStyle='#1a3027';ctx.strokeStyle='#80967d'
    ctx.beginPath();ctx.arc(39,-2,4,0,Math.PI*2);ctx.fill();ctx.stroke()
    ctx.strokeStyle='#697957';line(ctx,43,1,43,11)
    for(const y of [4,7,10])line(ctx,40,y,46,y)
    polygon(ctx,[[56,2],[59,5],[56,8],[53,5]],'#b3a36b')
  }else if(kind==='gondola'){
    polygon(ctx,[[1,-14],[77,-14],[77,14],[1,14]],'#7d8065',RAIL.edge)
    ctx.fillStyle='#101c17';ctx.fillRect(5,-10,68,19)
    for(let j=0;j<7;j++){
      const x=9+j*9,y=-3+variation(index,j)*8
      polygon(ctx,[[x-4,y],[x,y-6],[x+7,y-3],[x+5,y+5],[x-2,y+5]],j%2?'#293a2e':'#68745e','#5d6c4b70')
    }
    ctx.strokeStyle='#839173';line(ctx,3,-12,75,-12)
    ctx.strokeStyle='#58654a';for(const x of [5,28,51,74])line(ctx,x,10,x,14)
  }else if(kind==='flat'){
    polygon(ctx,[[1,-13],[77,-13],[77,13],[1,13]],'#263c32',RAIL.line)
    // A short sealed container leaves an exposed timber deck at each end.
    ctx.strokeStyle='#716d4f';for(const x of [5,9,68,72])line(ctx,x,-10,x,10)
    polygon(ctx,[[14,-12],[63,-12],[66,-9],[66,11],[14,11]],'#aaa077','#a7a079')
    polygon(ctx,[[14,7],[66,7],[66,11],[14,11]],'#3a4230')
    ctx.strokeStyle='#c0b78a65';line(ctx,16,-10,62,-10)
    ctx.strokeStyle='#3d4835';for(const x of [20,34,48,60])line(ctx,x,-7,x,5)
  }else{
    const roof=index%2?'#829174':'#9b9673'
    polygon(ctx,[[2,-11],[6,-15],[72,-15],[77,-10],[77,11],[73,15],[5,15],[2,10]],'#243729',RAIL.edge)
    polygon(ctx,[[6,-12],[72,-12],[74,-7],[74,8],[6,8],[4,4],[4,-7]],roof)
    ctx.strokeStyle='#a4ae8370';line(ctx,7,-11,71,-11)
    ctx.strokeStyle='#344730';line(ctx,7,-2,72,-2)
    ctx.fillStyle='#13281d';ctx.fillRect(31,9,18,5)
    ctx.strokeStyle='#798768';line(ctx,33,10,46,10)
    for(const x of [8,23,54,70])line(ctx,x,10,x,14)
  }
}

function consist(ctx:CanvasRenderingContext2D,x:number,y:number,cars:Cargo[]){
  ctx.save();ctx.translate(x,y);locomotive(ctx)
  for(const [i,kind] of cars.entries()){
    ctx.save();ctx.translate(114+i*90,0);freightCar(ctx,kind,i);ctx.restore()
    ctx.strokeStyle='#6c785f';ctx.lineWidth=2;line(ctx,105+i*90,0,109+i*90,0)
  }
  ctx.restore()
}

export function drawRailway(ctx:CanvasRenderingContext2D){
  const left=-SCENERY_MARGIN,right=FIELD.width+SCENERY_MARGIN
  ctx.save();ctx.lineWidth=.8
  ctx.fillStyle='#41483b';ctx.fillRect(left,-301,right-left,100)
  for(const y of [-272,-226]){
    ctx.fillStyle='#545c49';ctx.fillRect(left,y-18,right-left,36)
    for(let x=left;x<right;x+=16){
      ctx.fillStyle='#52604765';ctx.fillRect(x,y-13,4,26)
      ctx.fillStyle='#141f1765';ctx.fillRect(x+3,y-13,1,26)
    }
    for(const x of ROADS.avenues){
      ctx.fillStyle='#3a4438';ctx.fillRect(x-44,y-16,88,32)
      ctx.strokeStyle='#72827165';line(ctx,x-43,y-16,x+43,y-16);line(ctx,x-43,y+16,x+43,y+16)
    }
    for(const dy of [-7,7]){
      ctx.strokeStyle='#0d1e14';ctx.lineWidth=3;line(ctx,left,y+dy,right,y+dy)
      ctx.strokeStyle='#9fa78d95';ctx.lineWidth=1;line(ctx,left,y+dy-1,right,y+dy-1)
    }
  }
  // Trackside equipment and grounded signals support the scale of the rolling stock.
  for(const x of [205,683,1227,1586]){
    ctx.fillStyle='#3d4c3b';ctx.fillRect(x,-315,12,9)
    ctx.strokeStyle='#71856890';ctx.lineWidth=.8;ctx.strokeRect(x,-315,12,9)
    line(ctx,x+18,-306,x+18,-287)
    ctx.fillStyle='#0b1710';ctx.fillRect(x+15,-308,6,10)
    ctx.fillStyle='#bb926a';ctx.fillRect(x+17,-306,2,2)
  }
  consist(ctx,55,-272,['box','flat','box','gondola'])
  consist(ctx,724,-226,['tank','tank','flat','gondola'])
  consist(ctx,1420,-272,['gondola','box','flat'])
  ctx.restore()
}
