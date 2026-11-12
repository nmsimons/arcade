import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { desktopTarget } from '../../desktop/packaging.mjs'
import { decodeLevelFile } from '../../src/games/jumping/levelAssets.ts'
import { parseCampaign } from '../../src/games/jumping/campaign.ts'
import { linkOpen, resolveCampaign, savedProgress } from '../../src/games/jumping/facility.ts'

const root = resolve(import.meta.dirname, '../..')
const packaged = process.env.ARCADE_TEST_PACKAGED === '1'
const product = JSON.parse(readFileSync(join(root, 'release/products/arcade.json'), 'utf8'))
const target = desktopTarget(product)
// The first course a fresh save may open by its link, as the facility's own wiring decides, wherever the
// areas and the collection put it.
const levels = join(root, 'public/levels/jumping')
const files = JSON.parse(readFileSync(join(levels, 'index.json'), 'utf8')).levels
const byFile = new Map(files.map(file => [file, decodeLevelFile(readFileSync(join(levels, file), 'utf8'))]))
const byId = new Map([...byFile.values()].map(level => [level.id, level]))
const campaign = resolveCampaign(parseCampaign(JSON.parse(readFileSync(join(root, 'public/levels/jumping-campaign.json'), 'utf8'))), byId)
const fresh = savedProgress(campaign, byId, () => null, () => false, { getItem: () => null })
const openCourse = campaign.wings.flatMap(wing => wing.courses).find(id => linkOpen(campaign, fresh, byId, id))
const firstCourse = files.find(file => byFile.get(file).id === openCourse)
// Electron installs its development binary on demand; packaged runs use the
// tested executable directly and never download a separate runtime.
const executablePath = process.env.ARCADE_TEST_EXECUTABLE || (packaged ? join(root, 'desktop/out', target.directory, target.executable)
  : createRequire(join(root, 'desktop/package.json'))('electron'))
const launch = directory => electron.launch({
  executablePath,
  chromiumSandbox: true,
  args: packaged ? [] : [join(root, 'desktop')],
  env: { ...process.env, ARCADE_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined },
})

test('installed assets, deep routes, file saves, and fullscreen work without a server', async ({}, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'arcade-desktop-'))
  let app
  try {
    app = await launch(directory)
    let page = await app.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('heading', { level: 1, name: 'Dream Large Arcade' })).toBeVisible()
    expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null)).toBe(process.platform === 'darwin')
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Play offline on your computer', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Quit arcade', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('desktop-menu.png') })
    const catalog = await page.evaluate(async () => {
      const response = await fetch('/levels/jumping/index.json')
      return { status: response.status, value: await response.json() }
    })
    expect(catalog.status).toBe(200)
    expect(catalog.value).toBeTruthy()
    expect(await page.evaluate(async () => (await fetch('/levels/jumping/missing-file.json')).status)).toBe(404)
    await page.evaluate(() => {
      if (typeof window.require !== 'undefined') throw new Error('Node leaked into the renderer')
      window.arcadeDesktop.storage.setItem('arcade.jumping.times.v1', '{"desktop-test":42}')
      localStorage.setItem('arcade.jumping.times.v1', '{"browser-only":1}')
    })
    await page.getByRole('button', { name: 'Toggle fullscreen', exact: true }).click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true)
    await page.getByRole('button', { name: 'Toggle fullscreen', exact: true }).click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false)
    for (const [route, title] of [['hard-vacuum', 'Hard Vacuum'], ['bumper-ball', 'BUMPER BALL'], ['urban-fire', 'Urban Fire']]) {
      await page.goto(`arcade://game/${route}`)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('dialog').getByRole('button').first()).toBeVisible()
    }
    await page.goto('arcade://game/lab')
    await expect(page.locator('.jumping-game')).toBeVisible()
    await expect.poll(() => page.locator('.jumping-loading').count()).toBe(0)
    await page.reload()
    await expect(page.locator('.jumping-game')).toBeVisible()
    // L.A.B. opens the facility, and a fresh save wakes in Orientation.
    await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeVisible({ timeout: 30000 })
    // A course link opens once its door would: on a fresh save, the first course wired open from the start.
    const course = `arcade://game/lab/levels/built-in/${encodeURIComponent(firstCourse)}`
    await page.goto(course)
    await expect(page.locator('canvas[role="img"]')).toBeFocused()
    await expect(page).toHaveURL(course)
    // Saved level URLs contain .json but represent pages, not asset requests.
    await page.reload()
    await expect(page.locator('canvas[role="img"]')).toBeFocused()
    await expect(page).toHaveURL(course)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(errors).toEqual([])
    const firstClosed = app.waitForEvent('close')
    await page.getByRole('button', { name: 'Back to arcade', exact: true }).click()
    await page.getByRole('button', { name: 'Quit arcade', exact: true }).click()
    await firstClosed
    app = undefined
    app = await launch(directory)
    page = await app.firstWindow()
    await expect(page.getByRole('button', { name: 'Quit arcade', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.arcadeDesktop.storage.getItem('arcade.jumping.times.v1'))).toBe('{"desktop-test":42}')
    const closed = app.waitForEvent('close')
    await page.getByRole('button', { name: 'Quit arcade', exact: true }).click()
    await closed
    app = undefined
  } finally {
    if (app) await app.close()
    // Only remove the unique test directory created above.
    rmSync(directory, { recursive: true, force: true })
  }
})
