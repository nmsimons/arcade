import { readFile } from 'node:fs/promises'
const profile=JSON.parse(await readFile(process.argv[2],'utf8'))
const nodes=new Map(profile.nodes.map(n=>[n.id,n.callFrame])),times=new Map()
for(let i=0;i<profile.samples.length;i++){
  const frame=nodes.get(profile.samples[i]),key=`${frame.functionName||'(anonymous)'} (${frame.url.split('/').at(-1)}:${frame.lineNumber+1})`
  times.set(key,(times.get(key)??0)+profile.timeDeltas[i]/1000)
}
console.log([...times].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([name,ms])=>`${ms.toFixed(1).padStart(9)} ms  ${name}`).join('\n'))
