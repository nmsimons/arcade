import { test as base, expect } from './helpers/test.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { FIRST_LEVEL, JSON_LAB } from '../helpers/jumping-fixtures.mjs'
import { levelFileName } from '../../src/games/jumping/localLevels.ts'
import { dismissSaveFailure } from './helpers/jumpingLevels.mjs'
import { expectIndependentTemplateCopy } from './helpers/templateCopy.mjs'

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

test('connecting creates a missing index automatically and preserves existing order on reload', async ({ page }) => {
  const levels = { 'z.json': level('last', 'Last'), 'a.json': level('first', 'First') }
  await openFolder(page, levels)
  const connected = await folderContents(page)
  expect(JSON.parse(connected['index.json'])).toEqual({ version: 1, order: 'filename', levels: ['a.json', 'z.json'] })
  for (const [name, level] of Object.entries(levels)) expect(connected[name]).toBe(JSON.stringify(level))
  const manifest = { version: 1, order: 'listed', levels: ['z.json', 'a.json'], title: 'My collection' }
  await seed(page, 'My levels', { 'index.json': manifest })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Last', exact: true })).toBeVisible()
  expect((await folderContents(page))['index.json']).toBe(JSON.stringify(manifest))
  await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    await directory.removeEntry('index.json')
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: First', exact: true })).toBeVisible()
  expect(JSON.parse((await folderContents(page))['index.json']).order).toBe('filename')
})

test('Save and Test waits for the file, preserves edits on failure, and tests renamed files', async ({ page }) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Edit First local level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Saved test route')
  const readSaved = name => page.evaluate(async name => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    return JSON.parse(await (await (await directory.getFileHandle(name)).getFile()).text())
  }, name)
  await page.evaluate(() => {
    const createWritable = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      FileSystemFileHandle.prototype.createWritable = createWritable
      const writer = await createWritable.apply(this, args), close = writer.close.bind(writer)
      writer.close = async () => { await new Promise(resolve => { window.finishTestSave = resolve }); await close() }
      return writer
    }
  })
  const testButton = page.getByRole('button', { name: 'Save and Test', exact: true })
  await testButton.click()
  await expect.poll(() => page.evaluate(() => typeof window.finishTestSave)).toBe('function')
  await expect(testButton).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save level', exact: true })).toBeDisabled()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
  await expect(page).toHaveURL(/\/builder\/local\/00-first.json$/)
  expect((await readSaved('00-first.json')).name).toBe('First local level')
  await page.evaluate(() => window.finishTestSave())
  await expect(page.getByRole('img', { name: 'Saved test route: reach the exit' })).toBeFocused()
  expect((await readSaved('00-first.json')).name).toBe('Saved test route')
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()

  // An external edit must not be overwritten or launch an unsaved test.
  await seed(page, 'My levels', { '00-first.json': level('first', 'Changed on disk') })
  await page.getByRole('textbox', { name: 'Level name' }).fill('Keep my edits')
  await testButton.click()
  await dismissSaveFailure(page, 'changed on disk')
  await expect(testButton).toBeFocused()
  await expect(testButton).toBeEnabled()
  await expect(page).toHaveURL(/\/builder\/local\/00-first.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Keep my edits')
  expect((await readSaved('00-first.json')).name).toBe('Changed on disk')

  // Renaming also checks the original; it cannot evade an external-edit conflict.
  await page.getByRole('textbox', { name: 'Level file name' }).fill('01-renamed.json')
  await testButton.click()
  await dismissSaveFailure(page, 'changed on disk')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open 00-first.json', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Keep my edits')
  // The renamed level keeps its identity and uses its new return route.
  await page.getByRole('textbox', { name: 'Level file name' }).fill('01-renamed.json')
  await testButton.click()
  await expect(page).toHaveURL(/\/builder\/local\/01-renamed.json\/playtest$/)
  await expect(page.getByRole('img', { name: 'Keep my edits: reach the exit' })).toBeFocused()
  const copy = await readSaved('01-renamed.json')
  expect(copy.name).toBe('Keep my edits'); expect(copy.id).toBe('first')
  expect(await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    return (await Array.fromAsync(directory.keys())).sort()
  })).toEqual(['01-renamed.json', 'index.json'])
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/01-renamed.json$/)
  await expect(page.getByRole('textbox', { name: 'Level file name' })).toHaveValue('01-renamed.json')
  await testButton.click()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  expect((await readSaved('01-renamed.json')).id).toBe(copy.id)
  await page.reload()
  await expect(page.getByRole('img', { name: 'Keep my edits: reach the exit' })).toBeFocused()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/01-renamed.json$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/untitled-jumping-game$/)
})

for (const writable of [true, false]) test(`local templates create independent levels in a ${writable ? 'writable' : 'read-only'} folder`, async ({ page }, info) => {
  const source = { ...structuredClone(JSON_LAB), id: 'local-template', name: writable ? 'Local template' : 'A'.repeat(80) }
  const originalName = '00-source.jump-level.json', copyName = levelFileName(`${source.name.slice(0, 73)} — copy`)
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
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const template = page.getByRole('button', { name: `Use ${originalName} as template`, exact: true })
  await template.scrollIntoViewIfNeeded()
  await expect(template).toBeEnabled()
  expect(await page.locator('.builder-library').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('local-template-library.png') })
  await template.click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue(`${source.name.slice(0, 73)} — copy`)
  await expect(page.getByRole('textbox', { name: 'Level file name' })).toHaveValue(copyName)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeFocused()
  if (!writable) {
    await page.getByRole('button', { name: 'Save level', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Level library', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Level library', exact: true }).locator('.builder-library-message')).toContainText('Enable saving')
    await page.getByRole('button', { name: 'Enable saving', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Enable saving', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close library', exact: true }).click()
  }
  // Even explicitly reusing the source filename cannot overwrite the template.
  await page.getByRole('textbox', { name: 'Level file name' }).fill(originalName)
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await dismissSaveFailure(page, `“${originalName}” already exists in this folder`)
  await page.getByRole('textbox', { name: 'Level file name' }).fill(copyName)
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText(`Saved “${copyName}”`)
  const copy = await page.evaluate(async name => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    return JSON.parse(await (await (await directory.getFileHandle(name)).getFile()).text())
  }, copyName)
  expectIndependentTemplateCopy(copy, source)
  await page.getByRole('textbox', { name: 'Level name' }).fill('My new route')
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).fill(String(source.width + 120))
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save level', exact: true })).toBeEnabled()
  const onDisk = await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels'), files = {}
    for await (const entry of directory.values()) if (entry.kind === 'file') files[entry.name] = await (await entry.getFile()).text()
    return files
  })
  for (const [name, original] of Object.entries(files)) expect(onDisk[name]).toBe(JSON.stringify(original))
  expect(Object.keys(onDisk)).toHaveLength(5)
  expect(JSON.parse(onDisk[copyName])).toEqual({ ...copy, name: 'My new route', width: source.width + 120 })
})

test('the last selected collection survives reload independently of the remembered folder', async ({ page }) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Built-in levels', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Built-in levels', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Wait for restored folder access through the UI, then verify it did not switch the picker.
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Change folder', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Built-in levels', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: First local level', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Local folder', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Level 1: First local level', exact: true })).toBeVisible()
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
})

test('a remembered folder without a collection preference does not override built-ins', async ({ page }) => {
  await openFolder(page)
  await page.evaluate(() => {
    localStorage.removeItem('arcade.jumping.collection.v1')
    sessionStorage.setItem('folderPermission', 'prompt')
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Built-in levels', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reconnect folder', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Built-in levels', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reconnect folder', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
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
  expect(await names(page)).toEqual(['Changed on disk', 'New on disk', '02-second.json'])
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
  await expect(page.getByRole('img', { name: 'Local link: reach the exit' })).toBeFocused()
  expect(await page.evaluate(() => [window.folderPickerCalls, window.folderPermissionRequests])).toEqual([0, 0])
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'prompt'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reconnect folder' })).toBeEnabled()
  await page.getByRole('button', { name: 'Reconnect folder' }).click()
  await expect(page.getByRole('img', { name: 'Local link: reach the exit' })).toBeFocused()
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
  await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    await directory.removeEntry('index.json')
    sessionStorage.setItem('folderPermission', 'read-only')
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: First local level' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable saving' })).toBeEnabled()
  await expect(page.getByText('This folder has no index.json. Enable saving to create it automatically.')).toBeVisible()
  expect((await folderContents(page))['index.json']).toBeUndefined()
  expect(await page.evaluate(() => window.folderPermissionRequests)).toBe(0)
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.screenshot({ path: info.outputPath('read-only-folder.png') })
  await page.getByRole('button', { name: 'Enable saving' }).click()
  await expect(page.locator('.local-folder-title span')).toHaveText('1 level')
  expect(JSON.parse((await folderContents(page))['index.json'])).toEqual({ version: 1, order: 'filename', levels: ['00-first.json'] })
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
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
  await page.addInitScript(() => {
    for (const key of ['indexedDB', 'localStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Storage disabled', 'SecurityError') } })
  })
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

test('Library is modal, preserves canceled edits, and saves before replacing the draft', async ({ page }, info) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Edit First local level', exact: true }).click()
  await expect(page.getByRole('button', { name: /^(Export|Open file…|Build)$/ })).toHaveCount(0)
  await expect(page.getByLabel('Import level file')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Keep this route')
  const canvas = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  const library = page.getByRole('button', { name: 'Library', exact: true })
  await library.click()
  const dialog = page.getByRole('dialog', { name: 'Level library', exact: true })
  await expect(dialog).toBeVisible()
  expect(await page.getByRole('application', { name: 'Level canvas' }).boundingBox()).toEqual(canvas)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.screenshot({ path: info.outputPath('library-dialog.png') })
  await page.keyboard.press('Escape')
  await expect(library).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep this route')
  await library.click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('library-unsaved-changes.png') })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep this route')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await library.click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Untitled level')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  const saved = await page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels')
    return JSON.parse(await (await (await directory.getFileHandle('00-first.json')).getFile()).text())
  })
  expect(saved.name).toBe('Keep this route')
  await library.click()
  await page.getByRole('button', { name: 'Open 00-first.json', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  // Returning to the saved state via Undo is clean.
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).fill('3000')
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await library.click()
  await page.getByRole('button', { name: 'Use 00-first.json as template', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await library.click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  // A template is an unsaved new level even before further edits.
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Untitled level')
})

test('a failed save cannot replace the draft, and changing folders cannot overwrite a matching filename', async ({ page }) => {
  const first = level('first', 'First local level')
  await openFolder(page, { '00-first.json': first })
  await page.getByRole('button', { name: 'Edit First local level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Unsaved work')
  await seed(page, 'Other levels', { '00-first.json': first })
  await page.evaluate(() => sessionStorage.setItem('testFolder', 'Other levels'))
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Change folder', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click()
  await dismissSaveFailure(page, '“00-first.json” already exists in this folder')
  await expect(page.getByRole('button', { name: 'Save and continue', exact: true })).toBeFocused()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Unsaved work')
  await page.getByRole('textbox', { name: 'Level file name', exact: true }).fill('01-safe-copy.json')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open 00-first.json', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click()
  await dismissSaveFailure(page, 'Another file in this folder uses this level’s ID')
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('First local level')
  const contents = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), result = []
    for (const [folder, name] of [['My levels', '00-first.json'], ['Other levels', '00-first.json']]) {
      const directory = await root.getDirectoryHandle(folder)
      result.push(JSON.parse(await (await (await directory.getFileHandle(name)).getFile()).text()).name)
    }
    return result
  })
  expect(contents).toEqual(['First local level', 'First local level'])
})

test('Save and Test requires a writable folder and never downloads a fallback file', async ({ page }, info) => {
  await installPicker(page)
  const downloads = []; page.on('download', download => downloads.push(download.suggestedFilename()))
  await page.goto('/untitled-jumping-game/builder')
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Ready to save')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Level library', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Level library', exact: true }).locator('.builder-library-message')).toContainText('Choose a writable level folder')
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Close library', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'New level', exact: true })).toBeInViewport()
  expect(await page.locator('.builder-library').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('library-mobile.png') })
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Ready to save: reach the exit' })).toBeFocused()
  expect(downloads).toEqual([])
})

test('Library stays centered and nearly fills the viewport while the level grid scrolls', async ({ page }, info) => {
  await openFolder(page, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`${String(i).padStart(2, '0')}-level.json`, level(`level-${i}`, `Level ${i + 1}`)])))
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Level library', exact: true })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 2560, height: 1440 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const box = await dialog.boundingBox()
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThan(1)
    expect(Math.abs(box.y - (viewport.height - box.height) / 2)).toBeLessThan(1)
    expect(box.width).toBeGreaterThan(viewport.width * .88)
    expect(box.width).toBeLessThan(viewport.width)
    expect(box.height).toBeGreaterThan(viewport.height * .88)
    expect(box.height).toBeLessThan(viewport.height)
    await expect(page.getByRole('button', { name: 'New level', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Close library', exact: true })).toBeInViewport()
    const header = await page.locator('.builder-library-header').boundingBox()
    await page.getByRole('button', { name: 'Open 29-level.json', exact: true }).scrollIntoViewIfNeeded()
    expect(await page.locator('.builder-library-header').boundingBox()).toEqual(header)
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.screenshot({ path: info.outputPath(`library-${viewport.width}x${viewport.height}.png`) })
  }
})

async function folderContents(page) {
  return page.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels'), files = {}
    for await (const entry of directory.values()) if (entry.kind === 'file') files[entry.name] = await (await entry.getFile()).text()
    return files
  })
}

test('new drafts create no level file until Save, derive filenames from titles, and rename the same saved level', async ({ page }, info) => {
  await openFolder(page, {})
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  const title = page.getByRole('textbox', { name: 'Level name', exact: true }), filename = page.getByRole('textbox', { name: 'Level file name', exact: true })
  await title.fill('My first route')
  await expect(filename).toHaveValue('My first route.jump-level.json')
  expect(Object.keys(await folderContents(page))).toEqual(['index.json'])
  expect(JSON.parse((await folderContents(page))['index.json'])).toEqual({ version: 1, order: 'filename', levels: [] })
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “My first route.jump-level.json”')
  const original = JSON.parse((await folderContents(page))['My first route.jump-level.json'])
  await title.fill('A better level name')
  await expect(filename).toHaveValue('My first route.jump-level.json')
  await filename.fill('different-name.json')
  expect(Object.keys(await folderContents(page)).sort()).toEqual(['My first route.jump-level.json', 'index.json'])
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Renamed “My first route.jump-level.json” to “different-name.json”')
  const renamed = await folderContents(page)
  expect(Object.keys(renamed).sort()).toEqual(['different-name.json', 'index.json'])
  expect(JSON.parse(renamed['different-name.json'])).toMatchObject({ id: original.id, name: 'A better level name' })
  await expect(page).toHaveURL(/\/builder\/local\/different-name.json$/)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await title.fill('Another route')
  await filename.fill('chosen.json')
  await title.fill('The final title')
  await expect(filename).toHaveValue('chosen.json')
  expect(Object.keys(await folderContents(page)).sort()).toEqual(['different-name.json', 'index.json'])
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “chosen.json”')
  expect(Object.keys(await folderContents(page)).sort()).toEqual(['chosen.json', 'different-name.json', 'index.json'])
  const chosen = JSON.parse((await folderContents(page))['chosen.json'])
  expect(chosen).toMatchObject({ name: 'The final title' })
  expect(chosen.id).not.toBe(original.id)
  await filename.fill('different-name.json')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Save failed', exact: true })).toBeVisible()
  await page.getByRole('alertdialog', { name: 'Save failed', exact: true }).screenshot({ path: info.outputPath('save-name-collision.png') })
  await dismissSaveFailure(page, '“different-name.json” already exists in this folder')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await dismissSaveFailure(page, 'Choose a different File name in Level settings and save again.')
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toHaveCount(0)
  expect(JSON.parse((await folderContents(page))['chosen.json'])).toEqual(chosen)
  expect((await folderContents(page))['different-name.json']).toBe(renamed['different-name.json'])
})

test('save failure dialogs explain disk errors, preserve keyboard focus and drafts, and allow retry', async ({ page }, info) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Edit First local level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Keep this draft')
  const before = await folderContents(page)
  await page.evaluate(() => {
    const createWritable = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      if (this.name !== '00-first.json') return createWritable.apply(this, args)
      FileSystemFileHandle.prototype.createWritable = createWritable
      throw new DOMException('There is not enough free space to save this file.', 'QuotaExceededError')
    }
  })
  const node = page.getByRole('button', { name: 'Node', exact: true }), canvas = page.getByRole('application', { name: 'Level canvas' })
  await node.click(); await canvas.focus(); await page.keyboard.press('ControlOrMeta+s')
  const dialog = page.getByRole('alertdialog', { name: 'Save failed', exact: true }), close = dialog.getByRole('button', { name: 'Close', exact: true })
  await expect(dialog).toContainText('00-first.json')
  await expect(dialog).toContainText('There is not enough free space')
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab'); await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused()
  // Save, undo, and tool shortcuts must not reach the editor behind the notice.
  await page.keyboard.press('ControlOrMeta+s'); await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('v')
  expect(await folderContents(page)).toEqual(before)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await close.scrollIntoViewIfNeeded()
  await expect(close).toBeInViewport({ ratio: 1 })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await dialog.screenshot({ path: info.outputPath('save-failed-enlarged-text.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(canvas).toBeFocused()
  await expect(node).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep this draft')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addStyleTag({ content: 'html { font-size: 100%; }' })
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json”')
  expect(JSON.parse((await folderContents(page))['00-first.json']).name).toBe('Keep this draft')
})

test('drag and keyboard ordering in Library preserve drafts and level files, survive renames, and restore filename mode', async ({ page }, info) => {
  const originals = {
    'z-first.json': { ...level('first', 'First route'), notes: { keep: 'Original author metadata' } },
    'a-last.json': level('last', 'Last route'),
    'm-between.json': level('between', 'Between'),
  }
  const manifest = { version: 1, order: 'filename', levels: ['z-first.json', 'm-between.json', 'a-last.json'], title: 'A shareable collection' }
  await openFolder(page, { ...originals, 'index.json': manifest })
  expect(await names(page)).toEqual(['Last route', 'Between', 'First route'])
  await page.getByRole('button', { name: 'Edit First route', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Level order', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Unsaved geometry draft')
  await page.getByRole('textbox', { name: 'Level file name', exact: true }).fill('renamed-first.json')
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).fill('2600')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Organize levels', exact: true })).toHaveCount(0)
  const grid = page.getByRole('group', { name: 'Local level files' })
  const sequence = () => grid.locator('strong').allTextContents()
  const tile = name => grid.locator('.builder-local-file').filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) })
  expect(await sequence()).toEqual(['Last route', 'Between', 'First route'])
  await expect(page.getByRole('button', { name: 'Sort by filename', exact: true })).toBeDisabled()
  await tile('z-first.json').dragTo(tile('a-last.json'), { targetPosition: { x: 8, y: 40 } })
  await expect.poll(sequence).toEqual(['First route', 'Last route', 'Between'])
  expect(JSON.parse((await folderContents(page))['index.json']).order).toBe('listed')
  const last = page.getByRole('button', { name: 'Open a-last.json', exact: true })
  await last.focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(sequence).toEqual(['Last route', 'First route', 'Between'])
  await expect(last).toBeFocused()
  await page.screenshot({ path: info.outputPath('library-reorder.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Alt+ArrowDown')
  // Mobile uses one readable card per row, so Down moves one place.
  await expect.poll(sequence).toEqual(['First route', 'Last route', 'Between'])
  await expect(last).toBeFocused()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(sequence).toEqual(['Last route', 'First route', 'Between'])
  await expect(last).toBeFocused()
  await page.screenshot({ path: info.outputPath('library-reorder-mobile.png') })
  const sorted = await folderContents(page)
  for (const [name, original] of Object.entries(originals)) expect(sorted[name]).toBe(JSON.stringify(original))
  expect(JSON.parse(sorted['index.json'])).toEqual({ ...manifest, order: 'listed', levels: ['a-last.json', 'z-first.json', 'm-between.json'] })
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Unsaved geometry draft')
  await expect(page.getByRole('textbox', { name: 'Level file name', exact: true })).toHaveValue('renamed-first.json')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Renamed “z-first.json”')
  const renamed = await folderContents(page), saved = JSON.parse(renamed['renamed-first.json'])
  expect(saved).toMatchObject({ name: 'Unsaved geometry draft', id: 'first', width: 2600 })
  expect(saved.order).toBeUndefined()
  expect(JSON.parse(renamed['index.json'])).toEqual({ ...manifest, order: 'listed', levels: ['a-last.json', 'renamed-first.json', 'm-between.json'] })
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  expect(await names(page)).toEqual(['Last route', 'Unsaved geometry draft', 'Between'])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Last route' })).toBeVisible()
  expect(await names(page)).toEqual(['Last route', 'Unsaved geometry draft', 'Between'])
  await page.getByRole('button', { name: 'Edit Last route', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Sort by filename', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sort by filename', exact: true })).toBeDisabled()
  await expect(page.getByRole('status', { name: 'Level order' })).toHaveText('Filename order restored.')
  const alphabetical = await folderContents(page)
  for (const [name, text] of Object.entries(renamed)) if (name !== 'index.json') expect(alphabetical[name]).toBe(text)
  expect(JSON.parse(alphabetical['index.json']).order).toBe('filename')
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  expect(await names(page)).toEqual(['Last route', 'Between', 'Unsaved geometry draft'])
})


test('direct Library ordering rejects external manifest edits and recovers after refreshing', async ({ page }) => {
  await openFolder(page, { 'a.json': level('a', 'Alpha'), 'b.json': level('b', 'Beta') })
  await page.getByRole('button', { name: 'Edit Alpha', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const manifest = { version: 1, order: 'filename', levels: ['a.json', 'b.json'], title: 'External change' }
  await seed(page, 'My levels', { 'index.json': manifest })
  const before = await folderContents(page), alpha = page.getByRole('button', { name: 'Open a.json', exact: true })
  await alpha.focus(); await page.keyboard.press('Alt+ArrowRight')
  await expect(page.getByRole('alert')).toContainText('index.json changed on disk')
  expect(await page.locator('.builder-local-files strong').allTextContents()).toEqual(['Alpha', 'Beta'])
  expect(await folderContents(page)).toEqual(before)
  await page.getByRole('button', { name: 'Refresh folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh folder', exact: true })).toBeEnabled()
  await alpha.focus(); await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => page.locator('.builder-local-files strong').allTextContents()).toEqual(['Beta', 'Alpha'])
  await expect(alpha).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(JSON.parse((await folderContents(page))['index.json'])).toEqual({ ...manifest, order: 'listed', levels: ['b.json', 'a.json'] })
  const after = await folderContents(page)
  expect(after['a.json']).toBe(before['a.json']); expect(after['b.json']).toBe(before['b.json'])
})

async function recoveryContents(page) {
  return page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('My levels'), files = {}
    let bin
    try { bin = await folder.getDirectoryHandle('Deleted levels') } catch { return files }
    for await (const entry of bin.values()) if (entry.kind === 'directory') {
      for await (const file of entry.values()) if (file.kind === 'file') files[`${entry.name}/${file.name}`] = await (await file.getFile()).text()
    }
    return files
  })
}

test('immediate delete preserves an open draft and recovers exact files from the recycle bin without overwriting', async ({ page }, info) => {
  await openFolder(page)
  const before = await folderContents(page)
  await page.getByRole('button', { name: 'Edit First local level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Keep my unsaved draft')
  await page.getByRole('spinbutton', { name: 'Level width', exact: true }).fill('2600')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const library = page.getByRole('dialog', { name: 'Level library', exact: true })
  const libraryContent = await library.locator('.builder-library-content').boundingBox()
  await page.getByRole('button', { name: 'Delete 00-first.json', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open 00-first.json', exact: true })).toHaveCount(0)
  await expect(library.getByText(/moved to the recycle bin|Saved file deleted/)).toHaveCount(0)
  expect((await library.locator('.builder-library-content').boundingBox()).y).toBe(libraryContent.y)
  expect((await folderContents(page))['00-first.json']).toBeUndefined()
  expect(JSON.parse((await folderContents(page))['index.json']).levels).toEqual([])
  expect(Object.values(await recoveryContents(page))).toEqual([before['00-first.json']])
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep my unsaved draft')
  await expect(page.getByRole('spinbutton', { name: 'Level width', exact: true })).toHaveValue('2600')
  await expect(page).toHaveURL(/\/builder$/)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const binButton = await page.getByRole('button', { name: 'Recycle bin', exact: true }).boundingBox()
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recover 00-first.json', exact: true })).toBeVisible()
  const backButton = await page.getByRole('button', { name: 'Back to levels', exact: true }).boundingBox()
  expect(backButton.y).toBe(binButton.y)
  expect(backButton.x + backButton.width).toBe(binButton.x + binButton.width)
  const recycled = library.getByRole('group', { name: 'Deleted levels', exact: true }).locator('.builder-local-file')
  await expect(recycled.locator('canvas.level-thumbnail')).toHaveCount(1)
  await expect(recycled.getByRole('button')).toHaveCount(2)
  await expect(recycled.getByRole('button', { name: /^Open|^Edit|as template$/ })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('recycle-bin.png') })
  await seed(page, 'My levels', { '00-first.json': level('replacement', 'A different file') })
  await page.getByRole('button', { name: 'Recover 00-first.json', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Recover level', exact: true })
  await confirmation.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(confirmation.getByRole('alert')).toContainText('already exists')
  expect(JSON.parse((await folderContents(page))['00-first.json']).name).toBe('A different file')
  await page.getByRole('textbox', { name: 'Recovery filename', exact: true }).fill('restored.json')
  await confirmation.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(page.getByText('The recycle bin is empty.', { exact: true })).toBeVisible()
  expect((await folderContents(page))['restored.json']).toBe(before['00-first.json'])
  expect(await recoveryContents(page)).toEqual({})
  await page.getByRole('button', { name: 'Back to levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open restored.json', exact: true })).toBeVisible()
})

test('manually missing levels keep their places with only Delete, and removing them only updates the index', async ({ page }, info) => {
  const manifest = { version: 1, order: 'listed', levels: ['00-first.json', 'Balls-copy.jump-level.json', 'library-missing.json', 'last.json'] }
  await openFolder(page, { '00-first.json': level('first', 'First'), 'last.json': level('last', 'Last'), 'index.json': manifest })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await names(page)).toEqual(['First', 'Balls-copy.jump-level.json', 'library-missing.json', 'Last'])
  const missing = page.locator('.jumping-level-tile').filter({ hasText: 'Balls-copy.jump-level.json' })
  await expect(missing.getByRole('button')).toHaveCount(1)
  await expect(missing.getByRole('button', { name: 'Delete Balls-copy.jump-level.json', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('missing-level-picker.png') })
  const before = await folderContents(page)
  await missing.getByRole('button', { name: 'Delete Balls-copy.jump-level.json', exact: true }).click()
  await expect(missing).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(JSON.parse((await folderContents(page))['index.json'])).toEqual({ ...manifest, levels: ['00-first.json', 'library-missing.json', 'last.json'] })
  await page.getByRole('button', { name: 'Edit First', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const card = page.locator('.builder-local-file').filter({ hasText: 'library-missing.json' })
  await expect(card.getByRole('button')).toHaveCount(1)
  await expect(card).toHaveAttribute('draggable', 'false')
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 1280, height: 600 }]) {
    await page.setViewportSize(size)
    const valid = page.locator('.builder-local-file').filter({ has: page.getByRole('button', { name: 'Open 00-first.json', exact: true }) })
    const missingBox = await card.boundingBox(), validBox = await valid.boundingBox()
    expect(Math.abs(missingBox.height - validBox.height)).toBeLessThanOrEqual(1)
    const missingPreview = await card.locator('.level-thumbnail').boundingBox(), validPreview = await valid.locator('.level-thumbnail').boundingBox()
    expect(missingPreview.height).toBe(validPreview.height)
    await page.screenshot({ path: info.outputPath(`missing-level-library-${size.width}-${size.height}.png`) })
  }
  await card.getByRole('button', { name: 'Delete library-missing.json', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const after = await folderContents(page)
  expect(JSON.parse(after['index.json'])).toEqual({ ...manifest, levels: ['00-first.json', 'last.json'] })
  for (const [name, text] of Object.entries(before)) if (name !== 'index.json') expect(after[name]).toBe(text)
  expect(await recoveryContents(page)).toEqual({})
})

test('the recycle bin can be viewed read-only and emptied only after permanent-delete confirmation', async ({ page }, info) => {
  await openFolder(page, { 'a.json': level('a', 'Alpha'), 'b.json': level('b', 'Beta'), 'keep.json': level('keep', 'Keep') })
  const before = await folderContents(page)
  for (const name of ['a.json', 'b.json']) {
    await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Delete ${name}`, exact: true })).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  }
  await page.evaluate(() => sessionStorage.setItem('folderPermission', 'read-only'))
  await page.reload()
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recover a.json', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete permanently a.json', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Empty recycle bin', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Back to levels', exact: true }).click()
  await page.getByRole('button', { name: 'Enable saving', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enable saving', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Empty recycle bin', exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('recycle-bin-mobile.png') })
  await page.getByRole('button', { name: 'Empty recycle bin', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Empty recycle bin?', exact: true })
  await expect(confirm).toContainText('Permanently delete 2 levels')
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('empty-bin-confirmation.png') })
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(Object.keys(await recoveryContents(page))).toHaveLength(2)
  await page.getByRole('button', { name: 'Empty recycle bin', exact: true }).click()
  await confirm.getByRole('button', { name: 'Empty recycle bin', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.getByText('The recycle bin is empty.', { exact: true })).toBeVisible()
  expect(await recoveryContents(page)).toEqual({})
  expect((await folderContents(page))['keep.json']).toBe(before['keep.json'])
})

test('permanently deleting one recycled level requires confirmation and leaves the others intact', async ({ page }, info) => {
  await openFolder(page, { 'a.json': level('a', 'Alpha'), 'b.json': level('b', 'Beta'), 'keep.json': level('keep', 'Keep') })
  for (const name of ['a.json', 'b.json']) {
    await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Delete ${name}`, exact: true })).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  }
  const before = await folderContents(page), backups = await recoveryContents(page)
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const liveCard = await page.locator('.builder-local-file').boundingBox()
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await expect(page.locator('.builder-bin-content .builder-local-file')).toHaveCount(2)
  const recycledCard = await page.locator('.builder-bin-content .builder-local-file').first().boundingBox()
  expect(recycledCard.height).toBe(liveCard.height)
  expect(recycledCard.width).toBe(liveCard.width)
  await page.getByRole('button', { name: 'Delete permanently a.json', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete level permanently?', exact: true })
  await expect(confirm).toContainText('Alpha')
  await expect(confirm).toContainText('This cannot be undone')
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('permanent-delete-confirmation.png') })
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await recoveryContents(page)).toEqual(backups)
  await page.getByRole('button', { name: 'Delete permanently a.json', exact: true }).click()
  await confirm.getByRole('button', { name: 'Delete permanently', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recover a.json', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recover b.json', exact: true })).toBeVisible()
  expect(await recoveryContents(page)).toEqual(Object.fromEntries(Object.entries(backups).filter(([name]) => name.endsWith('/b.json'))))
  expect(await folderContents(page)).toEqual(before)
})

test('a level recovered to its original filename opens as a saved file and can be edited again', async ({ page }) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Delete 00-first.json', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete 00-first.json', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await page.getByRole('button', { name: 'Recover 00-first.json', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Recover level', exact: true }).getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to levels', exact: true }).click()
  await page.getByRole('button', { name: 'Open 00-first.json', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/00-first.json$/)
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Recovered and edited')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json”')
  await expect.poll(async () => JSON.parse((await folderContents(page))['00-first.json']).name).toBe('Recovered and edited')
  await expect(page).toHaveURL(/\/builder\/local\/00-first.json$/)
})

test('a failed recovery copy blocks deletion and leaves the level available', async ({ page }) => {
  await openFolder(page)
  const before = await folderContents(page)
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getDirectoryHandle
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = async function (name, options) {
      if (name === 'Deleted levels') throw new DOMException('Recovery folder is read only', 'NotAllowedError')
      return original.call(this, name, options)
    }
  })
  await page.getByRole('button', { name: 'Delete 00-first.json', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Recovery folder is read only')
  expect(await folderContents(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Level 1: First local level', exact: true })).toBeVisible()
})

test('finishing a Library reorder does not steal focus from the next selected level', async ({ page }) => {
  await openFolder(page, { 'a.json': level('a', 'A'), 'b.json': level('b', 'B'), 'c.json': level('c', 'C') })
  await page.getByRole('button', { name: 'Edit A', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000))
  const grid = page.getByRole('group', { name: 'Local level files' })
  const tile = name => grid.locator('.builder-local-file').filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) })
  await tile('c.json').dragTo(tile('a.json'), { targetPosition: { x: 8, y: 40 } })
  await expect.poll(() => grid.locator('strong').allTextContents()).toEqual(['C', 'A', 'B'])
  const next = page.getByRole('button', { name: 'Open b.json', exact: true })
  await expect(next).toBeEnabled(); await next.focus()
  await page.clock.runFor(64)
  await expect(next).toBeFocused()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(() => grid.locator('strong').allTextContents()).toEqual(['C', 'B', 'A'])
  // Finishing the DOM update must restore keyboard focus even before another
  // animation frame; the save temporarily disables the selected card.
  await expect(next).toBeFocused()
  await page.clock.runFor(64); await expect(next).toBeFocused()
})
