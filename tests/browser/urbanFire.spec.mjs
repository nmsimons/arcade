import { test, expect } from './helpers/test.mjs'
import { hold, tap } from './helpers/controller.mjs'

async function setup(page, controller = false) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(controller => {
    if (controller) {
      window.testPad = { index: 1, id: 'Urban Fire controller', mapping: 'standard', connected: true,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, window.testPad] })
    }
    window.tireAudio={started:0,stopped:0}
    window.impactAudio={started:0}
    for(const method of ['start','stop']){
      const original=AudioBufferSourceNode.prototype[method]
      AudioBufferSourceNode.prototype[method]=function(...args){
        if(this.loop)window.tireAudio[method==='start'?'started':'stopped']++
        if(method==='start'&&!this.loop&&Math.abs((this.buffer?.duration??0)-.34)<.0001)window.impactAudio.started++
        return original.apply(this,args)
      }
    }
    const proto = CanvasRenderingContext2D.prototype
    for (const method of ['fillRect', 'drawImage', 'ellipse', 'fillText', 'lineTo', 'stroke']) {
      const original = proto[method]
      proto[method] = function (...args) {
        if (this.canvas.getAttribute('aria-label') === 'Urban Fire battlefield') {
          if (method === 'fillRect' && args[0] === 0 && args[1] === 0 && args[2] === this.canvas.width && args[3] === this.canvas.height) {
            window.urbanFrame = { width: this.canvas.width, height: this.canvas.height, enemies: [], shots: [], hud: [], skids:0 }
          }
          const frame = window.urbanFrame
          if (frame) {
            const { a, b, c, d, e, f } = this.getTransform(), transform = { a, b, c, d, e, f }
            if (method === 'drawImage') frame.city = { width: args[0].width, height: args[0].height, transform }
            // Ground shadows retain the physical centers and headings while
            // the projected armor banks and its turret articulates above them.
            if (method === 'ellipse' && args[2] === 16 && args[3] === 9) frame.jeep = transform
            if (method === 'ellipse' && args[2] === 22 && args[3] === 19) frame.enemies.push(transform)
            // Each shaded jeep round has one cream nose at its collision pose.
            if (method === 'ellipse' && this.fillStyle === '#f5edcf') frame.shots.push(transform)
            if (method === 'fillText') frame.hud.push({ text: args[0], transform })
            if (method === 'stroke' && this.strokeStyle === '#101714' && Math.abs(this.lineWidth - 2.1) < .001) frame.skids++
          }
        }
        return original.apply(this, args)
      }
    }
  }, controller)
  await page.goto('/urban-fire')
  await expect(page.getByRole('heading', { name: 'Urban Fire', exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(32)
}
const frame = async page => { await page.clock.runFor(32); return page.evaluate(() => window.urbanFrame) }
const position = f => ({ x: (f.width / 2 - f.city.transform.e) / f.city.transform.a, y: (f.height / 2 - f.city.transform.f) / f.city.transform.d })
function centered(f) {
  expect(f.jeep.e).toBeCloseTo(f.width / 2, 3); expect(f.jeep.f).toBeCloseTo(f.height / 2, 3)
  expect([f.city.width, f.city.height]).toEqual([3648, 3148])
  for (const h of f.hud) expect(h.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
}

test('hard corners leave temporary rubber and squeal, while parked steering and pause stay quiet',async({page})=>{
  // This samples every frame through driving, a long pause, and the full skid fade.
  test.setTimeout(60000)
  await setup(page);await page.getByRole('button',{name:'Deploy',exact:true}).click()
  await page.keyboard.down('ArrowRight');await page.clock.runFor(400);await page.keyboard.up('ArrowRight')
  expect((await frame(page)).skids).toBe(0)
  expect(await page.evaluate(()=>window.tireAudio.started)).toBe(0)
  // Reach the open cross street before turning out of the workshop alley.
  await page.keyboard.down('ArrowUp');await page.clock.runFor(2800)
  expect((await frame(page)).skids).toBe(0)
  await page.keyboard.down('ArrowRight');await page.clock.runFor(500)
  await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowUp')
  const turning=await frame(page)
  expect(turning.skids).toBeGreaterThan(5)
  expect(turning.hud.some(item=>/TACTICAL|MINIMAP/.test(item.text))).toBe(false)
  expect(await page.evaluate(()=>window.tireAudio.started)).toBeGreaterThan(0)
  await page.keyboard.press('p');const paused=await frame(page)
  const audio=await page.evaluate(()=>window.tireAudio)
  expect(audio.stopped).toBe(audio.started)
  await page.clock.runFor(4000)
  expect((await frame(page)).skids).toBe(paused.skids)
  await page.keyboard.press('p');await page.clock.runFor(4500)
  expect((await frame(page)).skids).toBe(0)
})

test('tanks arrive under parachutes, freeze while paused and become active only after landing', async ({ page }) => {
  await setup(page);await page.getByRole('button',{name:'Deploy',exact:true}).click()
  const warning=await frame(page)
  expect(warning.enemies).toHaveLength(0)
  expect(warning.hud.some(item=>item.text==='0 HOSTILES · 2 INBOUND')).toBe(true)
  await page.clock.runFor(1550)
  const descending=await frame(page)
  expect(descending.enemies).toHaveLength(1)
  expect(descending.hud.some(item=>item.text==='0 HOSTILES · 2 INBOUND')).toBe(true)
  await page.keyboard.press('p');await frame(page)
  const frozen=await page.locator('canvas').evaluate(canvas=>canvas.toDataURL())
  await page.clock.runFor(1800)
  expect(await page.locator('canvas').evaluate(canvas=>canvas.toDataURL())).toBe(frozen)
  await page.keyboard.press('p');await page.clock.runFor(4200)
  const landed=await frame(page)
  expect(landed.enemies).toHaveLength(2)
  expect(landed.hud.some(item=>item.text==='2 HOSTILES')).toBe(true)
  expect(landed.hud.some(item=>item.text.startsWith('WAVE 01'))).toBe(true)
})

test('fixed battlefield stays centered while driving, zooming, pausing and resizing', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('Enter')
  const before = await frame(page); centered(before)
  await page.keyboard.down('ArrowRight');await page.clock.runFor(500);await page.keyboard.up('ArrowRight')
  const parked=await frame(page)
  expect(position(parked)).toEqual(position(before))
  expect(parked.jeep).toEqual(before.jeep)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(800); await page.keyboard.up('ArrowUp')
  const moved = await frame(page); centered(moved)
  expect(position(moved).y).toBeLessThan(position(before).y - 35)
  await page.keyboard.press('p'); await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  const frozen = position(await frame(page))
  for (const [width, height, zoom] of [[640, 480, .8], [2560, 1600, 1.6], [3440, 1440, 1.44], [1280, 800, .8]]) {
    await page.setViewportSize({ width, height })
    await expect(page.locator('canvas')).toHaveAttribute('width', String(width))
    await expect(page.locator('canvas')).toHaveAttribute('height', String(height))
    const output = await frame(page); centered(output)
    expect(output.city.transform.a).toBeCloseTo(zoom, 5)
    expect(position(output).x).toBeCloseTo(frozen.x, 3); expect(position(output).y).toBeCloseTo(frozen.y, 3)
  }
  await page.keyboard.press('p'); await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await page.keyboard.press('Escape'); await expect(page).toHaveURL(/\/$/)
})

test('jeep firing has no in-flight cap, pause freezes combat, and focus loss pauses', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await page.clock.runFor(32) }
  expect((await frame(page)).shots).toHaveLength(8)
  await page.keyboard.press('p'); const before = await frame(page)
  const frozenCanvas = await page.locator('canvas[aria-label="Urban Fire battlefield"]').evaluate(canvas=>canvas.toDataURL())
  await page.clock.runFor(2000)
  const after = await frame(page)
  expect(after.shots).toEqual(before.shots); expect(after.enemies).toEqual(before.enemies)
  expect(await page.locator('canvas[aria-label="Urban Fire battlefield"]').evaluate(canvas=>canvas.toDataURL())).toBe(frozenCanvas)
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
})

test('the jeep collects armor in the workshop alley and meets solid civic cover beyond it', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  const start = position(await frame(page))
  expect((await frame(page)).hud.some(item=>item.text==='ARMOR 3')).toBe(true)
  await page.clock.runFor(1250)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(1600)
  expect((await frame(page)).hud.some(item=>item.text==='ARMOR 4')).toBe(true)
  expect((await frame(page)).hud.some(item=>/UPGRADED|REPAIRED/.test(item.text))).toBe(false)
  await page.clock.runFor(3200); await page.keyboard.up('ArrowUp')
  const end = position(await frame(page))
  expect(end.x).toBeCloseTo(start.x, 2)
  expect(start.y - end.y).toBeGreaterThan(380)
  // This reaches the far street after crossing the full alley. The civic wing
  // beyond that street must still stop the car at its real southern facade.
  expect(end.y).toBeGreaterThanOrEqual(502)
  expect(end.y).toBeLessThan(540)
})

test('waterfront buildings and debris stop the jeep before the invisible map limit', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  const start = position(await frame(page))
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(5000)
  const stopped = position(await frame(page))
  expect(stopped.x).toBeCloseTo(start.x, 2)
  expect(stopped.y).toBeGreaterThan(1040)
  expect(stopped.y).toBeLessThan(1070)
  expect(await page.evaluate(()=>window.impactAudio.started)).toBe(1)
  await page.clock.runFor(500); await page.keyboard.up('ArrowDown')
  expect(position(await frame(page)).y).toBeCloseTo(stopped.y, 2)
  expect(await page.evaluate(()=>window.impactAudio.started),'holding the throttle against the building stays quiet').toBe(1)
})

test('controller deploys, turns, uses triggers, fires and resumes without stale inputs', async ({ page }) => {
  await setup(page, true)
  await hold(page, 7, .7); await tap(page, 0)
  const start = position(await frame(page))
  const parkedHeading=(await frame(page)).jeep
  await page.evaluate(()=>{window.testPad.axes[0]=.6});await page.clock.runFor(200)
  expect((await frame(page)).jeep).toEqual(parkedHeading)
  await page.evaluate(()=>{window.testPad.axes[0]=0})
  await page.clock.runFor(300); expect(position(await frame(page)).y).toBeCloseTo(start.y, 3)
  await hold(page, 7, 0); await frame(page); await hold(page, 7, .7); await page.clock.runFor(500)
  expect(position(await frame(page)).y).toBeLessThan(start.y - 10)
  await hold(page, 7, 0)
  await page.clock.runFor(700)
  const reverseStart = position(await frame(page))
  await hold(page, 6, 1); await page.clock.runFor(700); await hold(page, 6, 0)
  expect(position(await frame(page)).y).toBeGreaterThan(reverseStart.y + 10)
  await page.evaluate(() => { window.testPad.axes[0] = .6 }); await page.clock.runFor(200)
  const turned = await frame(page); expect(Math.abs(turned.jeep.a)).toBeGreaterThan(.15)
  await page.evaluate(() => { window.testPad.axes[0] = 0 }); await tap(page, 0)
  expect((await frame(page)).shots).toHaveLength(1)
  await tap(page, 9); await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await tap(page, 1); await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await page.evaluate(() => { window.testPad.connected = false }); await frame(page)
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
})
