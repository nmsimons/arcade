import assert from 'node:assert/strict'
import test from 'node:test'
import { fillTireSound, TIRE_SOUND } from '../src/games/urbanFire/tireSound.ts'

const render=(p=TIRE_SOUND)=>{
  const tone=new Float32Array(48000*4),noise=new Float32Array(tone.length)
  fillTireSound(tone,noise,48000,p)
  return {tone,noise}
}
const pitches=tone=>{
  const hz=[]
  for(let start=4800;start<tone.length-4800;start+=4800){
    let crosses=0
    for(let i=start;i<start+4800;i++)if(tone[i-1]<=0&&tone[i]>0)crosses++
    hz.push(crosses*10)
  }
  return hz
}

test('tire tone centers near the selected pitch with irregular, adjustable pitch instability',()=>{
  const {tone}=render(),hz=pitches(tone),average=hz.reduce((sum,n)=>sum+n,0)/hz.length
  assert.ok(Math.abs(average-TIRE_SOUND.pitch)<100)
  assert.ok(Math.max(...hz)-Math.min(...hz)>180,'instability produces meaningful frequency movement')
  const steady=pitches(render({...TIRE_SOUND,modulation:0}).tone)
  assert.ok(Math.max(...steady)-Math.min(...steady)<=20,'zero depth removes frequency movement')
})

test('broadband noise remains independent of tone tuning and both layers stay bounded',()=>{
  const a=render(),b=render({...TIRE_SOUND,pitch:1200,rasp:5})
  assert.deepEqual(a.noise,b.noise)
  let energy=0,lag=0
  for(let i=1;i<a.noise.length;i++){energy+=a.noise[i]**2;lag+=a.noise[i]*a.noise[i-1]}
  assert.ok(energy/a.noise.length>.07)
  assert.ok(Math.abs(lag/energy)<.02,'noise has no strong adjacent-sample correlation')
  for(const data of [a.tone,a.noise]){
    assert.equal(Math.abs(data[0]),0);assert.equal(Math.abs(data.at(-1)),0)
    assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.5))
  }
})

test('audio generation is deterministic without consuming gameplay randomness',()=>{
  const random=Math.random
  Math.random=()=>{throw new Error('audio must use its own random sequence')}
  try{assert.deepEqual(render(),render())}finally{Math.random=random}
})
