import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createWindowsArchive } from '../desktop/windows-archive.mjs'

test('Windows ZIPs use portable entry paths and preserve hidden assets and file bytes', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'arcade-zip-'))
  try {
    const source = join(root, "test app's folder"), archive = join(root, 'download.zip'), extracted = join(root, 'extracted')
    mkdirSync(join(source, 'resources'), { recursive: true })
    writeFileSync(join(source, 'app.exe'), 'test executable')
    writeFileSync(join(source, 'resources/.hidden'), 'hidden data')
    writeFileSync(join(source, 'resources/app.asar'), Buffer.from([0, 1, 255, 42]))
    createWindowsArchive(source, archive)
    const literal = value => `'${value.replaceAll("'", "''")}'`
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead(${literal(archive)}); try { ConvertTo-Json -Compress -InputObject @($zip.Entries | ForEach-Object { $_.FullName }) } finally { $zip.Dispose() }; [System.IO.Compression.ZipFile]::ExtractToDirectory(${literal(archive)}, ${literal(extracted)})`], { encoding: 'utf8' })
    const entries = JSON.parse(output.trim())
    assert.ok(entries.every(entry => !entry.includes('\\')))
    assert.ok(entries.includes("test app's folder/resources/.hidden"))
    assert.deepEqual(readFileSync(join(extracted, "test app's folder/resources/app.asar")), Buffer.from([0, 1, 255, 42]))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
