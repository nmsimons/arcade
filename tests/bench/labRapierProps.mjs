import RAPIER from '@dimforge/rapier2d-compat'
import { convexParts, bodyPolygon, lineBlocked } from '../../src/games/jumping/geometry.ts'
import { TUNING } from '../../src/games/jumping/model.ts'
import { propGravity } from '../../src/games/jumping/gravity.ts'
import { propWeightScale } from '../../src/games/jumping/propWeight.ts'
import { playerContactBody } from '../../src/games/jumping/playerContacts.ts'
import { playerTurnAngle } from '../../src/games/jumping/ropeGravity.ts'
import { gravityAtPoint } from '../../src/games/jumping/gravity.ts'
import { STEP } from '../../src/games/jumping/model.ts'
import { boxShape, ballShape } from '../../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../../src/games/jumping/mechanisms.ts'

export const rapierReady = RAPIER.init()
const SCALE = 100
const vector = (x, y) => ({x:x/SCALE,y:y/SCALE})
const unsupported = (run, contacts) => run.robots.length || run.water.pools.length
  || run.props.some(p=>p.floatSwitch) || run.player.inverted
  || contacts.push || contacts.body.length || contacts.support?.collider.prop
  || run.player.hang || run.player.mantle || run.player.climbing

/** A capacity probe for ordinary props, not a replacement for the gameplay
 * contact contract. Direct player/robot/water interactions use the legacy solve.
 * The benchmark retains the real mechanism planner, controller and rope solver.
 */
export class RapierPropProbe {
  constructor(iterations = 12, ropes = false) {
    this.iterations=iterations
    this.ropes=ropes
    this.runs=new Map()
    this.metrics={nativeSteps:0,fallbackSteps:0,nativeRopeSteps:0}
  }
  create(run) {
    const world=new RAPIER.World(vector(0,TUNING.gravity))
    world.numSolverIterations=this.iterations
    world.numInternalPgsIterations=2
    world.integrationParameters.normalizedAllowedLinearError=.00001
    world.integrationParameters.normalizedPredictionDistance=.002
    world.integrationParameters.contact_natural_frequency=1000
    world.integrationParameters.maxCcdSubsteps=4
    const props=new Map(), owners=new Map(), mechanisms=[], ropes=new Map()
    const material=(desc,ball=false)=>desc.setFriction(ball?0:.55).setRestitution(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(0x00010003)
    const fixed=(points)=>{
      const x=points.reduce((s,p)=>s+p[0],0)/points.length,y=points.reduce((s,p)=>s+p[1],0)/points.length
      const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(points.flatMap(p=>[(p[0]-x)/SCALE,(p[1]-y)/SCALE])))
      if(!desc)throw Error('Invalid native terrain hull')
      // Immovable kinematic hulls use the configured hard-contact solver.
      // Rapier 0.21's JS API does not expose the separate fixed-body softness.
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x/SCALE,y/SCALE))
      const collider=world.createCollider(material(desc),body);owners.set(collider.handle,null)
      return collider
    }
    for(let shape of run.terrain) {
      if(shape.w>1e6 || shape.h>1e6) {
        const x=Math.max(-2048,shape.x),y=Math.max(-2048,shape.y)
        shape={x,y,w:Math.min(run.level.width+2048,shape.x+shape.w)-x,h:Math.min(run.level.floor+2048,shape.y+shape.h)-y}
      }
      for(const points of convexParts(shape)) fixed(points)
    }
    for(const m of run.mechanisms) {
      const d=m.definition
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation((m.x+d.w/2)/SCALE,(m.y+d.h/2)/SCALE))
      const collider=world.createCollider(material(RAPIER.ColliderDesc.cuboid(d.w/2/SCALE,d.h/2/SCALE)),body)
      owners.set(collider.handle,null)
      mechanisms.push(body)
    }
    const contact=playerContactBody(run.player,true)
    const points=bodyPolygon(contact.x,contact.y,contact.height,1,playerTurnAngle(run.player),contact.outline)
    const playerCollider=fixed(points), playerOrigin=playerCollider.parent().translation()
    playerCollider.setCollisionGroups(0x00040001)
    for(const p of run.props) {
      const ball=p.kind==='ball',radius=p.size/2/SCALE
      // Keep every native body awake: faster settling/sleeping cannot by itself
      // be sold as greater dense-scene capacity.
      const desc=RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x/SCALE,(p.y-p.size/2)/SCALE)
        .setRotation(ball?0:p.angle).setLinvel(p.vx/SCALE,p.vy/SCALE)
        .setAngvel(ball?0:p.angularVelocity).setCanSleep(false).setCcdEnabled(true)
      if(ball)desc.lockRotations()
      const body=world.createRigidBody(desc)
      const mass=(ball ? .001*Math.PI/4 : .002)*p.size**2*propWeightScale(p)
      const collider=world.createCollider(material(ball?RAPIER.ColliderDesc.ball(radius):RAPIER.ColliderDesc.cuboid(radius,radius),ball).setMass(mass),body)
      props.set(p,{body,collider,x:p.x,y:p.y,angle:p.angle,vx:p.vx,vy:p.vy,angular:p.angularVelocity})
      owners.set(collider.handle,p)
    }
    if(this.ropes)for(const rope of run.player.ropes??[]) {
      const gravity=gravityAtPoint(run.gravityField,rope.definition.x,rope.definition.y,1400)
      const desc=RAPIER.SoftBodyDesc.polyline(new Float32Array(rope.nodes.flatMap(n=>[n.x/SCALE,n.y/SCALE])))
        .setPinnedParticles([0]).setTensionOnly().setSoftness(3000,1).setParticleMass(.001).setAdditionalPgsIterations(8)
        .setParticleRadius(.015).setLinearDamping(.12).setGravityScale(gravity/TUNING.gravity)
        .setCanSleep(false).setDominanceGroup(-1).setSelfContacts(false)
        .setSurfaceCollider(RAPIER.ColliderDesc.ball(.015).setFriction(0).setCollisionGroups(0x00020001))
      const soft=world.createSoftBody(desc)
      rope.nodes.forEach((n,i)=>{if(i)soft.setParticleVelocity(i,vector((n.x-n.oldX)/STEP,(n.y-n.oldY)/STEP))})
      ropes.set(rope,{soft,gravity})
    }
    const state={world,props,owners,mechanisms,ropes,advanced:false,published:new Set(),playerCollider,playerOrigin,playerStart:{x:run.player.x,y:run.player.y}}
    this.runs.set(run,state)
    return state
  }
  step(run,contacts,dt) {
    if(unsupported(run,contacts)){this.metrics.fallbackSteps++;return false}
    const state=this.runs.get(run)??this.create(run),{world,props,mechanisms}=state
    world.timestep=dt
    run.mechanisms.forEach((m,i)=>{
      const position=vector(m.x+m.definition.w/2,m.y+m.definition.h/2)
      mechanisms[i].setTranslation(position,true);mechanisms[i].setNextKinematicTranslation(position)
    })
    const {playerOrigin,playerStart}=state
    const playerPosition={x:playerOrigin.x+(run.player.x-playerStart.x)/SCALE,y:playerOrigin.y+(run.player.y-playerStart.y)/SCALE}
    state.playerCollider.parent().setTranslation(playerPosition,true)
    state.playerCollider.parent().setNextKinematicTranslation(playerPosition)
    for(const [p,s] of props) {
      if(p.x!==s.x || p.y!==s.y) s.body.setTranslation(vector(p.x,p.y-p.size/2),true)
      if(p.kind==='box' && p.angle!==s.angle)s.body.setRotation(p.angle,true)
      if(p.vx!==s.vx || p.vy!==s.vy)s.body.setLinvel(vector(p.vx,p.vy),true)
      if(p.kind==='box' && p.angularVelocity!==s.angular)s.body.setAngvel(p.angularVelocity,true)
      const gravity=propGravity(run.gravityField,p)
      s.body.setGravityScale(gravity/TUNING.gravity,false);p.gravity=gravity
    }
    for(const {soft,gravity} of state.ropes.values()) {
      soft.resetForces(false)
      const positions=soft.particlePositions()
      for(let i=1;i<soft.numParticles();i++) {
        const g=gravityAtPoint(run.gravityField,positions[i*2]*SCALE,positions[i*2+1]*SCALE,1400)
        if(g!==gravity)soft.addParticleForce(i,vector(0,.001*(g-gravity)),false)
      }
    }
    world.step();state.advanced=true
    const supported=new Set(),links=[]
    for(const [p,s] of props) world.contactPairsWith(s.collider,other=>world.contactPair(s.collider,other,(manifold,flipped)=>{
      if(!manifold.numSolverContacts())return
      const direction=p.gravity<0?-1:1,normal=manifold.normal()
      if(normal.y*(flipped?-1:1)*direction>.3) {
        const neighbor=state.owners.get(other.handle)
        if(neighbor)links.push([p,neighbor]);else if(state.owners.has(other.handle))supported.add(p)
      }
    }))
    for(let pass=0;pass<run.props.length;pass++){
      const count=supported.size
      for(const [a,b] of links)if(supported.has(b))supported.add(a)
      if(count===supported.size)break
    }
    for(const [p,s] of props) {
      const oldX=p.x,position=s.body.translation(),velocity=s.body.linvel()
      p.x=position.x*SCALE;p.y=position.y*SCALE+p.size/2
      p.vx=velocity.x*SCALE;p.vy=velocity.y*SCALE;p.grounded=supported.has(p)
      if(p.kind==='box'){p.angle=s.body.rotation();p.angularVelocity=s.body.angvel()}
      else p.angle+=(p.x-oldX)/(p.size/2)
      Object.assign(s,{x:p.x,y:p.y,angle:p.angle,vx:p.vx,vy:p.vy,angular:p.angularVelocity})
    }
    this.metrics.nativeSteps++
    return true
  }
  publishRope(run,rope,dt,loaded) {
    if(!this.ropes)return false
    if(loaded || this.metrics.fallbackSteps)throw Error('The batched rope capacity probe does not cover player-loaded ropes or fallback ticks')
    let state=this.runs.get(run)
    if(!state?.advanced){this.step(run,{support:null,push:null,body:[]},dt);state=this.runs.get(run)}
    const native=state.ropes.get(rope)
    if(!native)throw Error('Rope population changed during capacity probe')
    const positions=native.soft.particlePositions()
    rope.nodes.forEach((n,i)=>{n.oldX=n.x;n.oldY=n.y;n.x=positions[i*2]*SCALE;n.y=positions[i*2+1]*SCALE})
    rope.bends.fill(null);rope.pumpInput=0
    this.metrics.nativeRopeSteps++
    state.published.add(rope)
    if(state.published.size===state.ropes.size){state.advanced=false;state.published.clear()}
    return true
  }
  quality(run) {
    const state=this.runs.get(run)
    if(!state)return {...this.metrics,maxPenetration:null}
    let maxPenetration=0
    const visited=new Set()
    for(const {collider} of state.props.values()) state.world.contactPairsWith(collider,other=>{
      const key=[collider.handle,other.handle].sort((a,b)=>a-b).join(':')
      if(visited.has(key))return
      visited.add(key)
      const hit=collider.contactCollider(other,0)
      if(hit)maxPenetration=Math.max(maxPenetration,-hit.distance*SCALE)
    })
    let maxRopeStretch=1,totalRopeStretch=1,maxAnchorDrift=0,blockedRopeSpans=0
    const solids=[...run.terrain,...run.mechanisms.map(mechanismShape),...run.props.map(p=>p.kind==='box'?boxShape(p):ballShape(p))]
    for(const rope of state.ropes.keys()) {
      maxAnchorDrift=Math.max(maxAnchorDrift,Math.hypot(rope.nodes[0].x-rope.definition.x,rope.nodes[0].y-rope.definition.y))
      let length=0
      for(let i=1;i<rope.nodes.length;i++) {
        const distance=Math.hypot(rope.nodes[i].x-rope.nodes[i-1].x,rope.nodes[i].y-rope.nodes[i-1].y)
        const a=rope.nodes[i-1],b=rope.nodes[i]
        if(lineBlocked([a.x,a.y],[b.x,b.y],solids))blockedRopeSpans++
        length+=distance;maxRopeStretch=Math.max(maxRopeStretch,distance/8)
      }
      totalRopeStretch=Math.max(totalRopeStretch,length/rope.definition.length)
    }
    return {...this.metrics,maxPenetration,maxRopeStretch,totalRopeStretch,maxAnchorDrift,blockedRopeSpans,solverIterations:this.iterations,sleepingDisabled:true,awakeProps:[...state.props.values()].filter(s=>!s.body.isSleeping()).length}
  }
  dispose(){for(const s of this.runs.values())s.world.free();this.runs.clear()}
}
