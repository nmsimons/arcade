// Sound system for Urban Fire
export class ArmorSoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private engineGain: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineRunning = false

  init() {
    if (this.initialized) { void this.ctx?.resume().catch(() => {}); return }
    this.ctx = new AudioContext()
    this.initialized = true
  }

  startEngine() {
    if (!this.ctx || this.engineRunning) return
    this.engineRunning = true

    this.engineOsc = this.ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc.frequency.value = 40

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 100

    this.engineGain = this.ctx.createGain()
    this.engineGain.gain.setValueAtTime(0.06, this.ctx.currentTime)

    this.engineOsc.connect(filter)
    filter.connect(this.engineGain)
    this.engineGain.connect(this.ctx.destination)

    this.engineOsc.start()
  }

  setEngineSpeed(speed: number) {
    if (!this.engineOsc || !this.ctx) return
    const freq = 40 + Math.abs(speed) * 0.3
    this.engineOsc.frequency.setValueAtTime(freq, this.ctx.currentTime)
  }

  stopEngine() {
    if (!this.ctx || !this.engineRunning) return
    this.engineRunning = false

    if (this.engineGain) {
      this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1)
    }

    const oscillator = this.engineOsc, gain = this.engineGain
    this.engineOsc = null
    this.engineGain = null
    setTimeout(() => { oscillator?.stop(); oscillator?.disconnect(); gain?.disconnect() }, 150)
  }

  shoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(200, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  tankShoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(100, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.2)
  }

  tankHit() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(150, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  explosion() {
    if (!this.ctx) return
    const duration = 0.5

    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(800, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)
  }

  helicopter() {
    if (!this.ctx) return
    // Realistic helicopter rotor "whup whup" sound
    const now = this.ctx.currentTime

    // Low frequency rotor thump
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(45, now)
    thump.frequency.exponentialRampToValueAtTime(25, now + 0.08)
    thumpGain.gain.setValueAtTime(0.15, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start(now)
    thump.stop(now + 0.1)

    // Second blade thump (slightly delayed)
    const thump2 = this.ctx.createOscillator()
    const thump2Gain = this.ctx.createGain()
    thump2.type = 'sine'
    thump2.frequency.setValueAtTime(40, now + 0.07)
    thump2.frequency.exponentialRampToValueAtTime(22, now + 0.15)
    thump2Gain.gain.setValueAtTime(0, now)
    thump2Gain.gain.setValueAtTime(0.12, now + 0.07)
    thump2Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.17)
    thump2.connect(thump2Gain)
    thump2Gain.connect(this.ctx.destination)
    thump2.start(now)
    thump2.stop(now + 0.17)

    // High frequency blade whoosh/air sound
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.15)
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.3
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 400
    noiseFilter.Q.value = 2
    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.06, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start(now)
    noise.stop(now + 0.15)
  }

  death() {
    if (!this.ctx) return
    const duration = 0.8

    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(1500, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)
  }

  repairPickup() {
    if (!this.ctx) return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(740, now)
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.08)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.2)
  }
}
