import {readFile,writeFile} from 'node:fs/promises'
import {test,expect} from './helpers/test.mjs'
import {useLevelFixtures} from './helpers/jumpingLevels.mjs'
import {ledgeApproachLevel} from '../helpers/jumpingLedgeApproachScenarios.mjs'

for(const [file,kind,turn] of [['spire2.jump-level.json','wall jump',80],['spire2.jump-level.json','fall',12],
  ['Tower.jump-level.json','fall',12],['Tower II.jump-level.json','fall',12]]) {
  test(`${file} catches a reachable ${kind} approach with normal controls`,async({page},info)=>{
    test.setTimeout(60000)
    const authored=JSON.parse(await readFile(new URL('../../public/levels/jumping/'+file,import.meta.url),'utf8'))
    const level=ledgeApproachLevel(authored,kind)
    await useLevelFixtures(page,[level])
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.setViewportSize({width:852,height:393})
    await page.clock.install({time:new Date('2026-10-09T12:00:00Z')})
    await page.goto('/untitled-jumping-game/levels/built-in/00-fixture.json?motionDebug=1')
    const canvas=page.getByRole('img',{name:`${level.name}: reach the exit`,exact:true})
    await expect(canvas).toBeFocused()
    await page.clock.pauseAt(new Date('2026-10-09T13:00:00Z'));await page.clock.runFor(64)
    const started=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1).time)
    await page.keyboard.down('d')
    if(kind==='wall jump') {
      await page.keyboard.down('Space');await page.clock.runFor(150);await page.keyboard.up('Space')
      await page.clock.runFor(turn/120*1000-150)
    }else {
      // Hold the real key for measured physics steps. A fixed 100 ms timer
      // delivered 11 steps on Linux and 13 on Windows, sometimes turning back
      // before leaving the lip. Adjacent 12/13 steps remain reachable; exact
      // reported failures retain their original timing in the unit encounters.
      let elapsed=0
      for(let frame=0;frame<50&&elapsed<turn/120-1e-5;frame++) {
        await page.clock.runFor(8)
        elapsed=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1).time)-started
      }
      expect(elapsed).toBeGreaterThanOrEqual(turn/120-1e-5)
      expect(elapsed).toBeLessThanOrEqual((turn+1)/120+1e-5)
    }
    await page.keyboard.up('d');await page.keyboard.down('a')
    if(kind==='wall jump'){await page.keyboard.down('Space');await page.clock.runFor(150);await page.keyboard.up('Space')}
    const samples=new Map()
    for(let phase=0;phase<12;phase++) {
      await page.clock.runFor(64)
      for(const sample of await page.evaluate(()=>window.jumpingMotion.read().recent))samples.set(sample.time,sample)
      if([3,6,11].includes(phase))await page.screenshot({path:info.outputPath(`approach-${phase}.png`)})
    }
    await page.keyboard.up('a');await page.clock.runFor(300)
    const final=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))
    await writeFile(info.outputPath('approach-diagnostic.json'),JSON.stringify({file,kind,turn,final,samples:[...samples.values()]},null,2))
    expect([...samples.values()].some(sample=>!sample.signals.grounded)).toBe(true)
    expect(final.signals.mode).toBe('hang')
    expect(final.vx).toBe(0);expect(final.vy).toBe(0)
    await page.screenshot({path:info.outputPath('quiet-grip.png')})
    await page.keyboard.down('w');await page.clock.runFor(1300);await page.keyboard.up('w')
    const standing=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))
    expect(standing.signals.grounded).toBe(true)
    await page.screenshot({path:info.outputPath('standing-after-pull-up.png')})
    expect(errors).toEqual([])
    await writeFile(info.outputPath('ledge-approach.json'),JSON.stringify({file,kind,turn,final,standing,samples:[...samples.values()]},null,2))
  })
}
