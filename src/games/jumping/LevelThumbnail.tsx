import { memo, useEffect, useRef } from 'react'
import type { JumpLevel } from './level'
import { isPuzzleLevel, levelHeight, levelPlayer, levelTerrain, prepareLevelRopes } from './level'
import { createPreviewRun } from './challenge'
import { drawPuzzleWorld } from './challengeRender'
import { drawAthlete, drawClimbables, drawLevelBackdrop, drawTerrain } from './render'

/** Draw authored geometry only, and allocate canvas pixels only while visible. */
export const LevelThumbnail = memo(function LevelThumbnail({ level, preview = false }: { level: JumpLevel; preview?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!
    let visible = false
    let scene: ReturnType<typeof createScene> | undefined
    const createScene = () => {
      const prepared = preview ? level : prepareLevelRopes(level, true)
      const run = isPuzzleLevel(prepared) ? createPreviewRun(prepared) : null
      return { prepared, run, player: run?.player ?? levelPlayer(prepared, true) }
    }
    const paint = () => {
      if (!visible) return
      const { prepared, run, player } = scene ??= createScene()
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
      else { drawTerrain(ctx, levelTerrain(prepared)); drawClimbables(ctx, player, prepared.climbables); drawAthlete(ctx, player) }
      for (const [index, point] of [prepared.spawn, ...prepared.checkpoints].entries()) {
        ctx.fillStyle = index ? '#a0a3a4' : '#df633f'
        ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
      }
    }
    const observer = new ResizeObserver(paint); observer.observe(canvas)
    const visibility = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting
      if (visible) paint()
      else { canvas.width = 1; canvas.height = 1; scene = undefined }
    })
    visibility.observe(canvas)
    return () => { observer.disconnect(); visibility.disconnect() }
  }, [level, preview])
  return <canvas ref={ref} className="level-thumbnail" aria-hidden="true" />
})
