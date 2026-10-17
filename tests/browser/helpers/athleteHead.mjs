import { androidMaterials } from '../../../src/games/jumping/androidArtwork.ts'

const installed = new WeakSet()

/** Observe the rendered head's coordinate space, independently of its outline.
 * Palette values come from the artwork so visual tuning cannot disable probes. */
export async function installAthleteHeadObserver(page) {
  if (installed.has(page)) return
  installed.add(page)
  await page.addInitScript(({ faces }) => {
    const proto = CanvasRenderingContext2D.prototype
    const save = proto.save, restore = proto.restore, fill = proto.fill, stacks = new WeakMap()
    proto.save = function (...args) {
      const stack = stacks.get(this) ?? []; stack.push(this.getTransform()); stacks.set(this, stack)
      return save.apply(this, args)
    }
    proto.restore = function (...args) {
      stacks.get(this)?.pop(); return restore.apply(this, args)
    }
    proto.fill = function (...args) {
      const result = fill.apply(this, args), canvas = this.canvas
      if (args[0] instanceof Path2D && faces.includes(this.fillStyle)
        && canvas instanceof HTMLCanvasElement && canvas.matches('.jumping-game > canvas')) {
        const body = stacks.get(this)?.at(-1), headTransform = this.getTransform()
        if (body) {
          const head = body.inverse().transformPoint(new DOMPoint(headTransform.e, headTransform.f))
          window.dispatchEvent(new CustomEvent('jumping-athlete-head', {
            detail: { canvas, body, head: [head.x, head.y], alpha: this.globalAlpha },
          }))
        }
      }
      return result
    }
  }, { faces: ['#686b6e', '#e5e7e6'].map(ink => androidMaterials(ink).face) })
}
