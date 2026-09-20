import { createGameSession } from '../../src/games/hardVacuum/gameSession.ts'

/** Commands are recorded at simulation ticks, not render frames. No position writes during flight. */
export function replay(state, seed=90210, cosmeticRandom=()=>.5) {
  const session=createGameSession(state,{seed,cosmeticRandom}),inputs=[]
  let tick=0
  const command=action=>{inputs.push({tick,...action});session.command(action)}
  const key=(key,pressed)=>{if(session.refs.keysRef.current.has(key)!==pressed)command({type:'key',key,pressed})}
  const step=(pilot)=>{pilot?.();session.step();tick++;session.drainEvents()}
  const run=(ticks,pilot)=>{for(let i=0;i<ticks;i++)step(pilot)}
  const frames=(hz,seconds,pilot)=>{
    session.advance(0)
    for(let frame=1;frame<=hz*seconds;frame++) {
      session.advance(frame*1000/hz,()=>{pilot?.();tick++})
      session.drainEvents()
    }
  }
  const face=angle=>{
    const ship=session.refs.shipRef.current,error=Math.atan2(Math.sin(angle-ship.angle),Math.cos(angle-ship.angle))
    const control=error-(ship.angularVelocity??0)*.065
    key('a',control<-.025);key('d',control>.025)
    return error
  }
  const fly=(target,speed=160)=>{
    const ship=session.refs.shipRef.current,dx=target.x-ship.pos.x,dy=target.y-ship.pos.y,distance=Math.hypot(dx,dy)
    const error=face(Math.atan2(dy,dx)),forward=ship.vel.x*Math.cos(ship.angle)+ship.vel.y*Math.sin(ship.angle)
    key('w',Math.abs(error)<.3&&forward<speed)
    key('s',Math.abs(error)<.3&&forward>speed+5)
    return distance
  }
  const stop=()=>{for(const k of [...session.refs.keysRef.current])key(k,false)}
  const diagnostic=()=>JSON.stringify({seed,tick,inputs,mode:session.mode,ship:session.refs.shipRef.current,expedition:session.expedition,harpoon:session.refs.harpoonRef.current.state})
  command({type:'start'});session.drainEvents()
  return {session,command,key,step,run,frames,face,fly,stop,diagnostic,get tick(){return tick}}
}
