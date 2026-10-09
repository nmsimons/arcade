import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'

const accepted = new Set(['Untitled.jump-level.json', '01.json', '03.json', 'Coins.jump-level.json', 'Balls.jump-level.json'])
const records = JSON.parse(readFileSync(new URL('../fixtures/jumping-builtin-medal-runs.json', import.meta.url)))

for (const recording of records.runs.filter(run => accepted.has(run.file))) {
  test(`built-in ${recording.file} completes with current held keyboard controls`, async ({ page }, info) => {
    const data = JSON.parse(readFileSync(new URL(`../../public/levels/jumping/${recording.file}`, import.meta.url)))
    // This new whole-route Night test includes several lamps and a passive
    // mechanism wait in software Chromium. Existing medal deadlines are unchanged.
    test.setTimeout(recording.file === 'Balls.jump-level.json' ? 180000 : data.lighting?.nightMode ? 90000 : 60000)
    expect(recording.jumpModel).toBe('tap-hold')
    const errors = [], checkpoints = []; page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 852, height: 393 })
    await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') })
    await page.goto(`/untitled-jumping-game/levels/built-in/${encodeURIComponent(recording.file)}?motionDebug=1`)
    await expect(page.getByRole('img', { name: `${data.name}: reach the exit`, exact: true })).toBeFocused()
    await page.clock.pauseAt(new Date('2026-10-09T13:00:00Z'))
    await page.clock.runFor(64)
    await page.screenshot({ path: info.outputPath('fresh-start.png') })
    let held = new Set(), index = 0
    for (const segment of recording.trace) {
      const input = segment.input
      expect([-1, 0, 1]).toContain(input.move)
      expect(input.reach).toBe(false)
      expect('jumpStrength' in input).toBe(false)
      const wanted = new Set([input.move > 0 ? 'd' : input.move < 0 ? 'a' : '', input.jump ? 'Space' : '',
        input.climb ? 'w' : '', input.crouch || input.descend ? 's' : '', input.detach ? 'x' : ''].filter(Boolean))
      for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key)
      for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key)
      held = wanted
      const milliseconds = Math.round(segment.frames / 120 * 1000)
      // The Balls whole-route check asserts completion, not frame-by-frame
      // rendered transitions. Preserve every physics step with fewer rendered
      // frames during its long held inputs, including the 7.5-second delivery.
      if ((!wanted.size || recording.file === 'Balls.jump-level.json') && milliseconds > 500) await advanceJumpingPassiveWait(page, milliseconds)
      else await page.clock.runFor(milliseconds)
      checkpoints.push(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1)))
      await page.screenshot({ path: info.outputPath(`phase-${String(index++).padStart(2, '0')}.png`) })
      if (await page.getByRole('dialog', { name: 'Level complete', exact: true }).isVisible()) break
    }
    for (const key of held) await page.keyboard.up(key)
    // RAF input phases can leave the doorway fade unfinished. Score is already
    // locked on entry; advance only an already-started fade, never a failed route.
    await page.clock.runFor(64)
    const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
    for (let fade = 0; fade < 16 && !await complete.isVisible()
      && await page.getByText('Entering the exit', { exact: true }).isVisible(); fade++) await page.clock.runFor(64)
    await expect(complete).toBeVisible()
    await expect(complete.getByText('Gold medal', { exact: true })).toBeVisible()
    const [minutes, seconds] = (await complete.locator('.jumping-result-time').innerText()).split(':').map(Number)
    expect(minutes * 60 + seconds).toBeLessThanOrEqual(data.times.gold)
    expect(errors).toEqual([])
    await writeFile(info.outputPath('route-checkpoints.json'), JSON.stringify({ file: recording.file, checkpoints, elapsed: minutes * 60 + seconds }, null, 2))
    await page.screenshot({ path: info.outputPath('completed.png') })
  })
}
