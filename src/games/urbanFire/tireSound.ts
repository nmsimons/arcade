export type TireSoundSettings = {
  pitch:number; rasp:number; modulation:number; modulationRate:number
  hiss:number; brightness:number; resonance:number; volume:number
}

export const TIRE_SOUND:Readonly<TireSoundSettings> = {
  pitch:1500, rasp:4.5, modulation:490, modulationRate:80,
  hiss:.2, brightness:4600, resonance:.3, volume:100,
}

/** Separate tone and broadband friction layers. Irregular frequency targets
 * avoid a repeating vibrato; local randomness never changes combat outcomes. */
export function fillTireSound(tone:Float32Array,noiseBed:Float32Array,rate:number,p:TireSoundSettings=TIRE_SOUND){
  let seed=7391,phase=0,jitter=0,drift=0,target=0,remaining=0
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1}
  const smooth=1-Math.exp(-1/(rate*.012))
  for(let i=0;i<tone.length;i++){
    if(remaining--<=0){
      target=random()*p.modulation
      remaining=Math.max(1,Math.round(rate/(p.modulationRate*(1.05+random()*.4))))
    }
    const grain=random(),noise=random()
    jitter+=(grain-jitter)*.08
    drift+=(target-drift)*smooth
    phase+=Math.max(50,p.pitch+drift+jitter*p.modulation*.2)*Math.PI*2/rate
    const rubber=Math.tanh(Math.sin(phase)*p.rasp+Math.sin(phase*2)*.35)*.9+grain*.05
    const seam=Math.min(1,i/(rate*.008),(tone.length-1-i)/(rate*.008))
    tone[i]=rubber*.5*seam
    noiseBed[i]=noise*.5*seam
  }
}
