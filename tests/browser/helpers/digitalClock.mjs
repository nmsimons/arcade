/** Read the rendered seven-segment face without adding test hooks to the game. */
export async function installDigitalClockSpy(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const begin = proto.beginPath, move = proto.moveTo, fill = proto.fill, rect = proto.fillRect
    const masks = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011']
    const starts = [[3, 7], [13, 11], [13, 23], [3, 30], [0, 23], [0, 11], [3, 18.5]]
    proto.beginPath = function (...args) {
      this.clockSegments = []
      return begin.apply(this, args)
    }
    proto.moveTo = function (x, y) {
      this.clockSegments?.push([x, y])
      return move.call(this, x, y)
    }
    proto.fill = function (...args) {
      if (this.shadowBlur === 3 && this.clockSegments) {
        const digits = [27, 46, 74, 93].map(x => {
          const mask = starts.map(([dx, y]) => this.clockSegments.some(p => p[0] === x + dx && p[1] === y) ? '1' : '0').join('')
          return masks.indexOf(mask)
        })
        this.clockDigits = digits.every(digit => digit >= 0) ? `${digits[0]}${digits[1]}:${digits[2]}${digits[3]}` : null
      }
      return fill.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.digitalClocks = []
      if (args[0] === 66 && args[1] === 12 && args[2] === 3 && args[3] === 3 && this.clockDigits) {
        this.canvas.digitalClocks?.push({ value: this.clockDigits, color: this.fillStyle })
      }
      return rect.apply(this, args)
    }
  })
}

/** HUD/result timing retains hundredths; the wall face shows whole seconds. */
export const wallTimeFromHud = value => value.split('.')[0].padStart(5, '0')
