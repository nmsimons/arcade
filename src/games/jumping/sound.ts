import type { SoundCue, SoundFrame, SoundLoop, Surface } from './audioState.ts'

export const MAX_LOOP_VOICES = 6
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
type Voice = { id: string | null; source: AudioBufferSourceNode; tone: OscillatorNode; texture: GainNode; body: GainNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode }
type Shot = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; filter?: BiquadFilterNode }
/** A surface's own sound, played over a step or landing. */
type SurfaceSample = 'surface-metal' | 'surface-grass'
type SampleKind = SoundCue['kind'] | SurfaceSample
/** The cues that take the character of what they strike. */
const SURFACE_KINDS: ReadonlySet<SoundCue['kind']> = new Set(['footstep', 'robot-footstep', 'landing', 'robot-landing', 'box-impact', 'ball-impact'])
/**
 * How each surface colours a step, a landing or a crate or ball striking it: always the stone sound with a
 * change small enough to be felt more than heard. The cue's own sound may be a little quieter (`thump`, stone
 * is 1) or a little duller (`muffle`, decibels taken off its highs by a gentle shelf), with a faint sample of
 * the surface under it (`level`, of the cue's own loudness), and steel adds a slight echo (`echoes`: seconds
 * after the cue, and level). Wood is the crate's own knock, small. A step's thump is low, where the ear is
 * dull, and a surface's sample higher, where it is keen: steel's ring at 2% of a step's loudness is about
 * 20 dB under it to the ear.
 */
interface SurfaceTone { thump: number; muffle?: number; sample?: SampleKind; level?: number; sampleRate?: number; echoes?: readonly (readonly [number, number])[] }
const SURFACES: Readonly<Record<Surface, SurfaceTone>> = {
  stone: { thump: 1 },
  earth: { thump: .9, muffle: 5 },
  grass: { thump: .88, muffle: 6, sample: 'surface-grass', level: .025 },
  metal: { thump: 1, sample: 'surface-metal', level: .02, echoes: [[.075, .08], [.15, .025]] },
  wood: { thump: 1, sample: 'box-impact', level: .08, sampleRate: 1.3 },
  rubber: { thump: .95, muffle: 4 },
}
/** Where the muffling shelf starts, in hertz: above a step's thump, below a crate's knock. */
const MUFFLE_FROM = 700

function approach(param: AudioParam, value: number, now: number, seconds = .06) {
  param.cancelAndHoldAtTime(now)
  param.setTargetAtTime(value, now, seconds)
}
function fade(param: AudioParam, now: number) {
  param.cancelAndHoldAtTime(now)
  param.linearRampToValueAtTime(0, now + .04)
}

/** Dry, low-register textures. Size changes the ball's resonance; closing gates
 * have a lower, slower sound than opening gates. No reverb or background drone. */
export function loopTone(loop: SoundLoop) {
  const pace = clamp(loop.pace), playbackRate = .65 + pace * .8
  switch (loop.kind) {
    case 'ball': {
      // Retain the default 68-unit ball's sound. Lower the dominant rolling
      // texture as well as the quiet resonance as diameter increases.
      const scale = Math.sqrt(68 / clamp(loop.size, 30, 200))
      // Small balls use the rolling texture alone; a pitched body sounds like
      // a hum at their higher frequency. Blend it back in toward default size.
      const resonance = clamp((loop.size - 30) / (68 - 30)) ** 2
      return { frequency: (105 - 68 * .28 + pace * 28) * scale, cutoff: (240 + pace * 260) * scale,
        playbackRate: playbackRate * scale, body: .12 * resonance, texture: 1, volume: .12 }
    }
    case 'box': return { frequency: 60, cutoff: 700 + pace * 900, playbackRate, body: 0, texture: 1, volume: .075 }
    case 'booster': return { frequency: 60, cutoff: 1400 + pace * 400, playbackRate: .9, body: 0, texture: 1, volume: .018 }
    case 'shovebot': return { frequency: 65 + pace * 65, cutoff: 520 + pace * 200, playbackRate: .5 + pace * .6, body: .55, texture: .35, volume: .065 }
    case 'robot-servo': return { frequency: 110 + pace * 50, cutoff: 700, playbackRate: .7 + pace * .4, body: .35, texture: .28, volume: .035 }
    case 'elevator': return { frequency: 68 + pace * 25, cutoff: 380, playbackRate, body: .65, texture: .28, volume: .045 }
    case 'gate-open': return { frequency: 110 + pace * 35, cutoff: 950, playbackRate, body: .16, texture: .85, volume: .075 }
    case 'gate-close': return { frequency: 76 + pace * 28, cutoff: 650, playbackRate, body: .2, texture: .85, volume: .075 }
  }
}

function makeSamples(rate: number, seconds: number, sample: (time: number, noise: number) => number) {
  const data = new Float32Array(Math.ceil(rate * seconds))
  let seed = 18741
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[i] = sample(i / rate, seed / 2147483648 - 1)
  }
  return data
}

/** Every sound's samples at one rate. They depend on nothing else, so they can be made ahead of the first key press. */
export interface SoundSamples { rate: number; noise: Float32Array; cues: Record<SampleKind, Float32Array> }
/** Makes the samples one sound per step, so idle time can spread the work. */
export function* soundSteps(rate: number): Generator<void, SoundSamples> {
  const noise = makeSamples(rate, 2, (t, noise) => noise * (.8 + .2 * Math.sin(t * Math.PI * 13)))
  yield
  const make = (seconds: number, sample: (time: number, noise: number) => number) => () => makeSamples(rate, seconds, sample)
  let grain = 0, sole = 0, cushion = 0, robotSole = 0, grassHigh = 0, grassLow = 0, landGrain = 0, landSole = 0, landBody = 0, grit = 0, robotLand = 0, wood = 0, ballSurface = 0, ballBody = 0, waterSurface = 0, waterBody = 0
  const softening = 1 - Math.exp(-2 * Math.PI * 500 / rate)
  const cushioning = 1 - Math.exp(-2 * Math.PI * 130 / rate)
  const landCushioning = 1 - Math.exp(-2 * Math.PI * 95 / rate)
  const gritSoftening = 1 - Math.exp(-2 * Math.PI * 1800 / rate)
  const grassSoftening = 1 - Math.exp(-2 * Math.PI * 6000 / rate)
  const grassDamping = 1 - Math.exp(-2 * Math.PI * 1500 / rate)
  const woodSoftening = 1 - Math.exp(-2 * Math.PI * 850 / rate)
  const ballSoftening = 1 - Math.exp(-2 * Math.PI * 650 / rate)
  const ballDamping = 1 - Math.exp(-2 * Math.PI * 140 / rate)
  const waterSoftening = 1 - Math.exp(-2 * Math.PI * 1600 / rate)
  const waterDamping = 1 - Math.exp(-2 * Math.PI * 220 / rate)
  const recipes: Record<SampleKind, () => Float32Array> = {
    'surface-metal': make(.2, t => {
      // Steel's faint overtones: a few inharmonic partials ringing briefly over the step. They sit low in the
      // range the ear is keenest to (2 to 5 kHz), so a pure tone this faint is not picked out of the step.
      const attack = Math.min(1, t / .003)
      return attack * (Math.sin(2 * Math.PI * 740 * t) * .5 + Math.sin(2 * Math.PI * 1155 * t) * .3 + Math.sin(2 * Math.PI * 1635 * t) * .2)
        * Math.exp(-t * 34) * Math.min(1, (.2 - t) / .04)
    }),
    'surface-grass': make(.16, (t, noise) => {
      // Blades brushing the foot: a soft, airy swish with no knock of its own.
      grassHigh += (noise - grassHigh) * grassSoftening
      grassLow += (grassHigh - grassLow) * grassDamping
      const attack = Math.sin(Math.min(1, t / .02) * Math.PI / 2) ** 2
      return attack * (grassHigh - grassLow) * Math.exp(-t * 22) * Math.min(1, (.16 - t) / .03)
    }),
    footstep: make(.17, (t, noise) => {
      // A cushioned rubber sole: a rounded low thump and a faint, soft scuff.
      grain += (noise - grain) * softening
      sole += (grain - sole) * softening
      cushion += (sole - cushion) * cushioning
      const attack = Math.sin(Math.min(1, t / .022) * Math.PI / 2) ** 2
      return attack * (cushion * 1.8 * Math.exp(-t * 26)
        + sole * .18 * Math.exp(-t * 38)) * Math.min(1, (.17 - t) / .035)
    }),
    'robot-footstep': make(.23, (t, noise) => {
      // A weighty heel strike with a short metal-shell knock, not a gunshot.
      robotSole += (noise - robotSole) * softening
      const attack = Math.sin(Math.min(1, t / .006) * Math.PI / 2) ** 2
      return attack * (Math.sin(2 * Math.PI * (92 * t - 45 * t * t)) * .42 * Math.exp(-t * 28)
        + robotSole * .45 * Math.exp(-t * 48)
        + Math.sin(2 * Math.PI * 620 * t) * .07 * Math.exp(-t * 52)) * Math.min(1, (.23 - t) / .04)
    }),
    landing: make(.32, (t, noise) => {
      // Both feet and the body's weight: a deeper, longer cushioned thump than a step, and a short dry
      // scuff of grit as the dust kicks up.
      landGrain += (noise - landGrain) * softening
      landSole += (landGrain - landSole) * softening
      landBody += (landSole - landBody) * landCushioning
      grit += (noise - grit) * gritSoftening
      const attack = Math.sin(Math.min(1, t / .012) * Math.PI / 2) ** 2
      return attack * (landBody * 2.6 * Math.exp(-t * 15)
        + landSole * .3 * Math.exp(-t * 30)
        + (grit - landGrain) * .05 * Math.exp(-t * 45)) * Math.min(1, (.32 - t) / .05)
    }),
    'robot-landing': make(.32, (t, noise) => {
      // The heel strike with the whole frame behind it: a lower, longer knock that settles.
      robotLand += (noise - robotLand) * softening
      const attack = Math.sin(Math.min(1, t / .006) * Math.PI / 2) ** 2
      return attack * (Math.sin(2 * Math.PI * (72 * t - 40 * t * t)) * .5 * Math.exp(-t * 20)
        + robotLand * .5 * Math.exp(-t * 36)
        + Math.sin(2 * Math.PI * 520 * t) * .06 * Math.exp(-t * 40)) * Math.min(1, (.32 - t) / .05)
    }),
    'box-impact': make(.18, (t, noise) => {
      // A short, dry wooden knock with a rounded attack and no metallic ring.
      wood += (noise - wood) * woodSoftening
      const attack = Math.sin(Math.min(1, t / .005) * Math.PI / 2) ** 2
      return attack * (wood * .7 * Math.exp(-t * 55)
        + Math.sin(2 * Math.PI * (145 * t - 60 * t * t)) * .38 * Math.exp(-t * 40)) * Math.min(1, (.18 - t) / .03)
    }),
    'ball-impact': make(.24, (t, noise) => {
      // A rounded, damped thud. Filtered noise gives it body without a hum.
      ballSurface += (noise - ballSurface) * ballSoftening
      ballBody += (ballSurface - ballBody) * ballDamping
      const attack = Math.sin(Math.min(1, t / .008) * Math.PI / 2) ** 2
      return attack * (ballBody * 1.4 * Math.exp(-t * 24)
        + ballSurface * .35 * Math.exp(-t * 48)) * Math.min(1, (.24 - t) / .035)
    }),
    'water-entry': make(.62, (t, noise) => {
      // A rounded splash followed by a spreading wash, without pitched bubbles.
      waterSurface += (noise - waterSurface) * waterSoftening
      waterBody += (waterSurface - waterBody) * waterDamping
      const attack = Math.sin(Math.min(1, t / .012) * Math.PI / 2) ** 2
      return attack * (waterBody * 1.6 * Math.exp(-t * 19)
        + (waterSurface - waterBody) * .65 * Math.exp(-t * 7)) * Math.min(1, (.62 - t) / .09)
    }),
    switch: make(.16, (t, noise) => Math.min(1, t / .002) *
      (noise * .16 * Math.exp(-t * 90) + Math.sin(t * Math.PI * 2 * 480) * .2 * Math.exp(-t * 55)) * Math.min(1, (.16 - t) / .01)),
    coin: make(.28, t => Math.min(1, t / .004) *
      (Math.sin(t * Math.PI * 2 * 1046.5) + .3 * Math.sin(t * Math.PI * 2 * 1568)) * .13 * Math.exp(-t * 19) * Math.min(1, (.28 - t) / .025)),
    repulsor: make(.22, (t, noise) => Math.min(1, t / .003) *
      (Math.sin(Math.PI * 2 * (240 * t - 300 * t * t)) * .24 + noise * .06) * Math.exp(-t * 24)),
    shove: make(.2, (t, noise) => Math.min(1, t / .006) *
      (Math.sin(Math.PI * 2 * (110 * t - 90 * t * t)) * .4 + noise * .045) * Math.exp(-t * 28) * Math.min(1, (.2 - t) / .03)),
    'emp-shot': make(.18, (t, noise) => Math.min(1, t / .002) *
      (noise * .22 + Math.sin(t * Math.PI * 2 * 1450) * .08) * Math.exp(-t * 32)),
    'timer-paused': make(.46, t => {
      const note = (start: number, frequency: number) => {
        const age = t - start
        return age < 0 ? 0 : Math.sin(age * Math.PI * 2 * frequency) * Math.min(1, age / .006) * Math.exp(-age * 18)
      }
      return (note(0, 660) + note(.14, 440)) * .18 * Math.min(1, (.46 - t) / .03)
    }),
    'time-penalty': make(.46, t => {
      const note = (start: number, frequency: number) => {
        const age = t - start
        return age < 0 ? 0 : Math.sin(age * Math.PI * 2 * frequency) * Math.min(1, age / .006) * Math.exp(-age * 18)
      }
      return (note(0, 330) + note(.14, 220)) * .18 * Math.min(1, (.46 - t) / .03)
    }),
    // The whole level losing power: a breaker clunk, a second as the lights cut,
    // and a mains hum winding down to nothing.
    'power-down': make(1.7, (t, noise) => {
      const clunk = (start: number, level: number) => {
        const age = t - start
        return age < 0 ? 0 : (Math.sin(age * Math.PI * 2 * 68) * .5 + noise * .3 * Math.exp(-age * 60)) * Math.exp(-age * 34) * Math.min(1, age / .002) * level
      }
      const phase = Math.PI * 2 * (24 * t + 116 * (1 - Math.exp(-t * 2.4)) / 2.4)
      const hum = (Math.sin(phase) + .35 * Math.sin(phase * 2) + .15 * Math.sin(phase * 3))
        * Math.min(1, t / .015) * Math.exp(-t * 1.5) * .2
      return (clunk(0, 1) + clunk(.3, .55) + hum) * Math.min(1, (1.7 - t) / .15)
    }),
    // A soft electrical power-down, with a rounded attack and no crackle.
    emp: make(.42, t => {
      const phase = Math.PI * 2 * (110 * t + 420 * (1 - Math.exp(-t * 12)) / 12)
      const envelope = Math.min(1, t / .008) * Math.exp(-t * 9) * Math.min(1, (.42 - t) / .04)
      return (Math.sin(phase) + .18 * Math.sin(phase * 2)) * envelope * .2
    }),
  }
  const cues = {} as Record<SampleKind, Float32Array>
  for (const kind of Object.keys(recipes) as SampleKind[]) { cues[kind] = recipes[kind](); yield }
  return { rate, noise, cues }
}
/** All of them at once. */
export function synthesizeSounds(rate: number) {
  const steps = soundSteps(rate)
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value
}

/** A small reusable bank bounds the cost even in a tower full of mechanisms. */
export class JumpingSound {
  private readonly ctx: BaseAudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer
  private readonly cues: Record<SampleKind, AudioBuffer>
  /** Each sample's loudness over its first 0.1 s, so a surface's sample sits at a level relative to its step. */
  private readonly loudness: Record<SampleKind, number>
  private readonly voices: Voice[] = []
  private readonly shots = new Set<Shot>()
  private disposed = false
  private variation = 0

  constructor(ctx: BaseAudioContext, prepared?: SoundSamples) {
    this.ctx = ctx
    this.output = ctx.createGain(); this.output.gain.value = .8; this.output.connect(ctx.destination)
    // Samples made ahead at this context's rate are copied in; otherwise they are made here, as before.
    const samples = prepared?.rate === ctx.sampleRate ? prepared : synthesizeSounds(ctx.sampleRate)
    const buffer = (data: Float32Array) => {
      const made = ctx.createBuffer(1, data.length, ctx.sampleRate)
      made.copyToChannel(data as Float32Array<ArrayBuffer>, 0); return made
    }
    this.noise = buffer(samples.noise)
    this.cues = Object.fromEntries(Object.entries(samples.cues).map(([kind, data]) => [kind, buffer(data)])) as Record<SampleKind, AudioBuffer>
    this.loudness = Object.fromEntries(Object.entries(samples.cues).map(([kind, data]) => {
      const length = Math.min(data.length, Math.round(samples.rate * .1))
      let sum = 0
      for (let i = 0; i < length; i++) sum += data[i] ** 2
      return [kind, Math.sqrt(sum / Math.max(1, length))]
    })) as Record<SampleKind, number>
  }

  private createVoice(loop: SoundLoop): Voice {
    const ctx = this.ctx, source = ctx.createBufferSource(), tone = ctx.createOscillator()
    const texture = ctx.createGain(), body = ctx.createGain(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), pan = ctx.createStereoPanner()
    const target = loopTone(loop)
    source.buffer = this.noise; source.loop = true; source.playbackRate.value = target.playbackRate
    tone.type = 'triangle'; tone.frequency.value = target.frequency
    texture.gain.value = target.texture; body.gain.value = target.body
    filter.type = 'lowpass'; filter.frequency.value = target.cutoff; filter.Q.value = .4
    gain.gain.value = 0; pan.pan.value = loop.pan
    source.connect(texture); tone.connect(body); texture.connect(filter); body.connect(filter)
    filter.connect(gain); gain.connect(pan); pan.connect(this.output)
    source.start(0, (this.voices.length * .317) % 2); tone.start()
    const voice = { id: null, source, tone, texture, body, filter, gain, pan }
    this.voices.push(voice)
    return voice
  }

  update(frame: SoundFrame) {
    if (this.disposed) return
    const now = this.ctx.currentTime
    const loops = frame.loops.filter(l => l.volume > .005).sort((a, b) => b.volume - a.volume).slice(0, MAX_LOOP_VOICES)
    const wanted = new Set(loops.map(l => l.id))
    for (const voice of this.voices) if (voice.id !== null && !wanted.has(voice.id)) {
      fade(voice.gain.gain, now); voice.id = null
    }
    for (const loop of loops) {
      const voice = this.voices.find(v => v.id === loop.id) ?? this.voices.find(v => v.id === null) ?? this.createVoice(loop)
      voice.id = loop.id
      const tone = loopTone(loop)
      approach(voice.tone.frequency, tone.frequency, now)
      approach(voice.source.playbackRate, tone.playbackRate, now)
      approach(voice.body.gain, tone.body, now); approach(voice.texture.gain, tone.texture, now)
      approach(voice.filter.frequency, tone.cutoff, now)
      approach(voice.pan.pan, loop.pan, now)
      approach(voice.gain.gain, tone.volume * clamp(loop.volume), now, .035)
    }
    for (const cue of frame.cues) this.cue(cue)
  }

  cue(cue: SoundCue) {
    if (this.disposed || cue.volume <= .005 || this.shots.size >= 12) return
    const robotStep = cue.kind === 'robot-footstep', footstep = cue.kind === 'footstep' || robotStep
    const landing = cue.kind === 'landing', robotLanding = cue.kind === 'robot-landing'
    const box = cue.kind === 'box-impact', ball = cue.kind === 'ball-impact', water = cue.kind === 'water-entry'
    const defaultSize = water ? 60 : ball ? 68 : 50
    const rate = footstep || landing || robotLanding ? .94 + (++this.variation % 5) * .03 : box || ball || water ? clamp((defaultSize / (cue.size ?? defaultSize)) ** .25, .75, 1.2) : 1
    // A hard landing is an impact, clearly louder than any step: from about 5 dB over a running step at the
    // softest that raises dust to about 12 dB at the hardest, and 3 to 6 dB over Rbot's fastest step for its own.
    const level = clamp(cue.volume) * clamp(cue.strength) * (robotStep ? .34 : footstep ? .22 : landing ? .33 : robotLanding ? .43
      : box ? .28 : ball ? .32 : water ? .5 : .38)
    const surface = cue.surface && SURFACE_KINDS.has(cue.kind) ? SURFACES[cue.surface] : null
    const thump = level * (surface?.thump ?? 1), muffle = surface?.muffle
    this.shoot(cue.kind, thump, rate, cue.pan, 0, muffle)
    for (const [delay, echo] of surface?.echoes ?? []) this.shoot(cue.kind, thump * echo, rate, cue.pan, delay, muffle)
    if (!surface?.sample || !surface.level) return
    // The surface struck, at its level of the cue's own loudness, a little lower for a landing's weight. It
    // rings at its own pitch, not the step's: one that changed with every step would play a tune.
    const relative = this.loudness[cue.kind] / (this.loudness[surface.sample] || 1)
    this.shoot(surface.sample, level * surface.level * relative, (surface.sampleRate ?? 1) * (landing || robotLanding ? .88 : 1), cue.pan)
  }

  private shoot(kind: SampleKind, level: number, rate: number, panning: number, delay = 0, muffle?: number) {
    if (this.shots.size >= 12) return
    const ctx = this.ctx, source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner()
    source.buffer = this.cues[kind]; source.playbackRate.value = rate
    gain.gain.value = level; pan.pan.value = panning
    let filter: BiquadFilterNode | undefined
    if (muffle) {
      filter = ctx.createBiquadFilter(); filter.type = 'highshelf'; filter.frequency.value = MUFFLE_FROM; filter.gain.value = -muffle
      source.connect(filter); filter.connect(gain)
    } else source.connect(gain)
    gain.connect(pan); pan.connect(this.output)
    const shot: Shot = { source, gain, pan, filter }; this.shots.add(shot)
    source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); pan.disconnect(); this.shots.delete(shot) }
    source.start(ctx.currentTime + delay)
  }

  silence() {
    if (this.disposed) return
    for (const voice of this.voices) { fade(voice.gain.gain, this.ctx.currentTime); voice.id = null }
    for (const shot of this.shots) { fade(shot.gain.gain, this.ctx.currentTime); shot.source.stop(this.ctx.currentTime + .045) }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const voice of this.voices) {
      voice.source.stop(); voice.tone.stop()
      for (const node of [voice.source, voice.tone, voice.texture, voice.body, voice.filter, voice.gain, voice.pan]) node.disconnect()
    }
    for (const shot of this.shots) { shot.source.stop(); shot.source.disconnect(); shot.filter?.disconnect(); shot.gain.disconnect(); shot.pan.disconnect() }
    this.shots.clear(); this.output.disconnect()
  }
}

/** Samples made this visit, by rate. Every game uses the same ones. */
const preparedSounds = new Map<number, SoundSamples>()
/** Most devices output at 48 kHz; the first context this visit says for certain. */
let likelyRate = 48000

/** Own one context per mounted game. Browsers may decline autoplay; discard
 * unheard events instead of playing a backlog when a gesture unlocks audio. */
export class JumpingSoundSession {
  private ctx: AudioContext | null = null
  private sound: JumpingSound | null = null
  private resuming = false
  private disposed = false
  private cancelPreparation = () => {}
  constructor() { this.prepare(likelyRate) }

  /** Make the samples in idle time, a sound at a time, so the first key press only copies them in. */
  private prepare(rate: number) {
    if (preparedSounds.has(rate) || typeof window === 'undefined') return
    const steps = soundSteps(rate)
    const idle = (callback: IdleRequestCallback) => window.requestIdleCallback
      ? window.requestIdleCallback(callback, { timeout: 1000 })
      : window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 50)
    const cancelIdle = (handle: number) => window.cancelIdleCallback ? window.cancelIdleCallback(handle) : window.clearTimeout(handle)
    let handle = 0, cancelled = false
    const slice = (deadline: IdleDeadline) => {
      if (cancelled) return
      // A sound takes up to about 13 ms to make: take one while the browser has
      // time to spare, or one now that it has waited long enough.
      for (let budget = deadline.didTimeout ? 1 : Infinity; budget > 0 && (deadline.didTimeout || deadline.timeRemaining() > 8); budget--) {
        const step = steps.next()
        if (step.done) { preparedSounds.set(rate, step.value); return }
      }
      handle = idle(slice)
    }
    handle = idle(slice)
    this.cancelPreparation = () => { cancelled = true; cancelIdle(handle) }
  }

  unlock() {
    if (this.disposed || this.resuming) return
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext(); likelyRate = this.ctx.sampleRate; this.cancelPreparation()
        this.sound = new JumpingSound(this.ctx, preparedSounds.get(this.ctx.sampleRate))
      }
      if (this.ctx.state === 'suspended') {
        this.resuming = true
        void this.ctx.resume().catch(() => {}).finally(() => { this.resuming = false })
      }
    } catch { /* Audio is optional; unsupported devices can still play. */ }
  }

  update(frame: SoundFrame) {
    if (this.ctx?.state === 'running') this.sound?.update(frame)
  }

  pauseCue() {
    if (this.ctx?.state === 'running') this.sound?.cue({ kind: 'timer-paused', volume: 1, pan: 0, strength: .65 })
  }

  silence() { this.sound?.silence() }

  dispose() {
    this.disposed = true; this.cancelPreparation(); this.sound?.dispose()
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {})
    this.ctx = null; this.sound = null
  }
}
