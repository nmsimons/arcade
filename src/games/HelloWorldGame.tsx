import { useEffect, useRef } from 'react'

type HelloWorldGameProps = {
  onExit: () => void
}

type Segment = [number, number, number, number]

type Glyph = {
  width: number
  segments: Segment[]
}

// Keyboard handler for escape
function useEscapeKey(onExit: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        onExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit])
}

const GLYPHS: Record<string, Glyph> = {
  H: {
    width: 1,
    segments: [
      [0.1, 0.1, 0.1, 0.9],
      [0.9, 0.1, 0.9, 0.9],
      [0.1, 0.5, 0.9, 0.5],
    ],
  },
  E: {
    width: 1,
    segments: [
      [0.1, 0.1, 0.1, 0.9],
      [0.1, 0.1, 0.9, 0.1],
      [0.1, 0.5, 0.75, 0.5],
      [0.1, 0.9, 0.9, 0.9],
    ],
  },
  L: {
    width: 1,
    segments: [
      [0.1, 0.1, 0.1, 0.9],
      [0.1, 0.9, 0.9, 0.9],
    ],
  },
  O: {
    width: 1,
    segments: [
      [0.2, 0.1, 0.8, 0.1],
      [0.8, 0.1, 0.8, 0.9],
      [0.8, 0.9, 0.2, 0.9],
      [0.2, 0.9, 0.2, 0.1],
    ],
  },
  W: {
    width: 1.2,
    segments: [
      [0.1, 0.1, 0.25, 0.9],
      [0.25, 0.9, 0.6, 0.45],
      [0.6, 0.45, 0.95, 0.9],
      [0.95, 0.9, 1.1, 0.1],
    ],
  },
  R: {
    width: 1,
    segments: [
      [0.1, 0.1, 0.1, 0.9],
      [0.1, 0.1, 0.75, 0.1],
      [0.75, 0.1, 0.75, 0.5],
      [0.75, 0.5, 0.1, 0.5],
      [0.1, 0.5, 0.85, 0.9],
    ],
  },
  D: {
    width: 1,
    segments: [
      [0.1, 0.1, 0.1, 0.9],
      [0.1, 0.1, 0.75, 0.2],
      [0.75, 0.2, 0.75, 0.8],
      [0.75, 0.8, 0.1, 0.9],
    ],
  },
  ' ': {
    width: 0.6,
    segments: [],
  },
}

function drawWord(ctx: CanvasRenderingContext2D, word: string, size: number, gap: number, jitter: number) {
  let xCursor = 0
  for (const ch of word) {
    const glyph = GLYPHS[ch]
    const g = glyph ?? GLYPHS[' ']

    for (const [x1, y1, x2, y2] of g.segments) {
      const jx = (Math.random() - 0.5) * jitter
      const jy = (Math.random() - 0.5) * jitter
      ctx.moveTo((xCursor + x1) * size + jx, y1 * size + jy)
      ctx.lineTo((xCursor + x2) * size + jx, y2 * size + jy)
    }

    xCursor += g.width + gap
  }

  return xCursor * size
}

export function HelloWorldGame({ onExit }: HelloWorldGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  useEscapeKey(onExit)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)

    const animate = (t: number) => {
      if (!startRef.current) startRef.current = t
      const time = (t - startRef.current) / 1000

      const w = canvas.width
      const h = canvas.height

      // Background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)

      // Subtle scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = (time * 60) % 12
      for (let y = -12; y < h + 12; y += 12) {
        ctx.fillRect(0, y + scanY, w, 1)
      }
      ctx.restore()

      // Centered vector "HELLO WORLD"
      const baseSize = Math.max(26, Math.min(46, Math.floor(Math.min(w, h) / 14)))
      const scale = 1 + Math.sin(time * 2) * 0.03
      const jitter = 0.9 + (Math.sin(time * 8) + 1) * 0.35
      const gap = 0.25

      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(Math.sin(time * 0.7) * 0.02)
      ctx.scale(scale, scale)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00ff88'

      // Measure width by doing a dry run
      ctx.beginPath()
      const widthUnits = (() => {
        let units = 0
        for (const ch of 'HELLO WORLD') units += (GLYPHS[ch]?.width ?? GLYPHS[' '].width) + gap
        return units
      })()

      const totalWidth = widthUnits * baseSize
      const x0 = -totalWidth / 2
      const y0 = -baseSize / 2

      ctx.translate(x0, y0)
      ctx.beginPath()
      drawWord(ctx, 'HELLO WORLD', baseSize, gap, jitter)
      ctx.stroke()

      // Extra glow pass
      ctx.save()
      ctx.globalAlpha = 0.15
      ctx.lineWidth = 6
      ctx.strokeStyle = '#00ff88'
      ctx.stroke()
      ctx.restore()

      ctx.restore()

      // Rotating wire triangle frame (retro vector accent)
      const triR = Math.min(w, h) * 0.18
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(time * 0.4)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00ff88'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const x = Math.cos(a) * triR
        const y = Math.sin(a) * triR
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.restore()

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      <div className="absolute top-4 right-4">
        <button
          onClick={onExit}
          className="border-2 border-[#00ff88] text-[#00ff88] px-4 py-2 uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
        >
          Back
        </button>
      </div>

      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-[#00ff88]/70 text-xs tracking-widest uppercase">Animated vector demo • Press Esc to exit</div>
      </div>
    </div>
  )
}
