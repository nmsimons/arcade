import { useEffect, useRef } from 'react'
import type { GameTheme } from './games'

const scenes = {
  vacuum: () => import('./previews/vacuum'),
  bumper: () => import('./previews/bumper'),
  urban: () => import('./previews/urban'),
}

/** A still rendered by the real game renderers, without starting a game, audio,
 * animation loop, or touching the player's save. Resize at display resolution. */
export function GameArt({ theme, compact = false }: { theme: GameTheme; compact?: boolean }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const image = ref.current!
    const canvas = document.createElement('canvas')
    let disposed = false
    let observer: ResizeObserver | undefined
    let cleanupResize = () => {}
    image.dataset.artState = 'loading'
    void scenes[theme]().then(({ drawPreview }) => {
      if (disposed) return
      const draw = () => {
        const { width, height } = image.getBoundingClientRect()
        if (!width || !height) return
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.scale(canvas.width / width, canvas.height / height)
        drawPreview(ctx, width, height, compact)
        image.src = canvas.toDataURL('image/png')
        image.dataset.artState = 'ready'
      }
      observer = new ResizeObserver(draw)
      observer.observe(image)
      window.addEventListener('resize', draw)
      cleanupResize = () => window.removeEventListener('resize', draw)
      draw()
    }).catch(() => {
      // A decorative cover must never block the title's actual Play button.
      if (!disposed) image.dataset.artState = 'unavailable'
    })
    return () => { disposed = true; observer?.disconnect(); cleanupResize() }
  }, [theme, compact])
  return <img ref={ref} className={`game-art game-art-${theme}`} width={360} height={230} alt="" aria-hidden="true"
    src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
}
