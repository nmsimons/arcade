import { test, expect } from './helpers/test.mjs'
import { oneDrive } from '../helpers/oneDrive.mjs'
import { readFileSync } from 'node:fs'

const testLevel = JSON.parse(readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url)))

async function pauseClock(page) {
  const now = await page.evaluate(() => Date.now())
  // Freeze wall time before pausing so browser round trips cannot move the
  // target into the past. Restore advancing dates for subsequent runFor calls.
  await page.clock.setFixedTime(now)
  await page.clock.pauseAt(now)
  await page.clock.setSystemTime(now)
}

async function account(page, { delayConsent = false, progress = true, drive = oneDrive({ downloadOrigin: 'https://my.microsoftpersonalcontent.com' }) } = {}) {
  const handle = async route => {
    const request = route.request()
    const response = await drive.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  }
  await page.route('https://graph.microsoft.com/**', handle)
  await page.route('https://my.microsoftpersonalcontent.com/**', handle)
  await page.goto('/')
  await page.evaluate(async ({ delayConsent, progress }) => {
    const { setLogin } = await import('/src/accounts/session.ts')
    const { gameStorage } = await import('/src/accounts/profileStorage.ts')
    const { CloudAccessError } = await import('/src/accounts/errors.ts')
    window.testAuthorizations = 0
    setLogin({
      identity: { provider: 'microsoft', id: 'flow-test', name: 'Alex Player' },
      authorize: async () => {
        window.testAuthorizations++
        if (delayConsent) await new Promise(resolve => { window.finishConsent = resolve })
        window.testExpired = false
      },
      token: async () => {
        if (window.testExpired) throw new CloudAccessError('Your permission has expired.')
        return 'flow-test-token'
      },
      disconnect() {}, signOut: async () => {},
    })
    if (progress) gameStorage().setItem('arcade.jumping.times.v1', '{"Tower":123}')
  }, { delayConsent, progress })
  await page.getByRole('button', { name: 'Alex Player', exact: true }).click()
  return drive
}

test('OneDrive setup explains consent, slow checks and uploads, then gives a clear completion on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const drive = await account(page, { delayConsent: true })
  const status = page.locator('.account-status')
  await expect(page.getByRole('button', { name: 'Connect OneDrive', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disconnect cloud' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import backup', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('connect-mobile.png') })

  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(status).toContainText('Connecting OneDrive')
  await expect(status).toContainText('Microsoft popup')
  await expect(page.getByRole('button', { name: 'Close account' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Connecting…', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.testAuthorizations)).toBe(1)

  let finishCheck, finishUpload
  const check = new Promise(resolve => { finishCheck = resolve })
  const upload = new Promise(resolve => { finishUpload = resolve })
  drive.before = async request => {
    if (request.url.pathname.endsWith('/approot')) await check
    if (request.method === 'PUT') await upload
  }
  await page.evaluate(() => window.finishConsent())
  await expect(status).toContainText('Checking OneDrive')
  await expect(page.getByRole('button', { name: 'Back to arcade', exact: true })).toBeEnabled()
  finishCheck()
  await expect(status).toContainText('Saving to OneDrive')
  await page.screenshot({ path: testInfo.outputPath('saving-mobile.png') })
  finishUpload()
  await expect(status).toContainText('Your saves are up to date')
  await expect(status).toContainText('Synced with OneDrive')
  await expect(page.getByRole('button', { name: 'Back to arcade', exact: true })).toBeEnabled()
  const panel = await page.locator('.account-panel').boundingBox()
  expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(390)
  expect(await page.locator('.account-panel').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('synced-mobile.png') })
  expect(drive.find('Untitled Jumping Game/personal-bests.json').text).toBe('{"Tower":123}')
  const downloads = drive.requests.filter(request => request.url.host === 'my.microsoftpersonalcontent.com')
  // New uploads are verified by their returned IDs/eTags, without downloading
  // their bytes again. The two-browser test below exercises signed downloads.
  expect(downloads.length).toBe(0)
  await page.getByRole('button', { name: 'Back to arcade', exact: true }).click()
  await expect(page.locator('.arcade-account-bar')).toContainText('Saved to OneDrive')
})

test('two browsers sync from the builder and chooser, with file status and cloud Refresh', async ({ page, browser }, testInfo) => {
  test.setTimeout(60000)
  const otherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const other = await otherContext.newPage()
  const drive = await account(page, { progress: false })
  let finishUpload
  try {
    await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
    await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
    await page.getByRole('button', { name: 'Back to arcade', exact: true }).click()
    async function newLevel(name) {
      if (name === 'First') {
        await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
        await page.getByRole('button', { name: 'Account levels', exact: true }).click()
      }
      await page.getByRole('button', { name: /^(Level studio|Return to builder)$/ }).click()
      if (name === 'Second') {
        await page.getByRole('button', { name: 'Library', exact: true }).click()
        await page.getByRole('button', { name: 'New level', exact: true }).click()
      }
      await page.getByRole('textbox', { name: 'Level name', exact: true }).fill(name)
      await page.getByRole('button', { name: 'Save level', exact: true }).click()
      const status = page.getByRole('status', { name: 'Builder status' })
      await expect(status).toContainText('Waiting to sync')
      await expect(status.locator('.level-save-status')).toHaveAttribute('title', /Saved on this device/)
      if (name === 'Second') {
        await page.getByRole('button', { name: 'Library', exact: true }).click()
        const first = page.getByRole('button', { name: 'Open First.jump-level.json', exact: true })
        const second = page.getByRole('button', { name: 'Open Second.jump-level.json', exact: true })
        await expect(first).toContainText('Saved to OneDrive')
        await expect(second).toContainText(/Waiting to sync|Syncing/)
        await page.screenshot({ path: testInfo.outputPath('library-file-states.png') })
        await page.setViewportSize({ width: 390, height: 844 })
        await expect(second.locator('.level-save-status')).toBeVisible()
        expect(await second.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('library-file-states-mobile.png') })
        await page.setViewportSize({ width: 1280, height: 800 })
        await first.click()
        await page.getByRole('button', { name: 'Alex Player', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Close account', exact: true }).click()
        await expect(status).toContainText('Saved to OneDrive')
        await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Unsaved first edit')
        await expect(status).toContainText('Unsaved changes')
        await expect(status).not.toContainText('Saved to OneDrive')
        await page.screenshot({ path: testInfo.outputPath('builder-unsaved-state.png') })
        await page.getByRole('button', { name: 'Undo', exact: true }).click()
        await expect(status).toContainText('Saved to OneDrive')
      }
      await page.getByRole('button', { name: 'Back to game', exact: true }).click()
      if (name === 'Second') {
        await expect(page.getByRole('button', { name: 'Level 1: First', exact: true })).toContainText('Saved to OneDrive')
        await expect(page.getByRole('button', { name: 'Level 2: Second', exact: true })).toContainText(/Waiting to sync|Syncing/)
        await page.screenshot({ path: testInfo.outputPath('chooser-file-states.png') })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole('button', { name: 'Level 2: Second', exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath('chooser-file-states-mobile.png') })
        await page.setViewportSize({ width: 1280, height: 800 })
      }
    }
    await newLevel('First')
    await expect(page.getByRole('button', { name: 'Level 1: First', exact: true })).toContainText('Saved to OneDrive')
    await account(other, { drive, progress: false })
    await other.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
    await expect(other.locator('.account-status')).toContainText('Your saves are up to date')
    await other.getByRole('button', { name: 'Back to arcade', exact: true }).click()
    await other.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
    await other.getByRole('button', { name: 'Account levels', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Level 1: First', exact: true })).toContainText('Saved to OneDrive')

    const levelFolder = drive.find('Untitled Jumping Game/Levels').id
    const upload = new Promise(resolve => { finishUpload = resolve })
    drive.before = async request => {
      if (request.method === 'PUT' && request.url.pathname === `/v1.0/me/drive/items/${levelFolder}:/Second.jump-level.json:/content`) await upload
    }
    await newLevel('Second')
    await expect(page.getByRole('button', { name: 'Alex Player', exact: true })).toHaveAttribute('title', /Saving to OneDrive/)
    expect(drive.find('Untitled Jumping Game/Levels/Second.jump-level.json')).toBeUndefined()
    const refresh = other.getByRole('button', { name: 'Refresh account levels', exact: true })
    await refresh.click()
    await expect(refresh).toContainText('Refreshing')
    await expect(refresh).toBeDisabled()
    await expect(other.getByRole('button', { name: 'Alex Player', exact: true })).toHaveAttribute('title', /Retrying automatically/)
    finishUpload()
    await expect(page.getByRole('button', { name: 'Level 2: Second', exact: true })).toContainText('Saved to OneDrive')
    await expect(other.getByRole('button', { name: 'Level 2: Second', exact: true })).toContainText('Saved to OneDrive', { timeout: 15000 })
    await expect(refresh).toBeEnabled()
    const levels = target => target.evaluate(() => JSON.parse(localStorage.getItem('arcade.player.microsoft%3Aflow-test.arcade.account.levels.v1')).files)
    const saved = await levels(page)
    expect(await levels(other)).toEqual(saved)
    for (const [name, text] of Object.entries(saved)) expect(drive.find(`Untitled Jumping Game/Levels/${name}`).text).toBe(text)
    expect(Object.keys(saved)).toEqual(expect.arrayContaining(['First.jump-level.json', 'Second.jump-level.json', 'index.json']))
    const downloads = drive.requests.filter(request => request.url.host === 'my.microsoftpersonalcontent.com')
    expect(downloads.length).toBeGreaterThan(0)
    expect(downloads.every(request => !request.headers.has('authorization') && !request.headers.has('cookie'))).toBe(true)
    // Refresh also discovers files copied directly into the cloud folder.
    drive.put('Untitled Jumping Game/Levels/Third.json', JSON.stringify({ ...JSON.parse(saved['Second.jump-level.json']), id: 'third', name: 'Copied into OneDrive' }))
    await refresh.click()
    await expect(other.getByRole('button', { name: 'Level 3: Copied into OneDrive', exact: true })).toContainText('Saved to OneDrive')
    await expect(other).toHaveURL(/untitled-jumping-game/)
    await expect(page).toHaveURL(/untitled-jumping-game/)
  } finally { finishUpload?.(); await otherContext.close() }
})

test('sync failures offer retry, expired access offers reconnect, and recovery returns to ready', async ({ page }, testInfo) => {
  const drive = await account(page)
  drive.before = () => Response.json({ error: { code: 'unavailable' } }, { status: 503 })
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves couldn’t sync')
  await expect(page.getByRole('button', { name: 'Try sync again', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Play on this device', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('arcade.player.microsoft%3Aflow-test.arcade.jumping.times.v1'))).toBe('{"Tower":123}')
  // Background events must not repeatedly clear an actionable error.
  const requests = drive.requests.length
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.account-status')).toContainText('Your saves couldn’t sync')
  expect(drive.requests.length).toBe(requests)
  drive.before = undefined
  await page.getByRole('button', { name: 'Try sync again', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')

  await page.evaluate(() => { window.testExpired = true })
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Reconnect OneDrive to keep syncing')
  await expect(page.getByRole('button', { name: 'Try sync again', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('reconnect-desktop.png') })
  await page.getByRole('button', { name: 'Reconnect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(await page.evaluate(() => window.testAuthorizations)).toBe(2)
  await page.screenshot({ path: testInfo.outputPath('synced-desktop.png') })
})

test('conflicts focus the choice, keep cancellation safe and restore the selected progress', async ({ page }, testInfo) => {
  const drive = await account(page)
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  await page.evaluate(() => localStorage.setItem('arcade.player.microsoft%3Aflow-test.arcade.jumping.times.v1', '{"Tower":100}'))
  drive.put('Untitled Jumping Game/personal-bests.json', '{"Tower":110}')
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Which progress would you like to keep playing?')
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('conflict-desktop.png') })
  await page.getByRole('button', { name: /^Use cloud version/ }).click()
  await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => localStorage.getItem('arcade.player.microsoft%3Aflow-test.arcade.jumping.times.v1'))).toBe('{"Tower":100}')
  await page.getByRole('button', { name: /^Use cloud version/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Use cloud version', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(await page.evaluate(() => localStorage.getItem('arcade.player.microsoft%3Aflow-test.arcade.jumping.times.v1'))).toBe('{"Tower":110}')
})

test('unreadable OneDrive metadata explains the failure without leaking parser fragments', async ({ page }) => {
  const drive = await account(page)
  drive.before = request => request.url.pathname.endsWith('/approot')
    ? new Response('&#123;&quot;invalid', { headers: { 'Content-Type': 'application/json' } }) : undefined
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  const status = page.locator('.account-status')
  await expect(status).toContainText('OneDrive’s response could not be read')
  await expect(status).not.toContainText('Unexpected token')
  await expect(status).not.toContainText('&#123;')
  drive.before = undefined
  await page.getByRole('button', { name: 'Try sync again', exact: true }).click()
  await expect(status).toContainText('Your saves are up to date')
  // Folder metadata is also rejected clearly, without touching current saves.
  drive.find('Sync history').description = '{damaged'
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(status).toContainText('Cloud sync information could not be read')
  await expect(status).not.toContainText('Unexpected token')
  expect(await page.evaluate(() => localStorage.getItem('arcade.player.microsoft%3Aflow-test.arcade.jumping.times.v1'))).toBe('{"Tower":123}')
})

test('two tabs preserve independent level saves and reject a stale edit to the same file', async ({ page, context }) => {
  const other = await context.newPage(), pages = [page, other]
  for (const target of pages) {
    await target.goto('/')
    await target.evaluate(async level => {
      const { gameStorage } = await import('/src/accounts/profileStorage.ts')
      const { accountLevelRepository } = await import('/src/accounts/levelLibrary.ts')
      window.testStore = gameStorage('microsoft:concurrent-tabs')
      window.testRepo = accountLevelRepository(window.testStore)
      window.testLevel = level
    }, testLevel)
  }
  await page.evaluate(() => {
    const files = Object.fromEntries(Array.from({ length: 100 }, (_, n) => [`Seed-${n}.json`, JSON.stringify({ ...window.testLevel, id: `seed-${n}` })]))
    files['index.json'] = JSON.stringify({ version: 1, levels: Object.keys(files) })
    window.testStore.setItem('arcade.account.levels.v1', JSON.stringify({ files, deleted: [] }))
  })
  for (let pair = 0; pair < 10; pair++) {
    await Promise.all(pages.map((target, tab) => target.evaluate(async ({ pair, tab }) => {
      const id = `tab-${tab}-${pair}`
      await window.testRepo.save(`${id}.json`, { ...window.testLevel, id, name: id })
    }, { pair, tab })))
  }
  const files = await page.evaluate(() => JSON.parse(window.testStore.getItem('arcade.account.levels.v1')).files)
  expect(Object.keys(files)).toHaveLength(121)
  for (let pair = 0; pair < 10; pair++) for (let tab = 0; tab < 2; tab++) expect(files).toHaveProperty([`tab-${tab}-${pair}.json`])
  const outcomes = await Promise.all(pages.map((target, tab) => target.evaluate(async ({ tab, expected }) => {
    try {
      await window.testRepo.save('Seed-0.json', { ...window.testLevel, id: 'seed-0', name: `Winner ${tab}` }, expected)
      return 'saved'
    } catch (error) { return error.message }
  }, { tab, expected: files['Seed-0.json'] })))
  expect(outcomes.filter(value => value === 'saved')).toHaveLength(1)
  expect(outcomes.find(value => value !== 'saved')).toMatch(/changed/)
  await other.close()
})

test('completing an older upload keeps the newer edit visibly pending', async ({ page }) => {
  await page.clock.install()
  const drive = await account(page, { progress: false })
  await page.evaluate(async level => {
    const { gameStorage } = await import('/src/accounts/profileStorage.ts')
    const { accountLevelRepository } = await import('/src/accounts/levelLibrary.ts')
    window.testRepo = accountLevelRepository(gameStorage())
    window.testLevel = level
    window.testSaved = await window.testRepo.save('Level.json', level)
  }, testLevel)
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  await page.getByRole('button', { name: 'Back to arcade', exact: true }).click()
  await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
  await expect(page.locator('.account-indicator.is-synced')).toBeVisible()
  let finishUpload
  const upload = new Promise(resolve => { finishUpload = resolve })
  drive.before = async request => { if (request.method === 'PUT') await upload }
  const edit = name => page.evaluate(async name => {
    window.testSaved = await window.testRepo.save('Level.json', { ...window.testLevel, name }, window.testSaved.text)
  }, name)
  try {
    await edit('Snapshot A')
    await expect(page.getByRole('button', { name: 'Alex Player', exact: true })).toHaveAttribute('title', /Saving to OneDrive/)
    await edit('Newer edit B')
    await pauseClock(page)
    finishUpload()
    await expect(page.locator('.account-indicator.is-waiting')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Alex Player', exact: true })).toHaveAttribute('title', /Saved locally.*Waiting to sync/)
    expect(JSON.parse(drive.find('Untitled Jumping Game/Levels/Level.json').text).name).toBe('Snapshot A')
    await expect(page.locator('.account-indicator.is-synced')).toHaveCount(0)
    drive.before = undefined
    await page.clock.runFor(800)
    await expect(page.locator('.account-indicator.is-synced')).toBeVisible()
    expect(JSON.parse(drive.find('Untitled Jumping Game/Levels/Level.json').text).name).toBe('Newer edit B')
  } finally { finishUpload() }
})

test('failed local database commits keep the prior library and roll back an imported workspace', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async level => {
    const { gameStorage, LEVELS_SLOT, SAVE_SLOTS } = await import('/src/accounts/profileStorage.ts')
    const { accountLevelRepository } = await import('/src/accounts/levelLibrary.ts')
    const { readCurrentWorkspace, serializeWorkspace, replaceWorkspace } = await import('/src/accounts/data.ts')
    const store = gameStorage('microsoft:transaction-failure'), repo = accountLevelRepository(store)
    await repo.save('Original.json', level)
    store.setItem(SAVE_SLOTS[0], '{"banked":1}')
    const before = await readCurrentWorkspace(store), snapshot = serializeWorkspace(before)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      if (this.transaction.db.name === 'arcade.account.libraries.v1') this.transaction.abort()
      return request
    }
    const errors = []
    try {
      try { await repo.save('New.json', { ...level, id: 'new' }) } catch (error) { errors.push(error.message) }
      const next = JSON.parse(snapshot)
      next.slots[SAVE_SLOTS[0]] = '{"banked":2}'
      next.levels.files['Original.json'] = JSON.stringify({ ...level, name: 'Imported replacement' })
      try { await replaceWorkspace(store, next, snapshot) } catch (error) { errors.push(error.message) }
    } finally { IDBObjectStore.prototype.put = put }
    const after = serializeWorkspace(await readCurrentWorkspace(store))
    // Missing or stale UI caches never become the source for a later library read.
    store.removeItem(LEVELS_SLOT)
    const restored = await repo.read()
    return { errors, before: snapshot, after, files: restored.files.map(file => file.fileName) }
  }, testLevel)
  expect(result.errors).toHaveLength(2)
  expect(result.after).toBe(result.before)
  expect(result.files).toEqual(['Original.json'])
})

test('frequent game saves are batched, remain local immediately, and Sync now bypasses the delay', async ({ page }) => {
  await page.clock.install()
  const drive = await account(page)
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  await pauseClock(page)
  const versions = () => drive.paths().filter(path => path.startsWith('Sync history/Versions/')).length
  const initialVersions = versions()
  const autosave = n => page.evaluate(async n => {
    const { gameStorage } = await import('/src/accounts/profileStorage.ts')
    const store = gameStorage(), text = JSON.stringify({ Tower: n })
    store.setItem('arcade.jumping.times.v1', text)
    return store.getItem('arcade.jumping.times.v1')
  }, n)
  for (let n = 1; n <= 5; n++) {
    expect(await autosave(n)).toBe(JSON.stringify({ Tower: n }))
    await page.clock.runFor(3000)
    expect(versions()).toBe(initialVersions)
    await expect(page.locator('.account-status')).toContainText('Your latest changes are saved on this device')
  }
  await page.clock.runFor(16000)
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(versions()).toBe(initialVersions + 1)
  expect(drive.find('Untitled Jumping Game/personal-bests.json').text).toBe('{"Tower":5}')
  await autosave(6)
  await expect(page.locator('.account-status')).toContainText('Your latest changes are saved on this device')
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(drive.find('Untitled Jumping Game/personal-bests.json').text).toBe('{"Tower":6}')
})
