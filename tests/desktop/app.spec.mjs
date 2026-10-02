import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { desktopTarget } from '../../desktop/packaging.mjs'

const root = resolve(import.meta.dirname, '../..')
const packaged = process.env.ARCADE_TEST_PACKAGED === '1'
const product = JSON.parse(readFileSync(join(root, 'release/products/arcade.json'), 'utf8'))
const target = desktopTarget(product)
const executablePath = process.env.ARCADE_TEST_EXECUTABLE || (packaged ? join(root, 'desktop/out', target.directory, target.executable) : join(root, 'desktop/node_modules/electron/dist', process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'electron.exe' : 'electron'))
const launch = directory => electron.launch({
  executablePath,
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
    await page.goto('arcade://game/untitled-jumping-game')
    await expect(page.locator('.jumping-game')).toBeVisible()
    await expect.poll(() => page.locator('.jumping-loading').count()).toBe(0)
    await page.reload()
    await expect(page.locator('.jumping-game')).toBeVisible()
    const firstLevel = page.locator('.jumping-level-card').first()
    await firstLevel.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/levels\/built-in\//)
    await expect(page.locator('canvas[role="img"]')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(errors).toEqual([])
    await app.close(); app = undefined
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
