import type { SoundCue, SoundFrame, SoundLoop, Surface } from './audioState.ts'
import { AMBIENT_KINDS } from './ambience.ts'
import type { Ambience, AmbientKind } from './ambience.ts'

export const MAX_LOOP_VOICES = 6
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
type Voice = { id: string | null; source: AudioBufferSourceNode; tone: OscillatorNode; texture: GainNode; body: GainNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode }
type Shot = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; filter?: BiquadFilterNode }
/** A surface's own sound, played over a step or landing. */
type SurfaceSample = 'surface-metal' | 'surface-grass'
/** The bus's diesel at three engine speeds, crossfaded as it revs (engineLoop). */
type EngineSample = 'engine-idle' | 'engine-mid' | 'engine-high'
type SampleKind = SoundCue['kind'] | SurfaceSample | EngineSample
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
/**
 * The loudness of the cues of the world around the robot, against `.38` for the rest. Measured A-weighted against a
 * running step at its loudest: bubbles 6 dB under it, a bird at most 10 dB under (they sing further off still), and
 * the bus's air brakes letting go about as loud as a hard landing.
 */
const CUE_LEVEL: Partial<Record<SoundCue['kind'], number>> = { relay: .08, drip: .035, bubble: .0083,
  'bird-whistle': .00207, 'bird-trill': .00355, 'bird-chirp': .00279, 'air-brake': .0288,
  // Heard over everything for ten seconds: urgent, but no louder than the pickups' chimes.
  'power-warning': .34 }
/** Where the muffling shelf starts, in hertz: above a step's thump, below a crate's knock. */
const MUFFLE_FROM = 700

/**
 * Each ambient bed's gain at full volume (ambience.ts). Measured A-weighted against a lift running beside the
 * listener (the `elevator` loop at full volume), they sit: the air handling 12 dB under it and the open air 10; a
 * machine at rest beside the listener 10, a gravity plate 9, a lamp 15 and an idle robot 12; a pool 8, and the water
 * around a head under it 6; a force field only 4, as a warning; and the bus, a big diesel, idling beside the
 * listener 5 dB over it, its clatter foremost, and revving away about 10 over. The browser check holds them there.
 */
export const AMBIENT_LEVEL: Readonly<Record<AmbientKind, number>> = { hvac: .0088, air: .0025, hum: .017, gravity: .0141, buzz: .006, field: .0106, whir: .0039, water: .0081,
  underwater: .0248, engine: .0168 }
/**
 * How an electrical bed answers its power: `down` and `up` are the seconds its machinery takes to run down and back
 * up, and `droop` how far its pitch has fallen when it stops. A fan sags a long way, slowly; a lamp just goes out.
 * The water and the air never lose power.
 */
const RUN_DOWN: Readonly<Record<AmbientKind, { down: number; up: number; droop: number }>> = {
  hvac: { down: 1.1, up: 1.6, droop: .65 }, hum: { down: .35, up: .5, droop: .5 }, gravity: { down: .5, up: .8, droop: .55 }, whir: { down: .3, up: .4, droop: .6 },
  field: { down: .05, up: .12, droop: .2 }, buzz: { down: 0, up: .04, droop: 0 }, air: { down: 0, up: 0, droop: 0 }, water: { down: 0, up: 0, droop: 0 },
  underwater: { down: 0, up: 0, droop: 0 }, engine: { down: 0, up: 0, droop: 0 },
}
/**
 * How a paced bed answers its pace (0 to 1): its pitch runs from `from` to `to` times its own, and an engine gets
 * `louder` as it revs. A gravity plate pulling harder drones higher; the bus revs up to well over twice its idle.
 */
const PACE: Partial<Record<AmbientKind, { from: number; to: number; louder?: number }>> = {
  gravity: { from: .75, to: 1.25 }, engine: { from: 1, to: 1, louder: 1 },
}
/**
 * The bus's diesel: a big six-cylinder, idling at 600 rpm (30 firings a second) and revving to about 1,560 at full
 * pace. Its sound is baked at three speeds, each played a little faster or slower and crossfaded with its neighbour,
 * so the throat keeps its pitch as the revs climb rather than rising with them.
 */
const ENGINE_LAYERS: readonly { kind: EngineSample; firing: number }[] = [{ kind: 'engine-idle', firing: 30 }, { kind: 'engine-mid', firing: 50 }, { kind: 'engine-high', firing: 78 }]
type EngineVoice = { layers: { source: AudioBufferSourceNode; gain: GainNode; firing: number }[]; turbo: OscillatorNode; whistle: GainNode }
/** Under water, what is heard through the air comes dulled above this frequency and this much quieter. */
const UNDERWATER_CUTOFF = 450, UNDERWATER_LEVEL = .45
/**
 * Below this share of its full loudness a bed is silent, and a voice silent for `AMBIENT_RELEASE` seconds is let go:
 * its oscillators, noise and filters cost the audio thread as much at no volume as at full.
 */
const AMBIENT_AUDIBLE = .005, AMBIENT_RELEASE = 3
type AmbientVoice = { gain: GainNode; pan: StereoPannerNode; silent: number; tuned: { param: AudioParam; base: number }[]; nodes: AudioNode[]; sources: AudioScheduledSourceNode[]; engine?: EngineVoice }
/** How fast a bed's machinery is running (0 to 1) and how hard it works: kept apart from its voice, which may be let go. */
type AmbientMotor = { speed: number; pace: number }

function approach(param: AudioParam, value: number, now: number, seconds = .06) {
  param.cancelAndHoldAtTime(now)
  param.setTargetAtTime(value, now, seconds)
}
function fade(param: AudioParam, now: number) {
  param.cancelAndHoldAtTime(now)
  param.linearRampToValueAtTime(0, now + .04)
}

/** Dry, low-register textures. Size changes the ball's resonance; closing gates
 * have a lower, slower sound than opening gates. The level's standing sound is the ambience below. */
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
    // A submerged motor and the water it moves: a low, steady drone under a wash.
    case 'pump': return { frequency: 92 + pace * 14, cutoff: 560 + pace * 240, playbackRate: .6 + pace * .25, body: .45, texture: .6, volume: .03 }
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

/**
 * How the bus's diesel is mixed, set against recordings of real ones (a Mercedes OM 67 truck and bus engine, a
 * Detroit 6.2 and an idling mine locomotive, measured for their balance and their clatter): the ringing thump of each
 * firing, the gas's roar after it, the injector's knock and the block's clack, and the rattle of the valve train and
 * gears, which never quite stops.
 */
const DIESEL = { thump: 1, roar: 5, knock: .4, clack: .3, rattle: .2 }
/** The diesel's thumps and clacks at a sample rate, made once and shared by its three speeds. */
const dieselParts = new Map<number, { thumps: Float32Array[]; clacks: Float32Array[] }>()
function dieselResonances(rate: number) {
  const made = dieselParts.get(rate)
  if (made) return made
  let seed = 4421
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  // Hertz, decay per second and share of each resonance, summed into one response from a sharp start.
  const ringing = (seconds: number, attack: number, modes: readonly (readonly [number, number, number])[], phase = 0) => {
    const sample = new Float32Array(Math.round(rate * seconds))
    for (let i = 0; i < sample.length; i++) {
      const t = i / rate
      let v = 0
      for (const [k, [f, decay, share]] of modes.entries()) v += Math.sin(2 * Math.PI * f * t + phase * (k + 1)) * Math.exp(-decay * t) * share
      sample[i] = v * Math.min(1, t / attack)
    }
    return sample
  }
  // The exhaust and the chassis, in four slightly different tunings so no two firings ring alike.
  const throat: readonly (readonly [number, number, number])[] = [[58, 22, .5], [72, 30, .4], [104, 36, 1], [148, 46, .75], [228, 70, .55], [350, 105, .45], [520, 150, .35], [760, 210, .25]]
  const thumps = Array.from({ length: 4 }, () => ringing(.15, .0008, throat.map(([f, decay, share]) => [f * (.95 + .1 * random()), decay, share] as const), random() * 6))
  // The block knocked: inharmonic and hard, from a low knock up, in three slightly different voices.
  const clacks = [.94, 1, 1.07].map((scale, i) => ringing(.035, .0003,
    [[640 * scale, 170, .55], [1090 * scale, 210, .7], [1730 * scale, 260, 1], [2490 * scale, 330, .8], [3370 * scale, 420, .5], [4610 * scale, 520, .25]], i * 1.3))
  const parts = { thumps, clacks }
  dieselParts.set(rate, parts)
  return parts
}
/**
 * A big diesel heard from beside the bus, `firing` combustions a second from six cylinders. Each firing thumps the
 * exhaust and the chassis, ringing a few resonances, never quite the same twice, that stay put whatever the revs;
 * then the gas roars out, the injector knocks and the block clacks. Under it all the valve train and gears rattle,
 * swelling at each firing. The clatter is loudest at idle. The cylinders differ a little in strength and timing,
 * which gives the idle its lope. The loop is a whole number of engine cycles, each sound wrapping round from the end
 * into the start, so it plays seamlessly: two seconds at idle, where the lope could be followed, and less at speed.
 */
function engineLoop(rate: number, firing: number) {
  const seconds = Math.min(2, Math.max(1.2, 60 / firing))
  const cycles = Math.max(1, Math.round(seconds * firing / 6)), pulses = cycles * 6, length = Math.round(rate * pulses / firing)
  const data = new Float32Array(length), period = rate / firing, burst = Math.round(rate * .09)
  const { thumps, clacks } = dieselResonances(rate)
  let seed = 9127
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const smoothing = (hz: number) => 1 - Math.exp(-2 * Math.PI * hz / rate)
  const add = (at: number, sample: Float32Array, amount: number) => {
    at %= length
    const split = Math.min(sample.length, length - at)
    for (let i = 0; i < split; i++) data[at + i] += sample[i] * amount
    for (let i = split; i < sample.length; i++) data[(at + i) % length] += sample[i] * amount
  }
  const clatter = (30 / firing) ** .3
  const strength = [1, .78, .95, .72, 1.08, .86], lag = [0, .06, -.04, .07, -.02, .05]
  const roarHigh = smoothing(1700), roarLow = smoothing(110), knockHigh = smoothing(3800), knockLow = smoothing(900)
  const roarFade = Math.exp(-35 / rate), knockFade = Math.exp(-170 / rate), knockAt = Math.round(rate * .0015), attack = rate * .001
  for (let pulse = 0; pulse < pulses; pulse++) {
    const cylinder = pulse % 6, amount = strength[cylinder] * (.85 + .3 * random())
    const start = Math.round((pulse + lag[cylinder] * (.7 + .6 * random())) * period + length) % length
    add(start, thumps[Math.floor(random() * thumps.length)], amount * DIESEL.thump)
    // The gas's roar, from about 110 to 1,700 Hz (cut twice below, so it adds no rumble), and the injector's
    // knock, from 900 to 3,800 Hz.
    let a1 = 0, a = 0, b = 0, b2 = 0, c1 = 0, c = 0, d = 0, roar = DIESEL.roar * amount, knock = DIESEL.knock * clatter * amount
    for (let i = 0; i < burst; i++) {
      const n = random() * 2 - 1
      a1 += (n - a1) * roarHigh; a += (a1 - a) * roarHigh; b += (a - b) * roarLow; b2 += (a - b - b2) * roarLow
      c1 += (n - c1) * knockHigh; c += (c1 - c) * knockHigh; d += (c - d) * knockLow
      data[(start + i) % length] += ((a - b - b2) * roar + (i > knockAt ? (c - d) * knock : 0)) * Math.min(1, i / attack)
      roar *= roarFade; if (i > knockAt) knock *= knockFade
    }
    const clack = () => clacks[Math.floor(random() * clacks.length)]
    add(start + knockAt, clack(), DIESEL.clack * clatter * (.75 + .5 * random()))
    add(start + Math.round(rate * (.0045 + .002 * random())), clack(), DIESEL.clack * clatter * .4 * (.6 + .8 * random()))
  }
  // The valve train and gears: a rattle from 700 to 3,000 Hz all the way round, swelling at each firing.
  let e1 = 0, e = 0, g = 0
  const rattleHigh = smoothing(3000), rattleLow = smoothing(700)
  for (let i = 0; i < length; i++) {
    const n = random() * 2 - 1
    e1 += (n - e1) * rattleHigh; e += (e1 - e) * rattleHigh; g += (e - g) * rattleLow
    data[i] += (e - g) * DIESEL.rattle * clatter * (.4 + .6 * Math.exp(-5 * (i % period) / period))
  }
  // Nothing under about 40 Hz, where a pulse train piles up rumble no exhaust makes: cut twice, round the loop
  // twice so the cut runs on from its own end.
  let h1 = 0, h2 = 0
  const sub = smoothing(40)
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < length; i++) {
    const v = data[i]
    h1 += (v - h1) * sub; const once = v - h1
    h2 += (once - h2) * sub
    if (pass) data[i] = once - h2
  }
  let sum = 0
  for (const v of data) sum += v * v
  const scale = .3 / Math.sqrt(sum / length)
  for (let i = 0; i < length; i++) data[i] *= scale
  return data
}

/** Every sound's samples at one rate. They depend on nothing else, so they can be made ahead of the first key press. */
export interface SoundSamples { rate: number; noise: Float32Array; ambientNoise: Float32Array; cues: Record<SampleKind, Float32Array> }
/** Makes the samples one sound per step, so idle time can spread the work. */
export function* soundSteps(rate: number): Generator<void, SoundSamples> {
  const noise = makeSamples(rate, 2, (t, noise) => noise * (.8 + .2 * Math.sin(t * Math.PI * 13)))
  yield
  // Plain and long, for the ambience: a steady bed must neither flutter nor repeat itself where the ear can follow.
  const ambientNoise = makeSamples(rate, 7.3, (_, noise) => noise)
  yield
  // The diesel's resonances, shared by its three speeds below.
  dieselResonances(rate)
  yield
  const make = (seconds: number, sample: (time: number, noise: number) => number) => () => makeSamples(rate, seconds, sample)
  let whistle = 0, trill = 0, chirp = 0, hissLow = 0, hissBody = 0, click = 0, grain = 0, sole = 0, cushion = 0, robotSole = 0, grassHigh = 0, grassLow = 0, landGrain = 0, landSole = 0, landBody = 0, grit = 0, robotLand = 0, wood = 0, ballSurface = 0, ballBody = 0, waterSurface = 0, waterBody = 0
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
  const hissDamping = 1 - Math.exp(-2 * Math.PI * 2000 / rate)
  const hissSoftening = 1 - Math.exp(-2 * Math.PI * 7000 / rate)
  const recipes: Record<SampleKind, () => Float32Array> = {
    'engine-idle': () => engineLoop(rate, 30),
    'engine-mid': () => engineLoop(rate, 50),
    'engine-high': () => engineLoop(rate, 78),
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
    // A relay pulling in behind a panel: a small, dry tick with a brief metal ring, well under a pressure plate's.
    relay: make(.07, (t, noise) => {
      click += (noise - click) * softening
      const attack = Math.min(1, t / .001)
      return attack * ((noise - click) * .5 * Math.exp(-t * 160) + Math.sin(2 * Math.PI * 2350 * t) * .12 * Math.exp(-t * 75))
        * Math.min(1, (.07 - t) / .01)
    }),
    // A drop falling into still water: a round plink rising in pitch as the bubble closes.
    drip: make(.16, t => {
      const plink = Math.sin(2 * Math.PI * (950 * t + 9000 * t * t)) * Math.exp(-t * 48)
      return Math.min(1, t / .002) * plink * .3 * Math.min(1, (.16 - t) / .03)
    }),
    // Bubbles rising past the head: three small ones, each a round blip rising in pitch as it grows and goes.
    bubble: make(.4, t => {
      let sum = 0
      for (const [start, base, size] of [[0, 360, 1], [.085, 520, .7], [.21, 290, .85]] as const) {
        const age = t - start
        if (age < 0 || age > .12) continue
        // A tone rising to 2.2 times its pitch over about 40 ms, from the integral of its frequency.
        const phase = 2 * Math.PI * base * (2.2 * age - 1.2 * .04 * (1 - Math.exp(-age / .04)))
        sum += Math.sin(phase) * Math.min(1, age / .002) * Math.exp(-age * 38) * size
      }
      return sum * .4 * Math.min(1, (.4 - t) / .03)
    }),
    // Birds, far off: a two-note whistle, the second lower and warbling; a run of quick falling chirps; and two bright
    // rising chirps. Each is a pure tone gliding, as birdsong is.
    'bird-whistle': make(.62, t => {
      const first = t < .2, second = t >= .26 && t < .58
      whistle += 2 * Math.PI * (first ? 3500 - 900 * t / .2 : 2700 - 300 * (t - .26) / .32 + 90 * Math.sin(2 * Math.PI * 28 * t)) / rate
      const age = first ? t : t - .26, length = first ? .2 : .32
      return first || second ? Math.sin(whistle) * Math.sin(Math.PI * Math.min(1, age / length)) ** 1.5 * .3 : 0
    }),
    'bird-trill': make(.75, t => {
      const n = Math.floor(t / .068), age = t - n * .068
      trill += 2 * Math.PI * (4300 - 1500 * Math.min(1, age / .04)) / rate
      return n < 10 && age < .045 ? Math.sin(trill) * Math.sin(Math.PI * age / .045) * (1 - n * .07) * .25 : 0
    }),
    'bird-chirp': make(.4, t => {
      const age = t < .14 ? t : t - .17
      chirp += 2 * Math.PI * (2700 + 2100 * Math.min(1, Math.max(0, age) / .055)) / rate
      return age >= 0 && age < .07 ? Math.sin(chirp) * Math.sin(Math.PI * age / .07) ** 2 * .3 : 0
    }),
    // The bus's doors and brakes letting go of their air: a sharp hiss falling away.
    'air-brake': make(.9, (t, noise) => {
      hissLow += (noise - hissLow) * hissDamping
      hissBody += (noise - hissLow - hissBody) * hissSoftening
      return Math.min(1, t / .008) * hissBody * (.6 * Math.exp(-t * 4.5) + .4 * Math.exp(-t * 18)) * Math.min(1, (.9 - t) / .1)
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
    // The power-down warning: an urgent double pip, bright with odd harmonics like an alarm's buzzer, each one short and clipped.
    'power-warning': make(.24, t => {
      const pip = (start: number) => {
        const age = t - start
        if (age < 0 || age > .07) return 0
        const phase = age * Math.PI * 2 * 1175
        return (Math.sin(phase) + .3 * Math.sin(phase * 3) + .12 * Math.sin(phase * 5)) * Math.min(1, age / .004) * Math.min(1, (.07 - age) / .012)
      }
      return (pip(0) + pip(.11)) * .2
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
  return { rate, noise, ambientNoise, cues }
}
/** All of them at once. */
export function synthesizeSounds(rate: number) {
  const steps = soundSteps(rate)
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value
}

/** A small reusable bank bounds the cost even in a tower full of mechanisms. */
export class JumpingSound {
  private readonly ctx: BaseAudioContext
  /** Everything heard through the air; under water it reaches `master` dulled and quieter, through `muffle` and `wet`. */
  private readonly output: GainNode
  private readonly dry: GainNode
  private readonly wet: GainNode
  private readonly muffle: BiquadFilterNode
  /** What is made in the water itself, heard as it is: the water around a head under it, and its bubbles. */
  private readonly inWater: GainNode
  private readonly master: GainNode
  private readonly noise: AudioBuffer
  private readonly ambientNoise: AudioBuffer
  private readonly ambient = new Map<AmbientKind, AmbientVoice>()
  private readonly motors = new Map<AmbientKind, AmbientMotor>()
  private ambientTime = 0
  private readonly cues: Record<SampleKind, AudioBuffer>
  /** Each sample's loudness over its first 0.1 s, so a surface's sample sits at a level relative to its step. */
  private readonly loudness: Record<SampleKind, number>
  private readonly voices: Voice[] = []
  private readonly shots = new Set<Shot>()
  private disposed = false
  private variation = 0

  constructor(ctx: BaseAudioContext, prepared?: SoundSamples) {
    this.ctx = ctx
    this.master = ctx.createGain(); this.master.gain.value = .8; this.master.connect(ctx.destination)
    this.output = ctx.createGain(); this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = UNDERWATER_CUTOFF; this.muffle.Q.value = 1.1
    this.output.connect(this.dry).connect(this.master)
    this.output.connect(this.muffle).connect(this.wet).connect(this.master)
    this.inWater = ctx.createGain(); this.inWater.connect(this.master)
    // Samples made ahead at this context's rate are copied in; otherwise they are made here, as before.
    const samples = prepared?.rate === ctx.sampleRate ? prepared : synthesizeSounds(ctx.sampleRate)
    const buffer = (data: Float32Array) => {
      const made = ctx.createBuffer(1, data.length, ctx.sampleRate)
      made.copyToChannel(data as Float32Array<ArrayBuffer>, 0); return made
    }
    this.noise = buffer(samples.noise)
    this.ambientNoise = buffer(samples.ambientNoise)
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
    this.updateAmbience(frame.ambience ?? {}, now)
    const under = clamp(frame.underwater ?? 0)
    approach(this.dry.gain, 1 - under, now, .05); approach(this.wet.gain, UNDERWATER_LEVEL * under, now, .05)
  }

  /**
   * Bring each bed to the frame's loudness and bearing. A bed that loses power runs down at its own pace, its pitch
   * and loudness falling together, and runs back up when power returns; one the listener walks away from just fades.
   * A voice is built as its bed becomes audible and let go once it has been silent a while, so the audio thread only
   * works on what can be heard. Its machinery's speed outlives it: a voice rebuilt in an outage still runs back up.
   */
  private updateAmbience(ambience: Ambience, now: number) {
    const elapsed = Math.min(.5, Math.max(0, now - this.ambientTime)); this.ambientTime = now
    for (const kind of AMBIENT_KINDS) {
      const bed = ambience[kind], run = RUN_DOWN[kind]
      let motor = this.motors.get(kind)
      if (bed) {
        if (!motor) { motor = { speed: bed.power, pace: bed.pace ?? 0 }; this.motors.set(kind, motor) }
        const seconds = bed.power < motor.speed ? run.down : run.up
        motor.speed += (bed.power - motor.speed) * (seconds > 0 ? 1 - Math.exp(-elapsed / seconds) : 1)
        motor.pace = bed.pace ?? motor.pace
      }
      if (!motor) continue
      const paced = PACE[kind]
      const loudness = bed ? clamp(bed.volume) * (run.droop ? motor.speed ** 1.5 : motor.speed) * (1 + (paced?.louder ?? 0) * motor.pace) : 0
      let voice = this.ambient.get(kind)
      if (!voice) {
        if (loudness < AMBIENT_AUDIBLE) continue
        voice = this.ambientVoice(kind); this.ambient.set(kind, voice)
      }
      voice.silent = loudness < AMBIENT_AUDIBLE ? voice.silent + elapsed : 0
      if (voice.silent >= AMBIENT_RELEASE) { this.release(voice, now); this.ambient.delete(kind); continue }
      const pitch = (1 - run.droop * (1 - motor.speed)) * (paced ? paced.from + (paced.to - paced.from) * motor.pace : 1)
      for (const { param, base } of voice.tuned) approach(param, base * pitch, now, .05)
      if (voice.engine) this.driveEngine(voice.engine, motor.pace, now)
      approach(voice.gain.gain, AMBIENT_LEVEL[kind] * loudness, now, .25)
      if (bed) approach(voice.pan.pan, bed.pan, now, .15)
    }
  }

  /**
   * Run the diesel at this pace: the firing rate climbs from idle to well over twice it, each baked speed playing at
   * the rate that matches and fading in and out with its neighbours (equal power), so the throat stays where it is. At
   * idle the governor hunts a little; under load the turbo whistles.
   */
  private driveEngine(engine: EngineVoice, pace: number, now: number) {
    const idle = ENGINE_LAYERS[0].firing, top = ENGINE_LAYERS[ENGINE_LAYERS.length - 1].firing
    const firing = idle * (top / idle) ** clamp(pace) * (1 + .012 * Math.sin(2 * Math.PI * .6 * now) * (1 - clamp(pace)))
    engine.layers.forEach((layer, i) => {
      const lower = engine.layers[i - 1], upper = engine.layers[i + 1]
      let weight = 0
      if (firing <= layer.firing) weight = lower ? Math.sin(Math.PI / 2 * clamp(Math.log(firing / lower.firing) / Math.log(layer.firing / lower.firing))) : 1
      else weight = upper ? Math.cos(Math.PI / 2 * clamp(Math.log(firing / layer.firing) / Math.log(upper.firing / layer.firing))) : 1
      approach(layer.source.playbackRate, firing / layer.firing, now, .08)
      approach(layer.gain.gain, weight, now, .08)
    })
    approach(engine.turbo.frequency, 1300 + 2600 * clamp(pace), now, .3)
    approach(engine.whistle.gain, .05 * clamp(pace) ** 2, now, .3)
  }

  /** Fade a voice out, stop it and, once stopped, take it apart. */
  private release(voice: AmbientVoice, now: number) {
    fade(voice.gain.gain, now)
    voice.sources[0].onended = () => { for (const node of voice.nodes) node.disconnect() }
    for (const source of voice.sources) source.stop(now + .05)
  }

  /** One bed's sound, built from the long noise and a few oscillators. It starts silent and fades in. */
  private ambientVoice(kind: AmbientKind): AmbientVoice {
    const ctx = this.ctx, nodes: AudioNode[] = [], sources: AudioScheduledSourceNode[] = [], tuned: AmbientVoice['tuned'] = []
    const add = <T extends AudioNode>(node: T) => { nodes.push(node); return node }
    const level = (value: number) => { const node = add(ctx.createGain()); node.gain.value = value; return node }
    const gain = level(0), pan = add(ctx.createStereoPanner()), bed = level(1)
    bed.connect(gain); gain.connect(pan); pan.connect(kind === 'underwater' ? this.inWater : this.output)
    const length = this.ambientNoise.duration, start = AMBIENT_KINDS.indexOf(kind) * 1.37
    // Noise read from its own place in the buffer, at its own rate, so no two beds share a texture.
    const noise = (rate = 1, at = 0) => {
      const source = add(ctx.createBufferSource()); source.buffer = this.ambientNoise; source.loop = true; source.playbackRate.value = rate
      source.start(0, (start + at) % length); sources.push(source); tuned.push({ param: source.playbackRate, base: rate }); return source
    }
    const tone = (type: OscillatorType, frequency: number) => {
      const osc = add(ctx.createOscillator()); osc.type = type; osc.frequency.value = frequency
      osc.start(); sources.push(osc); tuned.push({ param: osc.frequency, base: frequency }); return osc
    }
    const filter = (type: BiquadFilterType, frequency: number, q = .7, tune = true) => {
      const node = add(ctx.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = q
      if (tune) tuned.push({ param: node.frequency, base: frequency })
      return node
    }
    // A slow sine moving a parameter either side of its value.
    const sway = (param: AudioParam, rate: number, depth: number) => {
      const osc = add(ctx.createOscillator()); osc.frequency.value = rate; osc.start(); sources.push(osc)
      osc.connect(level(depth)).connect(param)
    }
    const chain = (...path: AudioNode[]) => { for (let i = 1; i < path.length; i++) path[i - 1].connect(path[i]) }
    let engine: EngineVoice | undefined
    switch (kind) {
      case 'hvac': {
        // Air handling: a fan's rumble in its duct, the hiss of air at the vents and the motor's hum, swelling slowly.
        const air = noise()
        chain(air, filter('lowpass', 240, .6), level(1.6), bed)
        chain(air, filter('bandpass', 620, .8), level(.35), bed)
        chain(tone('sine', 59), level(.05), bed)
        chain(tone('triangle', 118), level(.025), bed)
        sway(bed.gain, .085, .15)
        break
      }
      case 'air': {
        // Open air: a soft wind whose colour and strength drift, and a faint hiss of it over the ground.
        const wind = filter('bandpass', 380, .5, false)
        chain(noise(.9), wind, level(1.2), bed)
        sway(wind.frequency, .07, 140)
        chain(noise(1.1, 3), filter('highpass', 2400, .5, false), level(.08), bed)
        sway(bed.gain, .045, .4)
        break
      }
      case 'hum': {
        // Transformers and motors held ready: mains hum, strongest at twice the mains, with a little mechanical grit.
        const mains = tone('sine', 60)
        mains.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(11), Float32Array.from([0, .3, 1, .35, .5, 0, .25, 0, .12, 0, .06])))
        chain(mains, filter('lowpass', 900, .5), level(.25), bed)
        chain(noise(.7, 2), filter('bandpass', 240, 1.5), level(.25), bed)
        sway(bed.gain, .6, .06)
        break
      }
      case 'gravity': {
        // A field generator: two low tones beating slowly, their overtones, and air turning through a slow, narrow sweep.
        chain(tone('sine', 70), level(.4), bed); chain(tone('sine', 70.9), level(.4), bed)
        chain(tone('triangle', 140), level(.14), bed)
        chain(tone('sine', 211), level(.07), bed)
        const swirl = filter('bandpass', 330, 6)
        chain(noise(.9, 3.3), swirl, level(1.4), bed)
        sway(swirl.frequency, .16, 110)
        break
      }
      case 'buzz': {
        // Ballasts and displays: a bright, thin buzz and the faint hiss of electronics.
        chain(tone('sawtooth', 120), filter('bandpass', 1800, 1.1), level(.4), bed)
        chain(tone('sine', 120), level(.12), bed)
        chain(noise(1, 4), filter('highpass', 5000, .5), level(.05), bed)
        break
      }
      case 'field': {
        // Two detuned emitters beating under a resonant filter, and a sizzle pulsing over them.
        const body = filter('lowpass', 1300, 3)
        chain(tone('sawtooth', 82), level(.2), body); chain(tone('sawtooth', 83.3), level(.2), body); chain(body, bed)
        const sizzle = level(.35)
        chain(noise(1, 5), filter('bandpass', 3200, 1.3), sizzle, bed)
        sway(sizzle.gain, 9.5, .25)
        break
      }
      case 'whir': {
        // A robot standing ready: its cooling fan and a faint servo whine.
        const fan = filter('bandpass', 1400, 4)
        chain(noise(1, 1), fan, level(1.2), bed)
        sway(fan.frequency, .23, 60)
        chain(tone('sine', 233), level(.05), bed)
        break
      }
      case 'underwater': {
        // Water all round: a deep, slow pressure, and the water moving past the head.
        chain(noise(.7, 1.9), filter('lowpass', 150, .7, false), level(1.6), bed)
        const flow = filter('bandpass', 300, 2.5, false)
        chain(noise(.8, 4.9), flow, level(.5), bed)
        sway(flow.frequency, .13, 90)
        sway(bed.gain, .09, .25)
        break
      }
      case 'engine': {
        // A big diesel (engineLoop) at three speeds, idling on the first, and its turbo, silent until it works.
        const layers = ENGINE_LAYERS.map(({ kind, firing }, i) => {
          const source = add(ctx.createBufferSource()); source.buffer = this.cues[kind]; source.loop = true
          const gain = level(i ? 0 : 1)
          source.connect(gain).connect(bed); source.start(); sources.push(source)
          return { source, gain, firing }
        })
        const turbo = add(ctx.createOscillator()); turbo.frequency.value = 1300; turbo.start(); sources.push(turbo)
        const whistle = level(0)
        turbo.connect(whistle).connect(bed)
        engine = { layers, turbo, whistle }
        break
      }
      case 'water': {
        // Water against its walls: slow, overlapping laps, a higher trickle and the body of the pool.
        const lap = level(.9), trickle = level(.35)
        chain(noise(.8, 2.5), filter('bandpass', 420, .9, false), lap, bed)
        sway(lap.gain, .31, .5); sway(lap.gain, .19, .3)
        chain(noise(1.2, 6), filter('bandpass', 1300, 2, false), trickle, bed)
        sway(trickle.gain, .53, .3)
        chain(noise(.6, 4.4), filter('lowpass', 170, .7, false), level(.6), bed)
        break
      }
    }
    return { gain, pan, silent: 0, tuned, nodes, sources, ...engine ? { engine } : {} }
  }

  cue(cue: SoundCue) {
    if (this.disposed || cue.volume <= .005 || this.shots.size >= 12) return
    const robotStep = cue.kind === 'robot-footstep', footstep = cue.kind === 'footstep' || robotStep
    const landing = cue.kind === 'landing', robotLanding = cue.kind === 'robot-landing'
    const box = cue.kind === 'box-impact', ball = cue.kind === 'ball-impact', water = cue.kind === 'water-entry'
    const defaultSize = water ? 60 : ball ? 68 : 50
    const rate = footstep || landing || robotLanding ? .94 + (++this.variation % 5) * .03 : box || ball || water ? clamp((defaultSize / (cue.size ?? defaultSize)) ** .25, .75, 1.2)
      : cue.kind === 'drip' ? .8 + (++this.variation % 7) * .07 : cue.pitch ?? 1
    // A hard landing is an impact, clearly louder than any step: from about 5 dB over a running step at the
    // softest that raises dust to about 12 dB at the hardest, and 3 to 6 dB over Rbot's fastest step for its own.
    const level = clamp(cue.volume) * clamp(cue.strength) * (robotStep ? .34 : footstep ? .22 : landing ? .33 : robotLanding ? .43
      : box ? .28 : ball ? .32 : water ? .5 : CUE_LEVEL[cue.kind] ?? .38)
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
    gain.connect(pan); pan.connect(kind === 'bubble' ? this.inWater : this.output)
    const shot: Shot = { source, gain, pan, filter }; this.shots.add(shot)
    source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); pan.disconnect(); this.shots.delete(shot) }
    source.start(ctx.currentTime + delay)
  }

  silence() {
    if (this.disposed) return
    for (const voice of this.voices) { fade(voice.gain.gain, this.ctx.currentTime); voice.id = null }
    // Nothing updates the beds while the game is paused: let them go now, and they fade back in on resuming.
    for (const voice of this.ambient.values()) this.release(voice, this.ctx.currentTime)
    this.ambient.clear()
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
    for (const voice of this.ambient.values()) {
      for (const source of voice.sources) source.stop()
      for (const node of voice.nodes) node.disconnect()
    }
    this.shots.clear(); this.ambient.clear()
    for (const node of [this.output, this.dry, this.wet, this.muffle, this.inWater, this.master]) node.disconnect()
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
      // A sound takes up to about 16 ms to make: take one while the browser has
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
