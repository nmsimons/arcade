export type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { readonly workspaceLock?: string }

export interface PlatformServices {
  kind: 'web' | 'desktop'
  accounts: boolean
  storage(): KeyStorage
  toggleFullscreen(): Promise<void>
  quit?: () => Promise<void>
}

export interface DesktopBridge {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  toggleFullscreen(): Promise<void>
  quit(): Promise<void>
}

declare global {
  interface Window { arcadeDesktop?: DesktopBridge }
}
