import test from 'node:test'
import assert from 'node:assert/strict'
import { RECORDS, RETIRED_RECORD_IDS, discoverCampaign } from '../src/games/hardVacuum/campaign.ts'
import { drawCampaignFloor } from '../src/games/hardVacuum/campaignFloor.ts'
import { freshExpedition, newExpedition, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { BERTHS } from '../src/games/hardVacuum/campaignWorld.ts'
import { TERMINALS } from '../src/games/hardVacuum/terminals.ts'
import { controlHint } from '../src/games/hardVacuum/controlHints.ts'

const stencils=(s,{connectedTerminal,havenLinkRetraction,controller=false}={})=>{
  const text=[],ctx={save(){},restore(){},fillText(value,x,y){text.push({value,x,y})}}
  drawCampaignFloor(ctx,s,(action,key)=>controlHint(controller,action,key),{connectedTerminal,havenLinkRetraction})
  return text
}
const words=(s,options)=>stencils(s,options).map(t=>t.value)

test('campaign has seven short physical story logs and one Haven greeting, not a walkthrough at every circuit',()=>{
  assert.equal(RECORDS.length,8);assert.equal(TERMINALS.length,7)
  for(const record of RECORDS) {
    assert.ok(record.text.split(/\s+/).length<=40,record.id)
    assert.doesNotMatch(record.text,/press |tow |recharge|receiver|southeast|north of|find cover|shutters|reserve cells|module|shortcut/i)
  }
  for(const id of RETIRED_RECORD_IDS) {
    assert.ok(!TERMINALS.some(t=>t.terminalId===id))
    assert.deepEqual(discoverCampaign(freshExpedition(),undefined,id),[])
  }
})

test('retired downloads survive save loading without returning as walkthroughs or counting as current logs',()=>{
  const s=freshExpedition();s.campaign.records=['first-light',...RETIRED_RECORD_IDS];s.banked=4321
  const loaded=parseExpedition(JSON.stringify(s))
  assert.ok(loaded);assert.deepEqual(loaded.campaign.records,s.campaign.records);assert.equal(loaded.banked,4321)
  assert.equal(RECORDS.filter(r=>loaded.campaign.records.includes(r.id)).length,1)
  loaded.campaign.records.push('unknown-record');assert.equal(parseExpedition(JSON.stringify(loaded)),null)
})

test('Haven has no tether hints and its docking stencil waits for the socket to fully retract',()=>{
  const s=newExpedition(),haven=s.campaign.haven
  assert.deepEqual(stencils(s),[])
  assert.deepEqual(words(s,{controller:true}),[])
  s.campaign.havenActivated=true;s.campaign.havenLinkPending=true
  assert.deepEqual(words(s,{connectedTerminal:'first-light'}),[])
  assert.deepEqual(words(s,{connectedTerminal:'first-light',controller:true}),[])
  delete s.campaign.havenLinkPending
  for(const havenLinkRetraction of [0,.6,1.19]) assert.deepEqual(words(s,{havenLinkRetraction}),[])
  assert.deepEqual(stencils(s,{havenLinkRetraction:1.2}),[{value:'Dock · E',...haven}])
  assert.deepEqual(stencils(s),[{value:'Dock · E',...haven}],'stays painted after the runtime animation ends or the game reloads')
  assert.deepEqual(words(s,{controller:true}),['Dock · Y / △'])
  s.campaign.journey={};assert.deepEqual(words(s),[],'no docking label during transit')
})

test('docking instructions travel with Haven and discovered empty berths retain a call stencil',()=>{
  const s=freshExpedition(),berth=BERTHS.find(b=>b.id==='freight')
  s.campaign.berths.push('freight')
  assert.deepEqual(stencils(s).find(t=>t.value==='Call Haven · E'),{value:'Call Haven · E',...berth.pos})
  s.campaign.berth='freight';s.campaign.haven={...berth.pos}
  assert.deepEqual(stencils(s)[0],{value:'Dock · E',...berth.pos})
  assert.equal(words(s).filter(t=>t.startsWith('Call Haven')).length,1)
  s.campaign.journey={}
  assert.deepEqual(words(s),['HAVEN IN TRANSIT'])
})
