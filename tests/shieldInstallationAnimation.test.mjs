import assert from 'node:assert/strict'
import test from 'node:test'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { freshExpedition, maxShields, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { drawPlayerShip, shieldRechargeAppearance } from '../src/games/hardVacuum/shipRender.ts'
import { SHIELD_REPAIR_TIME } from '../src/games/hardVacuum/tuning.ts'

function launch(state = freshExpedition(), module = 'impact') {
  if(module) state.cargo = { [module]: { pos: { x: 7868, y: 3560 }, vel: { x: 0, y: 0 }, tethered: true } }
  const s = createGameSession(state, { seed: 90210, cosmeticRandom: () => .5 })
  s.command({ type: 'start' });s.refs.rocksRef.current = [];s.drainEvents()
  return s
}
const run = (s, ticks) => { for(let i=0;i<ticks;i++) s.step() }
const chargeCues = events => events.filter(e => e.type === 'audio' && e.name === 'shieldCharge')
function install(s) {
  for(let ticks=0;ticks<240&&!s.expedition.impactShieldInstalled;ticks++) s.step()
  assert.equal(s.expedition.impactShieldInstalled, true)
  assert.ok(Math.abs(s.refs.runtimeRef.current.shieldInstallRecharge - 1/60) < 1e-9)
}
function shieldStrokes(s) {
  const styles=[],stack=[],ctx={
    save(){ stack.push(ctx.strokeStyle) },restore(){ ctx.strokeStyle=stack.pop() },
    translate(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},fill(){},
    stroke(){ styles.push(ctx.strokeStyle) },
  }
  drawPlayerShip(ctx,s.refs.shipRef.current,s.refs.shipAppearanceRef.current,{
    time:s.timeMs/1000,shields:s.expedition.shields,maxShields:maxShields(s.expedition),
    hitAge:Infinity,rechargeAge:s.timeMs-s.refs.lastShieldRechargeAtRef.current,
    ...shieldRechargeAppearance(s.refs.runtimeRef.current),laser:false,
  })
  return styles.filter(style=>style==='#00ff88').length
}

test('first shield installation plays a full recharge cycle even after the Haven service timer is full',()=>{
  const s=launch()
  run(s,90)
  assert.equal(s.expedition.impactShieldInstalled,false)
  assert.equal(s.refs.shipRepairTimeRef.current,SHIELD_REPAIR_TIME)
  assert.equal(shieldStrokes(s),0)
  install(s)
  assert.equal(s.expedition.shields,2,'installation supplies its normal charges immediately')
  assert.equal(shieldStrokes(s),2,'normal recharge rings are drawn')
  let events=s.drainEvents()
  assert.ok(events.some(e=>e.type==='audio'&&e.name==='startRepairHum'))
  assert.equal(chargeCues(events).length,0,'the finishing cue waits for the animation')
  run(s,29)
  assert.ok(Math.abs(shieldRechargeAppearance(s.refs.runtimeRef.current).rechargeProgress-.5)<1e-9)
  run(s,29)
  assert.equal(shieldStrokes(s),2)
  assert.equal(chargeCues(s.drainEvents()).length,0)
  s.step()
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,undefined)
  assert.equal(s.refs.lastShieldRechargeAtRef.current,s.timeMs)
  assert.equal(shieldStrokes(s),1,'the normal finishing flash follows the rings')
  events=s.drainEvents()
  assert.equal(chargeCues(events).length,1)
  assert.ok(events.some(e=>e.type==='audio'&&e.name==='stopRepairHum'))
  run(s,120)
  assert.equal(shieldStrokes(s),0)
  assert.equal(chargeCues(s.drainEvents()).length,0,'installation does not retrigger')
})

for(const mode of ['docking','docked']) test(`shield startup also runs when installation happens while ${mode}`,()=>{
  const s=launch()
  if(mode==='docking')run(s,110)
  s.command({type:'interact'})
  install(s)
  assert.equal(s.mode,mode)
  assert.equal(shieldStrokes(s),2)
  s.drainEvents();run(s,59)
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,undefined)
  assert.equal(chargeCues(s.drainEvents()).length,1)
  assert.equal(s.expedition.shields,2)
})

test('pause and survey suspension freeze startup, and loading an installed shield never replays it',()=>{
  const s=launch();install(s);run(s,12)
  const elapsed=s.refs.runtimeRef.current.shieldInstallRecharge,time=s.timeMs
  s.command({type:'pause'});run(s,120)
  assert.equal(s.timeMs,time)
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,elapsed)
  s.command({type:'resume'});s.command({type:'suspend',suspended:true});run(s,120)
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,elapsed)
  s.command({type:'suspend',suspended:false});s.step()
  assert.ok(s.refs.runtimeRef.current.shieldInstallRecharge>elapsed)
  const saved=parseExpedition(JSON.stringify(s.expedition))
  assert.equal(saved.shieldInstallRecharge,undefined,'presentation is not persisted')
  s.command({type:'load',expedition:saved});s.refs.rocksRef.current=[];s.drainEvents()
  run(s,180)
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,undefined)
  assert.equal(s.refs.lastShieldRechargeAtRef.current,-Infinity)
  assert.equal(chargeCues(s.drainEvents()).length,0)
  const menu=createGameSession(saved)
  assert.equal(menu.refs.lastShieldHitAtRef.current,-Infinity)
  assert.equal(menu.refs.lastShieldRechargeAtRef.current,-Infinity)
  assert.equal(shieldStrokes(menu),0,'the loaded menu ship does not falsely flash a shield event')
})

test('the startup effect grants no extra repair or ammunition away from Haven servicing',()=>{
  const state=freshExpedition();state.position={x:7770,y:3560}
  state.blasterInstalled=true;state.blasterCharges=1;state.credits=25
  const s=launch(state);install(s)
  s.expedition.shields=1
  run(s,180)
  assert.equal(s.expedition.shields,1,'a depleted charge is not restored by the animation')
  assert.equal(s.expedition.blasterCharges,1)
  assert.equal(s.expedition.credits,25);assert.equal(s.expedition.banked,0)
  assert.equal(chargeCues(s.drainEvents()).length,1)
})

test('first-install recharge timing and sound are independent of rendering frequency',()=>{
  let expected
  for(const hz of [60,30,120,144]) {
    const s=launch(),cues=[]
    s.advance(0)
    for(let frame=1;frame<=hz*4;frame++) {
      s.advance(frame*1000/hz)
      cues.push(...chargeCues(s.drainEvents()))
    }
    const actual={time:s.refs.lastShieldRechargeAtRef.current,charges:s.expedition.shields,cues}
    assert.equal(cues.length,1)
    assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,undefined)
    if(expected)assert.deepEqual(actual,expected,`render rate ${hz}`)
    else expected=actual
  }
})

test('ordinary Haven servicing retains its recharge rings, hum, refill and finishing cue',()=>{
  const state=freshExpedition();state.impactShieldInstalled=true;state.shields=1
  const s=launch(state,null);run(s,30)
  assert.equal(s.refs.runtimeRef.current.shieldInstallRecharge,undefined)
  assert.equal(shieldStrokes(s),2)
  assert.ok(s.drainEvents().some(e=>e.type==='audio'&&e.name==='startRepairHum'))
  run(s,30)
  assert.equal(s.expedition.shields,2)
  assert.equal(shieldStrokes(s),1)
  assert.equal(chargeCues(s.drainEvents()).length,1)
})
