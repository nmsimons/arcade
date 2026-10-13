import { app, BrowserWindow, ipcMain, Menu, net, powerMonitor, protocol, session, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_URL, assetPath, isAppUrl } from './assets.mjs'
import { fileStorage } from './save-store.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
app.setName('Dream Large Arcade')
if (process.env.ARCADE_USER_DATA) app.setPath('userData', resolve(process.env.ARCADE_USER_DATA))
protocol.registerSchemesAsPrivileged([{ scheme: 'arcade', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()
else app.whenReady().then(async () => {
  const root = join(directory, 'renderer')
  if (!existsSync(join(root, 'index.html'))) throw new Error('Build the desktop renderer first: npm run build:desktop')
  const product = JSON.parse(readFileSync(join(root, 'release.json'), 'utf8'))
  const startUrl = new URL(product.startPath, APP_URL).href
  if (!isAppUrl(startUrl) || !assetPath(root, startUrl)) throw new Error('Invalid desktop starting route.')
  const saves = fileStorage(join(app.getPath('userData'), 'saves', 'local'))
  protocol.handle('arcade', async request => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      const target = assetPath(root, request.url)
      if (!target) return new Response('Not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(target).href)
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  // macOS supplies Command-Q and text editing shortcuts through menu roles.
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)
  const window = new BrowserWindow({
    title: product.name, width: 1280, height: 800, minWidth: 640, minHeight: 400,
    backgroundColor: '#080e12', show: false,
    webPreferences: { preload: join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  })
  const allowed = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isAppUrl(event.senderFrame.url)
  ipcMain.on('arcade:storage', (event, message) => {
    try {
      if (!allowed(event) || !message || !['getItem', 'setItem', 'removeItem'].includes(message.method)) throw new Error('Local saves are unavailable.')
      event.returnValue = { ok: true, value: saves[message.method](message.key, message.value) }
    } catch (error) { event.returnValue = { ok: false, error: error.message } }
  })
  ipcMain.handle('arcade:fullscreen', event => { if (!allowed(event)) throw new Error('Invalid window request.'); window.setFullScreen(!window.isFullScreen()) })
  ipcMain.handle('arcade:quit', event => { if (!allowed(event)) throw new Error('Invalid window request.'); app.quit() })
  const external = value => {
    try { if (new URL(value).protocol === 'https:') void shell.openExternal(value) }
    catch { /* Invalid links cannot open another application. */ }
  }
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) { event.preventDefault(); external(url) } })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()) }
  })
  // Existing games pause on focus loss; use the same path when the device sleeps.
  powerMonitor.on('suspend', () => window.blur())
  powerMonitor.on('resume', () => window.focus())
  window.once('ready-to-show', () => window.show())
  app.on('second-instance', () => { if (window.isMinimized()) window.restore(); window.focus() })
  app.on('window-all-closed', () => app.quit())
  await window.loadURL(startUrl)
}).catch(error => { console.error(error); app.exit(1) })
