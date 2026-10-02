import type { DesktopBridge, PlatformServices } from '../contracts.ts'

export function desktopPlatform(bridge: DesktopBridge | undefined): PlatformServices {
  if (!bridge) throw new Error('The desktop bridge is unavailable. Launch the game through its desktop executable.')
  return { kind: 'desktop', accounts: false, storage: () => bridge.storage, toggleFullscreen: () => bridge.toggleFullscreen(), quit: () => bridge.quit() }
}
