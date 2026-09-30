import { object } from './data.ts'

const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY?.trim()
const appId = import.meta.env.VITE_GOOGLE_PROJECT_NUMBER?.trim()
export const googlePickerConfigured = !!apiKey && /^\d+$/.test(appId ?? '')
interface Picker { setVisible(visible: boolean): void; dispose(): void }
interface View {
  setParent(id: string): View
  setIncludeFolders(value: boolean): View
  setSelectFolderEnabled(value: boolean): View
}
interface Builder {
  setAppId(id: string): Builder
  setDeveloperKey(key: string): Builder
  setOAuthToken(token: string): Builder
  setOrigin(origin: string): Builder
  setTitle(title: string): Builder
  enableFeature(feature: string): Builder
  addView(view: View): Builder
  setCallback(callback: (value: unknown) => void): Builder
  build(): Picker
}
interface PickerSDK {
  DocsView: new () => View
  PickerBuilder: new () => Builder
  Feature: { MULTISELECT_ENABLED: string }
}
type GoogleWindow = Window & {
  gapi?: { load(name: string, options: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void }
  google?: { picker?: PickerSDK }
}
let loading: Promise<PickerSDK> | undefined
function preparePicker(): Promise<PickerSDK> {
  if (!googlePickerConfigured) return Promise.reject(new Error('Google Drive selection has not been configured for this site. You can still import level files from your computer.'))
  const win = window as GoogleWindow
  if (win.google?.picker) return Promise.resolve(win.google.picker)
  loading ??= new Promise<PickerSDK>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(fail, 15000)
    function fail() { clearTimeout(timer); script.remove(); reject(new Error('Google Drive’s file picker could not load. Check your connection and try again.')) }
    script.src = 'https://apis.google.com/js/api.js'; script.async = true
    script.onerror = fail
    script.onload = () => {
      if (!win.gapi) { fail(); return }
      win.gapi.load('picker', { timeout: 10000, onerror: fail, ontimeout: fail, callback: () => {
        clearTimeout(timer)
        if (!win.google?.picker) { fail(); return }
        resolve(win.google.picker)
      } })
    }
    document.head.append(script)
  }).catch(error => { loading = undefined; throw error })
  return loading
}

/** The token fixes the account; only selected IDs cross back into our Drive API. */
export async function pickGoogleLevels(token: string, parentId: string, signal: AbortSignal): Promise<string[] | undefined> {
  const sdk = await preparePicker()
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let picker: Picker | undefined, settled = false
    const focused = document.activeElement
    // Our menu focus traps must yield to Google's separate iframe. Restore every
    // previous inert value on success, cancellation, failure or account changes.
    const dialogs = [...document.querySelectorAll<HTMLElement>('.game-dialog, dialog[open]')].map(node => ({ node, inert: node.inert }))
    const finish = (ids?: string[], error?: unknown) => {
      if (settled) return
      settled = true; signal.removeEventListener('abort', cancel)
      try { picker?.dispose() } catch (cause) { error ??= cause }
      finally { for (const { node, inert } of dialogs) node.inert = inert }
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true })
      if (error) reject(error); else resolve(ids)
    }
    const cancel = () => finish(undefined, signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const view = new sdk.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false).setParent(parentId)
      picker = new sdk.PickerBuilder().setAppId(appId!).setDeveloperKey(apiKey!).setOAuthToken(token)
        .setOrigin(location.origin).setTitle('Choose level JSON files and an optional index.json')
        .enableFeature(sdk.Feature.MULTISELECT_ENABLED).addView(view).setCallback(value => {
          if (!object(value)) return
          if (value.action === 'cancel') { finish(); return }
          if (value.action !== 'picked') return
          if (!Array.isArray(value.docs) || !value.docs.length || value.docs.length > 501 || value.docs.some(doc => !object(doc) || typeof doc.id !== 'string' || !/^[\w-]{1,300}$/.test(doc.id))) {
            finish(undefined, new Error('Choose up to 500 level JSON files and an optional index.json.')); return
          }
          finish([...new Set(value.docs.map(doc => doc.id as string))])
        }).build()
      for (const { node } of dialogs) node.inert = true
      picker.setVisible(true)
    } catch (error) { finish(undefined, error) }
  })
}
