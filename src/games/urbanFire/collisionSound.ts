import type { CollisionMaterial } from './types'

export const COLLISION_SOUND_SECONDS=.34
const profiles={
  masonry:{start:88,end:38,decay:.072,cutoff:850,noiseDecay:.065,crisp:.12,rings:[[185,.07,.035]]},
  metal:{start:125,end:48,decay:.062,cutoff:2000,noiseDecay:.075,crisp:.38,rings:[[390,.16,.075],[671,.1,.05],[1033,.055,.035]]},
  armor:{start:72,end:28,decay:.105,cutoff:1200,noiseDecay:.065,crisp:.2,rings:[[191,.18,.095],[317,.11,.065],[523,.055,.04]]},
  wood:{start:145,end:58,decay:.048,cutoff:800,noiseDecay:.05,crisp:.13,rings:[[235,.13,.05],[419,.06,.027]]},
  soft:{start:85,end:42,decay:.065,cutoff:420,noiseDecay:.048,crisp:.025,rings:[]},
} as const

/** Short body knock, crushed material, and rapidly damped panel resonances.
 * These are deterministic samples, independent of the gameplay random stream. */
export function fillCollisionSound(data:Float32Array,rate:number,material:CollisionMaterial){
  const p=profiles[material],filter=1-Math.exp(-Math.PI*2*p.cutoff/rate)
  let seed=48271,low=0,phase=0
  for(let i=0;i<data.length;i++){
    const t=i/rate
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    const noise=seed/2147483648-1
    low+=(noise-low)*filter
    phase+=(p.end+(p.start-p.end)*Math.exp(-t*45))*Math.PI*2/rate
    const body=Math.sin(phase)*.72*Math.exp(-t/p.decay)
    const crunch=(low*(1-p.crisp)+noise*p.crisp)*1.4*Math.exp(-t/p.noiseDecay)
    let panels=0
    for(const [frequency,amplitude,decay] of p.rings)panels+=Math.sin(t*frequency*Math.PI*2)*amplitude*Math.exp(-t/decay)
    const envelope=Math.min(1,t/.002,Math.max(0,(data.length-1-i)/(rate*.025)))
    data[i]=Math.tanh(body+crunch+panels)*.8*envelope
  }
}
