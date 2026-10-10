import {test,expect} from './helpers/test.mjs'
import {useLevelFixtures} from './helpers/jumpingLevels.mjs'
import {blankTrial,levelProblems} from '../../src/games/jumping/level.ts'

async function start(page,level) {
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page,[level])
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(120)
}
const lipLevel=()=>({...blankTrial(),height:600,floor:500,spawn:{x:530,y:300},goal:{x:900,y:500},platforms:[{x:500,y:300,w:200,h:200}]})
const state=page=>page.evaluate(()=>window.jumpingMotion.read().recent.at(-1))

test('keyboard action cues predict lowering, a held safe hang, and a separate Down drop',async({page},info)=>{
  await start(page,lipLevel())
  const hint=page.getByLabel('Available actions')
  await expect(hint).toHaveText('Down to lower to a safe hang')
  await page.keyboard.down('s');await page.clock.runFor(1600)
  expect((await state(page)).signals.mode).toBe('hang')
  await expect(hint).toContainText('Release Down, then Down again to drop')
  await expect(hint).toContainText('Space to jump away')
  await page.screenshot({path:info.outputPath('lowered-safe-hang-cue.png')})
  await page.setViewportSize({width:390,height:844});await page.clock.runFor(120)
  const bounds=await hint.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390)
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(844)
  await page.screenshot({path:info.outputPath('narrow-screen-safe-hang-cue.png')})
  await page.keyboard.up('s');await page.clock.runFor(120)
  await expect(hint).toContainText('X to let go')
  await page.keyboard.down('s');await page.clock.runFor(32)
  expect((await state(page)).signals.mode).toBe('free')
  expect((await state(page)).vy).toBeGreaterThan(0)
})

test('keyboard Up under reverse gravity lowers to a held hang and needs a new press to pull up',async({page},info)=>{
  const level={...blankTrial(),height:600,floor:500,spawn:{x:530,y:500},goal:{x:900,y:500},
    platforms:[{x:500,y:100,w:220,h:20}],gravityPlates:[{id:'reverse',x:300,y:0,w:500,h:500,gravity:-1,power:'always'}]}
  await start(page,level)
  // A normal input starts the challenge; waiting on its ready frame does not
  // advance field motion. Release before reaching inverted support.
  await page.keyboard.down('w');await page.clock.runFor(16);await page.keyboard.up('w');await page.clock.runFor(1000)
  const supported=await state(page)
  expect(supported.signals.inverted).toBe(true);expect(supported.signals.grounded).toBe(true)
  await expect(page.getByLabel('Available actions')).toHaveText('Up to lower to a safe hang')
  await page.keyboard.down('w');await page.clock.runFor(1600)
  expect((await state(page)).signals.mode).toBe('hang')
  await expect(page.getByLabel('Available actions')).toContainText('Release Up, then Up again to pull up')
  await page.screenshot({path:info.outputPath('reverse-gravity-safe-hang-cue.png')})
  await page.keyboard.up('w');await page.clock.runFor(120)
  await page.keyboard.down('w');await page.clock.runFor(120)
  expect((await state(page)).signals.mode).toBe('mantle')
})

test('a blocked lowering path advertises and executes crouch',async({page},info)=>{
  const level=lipLevel();level.platforms.push({x:450,y:300,w:45,h:200})
  await start(page,level)
  await expect(page.getByLabel('Available actions')).toHaveText('Down to crouch')
  await page.keyboard.down('s');await page.clock.runFor(400)
  const sample=await state(page)
  expect(sample.signals.grounded).toBe(true);expect(sample.signals.mode).toBe('free')
  expect(sample.input.crouch).toBe(true);expect(sample.x).toBe(530)
  await page.screenshot({path:info.outputPath('blocked-lip-crouch-cue.png')})
})

test('keyboard water feedback matches floor crouching, standing and swimming up and explains it in help',async({page},info)=>{
  const level=blankTrial();level.spawn={x:700,y:920}
  level.gravityPlates=[{id:'water',x:200,y:400,w:1000,h:520,gravity:-1,effect:'water',power:'always'}]
  await start(page,level)
  await page.keyboard.down('s');await page.clock.runFor(2500)
  const bottom=await state(page)
  expect(bottom.signals.grounded).toBe(true);expect(bottom.input.crouch).toBe(true)
  expect(bottom.points[2][1]).toBeLessThan(bottom.points[0][1]-7)
  await expect(page.getByLabel('Available actions')).toContainText('Move to walk')
  await page.keyboard.up('s');await page.clock.runFor(500)
  const standing=await state(page)
  expect(standing.signals.grounded).toBe(true)
  expect(standing.points[2][1]).toBeLessThan(standing.points[0][1]-20)
  await expect(page.getByLabel('Available actions')).toContainText('Down to crouch')
  await page.keyboard.down('w');await page.clock.runFor(1600)
  const rising=await state(page)
  expect(rising.signals.grounded).toBe(false)
  expect(rising.y).toBeLessThan(bottom.y-80)
  expect(rising.vy).toBeGreaterThanOrEqual(-100.01)
  await expect(page.getByLabel('Available actions')).toContainText('Up to swim up')
  await page.screenshot({path:info.outputPath('water-buoyancy-cue.png')})
  await page.keyboard.up('w');await page.keyboard.press('Escape');await page.clock.runFor(32)
  await page.getByRole('button',{name:'Controls',exact:true}).click()
  const instructions=page.getByRole('region',{name:'How to play'})
  expect(await instructions.evaluate(section=>section.scrollTop)).toBe(0)
  await expect(instructions).toContainText('upright float at your reached depth underwater')
  await expect(instructions).toContainText('release, then press again to leave')
  await page.screenshot({path:info.outputPath('controls-open-at-first-binding.png')})
  await page.keyboard.press('PageDown');await page.clock.runFor(32)
  expect(await instructions.evaluate(section=>section.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({path:info.outputPath('water-controls-help.png')})
})
