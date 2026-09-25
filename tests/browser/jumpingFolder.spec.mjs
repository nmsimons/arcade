import { test as base, expect } from './helpers/test.mjs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { FIRST_LEVEL, JSON_LAB } from '../helpers/jumping-fixtures.mjs'
import { parseLevel, prepareLevelRopes } from '../../src/games/jumping/level.ts'

const level = (id, name) => ({ ...structuredClone(FIRST_LEVEL), id, name })
const names = page => page.locator('.jumping-level-card strong').allTextContents()
// A normal profile exercises persistent native handles rather than incognito storage.
const test = base.extend({
  context: async ({ playwright, baseURL, viewport }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'jumping-folder-browser-'))
    const context = await playwright.chromium.launchPersistentContext(profile, { channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true, baseURL, viewport })
    await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => [] }) })
    try { await use(context) } finally { await context.close(); await rm(profile, { recursive: true, force: true }) }
  },
})

async function installPicker(page) {
  await page.addInitScript(() => {
    window.folderPickerCalls = 0; window.folderPermissionRequests = 0
    // Real, structured-cloneable handles exercise IndexedDB across page reloads.
    // OPFS is only the browser test fixture; the app uses the user's chosen folder.
    window.showDirectoryPicker = async () => {
      window.folderPickerCalls++
      if (sessionStorage.getItem('cancelFolderPicker')) throw new DOMException('Cancelled', 'AbortError')
      const root = await navigator.storage.getDirectory()
      return root.getDirectoryHandle(sessionStorage.getItem('testFolder') || 'My levels', { create: true })
    }
    FileSystemHandle.prototype.queryPermission = async ({ mode }) => {
      const permission = sessionStorage.getItem('folderPermission') || 'granted'
      return permission === 'read-only' ? mode === 'read' ? 'granted' : 'prompt' : permission
    }
    FileSystemHandle.prototype.requestPermission = async () => {
      window.folderPermissionRequests++
      if (!navigator.userActivation.isActive) throw new DOMException('A click is required', 'SecurityError')
      if (sessionStorage.getItem('folderPermission') === 'denied') return 'denied'
      sessionStorage.setItem('folderPermission', 'granted')
      return 'granted'
    }
  })
}

async function seed(page, folder, files) {
  await page.evaluate(async ({ folder, files }) => {
    const root = await navigator.storage.getDirectory(), directory = await root.getDirectoryHandle(folder, { create: true })
    for (const [name, level] of Object.entries(files)) {
      const file = await directory.getFileHandle(name, { create: true }), writer = await file.createWritable()
      await writer.write(JSON.stringify(level)); await writer.close()
    }
  }, { folder, files })
}

async function openFolder(page, files = { '00-first.json': level('first', 'First local level') }) {
  await installPicker(page)
  await page.goto('/untitled-jumping-game')
  await seed(page, 'My levels', files)
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeEnabled()
}

for (const writable of [true, false]) test(`local templates create independent levels in a ${writable ? 'writable' : 'read-only'} folder`, async ({ page }, info) => {
  const source = { ...structuredClone(JSON_LAB), id: 'local-template', name: writable ? 'Local template' : 'A'.repeat(80) }
  const originalName = '00-source.jump-level.json', copyName = '00-source-copy-3.jump-level.json'
  const files = {
    [originalName]: source,
    '00-source-COPY.jump-level.json': { ...source, id: 'existing-copy' },
    '00-source-copy-2.jump-level.json': { ...source, id: 'existing-copy-2' },
  }
  await openFolder(page, files)
  if (!writable) {
    await page.evaluate(() => sessionStorage.setItem('folderPermission', 'read-only'))
    await page.reload()
    await expect(page.locator('.jumping-level-card')).toHaveCount(3)
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const template = page.getByRole('button', { name: `Use ${originalName} as template`, exact: true })
  await template.scrollIntoViewIfNeeded()
  await expect(template).toBeEnabled()
  expect(await page.locator('.builder-tools').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('local-template-library.png') })
  await template.click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue(`${source.name.slice(0, 73)} — copy`)
  await expect(page.getByRole('textbox', { name: 'Level file name' })).toHaveValue(copyName)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeFocused()
  let download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const exported = await download, copy = JSON.parse(await readFile(await exported.path(), 'utf8'))
  expect(exported.suggestedFilename()).toBe(copyName)
  expect(copy.id).not.toBe(source.id)
  expect(copy).toEqual({ ...parseLevel(prepareLevelRopes(source)), id: copy.id, name: `${source.name.slice(0, 73)} — copy` })
  await page.getByRole('textbox', { name: 'Level name' }).fill('My new route')
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).fill(String(source.width + 120))
  if (writable) {
    // Even explicitly reusing the source filename cannot overwrite the template.
    await page.getByRole('textbox', { name: 'Level file name' }).fill(originalName)
    await page.getByRole('button', { name: 'Save level', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('already exists or changed on disk')
    await page.getByRole('textbox', { name: 'Level file name' }).fill(copyName)
    await page.getByRole('button', { name: 'Save level', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Builder status' })).toContainText(`Saved “${copyName}”`)
  } else {
    download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save level', exact: true }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe(copyName)
    expect(JSON.parse(await readFile(await saved.path(), 'utf8'))).toEqual({ ...copy, name: 'My new route', width: source.width + 120 })
  }
  const onDisk = await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels'), files = {}
    for await (const entry of directory.values()) if (entry.kind === 'file') files[entry.name] = await (await entry.getFile()).text()
    return files
  })
  for (const [name, original] of Object.entries(files)) expect(onDisk[name]).toBe(JSON.stringify(original))
  expect(Object.keys(onDisk)).toHaveLength(writable ? 4 : 3)
  if (writable) expect(JSON.parse(onDisk[copyName])).toEqual({ ...copy, name: 'My new route', width: source.width + 120 })
})

test('reload reopens the remembered handle, reads disk changes, saves, and remembers a replacement folder', async ({ page }) => {
  await openFolder(page, { '02-second.json': level('second', 'Second'), '00-first.json': level('first', 'First') })
  expect(await names(page)).toEqual(['First', 'Second'])
  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('arcade.jumping.folder.v1')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result, request = db.transaction('preferences').objectStore('preferences').get('folder')
      request.onsuccess = () => { resolve({ keys: Object.keys(request.result).sort(), name: request.result.name, kind: request.result.handle.kind }); db.close() }
    }
  }))
  expect(stored).toEqual({ keys: ['handle', 'name'], name: 'My levels', kind: 'directory' })
  await seed(page, 'My levels', { '00-first.json': level('first', 'Changed on disk'), '01-added.json': level('added', 'New on disk') })
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); await (await root.getDirectoryHandle('My levels')).removeEntry('02-second.json') })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Changed on disk' })).toBeVisible()
  expect(await names(page)).toEqual(['Changed on disk', 'New on disk'])
  await expect(page.getByRole('button', { name: 'Local folder', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Saved after reload')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json” to My levels')
  await page.reload()
  await expect(page).toHaveURL(/\/builder\/local\/00-first.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Saved after reload')
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: Saved after reload' })).toBeVisible()
  await seed(page, 'Other levels', { '00-other.json': level('other', 'Other folder') })
  await page.evaluate(() => sessionStorage.setItem('testFolder', 'Other levels'))
  await page.getByRole('button', { name: 'Change folder' }).click()
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Other folder' })).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem('cancelFolderPicker', 'yes'))
  await page.getByRole('button', { name: 'Change folder' }).click()
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Other folder' })).toBeVisible()
  expect(await page.evaluate(() => window.folderPickerCalls)).toBe(0)
})

test('local play links reload from disk and resume after reconnecting folder access', async ({ page }) => {
  await openFolder(page, { '01-café #1%.json': level('linked-local', 'Local link') })
  await page.getByRole('button', { name: 'Play Local link', exact: true }).click()
  await expect(page).toHaveURL(/\/levels\/local\/01-caf%C3%A9%20%231%25.json$/)
  await page.reload()
  await expect(page.getByRole('img', { name: 'Local link: activate the goal' })).toBeFocused()
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'prompt'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reconnect folder' })).toBeEnabled()
  await page.getByRole('button', { name: 'Reconnect folder' }).click()
  await expect(page.getByRole('img', { name: 'Local link: activate the goal' })).toBeFocused()
  expect(await page.evaluate(() => window.folderPermissionRequests)).toBe(1)
})

test('expired permissions reconnect the same folder with one click, and denial keeps the folder remembered', async ({ page }, info) => {
  await openFolder(page)
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'prompt'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reconnect folder' })).toBeEnabled()
  await expect(page.getByText('My levels', { exact: true })).toBeVisible()
  expect(await names(page)).toEqual([])
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('reconnect-folder.png') })
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'denied'))
  await page.getByRole('button', { name: 'Reconnect folder' }).click()
  await expect(page.getByText('Access was not granted.', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reconnect folder' })).toBeEnabled()
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'prompt'))
  await page.getByRole('button', { name: 'Reconnect folder' }).click()
  await expect(page.getByRole('button', { name: 'Level 1: First local level' })).toBeVisible()
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 1])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: First local level' })).toBeVisible()
  expect(await page.evaluate(() => window.folderPermissionRequests)).toBe(0)
})

test('read permission restores levels automatically and write access can be enabled separately', async ({ page }, info) => {
  await openFolder(page)
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'read-only'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: First local level' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable saving' })).toBeEnabled()
  expect(await page.evaluate(() => window.folderPermissionRequests)).toBe(0)
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.screenshot({ path: info.outputPath('read-only-folder.png') })
  await page.getByRole('button', { name: 'Enable saving' }).click()
  await expect(page.getByText('1 level · Save directly to folder')).toBeVisible()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Writable again')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json”')
})

test('a removed folder reports the problem and can be replaced without restoring stale copies', async ({ page }) => {
  await openFolder(page)
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); await root.removeEntry('My levels', { recursive: true }) })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reconnect folder' })).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('Could not reopen this folder')
  expect(await names(page)).toEqual([])
  await seed(page, 'My levels', { '00-new.json': level('new', 'Replacement') })
  await page.getByRole('button', { name: 'Change folder' }).click()
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Replacement' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('unavailable browser storage does not prevent opening and saving local files', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage disabled', 'SecurityError') } }) })
  await openFolder(page)
  await expect(page.getByText('My levels', { exact: true })).toBeVisible()
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Still writable')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json”')
})

test('folder-input browsers remember the folder name and request reselection instead of caching level data', async ({ page }) => {
  const folder = await mkdtemp(join(tmpdir(), 'jumping-remembered-folder-'))
  try {
    await writeFile(join(folder, '00-first.json'), JSON.stringify(level('fallback', 'Local file')))
    await page.addInitScript(() => { window.showDirectoryPicker = undefined })
    await page.goto('/untitled-jumping-game')
    await page.getByRole('button', { name: 'Local folder', exact: true }).click()
    await page.getByLabel('Open local level folder').setInputFiles(folder)
    await expect(page.getByRole('button', { name: 'Reselect folder' })).toBeEnabled()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Reselect folder' })).toBeEnabled()
    await expect(page.getByText(basename(folder), { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reselect folder' })).toBeEnabled()
    expect(await names(page)).toEqual([])
    await writeFile(join(folder, '00-first.json'), JSON.stringify(level('fallback', 'Latest disk contents')))
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Reselect folder' }).click()
    await (await chooser).setFiles(folder)
    await expect(page.getByRole('button', { name: 'Level 1: Latest disk contents' })).toBeVisible()
  } finally { await rm(folder, { recursive: true, force: true }) }
})
