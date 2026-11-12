import { installAthleteHeadObserver } from './athleteHead.mjs'
import { blankTrial } from '../../../src/games/jumping/level.ts'

export function smallPropGap(reverse = false) {
  const level = { ...blankTrial(), name: 'Small prop gap', width: 1200, height: 600, floor: 500,
    entrance: { x: 650, y: 500 }, goal: { x: 100, y: 500 },
    platforms: [{ x: 400, y: 200, w: 200, h: 300 }],
    props: [{ kind: 'box', x: 615, y: 500, size: 30 }, { kind: 'ball', x: 668, y: 500, size: 30 }],
    robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
  if (reverse) level.props.reverse()
  return level
}

export async function observeGapHead(page) {
  await installAthleteHeadObserver(page)
  await page.addInitScript(() => {
    // The renderer reports the wall, and with it the camera (src/games/jumping/debugFrames.ts).
    window.addEventListener('jumping-wall', ({ detail: { canvas, transform } }) => {
      canvas.gapCamera = transform.inverse()
    })
    window.addEventListener('jumping-athlete-head', ({ detail: { canvas, body, head: args } }) => {
      if (canvas.gapCamera) {
        const transform = canvas.gapCamera.multiply(body)
        const head = transform.transformPoint(new DOMPoint(args[0], args[1]))
        canvas.gapFrames ??= []
        canvas.gapFrames.push({ time: performance.now(), headX: head.x, headY: head.y, x: transform.e, y: transform.f })
      }
    })
  })
}
