import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { escapadeTowerCatches, escapadeTowerLevel } from '../helpers/jumpingEscapadeScenarios.mjs'

for (const config of escapadeTowerCatches) {
  test(`Escapade catches a fall beside the ${config.name} with normal controls`, async ({ page }, info) => {
    const authored = JSON.parse(await readFile(new URL('../../public/levels/jumping/escapade.jump-level.json', import.meta.url), 'utf8'))
    const level = escapadeTowerLevel(authored, config)
    await useLevelFixtures(page, [level])
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: 'Play Escapade', exact: true })
    await expect(play).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-10-13T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    const read = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    const away = config.away > 0 ? 'd' : 'a', toward = config.away > 0 ? 'a' : 'd'
    await page.keyboard.down('Shift'); await page.keyboard.down(away)
    let departure
    for (let frame = 0; frame < 100; frame++) {
      await page.clock.runFor(8); departure = await read()
      if ((departure.x - config.edgeX) * config.away >= 10) break
    }
    expect((departure.x - config.edgeX) * config.away).toBeGreaterThanOrEqual(10)
    await page.keyboard.up(away); await page.keyboard.up('Shift'); await page.keyboard.down(toward)
    const samples = new Map()
    let caught
    for (let frame = 0; frame < 80; frame++) {
      await page.clock.runFor(8); caught = await read()
      for (const sample of await page.evaluate(() => window.jumpingMotion.read().recent)) samples.set(sample.time, sample)
      if (caught.signals.mode === 'hang') break
    }
    await page.keyboard.up(toward)
    expect([...samples.values()].some(sample => !sample.signals.grounded)).toBe(true)
    expect(caught.signals.mode).toBe('hang')
    await page.clock.runFor(400)
    const settled = await read()
    expect(settled.signals.mode).toBe('hang')
    expect(settled.x).toBeCloseTo(config.edgeX + config.away * 14, 1)
    expect(settled.y).toBeCloseTo(config.edgeY + 74, 1)
    expect(settled.vx).toBe(0); expect(settled.vy).toBe(0)
    await page.screenshot({ path: info.outputPath('tower-catch.png') })
    await page.keyboard.down('Space'); await page.clock.runFor(80); await page.keyboard.up('Space'); await page.clock.runFor(120)
    const released = await read()
    expect(released.signals.mode).not.toBe('hang')
    expect(errors).toEqual([])
    await writeFile(info.outputPath('tower-catch.json'), JSON.stringify({ config, departure, caught, settled, released, samples: [...samples.values()] }, null, 2))
  })
}
