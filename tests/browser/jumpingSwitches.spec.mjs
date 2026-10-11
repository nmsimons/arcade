import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, restartFromPause } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'

async function open(page, level) {
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, arc = proto.arc, rect = proto.roundRect, fill = proto.fillRect
    proto.arc = function (x, y, radius, ...rest) {
      if (radius === 11 && ['#a9d56b', '#9aa38e'].includes(this.fillStyle)) this.canvas.exitOn = this.fillStyle === '#a9d56b'
      return arc.call(this, x, y, radius, ...rest)
    }
    proto.roundRect = function (x, y, w, h, ...rest) {
      if (this.fillStyle === '#b3a28d' && w === 120 && h === 20) {
        if (x === 700) this.canvas.liftY = y
        if (y === 500) this.canvas.platformX = x
      }
      return rect.call(this, x, y, w, h, ...rest)
    }
    proto.fillRect = function (x, y, w, h) {
      if (w === 56 && h === 3 && ['#c4a66b', '#9bb878'].includes(this.fillStyle)) this.canvas.removedGoalPlate = true
      if (x === 320 && w === 200 && h === 3 && ['#c4a66b', '#9bb878'].includes(this.fillStyle)) this.canvas.plateY = y
      return fill.call(this, x, y, w, h)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  return canvas
}
const x = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1)?.x ?? 160)
async function walkTo(page, target) {
  const from = await x(page), key = target > from ? 'd' : 'a'
  await page.keyboard.down(key)
  for (let i = 0; i < 50 && (key === 'd' ? await x(page) < target : await x(page) > target); i++) await page.clock.runFor(100)
  await page.keyboard.up(key); await page.clock.runFor(350)
}

test('a logic-only XOR relay powers only the corresponding light, with release, competing load and restart', async ({ page }, info) => {
  const level = readLevelAsset('logic-relay-exclusive.json')
  // A held Switch plate lets the normal player controls exercise multiple inputs.
  level.triggers[1].behavior = 'switch'
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, arc = proto.arc, text = proto.fillText
    proto.arc = function (x, y, radius, ...rest) {
      if (y === 680 && radius === 11 && ['#a9d56b', '#9aa38e'].includes(this.fillStyle)) {
        this.canvas.exclusiveLights ??= {}
        this.canvas.exclusiveLights[x] = this.fillStyle === '#a9d56b'
      }
      return arc.call(this, x, y, radius, ...rest)
    }
    proto.fillText = function (value, ...args) {
      if (['XOR', '¬XOR'].includes(value)) this.canvas.logicNodeDrawn = true
      return text.call(this, value, ...args)
    }
  })
  const canvas = await open(page, level)
  // Stop before the plate center to allow for the player's ordinary braking.
  const stopAt = async target => {
    const direction = target > await x(page) ? 1 : -1, key = direction === 1 ? 'd' : 'a'
    await page.keyboard.down(key)
    for (let i = 0; i < 300 && (await x(page) - (target - direction * 50)) * direction < 0; i++) await page.clock.runFor(16)
    await page.keyboard.up(key); await page.clock.runFor(350)
  }
  const lights = () => canvas.evaluate(c => Object.entries(c.exclusiveLights ?? {}).filter(([, on]) => on).map(([x]) => Number(x)))
  expect(await lights()).toEqual([])
  await stopAt(370); expect(await lights()).toEqual([370])
  await page.screenshot({ path: info.outputPath('exclusive-light-1.png') })
  await stopAt(480); expect(await lights()).toEqual([])
  await stopAt(610); expect(await lights()).toEqual([610])
  await stopAt(480); expect(await lights()).toEqual([610])
  await stopAt(370); expect(await lights()).toEqual([])
  await page.screenshot({ path: info.outputPath('exclusive-two-buttons.png') })
  await stopAt(480); expect(await lights()).toEqual([610])
  expect(await canvas.evaluate(c => !!c.logicNodeDrawn)).toBe(false)
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await lights()).toEqual([])
  await stopAt(370); expect(await lights()).toEqual([370])
})

for (const [behavior, startsOn] of [['pressure', false], ['switch', false], ['switch', true], ['toggle', false], ['toggle', true]]) {
  test(`${behavior}${startsOn ? ' starts on' : ''} works through normal controls and fresh restarts`, async ({ page }, info) => {
    const level = readLevelAsset('switch-modes.json')
    level.triggers[0].behavior = behavior
    if (behavior === 'switch' || behavior === 'toggle') level.triggers[0].startsOn = startsOn
    const canvas = await open(page, level)
    const on = () => canvas.evaluate(c => c.exitOn)
    const plateY = () => canvas.evaluate(c => c.plateY)
    expect(await on()).toBe(startsOn)
    expect(await plateY()).toBe(913)
    await walkTo(page, 420)
    expect(await x(page)).toBeGreaterThan(320); expect(await x(page)).toBeLessThan(520)
    expect(await on()).toBe(!startsOn)
    await page.clock.runFor(1000); expect(await on()).toBe(!startsOn)
    expect(await plateY()).toBe(917)
    await walkTo(page, 650)
    expect(await on()).toBe(behavior === 'pressure' ? false : !startsOn)
    expect(await plateY()).toBe(behavior === 'switch' ? 917 : 913)
    if (behavior === 'switch') await page.screenshot({ path: info.outputPath('switch-after-release.png') })
    await walkTo(page, 420)
    expect(await on()).toBe(behavior === 'toggle' ? startsOn : !startsOn)
    await page.screenshot({ path: info.outputPath(`${behavior}-${startsOn}.png`) })
    expect(await canvas.evaluate(c => !!c.removedGoalPlate)).toBe(false)
    if (behavior === 'toggle' && !startsOn) {
      await walkTo(page, 650); await walkTo(page, 420); expect(await on()).toBe(true)
    }
    if (behavior !== 'pressure' && !(behavior === 'switch' && startsOn)) {
      await page.keyboard.down('d'); await page.clock.runFor(4000); await page.keyboard.up('d')
      await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
    }
    if (await page.getByRole('dialog', { name: 'Level complete' }).count()) await page.getByRole('button', { name: 'Try again', exact: true }).click()
    else await restartFromPause(page)
    await page.clock.runFor(64); expect(await on()).toBe(startsOn)
    expect(await plateY()).toBe(913)
    expect(await x(page)).toBeLessThan(200)
  })
}

test('always-on exits and moving mechanisms start in their authored state and the exit is immediately usable', async ({ page }, info) => {
  const level = readLevelAsset('switch-modes.json')
  delete level.goal.power; delete level.goal.id; level.triggers = []
  level.mechanisms = level.mechanisms.filter(m => m.kind === 'lift').map(m => ({ ...m, power: 'always' }))
  const canvas = await open(page, level)
  expect(await canvas.evaluate(c => c.exitOn)).toBe(true)
  expect(await canvas.evaluate(c => c.liftY)).toBe(600)
  expect(await canvas.evaluate(c => c.platformX)).toBe(950)
  await page.keyboard.down('w'); await page.clock.runFor(1000); await page.keyboard.up('w')
  expect(await canvas.evaluate(c => c.liftY)).toBeLessThan(600)
  expect(await canvas.evaluate(c => c.platformX)).toBeGreaterThan(950)
  await page.screenshot({ path: info.outputPath('always-on.png') })
  await page.keyboard.down('d'); await page.clock.runFor(6000); await page.keyboard.up('d')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
})
