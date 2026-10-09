import { blankTrial } from '../../../src/games/jumping/level.ts'

export function smallPropGap(reverse = false) {
  const level = { ...blankTrial(), name: 'Small prop gap', width: 1200, height: 600, floor: 500,
    spawn: { x: 650, y: 500 }, goal: { x: 100, y: 500 },
    platforms: [{ x: 400, y: 200, w: 200, h: 300 }],
    props: [{ kind: 'box', x: 615, y: 500, size: 30 }, { kind: 'ball', x: 668, y: 500, size: 30 }],
    robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
  if (reverse) level.props.reverse()
  return level
}

export async function observeGapHead(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.gapCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.gapCamera) {
        const transform = this.canvas.gapCamera.multiply(this.getTransform())
        const head = transform.transformPoint(new DOMPoint(args[0], args[1]))
        this.canvas.gapFrames ??= []
        this.canvas.gapFrames.push({ time: performance.now(), headX: head.x, headY: head.y, x: transform.e, y: transform.f })
      }
      return ellipse.apply(this, args)
    }
  })
}
