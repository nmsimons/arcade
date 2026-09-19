import fs from 'node:fs'
import { gzipSync } from 'node:zlib'
const manifest=JSON.parse(fs.readFileSync('dist/.vite/manifest.json','utf8'))
const entries=Object.entries(manifest).filter(([,entry])=>entry.isEntry||entry.isDynamicEntry)
console.log(JSON.stringify(entries.map(([source,entry])=>{
  const bytes=fs.readFileSync(`dist/${entry.file}`)
  return {source,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,imports:entry.imports??[]}
}),null,2))
