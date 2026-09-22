export type MotorDrive = { speed: number; throttle: number; boosting: boolean }
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

/** A little toy motor: low harmonics, modest revs, and no constant idle drone. */
export function motorTone({ speed, throttle, boosting }: MotorDrive) {
  const pace = clamp(Math.abs(speed) / 260)
  const rolling = clamp((Math.abs(speed) - 3) / 50)
  const load = boosting ? 1 : clamp(throttle)
  return {
    frequency: 64 + pace * 78 + load * 24 + Number(boosting) * 18,
    cutoff: 280 + pace * 340 + load * 220,
    volume: rolling * 0.007 + load * 0.018 + Number(boosting) * 0.007,
  }
}

export function opponentMotorMix(dx: number, dy: number) {
  return { volume: 0.28 / (1 + (Math.hypot(dx, dy) / 180) ** 2), pan: clamp(dx / 500, -0.8, 0.8) }
}

type Voice = {
  body: OscillatorNode; whirr: OscillatorNode; detail: GainNode
  filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode
}

function approach(param: AudioParam, value: number, now: number, seconds: number) {
  // Preserve the instantaneous value when a new input interrupts a fade.
  param.cancelAndHoldAtTime(now)
  param.setTargetAtTime(value, now, seconds)
}

/** Two persistent voices avoid repeated oscillator attacks and hard cutoffs. */
export class BumperMotorSound {
  private readonly ctx: BaseAudioContext
  private readonly player: Voice
  private readonly opponent: Voice
  private quiet = true
  private disposed = false

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    const wave = ctx.createPeriodicWave(new Float32Array(5), new Float32Array([0, 1, 0.28, 0.08, 0.025]))
    const createVoice = (detune: number): Voice => {
      const body = ctx.createOscillator(), whirr = ctx.createOscillator(), detail = ctx.createGain()
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), pan = ctx.createStereoPanner()
      body.setPeriodicWave(wave)
      body.frequency.value = 64
      body.detune.value = detune
      whirr.type = 'sine'
      whirr.frequency.value = 128
      whirr.detune.value = detune + 4
      detail.gain.value = 0.12
      filter.type = 'lowpass'
      filter.frequency.value = 280
      filter.Q.value = 0.45
      gain.gain.value = 0
      body.connect(filter)
      whirr.connect(detail); detail.connect(filter)
      filter.connect(gain); gain.connect(pan); pan.connect(ctx.destination)
      body.start(); whirr.start()
      return { body, whirr, detail, filter, gain, pan }
    }
    this.player = createVoice(0)
    this.opponent = createVoice(-85)
  }

  update(player: MotorDrive, opponent: MotorDrive, dx: number, dy: number) {
    if (this.disposed) return
    this.quiet = false
    const now = this.ctx.currentTime, mix = opponentMotorMix(dx, dy)
    const tune = (voice: Voice, drive: MotorDrive, volume: number, pan: number) => {
      const target = motorTone(drive)
      approach(voice.body.frequency, target.frequency, now, 0.12)
      approach(voice.whirr.frequency, target.frequency * 2, now, 0.14)
      approach(voice.filter.frequency, target.cutoff, now, 0.1)
      approach(voice.gain.gain, target.volume * volume, now, drive.throttle > 0 || drive.boosting ? 0.055 : 0.18)
      approach(voice.pan.pan, pan, now, 0.12)
    }
    tune(this.player, player, 1, 0)
    tune(this.opponent, opponent, mix.volume, mix.pan)
  }

  silence() {
    if (this.quiet || this.disposed) return
    this.quiet = true
    const now = this.ctx.currentTime
    for (const voice of [this.player, this.opponent]) {
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setTargetAtTime(0, now, 0.008)
      voice.gain.gain.setValueAtTime(0, now + 0.08)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const voice of [this.player, this.opponent]) {
      voice.body.stop(); voice.whirr.stop()
      for (const node of Object.values(voice)) node.disconnect()
    }
  }
}
