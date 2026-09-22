// Sound system using Web Audio API
import type { RecoveryCue } from './havenRecovery'
export class SoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private radiationNoise: AudioBuffer | null = null
  private radiationVoices = new Set<{ source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }>()
  private thrustGain: GainNode | null = null
  private thrustNoise: AudioBufferSourceNode | null = null
  private thrusting = false
  private thrustLevel = 0

  private phaserPlaying = false
  private phaserReady = false
  private phaserOsc: OscillatorNode | null = null
  private phaserNoise: AudioBufferSourceNode | null = null
  private phaserFilter: BiquadFilterNode | null = null
  private phaserGain: GainNode | null = null
  private phaserLfo: OscillatorNode | null = null
  private phaserLfoGain: GainNode | null = null
  private phaserAmpLfo: OscillatorNode | null = null
  private phaserAmpLfoGain: GainNode | null = null

  private repairHumPlaying = false
  private repairHumReady = false
  private repairHumOsc: OscillatorNode | null = null
  private repairHumGain: GainNode | null = null
  private repairHumFilter: BiquadFilterNode | null = null
  private repairHumLfo: OscillatorNode | null = null
  private repairHumLfoGain: GainNode | null = null
  private repairHumVibGain: GainNode | null = null

  private storeMasterGain: GainNode | null = null
  private storeFilter: BiquadFilterNode | null = null
  private storeMelOsc: OscillatorNode | null = null
  private storeBassOsc: OscillatorNode | null = null
  private storeMelGain: GainNode | null = null
  private storeBassGain: GainNode | null = null
  private storeSeqTimer: number | null = null
  private storeSeqNextTime = 0
  private storeSeqStep = 0
  private storePlaying = false

  init() {
    if (!this.initialized) {
      this.ctx = new AudioContext()
      this.initialized = true
    }
    // A controller can launch before the browser permits audio. A later real
    // click/key gesture retries the existing context instead of leaving it silent.
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  shutdown() {
    // Best-effort cleanup (useful for dev/HMR and leaving the game).
    try {
      this.stopPhaser(true)
      this.stopRepairHum(true)
      this.stopThrust()
      this.stopStoreMusic()
      this.stopRadiation()
    } catch {
      // Ignore.
    }
    try {
      this.ctx?.close()
    } catch {
      // Ignore.
    }
    this.ctx = null
    this.radiationNoise = null
    this.initialized = false
  }

  teleport() {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, now)
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.12)
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.45)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.11, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
    osc.start(now); osc.stop(now + 0.5)
  }

  radiationTick(urgency: number, unprotected = false) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.radiationNoise) {
      this.radiationNoise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.045), ctx.sampleRate)
      const samples = this.radiationNoise.getChannelData(0)
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    const now = ctx.currentTime, duration = unprotected ? 0.045 : 0.025
    source.buffer = this.radiationNoise
    filter.type = 'bandpass'; filter.frequency.value = unprotected ? 1250 : 2600; filter.Q.value = unprotected ? 4 : 0.7
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.10 + Math.max(0, Math.min(1, urgency)) * 0.14, now + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    const voice = { source, filter, gain }
    this.radiationVoices.add(voice)
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect()
      this.radiationVoices.delete(voice)
    }
    source.start(now); source.stop(now + duration)
  }

  stopRadiation() {
    for (const voice of this.radiationVoices) {
      voice.source.onended = null
      voice.source.stop()
      voice.source.disconnect(); voice.filter.disconnect(); voice.gain.disconnect()
    }
    this.radiationVoices.clear()
  }

  startRepairHum() {
    if (!this.ctx) return
    if (!this.repairHumReady) {
      const ctx = this.ctx
      const t0 = ctx.currentTime

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(110, t0)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(900, t0)
      filter.Q.setValueAtTime(0.25, t0)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, t0)

      // Subtle oscillation: gentle tremolo + tiny vibrato.
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.setValueAtTime(4.6, t0)

      const lfoGain = ctx.createGain()
      // Start with 0 tremolo depth; we'll ramp it in with the hum so it doesn't "pop" on.
      lfoGain.gain.setValueAtTime(0, t0)
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)

      const vibGain = ctx.createGain()
      vibGain.gain.setValueAtTime(1.6, t0) // Hz modulation depth
      lfo.connect(vibGain)
      vibGain.connect(osc.frequency)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.start(t0)
      lfo.start(t0)

      this.repairHumOsc = osc
      this.repairHumFilter = filter
      this.repairHumGain = gain
      this.repairHumLfo = lfo
      this.repairHumLfoGain = lfoGain
      this.repairHumVibGain = vibGain
      this.repairHumReady = true
    }

    if (this.repairHumPlaying) return
    this.repairHumPlaying = true

    const t = this.ctx.currentTime
    if (this.repairHumGain) {
      const g = this.repairHumGain.gain
      g.cancelScheduledValues(t)
      // Always fade in from silence to avoid any transient if stop/start happens quickly.
      g.setValueAtTime(0, t)
      g.linearRampToValueAtTime(0.02, t + 0.45)
    }

    if (this.repairHumLfoGain) {
      const lg = this.repairHumLfoGain.gain
      lg.cancelScheduledValues(t)
      lg.setValueAtTime(0, t)
      // Ramp tremolo depth in gently; keep it subtle.
      lg.linearRampToValueAtTime(0.004, t + 0.55)
    }
  }

  stopRepairHum(immediate = false) {
    if (!this.ctx || !this.repairHumReady || !this.repairHumGain) return

    this.repairHumPlaying = false
    const t = this.ctx.currentTime
    const g = this.repairHumGain.gain

    g.cancelScheduledValues(t)
    if (immediate) {
      g.setValueAtTime(0, t)
    } else {
      g.setValueAtTime(g.value, t)
      g.setTargetAtTime(0, t, 0.04)
    }

    if (this.repairHumLfoGain) {
      const lg = this.repairHumLfoGain.gain
      lg.cancelScheduledValues(t)
      if (immediate) lg.setValueAtTime(0, t)
      else {
        lg.setValueAtTime(lg.value, t)
        lg.setTargetAtTime(0, t, 0.04)
      }
    }

    if (!immediate) return

    // Hard kill for safety (dev/HMR/unmount): stop and disconnect the graph.
    const stopAt = t + 0.02
    try {
      this.repairHumOsc?.stop(stopAt)
    } catch {
      // Ignore.
    }
    try {
      this.repairHumLfo?.stop(stopAt)
    } catch {
      // Ignore.
    }

    try {
      this.repairHumVibGain?.disconnect()
    } catch {
      // Ignore.
    }
    try {
      this.repairHumLfoGain?.disconnect()
    } catch {
      // Ignore.
    }
    try {
      this.repairHumFilter?.disconnect()
    } catch {
      // Ignore.
    }
    try {
      this.repairHumGain?.disconnect()
    } catch {
      // Ignore.
    }

    this.repairHumOsc = null
    this.repairHumGain = null
    this.repairHumFilter = null
    this.repairHumLfo = null
    this.repairHumLfoGain = null
    this.repairHumVibGain = null
    this.repairHumReady = false
  }

  startStoreMusic() {
    if (!this.ctx || this.storePlaying) return
    this.storePlaying = true

    const ctx = this.ctx
    const t0 = ctx.currentTime

    // Cheery chiptune loop: square-ish lead + triangle bass.
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2400, t0)
    filter.Q.setValueAtTime(0.35, t0)

    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(0.07, t0 + 0.28)

    const melOsc = ctx.createOscillator()
    melOsc.type = 'square'
    const melGain = ctx.createGain()
    melGain.gain.setValueAtTime(0.0001, t0)

    const bassOsc = ctx.createOscillator()
    bassOsc.type = 'triangle'
    const bassGain = ctx.createGain()
    bassGain.gain.setValueAtTime(0.0001, t0)

    melOsc.connect(melGain)
    bassOsc.connect(bassGain)
    melGain.connect(filter)
    bassGain.connect(filter)
    filter.connect(master)
    master.connect(ctx.destination)

    melOsc.start(t0)
    bassOsc.start(t0)

    // Note helpers
    const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

    // C major-ish feel.
    // Melody is a 2-bar pattern of 16th steps; null means rest.
    const melody: Array<number | null> = [
      72,
      null,
      76,
      null,
      79,
      null,
      81,
      null,
      79,
      null,
      76,
      null,
      74,
      null,
      76,
      null,

      79,
      null,
      81,
      null,
      83,
      null,
      81,
      null,
      79,
      null,
      76,
      null,
      72,
      null,
      74,
      null,
    ]

    // Bass: quarter notes over two bars (C - F - G - C).
    const bass: number[] = [48, 53, 55, 48, 48, 53, 55, 48]

    const bpm = 132
    const step = (60 / bpm) / 4 // 16th notes
    const scheduleAhead = 0.7
    const tickMs = 120

    this.storeSeqStep = 0
    this.storeSeqNextTime = ctx.currentTime + 0.05

    const scheduleStep = (stepIndex: number, time: number) => {
      const m = melody[stepIndex % melody.length]
      if (m != null) {
        melOsc.frequency.setValueAtTime(hz(m), time)
        melGain.gain.setValueAtTime(0.0001, time)
        melGain.gain.exponentialRampToValueAtTime(0.12, time + 0.01)
        melGain.gain.exponentialRampToValueAtTime(0.0001, time + step * 0.92)
      } else {
        melGain.gain.setValueAtTime(0.0001, time)
      }

      // Bass on quarter notes.
      if (stepIndex % 4 === 0) {
        const qi = Math.floor(stepIndex / 4) % bass.length
        const b = bass[qi]
        bassOsc.frequency.setValueAtTime(hz(b), time)
        bassGain.gain.setValueAtTime(0.0001, time)
        bassGain.gain.exponentialRampToValueAtTime(0.09, time + 0.015)
        bassGain.gain.exponentialRampToValueAtTime(0.0001, time + step * 3.85)
      }
    }

    const tick = () => {
      if (!this.ctx || !this.storePlaying) return
      const now = this.ctx.currentTime
      const until = now + scheduleAhead
      while (this.storeSeqNextTime < until) {
        scheduleStep(this.storeSeqStep, this.storeSeqNextTime)
        this.storeSeqNextTime += step
        this.storeSeqStep += 1
      }
    }

    tick()
    this.storeSeqTimer = window.setInterval(tick, tickMs)

    this.storeFilter = filter
    this.storeMasterGain = master
    this.storeMelOsc = melOsc
    this.storeBassOsc = bassOsc
    this.storeMelGain = melGain
    this.storeBassGain = bassGain
  }

  stopStoreMusic() {
    if (!this.ctx || !this.storePlaying) return
    this.storePlaying = false

    if (this.storeSeqTimer != null) {
      window.clearInterval(this.storeSeqTimer)
      this.storeSeqTimer = null
    }

    const t = this.ctx.currentTime
    if (this.storeMasterGain) {
      // Fade out quickly to avoid clicks.
      this.storeMasterGain.gain.cancelScheduledValues(t)
      this.storeMasterGain.gain.setValueAtTime(Math.max(0.0001, this.storeMasterGain.gain.value), t)
      this.storeMasterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    }

    const stopAt = t + 0.25
    try {
      this.storeMelOsc?.stop(stopAt)
      this.storeBassOsc?.stop(stopAt)
    } catch {
      // Ignore double-stop.
    }

    // Disconnect nodes to avoid lingering graph connections (and to use stored refs).
    try {
      this.storeMelGain?.disconnect()
      this.storeBassGain?.disconnect()
      this.storeFilter?.disconnect()
      this.storeMasterGain?.disconnect()
    } catch {
      // Ignore disconnect errors.
    }

    setTimeout(() => {
      this.storeMelOsc = null
      this.storeBassOsc = null
      this.storeMelGain = null
      this.storeBassGain = null
      this.storeFilter = null
      this.storeMasterGain = null
    }, 350)
  }

  shoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  blaster() {
    if (!this.ctx) return
    const ctx = this.ctx, t = ctx.currentTime
    const body = ctx.createOscillator(), crack = ctx.createOscillator()
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    body.type = 'sawtooth'; body.frequency.setValueAtTime(230, t); body.frequency.exponentialRampToValueAtTime(42, t + 0.22)
    crack.type = 'square'; crack.frequency.setValueAtTime(720, t); crack.frequency.exponentialRampToValueAtTime(90, t + 0.07)
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(2200, t); filter.frequency.exponentialRampToValueAtTime(180, t + 0.22)
    gain.gain.setValueAtTime(0.22, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
    body.connect(filter); crack.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    body.start(t); crack.start(t); crack.stop(t + 0.07); body.stop(t + 0.25)
    body.onended = () => { body.disconnect(); crack.disconnect(); filter.disconnect(); gain.disconnect() }
  }

  startPhaser() {
    if (!this.ctx) return

    if (!this.phaserReady) {
      const ctx = this.ctx
      const t0 = ctx.currentTime

      // TOS-ish tonal body (simple, buzzy)
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(520, t0)

      // Subtle pitch wobble
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.setValueAtTime(5.2, t0)
      const lfoGain = ctx.createGain()
      lfoGain.gain.setValueAtTime(0, t0)
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      // Amplitude buzz (fast tremolo)
      const ampLfo = ctx.createOscillator()
      ampLfo.type = 'square'
      ampLfo.frequency.setValueAtTime(28, t0)
      const ampLfoGain = ctx.createGain()
      ampLfoGain.gain.setValueAtTime(0, t0)
      ampLfo.connect(ampLfoGain)

      // Noise layer for the “beam” texture
      const bufferSize = Math.floor(ctx.sampleRate * 1.5)
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1
      }
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer
      noise.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(1400, t0)
      filter.Q.setValueAtTime(0.65, t0)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, t0)

      // Drive buzz into gain (around a base level)
      ampLfoGain.connect(gain.gain)

      osc.connect(filter)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.start(t0)
      noise.start(t0)
      lfo.start(t0)
      ampLfo.start(t0)

      this.phaserOsc = osc
      this.phaserNoise = noise
      this.phaserFilter = filter
      this.phaserGain = gain
      this.phaserLfo = lfo
      this.phaserLfoGain = lfoGain
      this.phaserAmpLfo = ampLfo
      this.phaserAmpLfoGain = ampLfoGain
      this.phaserReady = true
    }

    if (this.phaserPlaying) return
    this.phaserPlaying = true

    const t = this.ctx.currentTime
    if (this.phaserGain) {
      const g = this.phaserGain.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(0, t)
      g.linearRampToValueAtTime(0.038, t + 0.07)
    }
    if (this.phaserLfoGain) {
      const lg = this.phaserLfoGain.gain
      lg.cancelScheduledValues(t)
      lg.setValueAtTime(0, t)
      lg.linearRampToValueAtTime(7, t + 0.12) // Hz pitch wobble depth
    }
    if (this.phaserAmpLfoGain) {
      const ag = this.phaserAmpLfoGain.gain
      ag.cancelScheduledValues(t)
      ag.setValueAtTime(0, t)
      ag.linearRampToValueAtTime(0.012, t + 0.1)
    }
  }

  stopPhaser(immediate = false) {
    if (!this.ctx || !this.phaserReady || !this.phaserGain) return
    this.phaserPlaying = false

    const t = this.ctx.currentTime
    const g = this.phaserGain.gain

    g.cancelScheduledValues(t)
    if (immediate) {
      g.setValueAtTime(0, t)
    } else {
      g.setValueAtTime(g.value, t)
      g.setTargetAtTime(0, t, 0.03)
    }

    if (this.phaserLfoGain) {
      const lg = this.phaserLfoGain.gain
      lg.cancelScheduledValues(t)
      if (immediate) lg.setValueAtTime(0, t)
      else {
        lg.setValueAtTime(lg.value, t)
        lg.setTargetAtTime(0, t, 0.04)
      }
    }

    if (this.phaserAmpLfoGain) {
      const ag = this.phaserAmpLfoGain.gain
      ag.cancelScheduledValues(t)
      if (immediate) ag.setValueAtTime(0, t)
      else {
        ag.setValueAtTime(ag.value, t)
        ag.setTargetAtTime(0, t, 0.04)
      }
    }

    if (!immediate) return

    const stopAt = t + 0.02
    try {
      this.phaserOsc?.stop(stopAt)
    } catch {
      // Ignore.
    }
    try {
      this.phaserNoise?.stop(stopAt)
    } catch {
      // Ignore.
    }
    try {
      this.phaserLfo?.stop(stopAt)
    } catch {
      // Ignore.
    }
    try {
      this.phaserAmpLfo?.stop(stopAt)
    } catch {
      // Ignore.
    }

    try {
      this.phaserLfoGain?.disconnect()
      this.phaserAmpLfoGain?.disconnect()
      this.phaserFilter?.disconnect()
      this.phaserGain?.disconnect()
    } catch {
      // Ignore.
    }

    this.phaserOsc = null
    this.phaserNoise = null
    this.phaserFilter = null
    this.phaserGain = null
    this.phaserLfo = null
    this.phaserLfoGain = null
    this.phaserAmpLfo = null
    this.phaserAmpLfoGain = null
    this.phaserReady = false
  }

  collect() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(520, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.12)
  }

  shieldHit(remainingShields: number) {
    if (!this.ctx) return

    // Short electric zap + click. Slightly higher pitch when shields are lower.
    const t = this.ctx.currentTime
    const base = remainingShields <= 0 ? 520 : remainingShields === 1 ? 620 : 720

    // Tonal zap
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(base, t)
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.07)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)

    // Noise click (filtered)
    const noiseLen = Math.floor(this.ctx.sampleRate * 0.06)
    const buf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < noiseLen; i++) {
      // Strong at start, decays quickly.
      const env = 1 - i / noiseLen
      data[i] = (Math.random() * 2 - 1) * env
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1100, t)
    filter.Q.setValueAtTime(1.4, t)

    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.14, t + 0.008)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)

    noise.connect(filter)
    filter.connect(ng)
    ng.connect(this.ctx.destination)
    noise.start(t)
    noise.stop(t + 0.06)
  }

  shieldCharge() {
    if (!this.ctx) return

    // Short rising chirp + soft shimmer to indicate recharge.
    const t = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(260, t)
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.18)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + 0.24)

    // Shimmer noise layer
    const noiseLen = Math.floor(this.ctx.sampleRate * 0.2)
    const buf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < noiseLen; i++) {
      const env = 1 - i / noiseLen
      data[i] = (Math.random() * 2 - 1) * env
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(1200, t)

    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.08, t + 0.03)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)

    noise.connect(filter)
    filter.connect(ng)
    ng.connect(this.ctx.destination)
    noise.start(t)
    noise.stop(t + 0.22)
  }

  explosion(size: 'large' | 'medium' | 'small') {
    if (!this.ctx) return
    const duration = size === 'large' ? 0.6 : size === 'medium' ? 0.4 : 0.2
    const volume = size === 'large' ? 0.4 : size === 'medium' ? 0.3 : 0.2

    // Create noise burst for the crunch
    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Filter the noise - lower for bigger explosions
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(size === 'large' ? 400 : size === 'medium' ? 600 : 800, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(volume, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)

    // Add a low thump underneath
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(size === 'large' ? 80 : size === 'medium' ? 100 : 120, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + duration * 0.5)
    thumpGain.gain.setValueAtTime(volume * 0.6, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration * 0.5)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + duration * 0.5)
  }

  startThrust(level = 1) {
    if (!this.ctx) return
    level = Math.max(0, Math.min(1, level))
    if (level === 0) { this.stopThrust(); return }
    const now = this.ctx.currentTime
    if (this.thrusting && this.thrustGain) {
      if (this.thrustLevel !== level) {
        // Analog triggers vary every frame. Retarget the continuous envelope;
        // repeatedly cancelling short linear ramps can produce silent gaps.
        this.thrustGain.gain.setTargetAtTime(0.2 * level, now, 0.025)
        this.thrustLevel = level
      }
      return
    }
    this.thrusting = true
    this.thrustLevel = level

    // Create a looping noise buffer
    const bufferSize = this.ctx.sampleRate * 2 // 2 seconds of noise
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    this.thrustNoise = this.ctx.createBufferSource()
    this.thrustNoise.buffer = noiseBuffer
    this.thrustNoise.loop = true

    // Band-pass filter for that whoosh character
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 300
    filter.Q.value = 0.5

    // Master gain with fade in
    this.thrustGain = this.ctx.createGain()
    this.thrustGain.gain.setValueAtTime(0, now)
    this.thrustGain.gain.setTargetAtTime(0.2 * level, now, 0.025)

    // Connect noise path
    this.thrustNoise.connect(filter)
    filter.connect(this.thrustGain)
    this.thrustGain.connect(this.ctx.destination)

    const source = this.thrustNoise, gain = this.thrustGain
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
    this.thrustNoise.start()
  }

  stopThrust() {
    if (!this.ctx || !this.thrusting) return
    this.thrusting = false
    this.thrustLevel = 0
    const source = this.thrustNoise, gain = this.thrustGain, now = this.ctx.currentTime
    this.thrustNoise = null
    this.thrustGain = null

    if (gain) {
      gain.gain.setTargetAtTime(0, now, 0.015)
      gain.gain.setValueAtTime(0, now + 0.1)
    }
    // Stop this voice only; a quick release/repress may already start another.
    source?.stop(now + 0.1)
  }

  havenImpact(speed: number) {
    if (!this.ctx) return
    const at=this.ctx.currentTime, oscillator=this.ctx.createOscillator(), gain=this.ctx.createGain()
    oscillator.type='triangle'
    oscillator.frequency.setValueAtTime(76,at)
    oscillator.frequency.exponentialRampToValueAtTime(27,at+.2)
    gain.gain.setValueAtTime(Math.min(.18,.04+speed/1400),at)
    gain.gain.exponentialRampToValueAtTime(.001,at+.24)
    oscillator.connect(gain);gain.connect(this.ctx.destination)
    oscillator.start(at);oscillator.stop(at+.25)
  }

  botCue(kind: 'wake' | 'lock' | 'shot' | 'grab' | 'hook') {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime
    const duration = kind === 'wake' ? .55 : kind === 'lock' ? .3 : .12
    osc.type = kind === 'shot' || kind === 'hook' ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(kind === 'wake' ? 110 : kind === 'lock' ? 420 : kind === 'grab' ? 180 : kind === 'hook' ? 330 : 750,now)
    osc.frequency.exponentialRampToValueAtTime(kind === 'wake' ? 290 : kind === 'lock' ? 800 : 90,now+duration)
    gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(kind === 'shot' ? .08 : .04,now+.012)
    gain.gain.exponentialRampToValueAtTime(.001,now+duration)
    osc.connect(gain);gain.connect(ctx.destination);osc.onended=()=>{osc.disconnect();gain.disconnect()}
    osc.start(now);osc.stop(now+duration)
  }

  havenRecovery(cue: RecoveryCue) {
    const ctx=this.ctx
    if(!ctx) return
    const at=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter()
    const duration=cue==='reach' ? .38 : cue==='grip' ? .24 : .3
    osc.type=cue==='reach' ? 'sawtooth' : 'triangle'
    osc.frequency.setValueAtTime(cue==='reach' ? 85 : cue==='grip' ? 210 : 125,at)
    osc.frequency.exponentialRampToValueAtTime(cue==='reach' ? 145 : 38,at+duration)
    filter.type='lowpass';filter.frequency.value=cue==='reach' ? 470 : 950
    gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(cue==='reach' ? .055 : .14,at+.012)
    gain.gain.exponentialRampToValueAtTime(.001,at+duration)
    osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination)
    osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect()}
    osc.start(at);osc.stop(at+duration)
  }

  death() {
    if (!this.ctx) return
    const duration = 1.2

    // Big initial noise burst
    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Filter sweeps down
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(2000, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)

    // Deep bass thump
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(60, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(15, this.ctx.currentTime + 0.6)
    thumpGain.gain.setValueAtTime(0.6, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.6)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + 0.6)

    // Multiple crackle bursts for debris feel
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (!this.ctx) return
        const crackleBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate)
        const crackleOut = crackleBuffer.getChannelData(0)
        for (let j = 0; j < crackleOut.length; j++) {
          crackleOut[j] = (Math.random() * 2 - 1) * Math.random()
        }
        const crackle = this.ctx.createBufferSource()
        crackle.buffer = crackleBuffer

        const crackleFilter = this.ctx.createBiquadFilter()
        crackleFilter.type = 'bandpass'
        crackleFilter.frequency.value = 400 + Math.random() * 600
        crackleFilter.Q.value = 2

        const crackleGain = this.ctx.createGain()
        crackleGain.gain.setValueAtTime(0.25, this.ctx.currentTime)
        crackleGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)

        crackle.connect(crackleFilter)
        crackleFilter.connect(crackleGain)
        crackleGain.connect(this.ctx.destination)
        crackle.start()
        crackle.stop(this.ctx.currentTime + 0.15)
      }, i * 80 + Math.random() * 50)
    }
  }
}

export const sounds = new SoundSystem()

// Dev-only: ensure hot reloads don't leave looping WebAudio nodes running.
if (import.meta && import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      sounds.shutdown()
    } catch {
      // Ignore.
    }
  })
}
