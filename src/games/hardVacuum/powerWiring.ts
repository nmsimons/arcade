import { GATES, SOCKETS, expeditionMap, freshExpedition } from './expedition.ts'
import { CHAMBERS, PASSAGES } from './stationLayout.ts'
import { isInsideCavern } from './worldGeometry.ts'
import type { Vector2 } from './types'
import { CIRCUIT_LOADS } from './stationProgression.ts'

export const WIRE_CLEARANCE = 24
export const WIRE_WALL_CLEARANCE = 28
const MIN_RUN = 24
const TURN_COST = 32
export interface PowerConnection { source: string; target: string; start: Vector2; end: Vector2; entry: Vector2; exit: Vector2 }
const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x-b.x, a.y-b.y)
const routingState = freshExpedition()
routingState.gates = GATES.map(g=>g.id)
routingState.power = Object.fromEntries(SOCKETS.map(s=>[s.id,s.id]))
const terrain = expeditionMap(routingState)
const walls = [terrain.boundary,...terrain.obstacles].flatMap(shape=>shape.map((p,i)=>[p,shape[(i+1)%shape.length]] as const))
const ports = (pos: Vector2) => [-1,1].flatMap(side=>[
  {start:{x:pos.x+side*78,y:pos.y},entry:{x:pos.x+side*110,y:pos.y}},
  ...[-1,1].map(y=>({start:{x:pos.x+side*72,y:pos.y+y*24},entry:{x:pos.x+side*72,y:pos.y+y*56}})),
]).filter(p=>isInsideCavern(p.entry,WIRE_WALL_CLEARANCE,terrain))

/** Fixed equipment only: loose reserve cells never have trailing power wires. */
export const POWER_CONNECTIONS: PowerConnection[] = SOCKETS.flatMap(socket => {
  const targets = CIRCUIT_LOADS.filter(load => load.circuit === socket.id).map(load => {
    if (load.kind !== 'door') return load
    const gate = GATES.find(g => g.id === load.gate)!
    const ends = gate.w > gate.h
      ? [{end:{x:gate.x+4,y:gate.y+gate.h/2},exit:{x:gate.x+36,y:gate.y+gate.h/2}},
        {end:{x:gate.x+gate.w-4,y:gate.y+gate.h/2},exit:{x:gate.x+gate.w-36,y:gate.y+gate.h/2}}]
      : [{end:{x:gate.x+gate.w/2,y:gate.y+4},exit:{x:gate.x+gate.w/2,y:gate.y+36}},
        {end:{x:gate.x+gate.w/2,y:gate.y+gate.h-4},exit:{x:gate.x+gate.w/2,y:gate.y+gate.h-36}}]
    return {target:load.target,...ends.filter(p=>isInsideCavern(p.exit,WIRE_WALL_CLEARANCE,terrain)).sort((a,b)=>distance(a.exit,socket.pos)-distance(b.exit,socket.pos))[0]}
  })
  return targets.map(({target,end,exit})=>({source:socket.id,target,...ports(socket.pos).sort((a,b)=>
    // The twelve pod cradles share one west-facing ward feed. Picking a new
    // receiver port per cradle produces competing leads across the tow lane.
    target.startsWith('ward:') ? distance(a.entry,{x:socket.pos.x-110,y:socket.pos.y})-distance(b.entry,{x:socket.pos.x-110,y:socket.pos.y})
      : distance(a.entry,exit)-distance(b.entry,exit))[0],end,exit}))
})

const pointGap = (p: Vector2, a: Vector2, b: Vector2) => {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)))
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)
}
const pointClearCache = new Map<string,boolean>()
const pointClear = (p: Vector2) => {
  const key=`${p.x},${p.y}`
  if (!pointClearCache.has(key)) pointClearCache.set(key,isInsideCavern(p,WIRE_WALL_CLEARANCE-.001,terrain))
  return pointClearCache.get(key)!
}
// Every candidate leg has a known interior graph node at one end. Reject
// crossings and check exact segment distance, so its other end stays inside
// too. Bounding boxes avoid scanning distant geometry in the narrow phase.
const clear = (a: Vector2, b: Vector2) => walls.every(([c,d])=>{
    const margin=WIRE_WALL_CLEARANCE-.001
    if (Math.max(c.x,d.x)<Math.min(a.x,b.x)-margin||Math.min(c.x,d.x)>Math.max(a.x,b.x)+margin||
      Math.max(c.y,d.y)<Math.min(a.y,b.y)-margin||Math.min(c.y,d.y)>Math.max(a.y,b.y)+margin) return true
    const cross=(p: Vector2,q: Vector2,r: Vector2)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x)
    if (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0) return false
    return pointGap(c,a,b)>=margin&&pointGap(d,a,b)>=margin&&pointGap(a,c,d)>=margin&&pointGap(b,c,d)>=margin
  })
const heading = (a: Vector2,b: Vector2) => (Math.round(Math.atan2(b.y-a.y,b.x-a.x)/(Math.PI/4))+8)%8
const turn = (a: number,b: number) => Math.min(Math.abs(a-b),8-Math.abs(a-b))
const leads = POWER_CONNECTIONS.flatMap(c=>[{a:c.start,b:c.entry},{a:c.end,b:c.exit}])
const longEnough = (a: Vector2,b: Vector2) => {
  const length=distance(a,b)
  // A short extension of a contact lead becomes one long visible run.
  return length<.001||length>=MIN_RUN||leads.some(lead=>distance(lead.b,a)<.001&&heading(lead.a,lead.b)===heading(a,b))
}
const traceBends = (a: Vector2, b: Vector2): Vector2[] => {
  const dx=b.x-a.x,dy=b.y-a.y,diagonal=Math.min(Math.abs(dx),Math.abs(dy))
  // Square elbows are useful when a diagonal would leave a tiny extra jog.
  const candidates=[{x:a.x+Math.sign(dx)*diagonal,y:a.y+Math.sign(dy)*diagonal},
    {x:b.x-Math.sign(dx)*diagonal,y:b.y-Math.sign(dy)*diagonal},
    {x:a.x,y:b.y},{x:b.x,y:a.y}]
  return candidates.filter((p,i)=>!candidates.slice(0,i).some(q=>distance(p,q)<.001)&&
    longEnough(a,p)&&longEnough(b,p)&&clear(a,p)&&clear(p,b))
}
export interface PowerTrace { source: string; a: Vector2; b: Vector2 }
const parallelBlocked = (a: Vector2,b: Vector2,source: string,trace: PowerTrace) => {
  const u={x:b.x-a.x,y:b.y-a.y},v={x:trace.b.x-trace.a.x,y:trace.b.y-trace.a.y}
  const length=Math.hypot(u.x,u.y),other=Math.hypot(v.x,v.y)
  if (length<.001||other<.001||Math.abs(u.x*v.y-u.y*v.x)>.001*length*other) return false
  const gap=Math.min(pointGap(a,trace.a,trace.b),pointGap(b,trace.a,trace.b),pointGap(trace.a,a,b),pointGap(trace.b,a,b))
  // One physical trunk may branch to several loads on the same circuit.
  const collinear=Math.abs((trace.a.x-a.x)*u.y-(trace.a.y-a.y)*u.x)/length<.001
  return !(source===trace.source&&collinear&&gap<.001)&&gap<WIRE_CLEARANCE-.001
}
let cached: (PowerConnection & { path: Vector2[] })[] | undefined

/** Route fixed cable through the authored passages, even while doors are shut.
 * Build once; doors, moving cargo and restored power never move the cables. */
export function powerConduits() {
  if (cached) return cached
  const nodes: Vector2[] = []
  const add = (point: Vector2) => {
    const existing = nodes.findIndex(p=>distance(p,point)<.01)
    if (existing>=0) return existing
    nodes.push(point); return nodes.length-1
  }
  const endpoints = POWER_CONNECTIONS.map(connection=>({start:add(connection.entry),end:add(connection.exit)}))
  const addClear = (point: Vector2) => { if (pointClear(point)) add(point) }
  // Give connectors a straight approach before choosing the first elbow.
  for (const lead of leads) {
    const length=distance(lead.a,lead.b)
    addClear({x:lead.b.x+(lead.b.x-lead.a.x)*32/length,y:lead.b.y+(lead.b.y-lead.a.y)*32/length})
  }
  // Branch the dense ward harness in its central service aisle. These are
  // junctions, not collision exceptions: addClear enforces ordinary clearance.
  addClear({x:2562,y:3584})
  addClear({x:2562,y:3812})
  for (const shape of [...Object.values(CHAMBERS),...PASSAGES.map(p=>p.shape)]) {
    const center=shape.reduce((p,q)=>({x:p.x+q.x/shape.length,y:p.y+q.y/shape.length}),{x:0,y:0})
    addClear(center)
    // Passage end caps provide stable bend points, recessed from the rock.
    if (!PASSAGES.some(p=>p.shape===shape)) continue
    for (let i=shape.length===4 ? 1 : 0;i<shape.length;i+=shape.length===4 ? 2 : 3) {
      const a=shape[i],b=shape[(i+1)%shape.length]
      const point={x:(a.x+b.x)*.44+center.x*.12,y:(a.y+b.y)*.44+center.y*.12}
      addClear(point)
    }
  }
  // Give the router room to go around fixed machinery as well as rock.
  for (const shape of terrain.obstacles) {
    const xs=shape.map(p=>p.x),ys=shape.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
    if (right-left>300||bottom-top>300) continue
    for (const x of [left-32,right+32]) for (const y of [top-32,bottom+32]) addClear({x,y})
  }
  const edges: {to:number;length:number;bend:Vector2;enter:number;leave:number}[][] = nodes.map(()=>[])
  for (let a=0;a<nodes.length;a++) for (let b=a+1;b<nodes.length;b++) {
    const length=distance(nodes[a],nodes[b])
    if (length>1800) continue
    for (const bend of traceBends(nodes[a],nodes[b])) {
      const enter=heading(nodes[a],distance(nodes[a],bend)<.001 ? nodes[b] : bend)
      const leave=heading(distance(nodes[b],bend)<.001 ? nodes[a] : bend,nodes[b])
      const traceLength=distance(nodes[a],bend)+distance(bend,nodes[b])+turn(enter,leave)*TURN_COST
      edges[a].push({to:b,length:traceLength,bend,enter,leave})
      edges[b].push({to:a,length:traceLength,bend,enter:(leave+4)%8,leave:(enter+4)%8})
    }
  }
  // Reserve every equipment lead before routing any trunk, so later circuits
  // cannot end up pinned against an earlier cable at their own contact.
  const occupied: PowerTrace[]=POWER_CONNECTIONS.flatMap(c=>[
    {source:c.source,a:c.start,b:c.entry},{source:c.source,a:c.exit,b:c.end},
  ])
  cached=POWER_CONNECTIONS.map((connection,i)=>{
    const {start,end}=endpoints[i],cost=Array<number>(nodes.length*8).fill(Infinity),previous=cost.map(()=>-1),bends: (Vector2|undefined)[]=cost.map(()=>undefined)
    // Keep the arrival heading in the search state. A short route that curls
    // back on itself is less deliberate than one with a few broad elbows.
    const first=start*8+heading(connection.start,connection.entry),lastHeading=heading(connection.exit,connection.end),open=new Set([first])
    let last=-1
    cost[first]=0
    while (open.size) {
      let next=-1
      for (const n of open) if (next<0||cost[n]<cost[next]) next=n
      open.delete(next)
      const node=Math.floor(next/8),direction=next%8
      if (node===end) { last=next; break }
      for (const edge of edges[node]) {
        const corner=turn(direction,edge.enter),finish=edge.to===end ? turn(edge.leave,lastHeading) : 0
        if (corner>2||finish>2) continue
        const target=edge.to*8+edge.leave,nextCost=cost[next]+edge.length+(corner+finish)*TURN_COST+1
        if (nextCost>=cost[target]) continue
        if (occupied.some(trace=>parallelBlocked(nodes[node],edge.bend,connection.source,trace)||parallelBlocked(edge.bend,nodes[edge.to],connection.source,trace))) continue
        cost[target]=nextCost; previous[target]=next; bends[target]=edge.bend; open.add(target)
      }
    }
    if (last<0) throw new Error(`No power conduit route: ${connection.source} → ${connection.target}`)
    const path: Vector2[]=[]
    for (let n=last;n!==-1;n=previous[n]) {
      path.unshift(nodes[Math.floor(n/8)])
      if (bends[n]) path.unshift(bends[n]!)
    }
    const clean=path.filter((p,i)=>i===0||distance(p,path[i-1])>.01)
    const trunk=clean.filter((p,i)=>{
      if (i===0||i===clean.length-1) return true
      const a=clean[i-1],b=clean[i+1]
      return Math.abs((p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x))>.01
    })
    for (let n=1;n<trunk.length;n++) occupied.push({source:connection.source,a:trunk[n-1],b:trunk[n]})
    return {...connection,path:[connection.start,...trunk,connection.end]}
  })
  return cached
}

let cachedTraces: PowerTrace[] | undefined
/** Several loads can share a feed; draw that feed once, without overpainting. */
export function powerTraces() {
  if (cachedTraces) return cachedTraces
  const traces: PowerTrace[]=[]
  for (const cable of powerConduits()) for (let i=1;i<cable.path.length;i++) {
    let a=cable.path[i-1],b=cable.path[i]
    if (distance(a,b)<.001) continue
    const length=distance(a,b),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length
    for (let j=traces.length-1;j>=0;j--) {
      const trace=traces[j]
      if (trace.source!==cable.source) continue
      const cross=(p: Vector2)=>(p.x-a.x)*uy-(p.y-a.y)*ux
      if (Math.abs(cross(trace.a))>.001||Math.abs(cross(trace.b))>.001) continue
      const project=(p: Vector2)=>(p.x-a.x)*ux+(p.y-a.y)*uy
      const lo=Math.min(project(trace.a),project(trace.b)),hi=Math.max(project(trace.a),project(trace.b)),end=distance(a,b)
      if (hi<-.001||lo>end+.001) continue
      b={x:a.x+ux*Math.max(end,hi),y:a.y+uy*Math.max(end,hi)}
      a={x:a.x+ux*Math.min(0,lo),y:a.y+uy*Math.min(0,lo)}
      traces.splice(j,1)
      // An extended run may now reach another previously separate section.
      j=traces.length
    }
    traces.push({source:cable.source,a,b})
  }
  cachedTraces=traces
  return traces
}
