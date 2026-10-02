import type { PlatformServices } from '../contracts.ts'

export const webPlatform: PlatformServices = {
  kind: 'web', accounts: true,
  storage: () => window.localStorage,
  async toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  },
}
