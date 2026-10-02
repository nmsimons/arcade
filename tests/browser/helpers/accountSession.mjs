/** Reopen with persistent browser data only: no tab storage or session cookies. */
export async function newBrowserSession(browser, context, testInfo) {
  const storageState = await context.storageState({ indexedDB: true })
  storageState.cookies = storageState.cookies.filter(cookie => cookie.expires > Date.now() / 1000)
  await context.close()
  const reopened = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState })
  await reopened.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, writable: true, value: () => [] })
  })
  return reopened
}
