export const DESKTOP_RELEASES_URL = 'https://github.com/nmsimons/arcade/releases'
export const DESKTOP_RELEASES_API = 'https://api.github.com/repos/nmsimons/arcade/releases?per_page=20'

export const DESKTOP_DOWNLOADS = [
  { id: 'windows', label: 'Windows', detail: 'Windows 10 or later · 64-bit', asset: 'dream-large-arcade-windows-x64.zip', instructions: 'Extract the whole ZIP, then run dream-large-arcade.exe.' },
  { id: 'linux', label: 'Linux / Steam Deck', detail: 'Linux · 64-bit Intel / AMD', asset: 'dream-large-arcade-linux-x64.tar.gz', instructions: 'Extract the archive, then run dream-large-arcade. On Steam Deck, add it to Steam in Desktop Mode and launch in Gaming Mode.' },
  { id: 'mac-arm64', label: 'Mac — Apple silicon', detail: 'macOS 12 or later · M-series', asset: 'dream-large-arcade-macos-arm64.zip', instructions: 'Unzip, then move Dream Large Arcade.app to Applications.' },
] as const

export interface DesktopRelease { version: string; url: string; downloads: Partial<Record<typeof DESKTOP_DOWNLOADS[number]['id'], string>> }

// Only public stable desktop releases count. Every link belongs to the same
// release, and is restricted to this repository's exact expected asset name.
export function desktopReleaseFromResponse(value: unknown): DesktopRelease | null {
  if (!Array.isArray(value)) throw new Error('Invalid release response')
  for (const release of value) {
    if (!release || release.draft !== false || release.prerelease !== false
      || typeof release.tag_name !== 'string' || !/^desktop-v\d+\.\d+\.\d+$/.test(release.tag_name)
      || !Array.isArray(release.assets)) continue
    const downloads: DesktopRelease['downloads'] = {}
    for (const option of DESKTOP_DOWNLOADS) {
      const url = `${DESKTOP_RELEASES_URL}/download/${release.tag_name}/${option.asset}`
      if (release.assets.some((asset: { name?: unknown; state?: unknown; size?: unknown; browser_download_url?: unknown } | null) =>
        asset?.name === option.asset && asset.state === 'uploaded' && typeof asset.size === 'number' && asset.size > 0 && asset.browser_download_url === url)) downloads[option.id] = url
    }
    if (Object.keys(downloads).length) return { version: release.tag_name.slice('desktop-v'.length), url: `${DESKTOP_RELEASES_URL}/tag/${release.tag_name}`, downloads }
  }
  return null
}
