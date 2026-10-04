import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { JumpLevel } from './level'
import { isPuzzleLevel, levelHeight, levelPlayer, levelTerrain, prepareLevelRopes } from './level'
import { createPreviewRun } from './challenge'
import { drawPuzzleWorld } from './challengeRender'
import { drawAthlete, drawClimbables, drawLevelBackdrop, drawTerrain } from './render'
import { useWallTextFont } from './useWallTextFont'
import { LightingRenderer, lightingPixelRatio } from './lightingRender'
import { playgroundLightingWorld } from './lightingModel'
import { useLightingGeometry } from './useLightingGeometry'

/** Prepare and allocate only visible previews. Lighting uses the same initial world as play. */
export const LevelThumbnail = memo(function LevelThumbnail({ level, preview = false }: { level: JumpLevel; preview?: boolean }) {
  const wallTextFontReady = useWallTextFont()
  const ref = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const scene = useMemo(() => {
    if (!visible) return null
    const prepared = preview ? level : prepareLevelRopes(level, true)
    const run = isPuzzleLevel(prepared) ? createPreviewRun(prepared) : null
    return { prepared, run, player: run?.player ?? levelPlayer(prepared, true) }
  }, [level, preview, visible])
  const geometry = useLightingGeometry(scene?.prepared ?? level, visible)
  useEffect(() => {
    const visibility = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting))
    visibility.observe(ref.current!)
    return () => visibility.disconnect()
  }, [])
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!
    if (!visible) { canvas.width = canvas.height = 1; return }
    if (!scene || !geometry.ready) return
    const { prepared, run, player } = scene
    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const ratio = lightingPixelRatio(width, height, window.devicePixelRatio || 1), roomHeight = levelHeight(prepared)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      const zoom = Math.min(width / (prepared.width + 60), height / (roomHeight + 60))
      const x = (prepared.width - width / zoom) / 2, y = (roomHeight - height / zoom) / 2
      if (prepared.lighting) {
        const renderer = new LightingRenderer()
        try {
          if (geometry.groups) renderer.prepare(prepared, geometry.groups)
          renderer.render(ctx, run ?? playgroundLightingWorld(prepared, player), prepared.lighting,
            { x, y, width: canvas.width, height: canvas.height, zoom: zoom * ratio }, 0, undefined, true)
        } finally { renderer.dispose() }
        return
      }
      ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, -x * zoom * ratio, -y * zoom * ratio)
      drawLevelBackdrop(ctx, prepared, { x, y, w: width / zoom, h: height / zoom }, zoom)
      if (run) drawPuzzleWorld(ctx, run, true)
      else { drawTerrain(ctx, levelTerrain(prepared), prepared.platforms); drawClimbables(ctx, player, prepared.climbables); drawAthlete(ctx, player) }
      for (const [index, point] of [prepared.spawn, ...prepared.checkpoints].entries()) {
        ctx.fillStyle = index ? '#a0a3a4' : '#df633f'; ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
      }
    }
    const observer = new ResizeObserver(paint); observer.observe(canvas); paint()
    return () => observer.disconnect()
  }, [scene, visible, geometry.ready, geometry.groups, wallTextFontReady])
  return <canvas ref={ref} className="level-thumbnail" aria-hidden="true" />
})
