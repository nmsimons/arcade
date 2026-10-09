import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

for(const hold of [false,true])for(const direction of [-1,1])test(`keyboard ${hold?'held':'tap'} jump has distinct flight balance and pre-contact preparation facing ${direction}`,async({page},info)=>{
  const level=blankTrial();level.width=4000;level.spawn={x:1500,y:920};level.goal={x:3800,y:920}
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  // Establish facing using the real controls, then settle the tiny movement.
  const key=direction<0?'a':'d'
  await page.keyboard.down(key);await page.clock.runFor(16)
  await page.keyboard.up(key);await page.clock.runFor(128)
  const start=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1).time)
  await page.keyboard.down('Space');await page.clock.runFor(hold?180:16)
  await page.keyboard.up('Space');await page.clock.runFor((hold?620:264)-(hold?180:16))
  await page.screenshot({path:info.outputPath('gathered-apex.png')})
  await page.clock.runFor(1200-(hold?620:264))
  const read=await page.evaluate(()=>window.jumpingMotion.read()),frames=read.recent.filter(f=>f.time>start)
  const air=frames.filter(f=>!f.signals.grounded&&f.signals.mode==='free')
  expect(air.length).toBeGreaterThan(40)
  expect(air.every(f=>f.signals.facing===direction)).toBe(true)
  const apex=air.reduce((a,b)=>Math.abs(a.vy)<Math.abs(b.vy)?a:b)
  expect(Math.abs(apex.vy)).toBeLessThan(15)
  expect(apex.points[6][0]-apex.points[1][0]).toBeLessThan(-3)
  const leadingElbow=f=>f.points[3][0]-f.points[1][0]
  expect(Math.max(...air.filter(f=>f.vy<-180).map(leadingElbow))).toBeGreaterThan(leadingElbow(apex)+3)
  expect(air.some(f=>f.vy>100&&f.points[4][0]<f.points[1][0]-2)).toBe(true)
  const peak=920-Math.min(...air.map(f=>f.y))
  expect(peak).toBeGreaterThan(hold?150:45);expect(peak).toBeLessThan(hold?220:60)
  const contact=frames.find(f=>f.time>apex.time&&f.signals.grounded)
  expect(contact).toBeTruthy();expect(contact.y).toBe(920)
  expect(contact.contacts.feet.some(f=>f.planted)).toBe(true)
  for(let i=1;i<frames.length;i++)if(!frames[i].signals.grounded||!frames[i-1].signals.grounded) {
    for(let j=0;j<frames[i].points.length;j++)expect(Math.hypot(...frames[i].points[j].map((v,k)=>v-frames[i-1].points[j][k]))).toBeLessThan(5)
  }
  expect(read.reports).toEqual([])
  await page.screenshot({path:info.outputPath('settled-after-landing.png')})
})
