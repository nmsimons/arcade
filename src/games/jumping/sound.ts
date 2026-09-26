import type { SoundCue, SoundFrame, SoundLoop } from './audioState.ts'

export const MAX_LOOP_VOICES = 6
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
type Voice = { id: string | null; source: AudioBufferSourceNode; tone: OscillatorNode; texture: GainNode; body: GainNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode }
type Shot = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }

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
    case 'elevator': return { frequency: 68 + pace * 25, cutoff: 380, playbackRate, body: .65, texture: .28, volume: .045 }
    case 'gate-open': return { frequency: 110 + pace * 35, cutoff: 950, playbackRate, body: .16, texture: .85, volume: .075 }
    case 'gate-close': return { frequency: 76 + pace * 28, cutoff: 650, playbackRate, body: .2, texture: .85, volume: .075 }
  }
}

function makeBuffer(ctx: BaseAudioContext, seconds: number, sample: (time: number, noise: number) => number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0)
  let seed = 18741
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[i] = sample(i / ctx.sampleRate, seed / 2147483648 - 1)
  }
  return buffer
}

/** A small reusable bank bounds the cost even in a tower full of mechanisms. */
export class JumpingSound {
  private readonly ctx: BaseAudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer
  private readonly cues: Record<SoundCue['kind'], AudioBuffer>
  private readonly voices: Voice[] = []
  private readonly shots = new Set<Shot>()
  private disposed = false
  private variation = 0

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain(); this.output.gain.value = .8; this.output.connect(ctx.destination)
    this.noise = makeBuffer(ctx, 2, (t, noise) => noise * (.8 + .2 * Math.sin(t * Math.PI * 13)))
    let grain = 0, sole = 0, cushion = 0
    const softening = 1 - Math.exp(-2 * Math.PI * 500 / ctx.sampleRate)
    const cushioning = 1 - Math.exp(-2 * Math.PI * 130 / ctx.sampleRate)
    this.cues = {
      footstep: makeBuffer(ctx, .17, (t, noise) => {
        // A cushioned rubber sole: a rounded low thump and a faint, soft scuff.
        grain += (noise - grain) * softening
        sole += (grain - sole) * softening
        cushion += (sole - cushion) * cushioning
        const attack = Math.sin(Math.min(1, t / .022) * Math.PI / 2) ** 2
        return attack * (cushion * 1.8 * Math.exp(-t * 26)
          + sole * .18 * Math.exp(-t * 38)) * Math.min(1, (.17 - t) / .035)
      }),
      switch: makeBuffer(ctx, .16, (t, noise) => Math.min(1, t / .002) *
        (noise * .16 * Math.exp(-t * 90) + Math.sin(t * Math.PI * 2 * 480) * .2 * Math.exp(-t * 55)) * Math.min(1, (.16 - t) / .01)),
      'timer-paused': makeBuffer(ctx, .46, t => {
        const note = (start: number, frequency: number) => {
          const age = t - start
          return age < 0 ? 0 : Math.sin(age * Math.PI * 2 * frequency) * Math.min(1, age / .006) * Math.exp(-age * 18)
        }
        return (note(0, 660) + note(.14, 440)) * .18 * Math.min(1, (.46 - t) / .03)
      }),
    }
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
    const ctx = this.ctx, source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner()
    source.buffer = this.cues[cue.kind]
    const footstep = cue.kind === 'footstep'
    source.playbackRate.value = footstep ? .94 + (++this.variation % 5) * .03 : 1
    gain.gain.value = clamp(cue.volume) * clamp(cue.strength) * (footstep ? .22 : .38)
    pan.pan.value = cue.pan; source.connect(gain); gain.connect(pan); pan.connect(this.output)
    const shot = { source, gain, pan }; this.shots.add(shot)
    source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); this.shots.delete(shot) }
    source.start()
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
    for (const shot of this.shots) { shot.source.stop(); shot.source.disconnect(); shot.gain.disconnect(); shot.pan.disconnect() }
    this.shots.clear(); this.output.disconnect()
  }
}

/** Own one context per mounted game. Browsers may decline autoplay; discard
 * unheard events instead of playing a backlog when a gesture unlocks audio. */
export class JumpingSoundSession {
  private ctx: AudioContext | null = null
  private sound: JumpingSound | null = null
  private resuming = false
  private disposed = false
  unlock() {
    if (this.disposed || this.resuming) return
    try {
      if (!this.ctx) { this.ctx = new AudioContext(); this.sound = new JumpingSound(this.ctx) }
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
    this.disposed = true; this.sound?.dispose()
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {})
    this.ctx = null; this.sound = null
  }
}
