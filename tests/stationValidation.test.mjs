import test from 'node:test'
import assert from 'node:assert/strict'
import { STATION_AUTHORING, validateStation } from '../src/games/hardVacuum/stationValidation.ts'
import { freshExpedition, powerReceiver, parseExpedition, GATES } from '../src/games/hardVacuum/expedition.ts'

test('all authored station references and physical placements are valid',()=>{
  assert.deepEqual(validateStation(),[])
})
test('authoring diagnostics reject duplicate IDs, dangling references, targets, prerequisites and placements',()=>{
  const mutations=[
    d=>d.rooms.push(d.rooms[0]),
    d=>d.passages[0].rooms.push('missing-room'),
    d=>d.circuits[0].gates.push('missing-door'),
    d=>d.loads[0].target='missing-target',
    d=>d.loads.find(l=>l.kind==='bot').target='bot:rescue-cache',
    d=>d.loads.find(l=>l.kind==='bot').circuit='breach-power',
    d=>d.loads.find(l=>l.kind==='core').circuit='breach-power',
    d=>d.loads.find(l=>l.kind==='door').circuit='ignition-power',
    d=>d.berths.push(d.berths[0]),
    d=>d.regions.push(d.regions[0]),
    d=>d.prerequisites[0].requires.push('ignition-power'),
    d=>d.circuits[0].source={x:-100,y:-100},
    d=>d.circuits[0].pos={x:-100,y:-100},
  ]
  for(const mutate of mutations) {
    const data=structuredClone(STATION_AUTHORING);mutate(data)
    assert.ok(validateStation(data).length>0,mutate.toString())
  }
})
test('power changes physical doors and abstract milestones through separate typed targets',()=>{
  const s=freshExpedition()
  powerReceiver(s,'heart','heart');powerReceiver(s,'ignition-power','ignition-power')
  assert.deepEqual(s.flags,['heart','ignition-ready'])
  assert.ok(s.gates.every(id=>GATES.some(g=>g.id===id)))
  assert.ok(s.gates.includes('breach-return'))
  assert.deepEqual(parseExpedition(JSON.stringify(s)),s)
})
