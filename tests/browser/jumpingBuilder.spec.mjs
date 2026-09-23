import { test, expect } from './helpers/test.mjs'

async function open(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.jumpCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.jumpCamera) {
        const body = this.getTransform(), camera = this.canvas.jumpCamera
        window.jumpPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
}
async function dragWorld(page, start, end) {
  const canvas = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  const camera = await page.getByRole('application', { name: 'Level canvas' }).evaluate(canvas => { const c = canvas.jumpCamera; return { a: c.a, d: c.d, e: c.e, f: c.f, ratio: devicePixelRatio } })
  const x = v => canvas.x + (v * camera.a + camera.e) / camera.ratio, y = v => canvas.y + (v * camera.d + camera.f) / camera.ratio
  await page.mouse.move(x(start.x), y(start.y)); await page.mouse.down()
  await page.mouse.move(x(end.x), y(end.y), { steps: 8 }); await page.mouse.up()
}

test('build, edit, undo, save, playtest, return and reload a custom level', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Slope workshop')
  await page.getByRole('button', { name: 'Polygon', exact: true }).click()
  for (const p of [{x:360,y:920},{x:660,y:800},{x:660,y:920}]) await dragWorld(page,p,p)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('120')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('400')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “Slope workshop”')
  await page.clock.runFor(600)
  await page.screenshot({ path: info.outputPath('level-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: false }).click()
  await page.clock.runFor(100)
  await expect(page.locator('canvas[aria-label="Slope workshop: reach the flag"]')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d'); await page.clock.runFor(100)
  const p = await page.evaluate(() => window.jumpPlayer)
  expect(p.x).toBeGreaterThan(450); expect(p.y).toBeLessThan(900)
  await page.screenshot({ path: info.outputPath('custom-level-playtest.png') })
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  // Let React's lazy-route scheduling run normally across the reload.
  await page.clock.resume(); await page.reload()
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  const levels = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.levels.v1')))
  expect(levels).toHaveLength(1); expect(levels[0].platforms).toHaveLength(1)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('combobox', { name: 'Saved levels' }).selectOption({ label: 'Slope workshop' })
  await page.getByRole('button', { name: 'Load level', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  expect(errors).toEqual([])
})

test('polygon terrain can be reshaped and removed, with undo restoring it', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('button', { name: 'Polygon', exact: true }).click()
  for (const p of [{x:340,y:920},{x:560,y:800},{x:800,y:920}]) await dragWorld(page,p,p)
  await page.keyboard.press('Enter')
  await dragWorld(page, { x: 560, y: 800 }, { x: 560, y: 760 })
  await page.clock.runFor(600)
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.draft.v1')))
  expect(draft.platforms[0].y).toBe(760); expect(draft.platforms[0].polygon).toHaveLength(3)
  await page.getByRole('button', { name: 'Delete object' }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' }).locator('option')).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' }).locator('option')).toHaveCount(4)
})

test('exported levels import successfully and bad imports leave the current draft intact', async ({ page }) => {
  await open(page)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Export me')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  expect(download.suggestedFilename()).toBe('Export me.jump-level.json')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Export me')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Imported')
  await page.getByLabel('Import level file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"platforms":[]}') })
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Could not import')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Export me')
})

test('storage failures are visible and do not falsely report a successful save', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage full') } })
  await open(page)
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Could not save')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Saved levels' }).locator('option')).toHaveCount(1)
})

test('builder controls and drawing area remain usable on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page)
  await expect(page.getByRole('button', { name: 'Playtest' })).toBeInViewport()
  const box = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  expect(box.width).toBeGreaterThan(200); expect(box.height).toBeGreaterThan(130)
  expect(await page.locator('.jumping-builder').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('level-builder-mobile.png') })
})

test('author terrain, a free ladder and an anchored rope with portable export', async ({ page }, info) => {
  await open(page)
  await expect(page.getByRole('button', {name:'Crate', exact:true})).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Level name' }).fill('My rope course')
  await page.getByRole('button', {name:'Rectangle', exact:true}).click()
  await dragWorld(page,{x:800,y:400},{x:1100,y:460})
  await page.getByRole('button', {name:'Rope', exact:true}).click()
  await dragWorld(page,{x:1100,y:460},{x:1100,y:800})
  await expect(page.getByRole('button', {name:'Detach anchor', exact:true})).toBeVisible()
  await page.getByRole('button', {name:'Ladder', exact:true}).click()
  await dragWorld(page,{x:600,y:400},{x:600,y:800})
  await expect(page.getByRole('spinbutton', {name:'Object x', exact:true})).toHaveValue('600')
  await page.getByRole('spinbutton', {name:'Object x', exact:true}).fill('640')
  await page.getByRole('button', {name:'Save level', exact:true}).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.platforms).toHaveLength(1); expect(exported.platforms[0].h).toBe(60)
  expect(exported.climbables.ropes[0].anchor.platform).toBe(0)
  expect(exported.climbables.ladders[0].platform).toBe(-1); expect(exported.climbables.ladders[0].x).toBe(640)
  await page.screenshot({ path: info.outputPath('simple-level-elements.png') })
  await page.getByRole('button', {name:'Playtest'}).click(); await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'My rope course: reach the flag' })).toBeFocused()
  await page.getByRole('button', {name:'Return to builder'}).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await page.getByRole('button', {name:'Save level', exact:true}).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.levels.v1')).at(-1))
  expect(saved.platforms).toEqual(exported.platforms); expect(saved.climbables).toEqual(exported.climbables)
})

for (const controller of [false,true]) test(`${controller ? 'controller' : 'keyboard'} Down transfers onto its rope, descends and swings away from the wall`, async ({page},info) => {
  const level={version:1,id:'rappel-test',name:'Rappel test',width:1000,height:920,floor:920,spawn:{x:410,y:200},flag:{x:700,y:200},checkpoints:[],platforms:[{x:400,y:200,w:400,h:720}],climbables:{ladders:[],ropes:[{x:398,y:100,length:600,segments:28}]},props:[],robots:[],triggers:[],mechanisms:[],times:{gold:10,silver:20,bronze:40}}
  await page.addInitScript(({level,controller})=>{
    localStorage.setItem('arcade.jumping.draft.v1',JSON.stringify(level))
    if(controller){window.testPad={index:0,id:'Rappel pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]})}
  },{level,controller})
  await open(page);await page.getByRole('button',{name:'Playtest'}).click();await page.clock.runFor(100)
  if(controller)await page.evaluate(()=>{window.testPad.axes[1]=1})
  else await page.keyboard.down('s')
  await page.clock.runFor(350);await expect(page.locator('.jumping-state')).toHaveText('Lowering')
  await page.clock.runFor(2200);await expect(page.locator('.jumping-state')).toContainText('descending')
  const a=await page.evaluate(()=>window.jumpPlayer)
  await page.clock.runFor(600);const b=await page.evaluate(()=>window.jumpPlayer)
  expect(b.y).toBeGreaterThan(a.y+40);expect(b.x).toBeLessThan(388)
  await page.screenshot({path:info.outputPath('rappelling-from-ledge.png')})
  if(controller)await page.evaluate(()=>{window.testPad.axes[1]=0})
  else await page.keyboard.up('s')
  await page.clock.runFor(350)
  await expect(page.locator('.jumping-footer')).toContainText('Jump off rope')
  await expect(page.locator('.jumping-footer')).toContainText('Push off wall')
  const braced = await page.evaluate(() => window.jumpPlayer)
  if(controller)await page.evaluate(()=>{window.testPad.axes[0]=-1})
  else await page.keyboard.down('a')
  await page.clock.runFor(450)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  const swung = await page.evaluate(() => window.jumpPlayer)
  expect(swung.x).toBeLessThan(braced.x - 25)
  await page.screenshot({path:info.outputPath('rappel-push-off.png')})
  if(controller)await page.evaluate(()=>{window.testPad.axes[0]=0})
  else await page.keyboard.up('a')
  await page.clock.runFor(2200)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  // Wait for the feet to settle against the wall before testing a fresh push.
  for (let i = 0; i < 30 && Math.abs((await page.evaluate(() => window.jumpPlayer)).x - 377) > .1; i++) await page.clock.runFor(100)
  const returned = await page.evaluate(() => window.jumpPlayer)
  expect(returned.x).toBeCloseTo(377, 1)
  if(controller)await page.evaluate(()=>{window.testPad.buttons[1]={pressed:true,value:1}})
  else await page.keyboard.down('x')
  await page.clock.runFor(600)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  // Action gives one kick, without the additional pumping from held steering.
  expect((await page.evaluate(() => window.jumpPlayer)).x).toBeLessThan(returned.x - 12)
  if(controller)await page.evaluate(()=>{window.testPad.buttons[1]={pressed:false,value:0};window.testPad.buttons[0]={pressed:true,value:1}})
  else { await page.keyboard.up('x'); await page.keyboard.down('Space') }
  await page.clock.runFor(120)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} climbs a grid-snapped free ladder onto its neighboring cliff`, async ({ page }, info) => {
  const level = { version: 1, id: 'ladder-exit-test', name: 'Ladder exit test', width: 1000, height: 600, floor: 600,
    spawn: { x: 420, y: 600 }, flag: { x: 100, y: 200 }, checkpoints: [], platforms: [{ x: 0, y: 200, w: 400, h: 400 }],
    climbables: { ladders: [{ x: 420, top: 200, bottom: 600, platform: -1, side: 1 }], ropes: [] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(({ level, controller }) => {
    localStorage.setItem('arcade.jumping.draft.v1', JSON.stringify(level))
    if (controller) {
      window.testPad = { index: 0, id: 'Ladder pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
  }, { level, controller })
  await open(page); await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = -1 })
  else await page.keyboard.down('w')
  await page.clock.runFor(4300)
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await page.screenshot({ path: info.outputPath('ladder-top-transfer.png') })
  await page.clock.runFor(1000)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const top = await page.evaluate(() => window.jumpPlayer)
  expect(top.x).toBeCloseTo(380, 1); expect(top.y).toBeCloseTo(200, 1)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = 1 })
  else { await page.keyboard.up('w'); await page.keyboard.down('s') }
  await page.clock.runFor(350)
  await expect(page.locator('.jumping-state')).toHaveText('Lowering')
  await page.clock.runFor(1600)
  await expect(page.locator('.jumping-state')).toHaveText('Ladder · descending')
  const descending = await page.evaluate(() => window.jumpPlayer)
  expect(descending.x).toBeCloseTo(420, 1); expect(descending.y).toBeGreaterThan(300)
})

for (const anchorY of [200, 220]) for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} climbs onto a thin platform from a rope anchored at ${anchorY}`, async ({ page }, info) => {
  const level = { version: 1, id: 'rope-exit-test', name: 'Rope exit test', width: 1000, height: 600, floor: 600,
    spawn: { x: 400, y: 600 }, flag: { x: 700, y: 200 }, checkpoints: [], platforms: [{ x: 400, y: 200, w: 400, h: 20 }],
    climbables: { ladders: [], ropes: [{ x: 400, y: anchorY, length: 330, segments: 24, anchor: { platform: 0, x: 0, y: anchorY - 200 } }] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(({ level, controller }) => {
    localStorage.setItem('arcade.jumping.draft.v1', JSON.stringify(level))
    if (controller) {
      window.testPad = { index: 0, id: 'Rope pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
  }, { level, controller })
  await open(page); await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = -1 })
  else await page.keyboard.down('w')
  await page.clock.runFor(1000)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · ascending')
  await page.clock.runFor(4500)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const top = await page.evaluate(() => window.jumpPlayer)
  expect(top.x).toBeCloseTo(420, 1); expect(top.y).toBeCloseTo(200, 1)
  await page.screenshot({ path: info.outputPath('rope-platform-exit.png') })
})

test('snap aligns final terrain positions and resize edges, including previously offset terrain', async ({ page }, info) => {
  const level = { version: 1, id: 'grid-test', name: 'Grid test', width: 1000, height: 600, floor: 600,
    spawn: { x: 100, y: 600 }, flag: { x: 800, y: 600 }, checkpoints: [], platforms: [{ x: 403, y: 203, w: 203, h: 117 }],
    climbables: { ladders: [], ropes: [] }, props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(level => localStorage.setItem('arcade.jumping.draft.v1', JSON.stringify(level)), level)
  await open(page)
  await dragWorld(page, { x: 500, y: 250 }, { x: 523, y: 271 })
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('420')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('220')
  const zoom = await page.getByRole('application', { name: 'Level canvas' }).evaluate(canvas => canvas.jumpCamera.a / devicePixelRatio)
  await dragWorld(page, { x: 623, y: 337 + 14 / zoom }, { x: 660, y: 360 + 14 / zoom })
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('240')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('140')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('421')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('440')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('440')
  await page.getByRole('checkbox', { name: 'Snap 20' }).uncheck()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('447')
  await page.getByRole('checkbox', { name: 'Snap 20' }).check()
  await dragWorld(page, { x: 447, y: 220 }, { x: 466, y: 239 })
  await page.clock.runFor(600)
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.draft.v1')))
  expect(draft.platforms[0].polygon[0].map((v, i) => v + (i ? draft.platforms[0].y : draft.platforms[0].x))).toEqual([460, 240])
  await page.screenshot({ path: info.outputPath('aligned-grid.png') })
})
