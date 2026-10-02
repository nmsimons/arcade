const { contextBridge, ipcRenderer } = require('electron')

function storage(method, key, value) {
  const result = ipcRenderer.sendSync('arcade:storage', { method, key, value })
  if (!result?.ok) throw new Error(result?.error || 'Local saves are unavailable.')
  return result.value
}

contextBridge.exposeInMainWorld('arcadeDesktop', {
  storage: {
    getItem: key => storage('getItem', key),
    setItem: (key, value) => storage('setItem', key, value),
    removeItem: key => storage('removeItem', key),
  },
  toggleFullscreen: () => ipcRenderer.invoke('arcade:fullscreen'),
  quit: () => ipcRenderer.invoke('arcade:quit'),
})
