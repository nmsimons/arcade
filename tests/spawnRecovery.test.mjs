import assert from 'node:assert/strict'
import test from 'node:test'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { freshExpedition, newExpedition, expeditionMap, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { DYING_ANIMATION_DURATION } from '../src/games/hardVacuum/tuning.ts'

const finishExplosion = session => {
  for (let i=0;i<Math.ceil(DYING_ANIMATION_DURATION/1000*60)+2;i++) session.step()
  assert.equal(session.mode,'gameOver')
}

test('a ship loaded in outer rock, an interior formation or a sealed door dies and recovers at Haven', () => {
  for (const position of [{x:50,y:50},{x:1000,y:700},{x:7970,y:2790}]) {
    const state=freshExpedition();state.position=position;state.credits=200;state.banked=3000
    state.impactShieldInstalled=true;state.shields=2
    assert.equal(isInsideCavern(position,0,expeditionMap(state)),false)
    const session=createGameSession(state,{seed:123});session.command({type:'start'})
    assert.equal(session.mode,'dying','spawn invulnerability and shields cannot keep a buried ship alive')
    assert.deepEqual(session.refs.shipRef.current.pos,position,'the loss occurs at the invalid position')
    assert.equal(session.expedition.campaign.deaths,1)
    assert.equal(session.expedition.credits,0);assert.equal(session.expedition.banked,3000)
    assert.equal(session.expedition.impactShieldInstalled,true)
    const events=session.drainEvents()
    assert.equal(events.filter(e=>e.type==='audio'&&e.name==='explosion').length,1)
    assert.ok(events.some(e=>e.type==='persist'))
    const saved=parseExpedition(JSON.stringify(session.expedition))
    assert.deepEqual(saved.position,saved.campaign.haven,'saving during the explosion cannot trap the next launch')
    finishExplosion(session)
    session.command({type:'start'})
    assert.equal(session.mode,'playing');assert.equal(session.expedition.campaign.deaths,1)
    assert.deepEqual(session.refs.shipRef.current.pos,session.expedition.campaign.haven)
  }
})

test('a buried pilot without a Haven link follows the normal new-expedition restart', () => {
  const state=newExpedition();state.position={x:50,y:50};state.credits=200
  const session=createGameSession(state,{seed:123});session.command({type:'start'})
  assert.equal(session.mode,'dying');assert.deepEqual(session.expedition,newExpedition())
  finishExplosion(session);session.command({type:'start'})
  assert.equal(session.mode,'playing')
  assert.deepEqual(session.refs.shipRef.current.pos,newExpedition().position)
})

test('a saved hull touching a wall is resolved normally without killing or relocating the pilot', () => {
  const state=freshExpedition();state.position={x:9200,y:2805}
  assert.equal(isInsideCavern(state.position,0,expeditionMap(state)),true)
  assert.equal(isInsideCavern(state.position,15,expeditionMap(state)),false)
  const session=createGameSession(state,{seed:123});session.command({type:'start'})
  assert.equal(session.mode,'playing');assert.deepEqual(session.refs.shipRef.current.pos,state.position)
  session.step()
  assert.equal(session.mode,'playing');assert.equal(session.expedition.campaign.deaths,0)
  assert.ok(isInsideCavern(session.refs.shipRef.current.pos,14.9,expeditionMap(session.expedition)))
})
