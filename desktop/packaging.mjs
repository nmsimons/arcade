import { join } from 'node:path'

export function desktopTarget(product, platform = process.platform, arch = process.env.ARCADE_DESKTOP_ARCH || (platform === 'darwin' ? 'arm64' : 'x64')) {
  if (!['win32', 'linux', 'darwin'].includes(platform) || arch !== (platform === 'darwin' ? 'arm64' : 'x64')) throw new Error('Unsupported desktop target.')
  if (!/^[a-z0-9-]+$/.test(product.executable) || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,79}$/.test(product.name)) throw new Error('Invalid desktop product.')
  const name = platform === 'darwin' ? product.name : 'dream-large-arcade-desktop'
  return {
    platform, arch, name, directory: `${name}-${platform}-${arch}`,
    executable: platform === 'darwin' ? join(`${name}.app`, 'Contents/MacOS', product.executable) : `${product.executable}${platform === 'win32' ? '.exe' : ''}`,
    download: `dream-large-arcade-${platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'}-${arch}.${platform === 'linux' ? 'tar.gz' : 'zip'}`,
  }
}

export function macSigningOptions(platform, env = process.env) {
  if (platform !== 'darwin' || env.ARCADE_MAC_SIGNED !== '1') return {}
  for (const key of ['MAC_SIGNING_IDENTITY', 'ARCADE_MAC_KEYCHAIN', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
    if (!env[key]) throw new Error(`Mac release signing requires ${key}.`)
  }
  return {
    osxSign: { identity: env.MAC_SIGNING_IDENTITY, keychain: env.ARCADE_MAC_KEYCHAIN, strictVerify: true, optionsForFile: () => ({ hardenedRuntime: true }) },
    osxNotarize: { appleId: env.APPLE_ID, appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID },
  }
}
