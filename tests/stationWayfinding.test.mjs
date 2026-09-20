import test from 'node:test'
import assert from 'node:assert/strict'
import { BREACH_ANCHORAGE_SIGN, REGION_ENTRY_SIGNS, wayfindingLayout } from '../src/games/hardVacuum/stationWayfinding.ts'
import { CAMPAIGN_GATES, CAMPAIGN_PASSAGES, REGIONS } from '../src/games/hardVacuum/campaignWorld.ts'
import { expeditionMap, freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern, pointInPolygon } from '../src/games/hardVacuum/worldGeometry.ts'

const signs=[BREACH_ANCHORAGE_SIGN,...REGION_ENTRY_SIGNS]
test('one sparse wayfinding sign marks each main area, without controls or puzzle instructions',()=>{
  assert.deepEqual(signs.map(s=>s.region),REGIONS.map(r=>r.id))
  for(const sign of REGION_ENTRY_SIGNS)assert.equal(sign.lines.join(' '),REGIONS.find(r=>r.id===sign.region).name.toUpperCase())
  assert.equal(wayfindingLayout(BREACH_ANCHORAGE_SIGN).textY,-22,'preserve the original anchorage design')
})

test('the complete lettering and arrow fit the real tunnel floor, clear of closed doors',()=>{
  const map=expeditionMap(freshExpedition())
  for(const sign of signs) {
    const {textY,arrow}=wayfindingLayout(sign)
    // Conservative monospace glyph bounds; sample the whole printed area, not just its center.
    const ink=[...arrow]
    sign.lines.forEach((line,i)=>{
      const halfWidth=line.length*6.1,y=textY+i*24
      for(let x=-halfWidth;x<=halfWidth;x+=4)for(let dy=-11;dy<=11;dy+=2)ink.push({x,y:y+dy})
    })
    for(const p of ink)assert.ok(isInsideCavern({x:sign.pos.x+p.x,y:sign.pos.y+p.y},3,map),`${sign.region}: ${JSON.stringify(p)}`)
  }
})

test('each new arrow follows its approach toward the destination gate',()=>{
  const gates=['breach-link','freight-link','ring-link','refuge-link','heart-link']
  REGION_ENTRY_SIGNS.forEach((sign,i)=>{
    const gate=CAMPAIGN_GATES.find(g=>g.id===gates[i])
    const delta={x:gate.x+gate.w/2-sign.pos.x,y:gate.y+gate.h/2-sign.pos.y}
    assert.ok(delta.x*sign.direction.x+delta.y*sign.direction.y>0,sign.region)
    const next={x:sign.pos.x+sign.direction.x*60,y:sign.pos.y+sign.direction.y*60}
    assert.ok(CAMPAIGN_PASSAGES.some(p=>p.gate===gate.id && pointInPolygon(sign.pos,p.shape) && pointInPolygon(next,p.shape)),sign.region)
  })
})
