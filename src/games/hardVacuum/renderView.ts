import type { Vector2 } from './types'

export type RenderView = { x:number; y:number; w:number; h:number }

/** Conservative world-space bounds; padding includes strokes, glow and labels. */
export const inRenderView = (p:Vector2, radius:number, view?:RenderView) => !view ||
  (p.x+radius>=view.x && p.x-radius<=view.x+view.w && p.y+radius>=view.y && p.y-radius<=view.y+view.h)

export const segmentInRenderView = (a:Vector2,b:Vector2,pad:number,view?:RenderView) => !view ||
  (Math.max(a.x,b.x)+pad>=view.x && Math.min(a.x,b.x)-pad<=view.x+view.w &&
    Math.max(a.y,b.y)+pad>=view.y && Math.min(a.y,b.y)-pad<=view.y+view.h)
