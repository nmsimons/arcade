import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

// Explicit ZIP entry names keep Windows PowerShell's legacy .NET framework
// from writing backslashes. Include hidden files and the enclosing app folder.
export function createWindowsArchive(source, destination) {
  const directory = resolve(source), archive = resolve(destination)
  const entries = []
  function collect(relative = '') {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name)
      if (entry.isDirectory()) collect(path)
      else if (entry.isFile()) entries.push({ source: join(directory, path), name: `${basename(directory)}/${path.split(sep).join('/')}` })
    }
  }
  collect()
  const literal = value => `'${value.replaceAll("'", "''")}'`
  const command = `$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath ${literal(archive)}) { Remove-Item -LiteralPath ${literal(archive)} }
$arcadeEntries = [Console]::In.ReadToEnd() | ConvertFrom-Json
$arcadeZip = [System.IO.Compression.ZipFile]::Open(${literal(archive)}, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($arcadeEntry in $arcadeEntries) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($arcadeZip, $arcadeEntry.source, $arcadeEntry.name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $arcadeZip.Dispose() }`
  // Node's relative names avoid Windows provider expansion of short temp paths.
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input: JSON.stringify(entries), stdio: ['pipe', 'inherit', 'inherit'] })
}
