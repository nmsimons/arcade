import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function prepareDesktopRelease(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid desktop version.')
  const expected = ['dream-large-arcade-windows-x64.zip', 'dream-large-arcade-linux-x64.tar.gz', 'dream-large-arcade-macos-arm64.zip']
  const files = readdirSync(directory)
  if (files.some(file => /^dream-large-arcade-.*\.(?:zip|tar\.gz)$/.test(file) && !expected.includes(file))) throw new Error('Unsupported desktop download target.')
  const included = expected.filter(file => files.includes(file))
  if (!included.includes(expected[0]) || !included.includes(expected[1])) throw new Error('A desktop release needs both tested Windows and Linux downloads.')
  const checksums = included.map(file => `${createHash('sha256').update(readFileSync(join(directory, file))).digest('hex')}  ${file}`).join('\n') + '\n'
  writeFileSync(join(directory, 'SHA256SUMS.txt'), checksums)
  const mac = included.includes('dream-large-arcade-macos-arm64.zip')
  const notes = `Dream Large Arcade ${version} includes Hard Vacuum, Bumper Ball, Urban Fire, and Untitled Jumping Game. All four games run offline. Progress is saved on this computer; browser and desktop saves are separate.\n\n` +
    `- **Windows:** download the Windows ZIP, extract the whole folder, and run dream-large-arcade.exe. Windows 10 or later, x64. This build is unsigned; Windows may show a publisher warning.\n` +
    `- **Linux / Steam Deck:** extract the Linux tar.gz and run dream-large-arcade. On Steam Deck, add the executable as a non-Steam game in Desktop Mode, choose the Gamepad template, and launch in Gaming Mode. Leave forced Proton off for this native Linux build.\n` +
    (mac ? `- **Mac (Apple silicon):** unzip and move Dream Large Arcade.app to Applications. The Mac download is signed and notarized.\n` : `- **Mac (Apple silicon):** public downloads are pending Apple signing and notarization setup.\n`) +
    `\nSHA256SUMS.txt contains SHA-256 checksums for every download. Updates currently require downloading a new archive. CI checks startup, installed assets, gameplay, fullscreen, and saved progress; Steam Deck hardware behavior still needs a real-device playtest.\n`
  writeFileSync(join(directory, 'RELEASE-NOTES.md'), notes)
  return included
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareDesktopRelease(resolve(process.argv[2]), process.argv[3])
}
