import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, restartFromPause } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('keyboard turns between blocked props retain the whole body and establish the incoming brace', async ({page},info) => {
  const root=474.5,size=80,offset=size/2+25.5
  const level={...blankTrial(),spawn:{x:root,y:920},
    props:[{kind:'box',x:root+offset,y:920,size},{kind:'box',x:root-offset,y:920,size}],
    platforms:[{x:root+25.5+size,y:650,w:120,h:270},{x:root-25.5-size-120,y:650,w:120,h:270}]}
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d');await page.clock.runFor(3000)
  let held='d',previous=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1)),reaches=0,braces=0
  const world=(frame,point)=>[frame.x+point[0]*frame.signals.facing,frame.y+point[1]]
  for(const [key,milliseconds] of [['a',1000],['d',16],['a',16],['d',1000],['',1000]]){
    if(held)await page.keyboard.up(held)
    if(key)await page.keyboard.down(key)
    held=key
    await page.clock.runFor(milliseconds)
    const frames=await page.evaluate(()=>window.jumpingMotion.read().recent)
    for(const frame of frames.filter(frame=>frame.time>previous.time)){
      expect(frame.x).toBeCloseTo(root,3)
      frame.points.forEach((point,i)=>{
        const a=world(previous,previous.points[i]),b=world(frame,point)
        expect(Math.hypot(b[0]-a[0],b[1]-a[1])).toBeLessThanOrEqual(5.00001)
      })
      if(frame.signals.reachingPush)reaches++
      else if(frame.signals.push&&frame.contacts.palms.length){
        braces++
        frame.contacts.hands.forEach((hand,i)=>{
          const palm=frame.contacts.palms[i]
          expect(Math.hypot(hand.x-palm.x-palm.nx*1.6,hand.y-palm.y-palm.ny*1.6)).toBeLessThan(.001)
        })
      }
      previous=frame
    }
  }
  expect(reaches).toBeGreaterThan(0);expect(braces).toBeGreaterThan(20)
  expect(previous.signals.reachingPush).toBe(false)
  await page.screenshot({path:info.outputPath('settled-crowded-keyboard-turn.png')})
  await page.keyboard.down('Space');await page.clock.runFor(64)
  const departure=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))
  expect(departure.vy).toBeLessThan(0);expect(departure.signals.grounded).toBe(false)
})

test('keyboard reversal brakes continuously while steering responds on the first tick', async ({page},info) => {
  const level = blankTrial(); level.width=4000; level.spawn={x:1500,y:920};level.goal={x:3800,y:920}
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(750)
  const before=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))
  expect(before.vx).toBe(410)
  await page.keyboard.up('d'); await page.keyboard.down('a'); await page.clock.runFor(600)
  const frames=await page.evaluate(()=>window.jumpingMotion.read().recent)
  const turn=frames.filter(frame=>frame.time>before.time)
  expect(turn.length).toBeGreaterThan(50)
  expect(turn[0].signals.facing).toBe(-1)
  expect(turn[0].vx).toBeCloseTo(410-2000/120,6)
  const head=frame=>[frame.x+frame.points[2][0]*frame.signals.facing,frame.y+frame.points[2][1]]
  let previous=head(before)
  for(const frame of turn) {
    const next=head(frame)
    expect(Math.hypot(next[0]-previous[0],next[1]-previous[1])).toBeLessThan(8)
    previous=next
  }
  expect(turn.at(-1).vx).toBe(-410)
  await page.screenshot({path:info.outputPath('supported-keyboard-turn.png')})
})

test('keyboard lowering then Jump away retains the ledge impulse while holding toward it', async ({page},info) => {
  const level=blankTrial();level.height=600;level.floor=500
  level.spawn={x:530,y:300};level.goal={x:900,y:500}
  level.platforms=[{x:500,y:300,w:200,h:200}]
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('s');await page.clock.runFor(1000)
  const hanging=await page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))
  expect(hanging.signals.mode).toBe('hang')
  await page.keyboard.up('s');await page.keyboard.down('d');await page.keyboard.down('Space');await page.clock.runFor(250)
  const frames=await page.evaluate(()=>window.jumpingMotion.read().recent)
  const departure=frames.find(frame=>frame.time>hanging.time&&frame.input.jump)
  expect(departure.signals.mode).toBe('free')
  expect(departure.vx).toBe(-260)
  expect(departure.input.move).toBe(1)
  const head=frame=>[frame.x+frame.points[2][0]*frame.signals.facing,frame.y+frame.points[2][1]]
  const a=head(hanging),b=head(departure)
  expect(Math.hypot(b[0]-a[0],b[1]-a[1])).toBeLessThan(8)
  await page.screenshot({path:info.outputPath('ledge-keyboard-jump-away.png')})
})

for (const key of ['a','s']) test(`keyboard ${key === 'a' ? 'opposite movement' : 'Down'} backs out of a tall step before top support`, async ({page},info) => {
  const level = blankTrial(); level.height = 600; level.floor = 500
  level.spawn = {x:474.5,y:500}; level.goal = {x:900,y:500}
  level.platforms = [{x:500,y:440,w:200,h:60}]
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(300)
  const entered = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(entered.signals.mode).toBe('step')
  await page.keyboard.up('d'); await page.keyboard.down(key); await page.clock.runFor(800)
  const returned = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(returned.signals.mode).toBe('free'); expect(returned.signals.grounded).toBe(true)
  expect(returned.y).toBe(500); expect(returned.x).toBeLessThan(500)
  await page.screenshot({path:info.outputPath('returned-from-tall-step.png')})
})

for (const operation of ['resume','restart']) test(`keyboard ${operation} clears a queued jump during an actual returning tall step`, async ({page},info) => {
  const level=blankTrial();level.height=600;level.floor=500
  level.spawn={x:474.5,y:500};level.goal={x:900,y:500}
  level.platforms=[{x:500,y:440,w:200,h:60}]
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(32)
  const read=()=>page.evaluate(()=>window.jumpingMotion.read().recent)
  const initial=(await read()).at(-1)
  await page.keyboard.down('d');await page.clock.runFor(300)
  const entered=(await read()).at(-1)
  expect(entered.signals.mode).toBe('step')
  await page.keyboard.up('d');await page.keyboard.down('a');await page.keyboard.down('Space')
  await page.clock.runFor(16)
  const returning=(await read()).at(-1)
  expect(returning.signals.mode).toBe('step')
  expect(returning.y).toBeGreaterThan(entered.y)
  expect(returning.input.jump).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog',{name:'Game paused'})).toBeVisible()
  await page.clock.runFor(600)
  expect(await read()).toEqual([])
  await page.keyboard.up('a');await page.keyboard.up('Space')
  const action=operation==='resume'?/^Resume$/:/^(Restart level|Reset position)$/
  await page.getByRole('button',{name:action}).click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(800)
  const settled=(await read()).at(-1)
  expect(settled.signals.mode).toBe('free')
  expect(settled.signals.grounded).toBe(true)
  expect(settled.y).toBe(500);expect(settled.vy).toBe(0)
  expect(settled.x).toBeLessThan(500)
  expect((await read()).every(frame=>!frame.input.jump&&frame.vy>=0)).toBe(true)
  if(operation==='restart'){
    expect(settled.x).toBe(initial.x)
    expect(settled.points).toEqual(initial.points)
  }
  await page.keyboard.down('Space');await page.clock.runFor(32)
  const fresh=(await read()).at(-1)
  expect(fresh.signals.grounded).toBe(false);expect(fresh.vy).toBeLessThan(-250)
  await page.keyboard.up('Space')
  await info.attach('return-pause-handoff',{body:JSON.stringify({initial,entered,returning,settled,fresh},null,2),contentType:'application/json'})
  await page.screenshot({path:info.outputPath(`return-${operation}-fresh-jump.png`)})
})

test('motion diagnostics observe real controls and pushing resumes smoothly after a brief release', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: 580, y: 700, w: 100, h: 220 }]
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(800)
  const read = () => page.evaluate(() => window.jumpingMotion.read())
  expect((await read()).recent.at(-1).blends.push).toBe(1)
  for (let i = 0; i < 6; i++) {
    await page.keyboard.up('d'); await page.clock.runFor(16)
    expect((await read()).recent.at(-1).signals.push).toBeNull()
    await page.keyboard.down('d'); await page.clock.runFor(32)
    expect((await read()).recent.at(-1).blends.push).toBeGreaterThan(.85)
  }
  await page.screenshot({ path: info.outputPath('resumed-push.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(400)
  await page.keyboard.up('Space'); await page.clock.runFor(64)
  const jumping = (await read()).recent.at(-1)
  expect(jumping.signals.grounded).toBe(false)
  expect(jumping.signals.push).toBeNull()
  expect(jumping.blends.push).toBe(0)
  expect((await read()).reports).toEqual([])
  await page.keyboard.up('d'); await page.keyboard.press('Escape'); await page.clock.runFor(32)
  expect((await read()).recent).toEqual([])
  expect(errors).toEqual([])
})

test('production play does not enable diagnostics without the flag', async ({ page }) => {
  await useLevelFixtures(page, [blankTrial()])
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  expect(await page.evaluate(() => window.jumpingMotion)).toBeUndefined()
})

for (const direction of [-1, 1]) for (const width of [16, 24]) test(`a keyboard brace keeps both soles on ${width}-unit footing through recontact (${direction})`, async ({ page }, info) => {
  const rect = (x, y, w, h) => ({ x: direction === 1 ? x : 900 - x - w, y, w, h })
  const level = { ...blankTrial(), width: 900, height: 700, floor: 650,
    spawn: { x: direction === 1 ? 414.5 : 485.5, y: 500 },
    goal: { x: direction === 1 ? 100 : 800, y: 650, flipX: direction === -1 },
    platforms: [rect(414.5 - width / 2, 500, width, 20), rect(440, 500, 80, 20), rect(520, 350, 100, 300)],
    props: [{ kind: 'box', x: direction === 1 ? 480 : 420, y: 500, size: 80 }] }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const key = direction === 1 ? 'd' : 'a'
  await page.keyboard.down(key); await page.clock.runFor(1000)
  const before = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(before.contacts.feet.every(foot => foot.planted)).toBe(true)
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.up(key); await page.clock.runFor(16)
    await page.keyboard.down(key); await page.clock.runFor(64)
  }
  const frames = await page.evaluate(() => window.jumpingMotion.read().recent)
  const recontact = frames.filter(frame => frame.time > before.time)
  expect(recontact.length).toBeGreaterThan(20)
  for (const frame of recontact) {
    expect(frame.signals.grounded).toBe(true)
    frame.contacts.feet.forEach((foot, index) => {
      expect(foot.planted).toBe(true)
      expect(Math.hypot(foot.x - before.contacts.feet[index].x, foot.y - before.contacts.feet[index].y)).toBeLessThan(.02)
    })
  }
  await page.screenshot({ path: info.outputPath('narrow-supported-brace.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(100)
  const departure = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(departure.signals.grounded).toBe(false)
  expect(departure.vy).toBeLessThan(0)
})

for (const direction of [-1, 1]) test(`a keyboard shove begins with palms on the surface before and after restart (${direction})`, async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 540 - direction * 65.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const key = direction === 1 ? 'd' : 'a'
  for (const attempt of ['fresh', 'restart']) {
    if (attempt === 'restart') {
      await page.keyboard.up(key)
      await restartFromPause(page); await page.clock.runFor(120)
      const ready = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
      expect(ready.x).toBe(level.spawn.x); expect(ready.y).toBe(level.spawn.y)
    }
    await page.keyboard.down(key); await page.clock.runFor(200)
    const frames = await page.evaluate(() => window.jumpingMotion.read().recent)
    expect(frames.length).toBeGreaterThan(5)
    const loaded = frames.filter(frame => frame.contacts.palms.length)
    expect(loaded.length).toBeGreaterThan(5)
    expect(frames.at(-1).x * direction).toBeGreaterThan(level.spawn.x * direction + 1)
    for (const frame of loaded) frame.contacts.hands.forEach((hand, i) => {
        const palm = frame.contacts.palms[i]
        expect(Math.hypot(hand.x - palm.x - palm.nx * 1.6, hand.y - palm.y - palm.ny * 1.6)).toBeLessThan(.5)
      })
    await page.screenshot({ path: info.outputPath(`${attempt}-palm-contact.png`) })
  }
})

test('held keyboard movement springs a long-fall landing into supported running', async ({ page }, info) => {
  const level = blankTrial(); level.height = 1480; level.floor = 1400; level.width = 4000
  level.spawn = { x: 540, y: 100 }; level.goal.y = 1400
  level.platforms = [{ x: 500, y: 100, w: 120, h: 20 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(2500)
  const frames = await page.evaluate(() => window.jumpingMotion.read().recent)
  const impact = frames.find(frame => frame.signals.grounded && frame.signals.mode === 'get-up')
  expect(impact).toBeTruthy()
  const settled = frames.filter(frame => frame.time >= impact.time + .2)
  expect(settled.length).toBeGreaterThan(10)
  expect(settled.every(frame => frame.signals.mode === 'free' && frame.points[2][1] < -35)).toBe(true)
  expect(settled.some(frame => frame.contacts.feet.some(foot => foot.planted))).toBe(true)
  expect(settled.every(frame => Math.abs(frame.vx - 410) < .01)).toBe(true)
  await page.screenshot({ path: info.outputPath('supported-moving-recovery.png') })
})

for (const direction of [-1, 1]) test(`crouched pushing keeps the final head clear and establishes a brace: direction=${direction}`, async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 540 - direction * 65.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: direction === 1 ? 580 : 380, y: 650, w: 120, h: 270 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  const key = direction === 1 ? 'd' : 'a'
  await page.keyboard.down(key); await page.keyboard.down('ArrowDown')
  await page.clock.runFor(800)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent.slice(-40))
  expect(samples.length).toBe(40)
  const face = direction === 1 ? 500 : 580
  for (const s of samples) {
    expect(s.signals.grounded).toBe(true)
    expect(s.signals.facing).toBe(direction)
    expect(s.signals.push).not.toBeNull()
    expect((face - s.x) * direction - s.points[2][0] - 6.2).toBeGreaterThanOrEqual(-.02)
    expect(Math.abs(s.points[8][0] - s.points[10][0])).toBeGreaterThan(8)
  }
  await page.screenshot({ path: info.outputPath('crouched-brace.png') })
  await page.keyboard.up('ArrowDown'); await page.keyboard.up(key)
})

test('the rendered torso transfers weight during a real moving push', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(1500)
  const data = await page.evaluate(() => window.jumpingMotion.read())
  const samples = data.recent.filter(s => s.blends.push === 1).slice(-100)
  expect(samples.length).toBe(100)
  const range = (point, axis) => Math.max(...samples.map(s => s.points[point][axis])) - Math.min(...samples.map(s => s.points[point][axis]))
  expect(samples.at(-1).x - samples[0].x).toBeGreaterThan(20)
  expect(range(0, 1)).toBeGreaterThan(.5)
  expect(range(1, 0)).toBeGreaterThan(.2)
  expect(data.reports).toEqual([])
  await page.screenshot({ path: info.outputPath('moving-push.png') })
  await page.keyboard.up('d')
})

test('first opposite keyboard press during stationary get-up retains the outgoing whole rig',async({page},info)=>{
 const level={...blankTrial(),height:1400,floor:1400,spawn:{x:200,y:160},goal:{x:1620,y:1400},platforms:[{x:100,y:160,w:220,h:24}]}
 await useLevelFixtures(page,[level]);await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
 await page.goto('/untitled-jumping-game?motionDebug=1')
 await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
 await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
 await page.locator('.jumping-level-card[aria-pressed=true]').click();await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
 await page.keyboard.down('Shift');await page.keyboard.down('d');await page.clock.runFor(1400)
 await page.keyboard.up('d');await page.keyboard.up('Shift')
 const read=()=>page.evaluate(()=>window.jumpingMotion.read().recent)
 const latest=async()=>(await read()).at(-1)
 for(let i=0;i<130&&!(await latest()).signals.grounded;i++)await page.clock.runFor(16)
 await page.clock.runFor(300)
 const before=await latest();expect(before.signals.mode).toBe('get-up');expect(before.vx).toBe(0);expect(before.signals.facing).toBe(1)
 const world=(frame,p)=>[frame.x+p[0]*frame.signals.facing,frame.y+p[1]]
 await page.keyboard.down('a');await page.clock.runFor(16)
 await page.keyboard.up('a');await page.keyboard.down('d');await page.clock.runFor(16)
 await page.keyboard.up('d');await page.keyboard.down('a');await page.clock.runFor(800)
 let previous=before,recovering=0,supportedStride=false
 for(const frame of (await read()).filter(f=>f.time>before.time)){
  if(previous.signals.mode==='get-up'||frame.signals.mode==='get-up'){
   recovering++
   frame.points.forEach((point,j)=>{
    const a=world(previous,previous.points[j]),b=world(frame,point)
    expect(Math.hypot(b[0]-a[0],b[1]-a[1]),`world joint ${j} at ${frame.time}`).toBeLessThan(8)
   })
  }
  supportedStride ||= frame.signals.mode==='free'&&frame.signals.grounded&&frame.contacts.feet.some(f=>f.planted)
  previous=frame
 }
 expect(recovering).toBeGreaterThan(5);expect(previous.signals.mode).toBe('free');expect(previous.signals.grounded).toBe(true)
 expect(previous.vx).toBe(-410);expect(supportedStride).toBe(true)
 await page.screenshot({path:info.outputPath('opposite-get-up-keyboard.png')})
 await page.keyboard.up('a');await page.clock.runFor(500)
 await page.keyboard.down('Space');await page.clock.runFor(64)
 expect((await latest()).vy).toBeLessThan(0);expect((await latest()).signals.grounded).toBe(false)
})
