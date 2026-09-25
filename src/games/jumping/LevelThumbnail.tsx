import { memo, useEffect, useRef } from 'react'
import type { JumpLevel } from './level'
import { isPuzzleLevel, levelHeight, levelPlayer, prepareLevelRopes } from './level'
import { createRun } from './challenge'
import { drawPuzzleWorld } from './challengeRender'
import { drawAthlete, drawClimbables, drawLevelBackdrop, drawTerrain } from './render'

/** Render a still using the same world drawing and initial placement as play. */
export const LevelThumbnail = memo(function LevelThumbnail({ level }: { level: JumpLevel }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!
    const prepared = prepareLevelRopes(level)
    const run = isPuzzleLevel(prepared) ? createRun(prepared) : null
    const player = run?.player ?? levelPlayer(prepared)
    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2), roomHeight = levelHeight(prepared)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      const zoom = Math.min(width / (prepared.width + 60), height / (roomHeight + 60))
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.translate((width - prepared.width * zoom) / 2, (height - roomHeight * zoom) / 2); ctx.scale(zoom, zoom)
      drawLevelBackdrop(ctx, prepared, { x: -30, y: -30, w: prepared.width + 60, h: roomHeight + 60 }, zoom)
      if (run) drawPuzzleWorld(ctx, run, true)
      else { drawTerrain(ctx, prepared.platforms); drawClimbables(ctx, player, prepared.climbables); drawAthlete(ctx, player) }
      for (const [index, point] of [prepared.spawn, ...prepared.checkpoints].entries()) {
        ctx.fillStyle = index ? '#a0a3a4' : '#df633f'
        ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
      }
    }
    const observer = new ResizeObserver(paint); observer.observe(canvas); paint()
    return () => observer.disconnect()
  }, [level])
  return <canvas ref={ref} className="level-thumbnail" aria-hidden="true" />
})
