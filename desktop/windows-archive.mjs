import { execFileSync } from 'node:child_process'
import { basename, resolve } from 'node:path'

// Explicit ZIP entry names keep Windows PowerShell's legacy .NET framework
// from writing backslashes. Include hidden files and the enclosing app folder.
export function createWindowsArchive(source, destination) {
  const directory = resolve(source), archive = resolve(destination)
  const literal = value => `'${value.replaceAll("'", "''")}'`
  const command = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath ${literal(archive)}) { Remove-Item -LiteralPath ${literal(archive)} }
$arcadeSource = ${literal(directory)}
$arcadeZip = [System.IO.Compression.ZipFile]::Open(${literal(archive)}, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $arcadeSource -Recurse -File -Force | ForEach-Object {
    $arcadeRelative = $_.FullName.Substring($arcadeSource.Length + 1).Replace('\\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($arcadeZip, $_.FullName, ${literal(basename(directory) + '/')} + $arcadeRelative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $arcadeZip.Dispose() }`
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit' })
}
