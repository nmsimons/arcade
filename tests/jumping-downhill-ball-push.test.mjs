import test from 'node:test'
import assert from 'node:assert/strict'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {NEUTRAL_INPUT,TUNING} from '../src/games/jumping/model.ts'
import {levelProblems,parseLevel} from '../src/games/jumping/level.ts'
import {playerContacts} from '../src/games/jumping/playerContacts.ts'
import {downhillBallLevel,downhillBallInput} from './helpers/jumpingDownhillBallScenarios.mjs'

for(const slope of [.15,.3,.6])for(const size of [30,100,200])for(const mode of ['run','walk','crouch']) {
  test(`${size}-unit ball rolls freely ahead of a downhill ${mode} on grade ${slope} in both directions`,()=>{
    for(const direction of [-1,1]) {
      const level=parseLevel(downhillBallLevel(size,direction,slope))
      assert.deepEqual(levelProblems(level),[])
      const run=createRun(level),passive=createRun(level),input=downhillBallInput(mode,direction)
      run.started=passive.started=true
      // The steep small-ball case can finish its first actual shove during
      // the physics step, before the final published presentation contact.
      const initial = playerContacts(run.player,input,{platforms:run.platforms,
        colliders:run.platforms.map((platform,index)=>({id:`fixture:${index}`,platform,
          ...(index>=run.terrain.length?{prop:run.props[index-run.terrain.length]}:{})}))})
      if(initial.push) assert.equal(initial.push.collider.prop,run.props[0],'the nearest reachable surface is the actual ball')
      let pushTicks=0,releaseTicks=0,maxSpeed=0,released=false
      const speedLimit=mode==='run'?TUNING.runSpeed:TUNING.walkSpeed
      for(let tick=0;tick<360;tick++) {
        stepRun(run,input);stepRun(passive,NEUTRAL_INPUT)
        const p=run.player,ball=run.props[0]
        const pushing=p.contacts?.push?.collider.prop===ball
        pushTicks+=Number(pushing)
        if (pushing) {
          assert.ok(ball.vx*direction<=Math.abs(input.move)*90+.1,
            'a ball moving under its own faster momentum cannot claim voluntary pushing')
          assert.equal(released,false,'a self-moving downhill ball cannot restart the pushing stance')
        }
        if(!pushing && ball.vx*direction>Math.abs(input.move)*90+.1)released=true
        if(tick>=300)releaseTicks+=Number(!pushing)
        maxSpeed=Math.max(maxSpeed,p.vx*direction)
      }
      const p=run.player,ball=run.props[0],unloaded=passive.props[0]
      // A short ball on the steepest grade can already sit below the uphill
      // player's palm reach. It must escape without inventing a shove there.
      if(initial.push) assert.ok((ball.x-unloaded.x)*direction>0,'the reachable initial shove actually adds forward travel')
      assert.ok((ball.x-unloaded.x)*direction>=-1,'pushing must not reduce free downhill travel')
      assert.ok(ball.vx*direction>speedLimit+40,'gravity, without a launch impulse, overtakes the pusher')
      assert.ok((ball.x-p.x)*direction-size/2>60,'the ball leaves hand reach instead of tethering player and ball')
      assert.equal(releaseTicks,60,'there is no lingering force-bearing push after separation')
      assert.ok(maxSpeed<=speedLimit+.001,'a faster ball cannot tow the player past their selected movement speed')
      assert.equal(p.pushing,null,'the load/reach presentation releases after the ball rolls away')
    }
  })
}
