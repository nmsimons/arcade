import { useCallback, useEffect, useRef, useState } from 'react'

type SlingLoadGameProps = {
  onExit: () => void
}

type Vector2 = { x: number; y: number }

type Helicopter = {
  pos: Vector2
  vel: Vector2
  radius: number
  rotor: number
  hitFlashMs: number
  yaw: number
  pitch: number
}

type Crate = {
  pos: Vector2
  vel: Vector2
  radius: number
  attached: boolean
  delivered: boolean
}

type Pad = {
  x: number
  width: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function SlingLoadGame({ onExit }: SlingLoadGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [deliveries, setDeliveries] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })

  const worldWidthRef = useRef(4200)
  const cameraXRef = useRef(0)

  const heliRef = useRef<Helicopter>({
    pos: { x: 300, y: 200 },
    vel: { x: 0, y: 0 },
    radius: 16,
    rotor: 0,
    hitFlashMs: 0,
    yaw: 1,
    pitch: 0,
  })

  const ropeLengthRef = useRef(110)
  const crateRef = useRef<Crate>({
    pos: { x: 1200, y: 0 },
    vel: { x: 0, y: 0 },
    radius: 14,
    attached: false,
    delivered: false,
  })

  const padRef = useRef<Pad>({ x: 420, width: 140 })

  const hookRangeRef = useRef(80)

  const getHookPoint = useCallback((heli: Helicopter) => {
    const offY = heli.radius * 0.9
    const yawSign = heli.yaw >= 0 ? 1 : -1
    const yawAbs = Math.abs(heli.yaw)
    // When yaw is near 0 (front-facing), we intentionally squash X so that the left/right mirror flip is visually smooth.
    const yawScaleMag = 0.35 + 0.65 * smoothstep(0.08, 0.55, yawAbs)
    const sx = yawSign * yawScaleMag

    // Apply the same transform order as drawing: scaleX, then pitch rotation.
    const c = Math.cos(heli.pitch)
    const s = Math.sin(heli.pitch)

    // Start from local offset (0, offY)
    // After pitch rotation: (x, y) = (-offY*sin, offY*cos)
    // After scaleX: x *= sx
    const localX = (-offY * s) * sx
    const localY = offY * c

    return { x: heli.pos.x + localX, y: heli.pos.y + localY }
  }, [])

  const groundHeightAt = useCallback((x: number) => {
    // A smooth height field made from a few sine waves (fast + deterministic).
    const base = 0.78
    const h1 = Math.sin(x * 0.004) * 0.03
    const h2 = Math.sin(x * 0.011 + 1.7) * 0.02
    const h3 = Math.sin(x * 0.023 + 0.4) * 0.01
    const n = base + h1 + h2 + h3
    const { height } = canvasSizeRef.current
    return height * n
  }, [])

  const resetWorld = useCallback(() => {
    const { height } = canvasSizeRef.current
    const heli = heliRef.current
    heli.pos = { x: 320, y: height * 0.35 }
    heli.vel = { x: 0, y: 0 }
    heli.hitFlashMs = 0

    const crate = crateRef.current
    crate.attached = false
    crate.delivered = false
    crate.vel = { x: 0, y: 0 }
    crate.pos = { x: 1100, y: groundHeightAt(1100) - crate.radius }

    ropeLengthRef.current = 110
    cameraXRef.current = 0
  }, [groundHeightAt])

  const startGame = useCallback(() => {
    setScore(0)
    setLives(3)
    setDeliveries(0)
    resetWorld()
    setGameState('playing')
  }, [resetWorld])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      // Pause
      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'playing') {
        setGameState('paused')
        return
      }
      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'paused') {
        setGameState('playing')
        return
      }

      // Menu navigation
      if (gameState === 'menu') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setMenuIndex((i) => (i > 0 ? i - 1 : 1))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setMenuIndex((i) => (i < 1 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (menuIndex === 0) startGame()
          else onExit()
        }
        return
      }

      // Game Over navigation
      if (gameState === 'gameOver') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setGameOverIndex((i) => (i > 0 ? i - 1 : 2))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setGameOverIndex((i) => (i < 2 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (gameOverIndex === 0) startGame()
          else if (gameOverIndex === 1) setGameState('menu')
          else onExit()
        }
        return
      }

      // Sling attach / release
      if (gameState === 'playing' && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault()
        if (e.repeat) return
        const heli = heliRef.current
        const crate = crateRef.current
        if (crate.delivered) return

        if (crate.attached) {
          crate.attached = false
          // Give a tiny separation impulse so it doesn't immediately reattach.
          crate.vel.x += heli.vel.x * 0.1
          crate.vel.y += heli.vel.y * 0.1
        } else {
          const hook = getHookPoint(heli)
          const dx = crate.pos.x - hook.x
          const dy = crate.pos.y - hook.y
          const d = Math.hypot(dx, dy)
          const hookRange = hookRangeRef.current
          if (d < hookRange) {
            crate.attached = true
          }
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, menuIndex, gameOverIndex, startGame, onExit, getHookPoint])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }

      // Keep world scale roughly comparable across screens.
      worldWidthRef.current = Math.max(2600, Math.floor(canvas.width * 5.5))
      // Place pad near the start.
      padRef.current = { x: Math.max(380, canvas.width * 0.45), width: 160 }
    }

    resize()
    window.addEventListener('resize', resize)

    const killPlayer = () => {
      if (gameState !== 'playing') return
      setLives((l) => {
        const nl = l - 1
        if (nl <= 0) {
          setTimeout(() => setGameState('gameOver'), 350)
        } else {
          // Soft reset position without resetting score.
          const { height } = canvasSizeRef.current
          heliRef.current.pos = { x: padRef.current.x, y: height * 0.35 }
          heliRef.current.vel = { x: 0, y: 0 }
          crateRef.current.attached = false
        }
        return nl
      })
    }

    const update = (dt: number, time: number) => {
      if (gameState !== 'playing') return

      const { width, height } = canvasSizeRef.current
      const worldWidth = worldWidthRef.current
      const heli = heliRef.current
      const crate = crateRef.current

      heli.hitFlashMs = Math.max(0, heli.hitFlashMs - dt * 1000)

      // Controls (arcade thrust model)
      const thrust = 520
      const drag = 0.985

      const left = keysRef.current.has('arrowleft') || keysRef.current.has('a')
      const right = keysRef.current.has('arrowright') || keysRef.current.has('d')
      const up = keysRef.current.has('arrowup') || keysRef.current.has('w')
      const down = keysRef.current.has('arrowdown') || keysRef.current.has('s')
      const stabilize = keysRef.current.has('shift')

      // Hover drift (when no input)
      if (!left && !right && !up && !down && !stabilize) {
        const t = time / 1000
        heli.vel.x += Math.sin(t * 1.1) * 15 * dt
        heli.vel.y += Math.cos(t * 1.4) * 12 * dt
      }

      if (left) heli.vel.x -= thrust * dt
      if (right) heli.vel.x += thrust * dt
      if (up) heli.vel.y -= thrust * dt
      if (down) heli.vel.y += thrust * dt

      // 3D-ish yaw + pitch:
      // - yaw: smoothly transitions between left (-1) and right (+1)
      // - pitch: nose-down tilt in the direction of travel (never upside down)
      const vx = heli.vel.x
      const vxAbs = Math.abs(vx)
      
      // If moving, face that direction. If stopped, maintain last facing direction.
      // We use a hysteresis threshold to prevent flipping during drift or small backward movements.
      let yawTarget = heli.yaw
      const turnThreshold = 60
      
      if (heli.yaw > 0) {
        // Facing Right: only turn left if moving significantly left
        if (vx < -turnThreshold) yawTarget = -1
        else yawTarget = 1
      } else {
        // Facing Left: only turn right if moving significantly right
        if (vx > turnThreshold) yawTarget = 1
        else yawTarget = -1
      }

      const yawT = 1 - Math.exp(-7 * dt)
      heli.yaw += (yawTarget - heli.yaw) * yawT

      const maxPitch = 0.28 // ~16 degrees
      // Tilt nose down in direction of travel relative to facing
      // If moving forward (vx and yaw same sign), pitch > 0 (Nose Down)
      // If moving backward (vx and yaw diff sign), pitch < 0 (Nose Up)
      const isMovingForward = (vx * heli.yaw) >= 0
      const pitchSign = isMovingForward ? 1 : -1
      const pitchTarget = pitchSign * maxPitch * smoothstep(0, 260, vxAbs)
      const pitchT = 1 - Math.exp(-8 * dt)
      heli.pitch += (pitchTarget - heli.pitch) * pitchT

      // The helicopter should not auto-descend unless it's carrying a load.
      // If the attached load is still resting on the ground, it shouldn't pull the chopper down.
      const groundUnderCrate = groundHeightAt(crate.pos.x)
      const crateOnGround = crate.attached && !crate.delivered && crate.pos.y + crate.radius >= groundUnderCrate - 0.5
      const isLoaded = crate.attached && !crate.delivered && !crateOnGround
      if (isLoaded) heli.vel.y += 220 * dt

      const maxSpeed = 420
      const speed = Math.hypot(heli.vel.x, heli.vel.y)
      if (speed > maxSpeed) {
        heli.vel.x = (heli.vel.x / speed) * maxSpeed
        heli.vel.y = (heli.vel.y / speed) * maxSpeed
      }

      const d = stabilize ? 0.94 : drag
      heli.vel.x *= d
      heli.vel.y *= d

      heli.pos.x += heli.vel.x * dt
      heli.pos.y += heli.vel.y * dt

      heli.pos.x = clamp(heli.pos.x, 0, worldWidth)
      heli.pos.y = clamp(heli.pos.y, 30, height - 30)

      // Rotor animation
      heli.rotor += dt * (8 + clamp(Math.hypot(heli.vel.x, heli.vel.y) / 60, 0, 8))

      // Crate physics
      const crateDrag = stabilize ? 0.965 : 0.988
      crate.vel.y += 300 * dt
      crate.vel.x *= crateDrag
      crate.vel.y *= crateDrag
      crate.pos.x += crate.vel.x * dt
      crate.pos.y += crate.vel.y * dt

      // Sling constraint (only max distance, slack allowed)
      if (crate.attached && !crate.delivered) {
        const hook = getHookPoint(heli)
        const dx = crate.pos.x - hook.x
        const dy = crate.pos.y - hook.y
        const dist = Math.hypot(dx, dy)
        const L = ropeLengthRef.current

        if (dist > L && dist > 0.0001) {
          const nx = dx / dist
          const ny = dy / dist

          // Project position to rope circle
          crate.pos.x = hook.x + nx * L
          crate.pos.y = hook.y + ny * L

          // Remove outward velocity component (prevents energy blow-up)
          const relVx = crate.vel.x - heli.vel.x
          const relVy = crate.vel.y - heli.vel.y
          const outward = relVx * nx + relVy * ny
          if (outward > 0) {
            crate.vel.x -= outward * nx
            crate.vel.y -= outward * ny
          }

          // Add some tension damping
          crate.vel.x = crate.vel.x * 0.995 + heli.vel.x * 0.005
          crate.vel.y = crate.vel.y * 0.995 + heli.vel.y * 0.005
        }
      }

      // Ground collisions
      const groundHHeli = groundHeightAt(heli.pos.x)
      const heliBottom = heli.pos.y + heli.radius
      if (heliBottom > groundHHeli) {
        const impact = Math.hypot(heli.vel.x, heli.vel.y)
        heli.pos.y = groundHHeli - heli.radius
        heli.vel.y *= -0.15
        heli.vel.x *= 0.6
        heli.hitFlashMs = 150
        if (impact > 220) {
          killPlayer()
        }
      }

      const groundHCrate = groundHeightAt(crate.pos.x)
      const crateBottom = crate.pos.y + crate.radius
      if (crateBottom > groundHCrate) {
        const impact = Math.abs(crate.vel.y)
        crate.pos.y = groundHCrate - crate.radius
        crate.vel.y = 0
        crate.vel.x *= 0.86

        // Delivery check (crate must be on pad and not slammed)
        const pad = padRef.current
        const onPad = crate.pos.x >= pad.x - pad.width / 2 && crate.pos.x <= pad.x + pad.width / 2
        if (!crate.delivered && onPad && impact < 140 && !crate.attached) {
          crate.delivered = true
          setDeliveries((d) => d + 1)
          setScore((s) => s + 500)

          // Spawn a new crate further out.
          const spawnX = clamp(pad.x + 900 + Math.random() * 2200, 600, worldWidth - 200)
          setTimeout(() => {
            const c = crateRef.current
            c.delivered = false
            c.attached = false
            c.vel = { x: 0, y: 0 }
            c.pos = { x: spawnX, y: groundHeightAt(spawnX) - c.radius }
          }, 500)
        }

      }

      // Camera follows heli
      const camTarget = clamp(heli.pos.x - width * 0.45, 0, worldWidth - width)
      cameraXRef.current += (camTarget - cameraXRef.current) * (1 - Math.pow(0.001, dt))
    }

    const drawGround = (ctx2: CanvasRenderingContext2D) => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current

      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.beginPath()

      const step = 18
      for (let sx = 0; sx <= width + step; sx += step) {
        const wx = camX + sx
        const gy = groundHeightAt(wx)
        if (sx === 0) ctx2.moveTo(sx, gy)
        else ctx2.lineTo(sx, gy)
      }
      ctx2.stroke()

      // Fill below ground as a dark mass
      ctx2.fillStyle = 'rgba(0, 255, 136, 0.06)'
      ctx2.beginPath()
      ctx2.moveTo(0, height)
      for (let sx = 0; sx <= width + step; sx += step) {
        const wx = camX + sx
        const gy = groundHeightAt(wx)
        ctx2.lineTo(sx, gy)
      }
      ctx2.lineTo(width, height)
      ctx2.closePath()
      ctx2.fill()
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // World transform
      ctx.save()
      ctx.translate(-camX, 0)

      // Ground
      ctx.save()
      ctx.translate(camX, 0)
      drawGround(ctx)
      ctx.restore()

      // Drop pad
      const pad = padRef.current
      const padY = groundHeightAt(pad.x)
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pad.x - pad.width / 2, padY)
      ctx.lineTo(pad.x - pad.width / 2, padY - 18)
      ctx.lineTo(pad.x + pad.width / 2, padY - 18)
      ctx.lineTo(pad.x + pad.width / 2, padY)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(0,255,136,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.x - pad.width / 2 + 10, padY - 10)
      ctx.lineTo(pad.x + pad.width / 2 - 10, padY - 10)
      ctx.stroke()

      // Rope + crate
      const heli = heliRef.current
      const crate = crateRef.current
      const hook = getHookPoint(heli)

      if (crate.attached) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(hook.x, hook.y)
        ctx.lineTo(crate.pos.x, crate.pos.y)
        ctx.stroke()
      }

      if (!crate.delivered) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.save()
        ctx.translate(crate.pos.x, crate.pos.y)
        ctx.beginPath()
        ctx.rect(-crate.radius, -crate.radius, crate.radius * 2, crate.radius * 2)
        ctx.stroke()
        ctx.restore()

        // Hook hint ring
        const dx = crate.pos.x - hook.x
        const dy = crate.pos.y - hook.y
        const dist = Math.hypot(dx, dy)
        const hookRange = hookRangeRef.current
        if (!crate.attached && dist < hookRange) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(crate.pos.x, crate.pos.y, 30, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // ========== 3D Helicopter Rendering ==========
      // 3D point type: [x, y, z] where +X is forward, +Y is down, +Z is right (viewer's left)
      type V3 = [number, number, number]
      type Renderable = 
        | { type: 'poly', pts: V3[], fill: string, stroke: string, z?: number, _tPts?: V3[], _depth?: number }
        | { type: 'line', pts: V3[], stroke: string, width: number, z?: number, _tPts?: V3[], _depth?: number }

      // Rotate around Y axis (yaw)
      const rotY = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
      }
      // Rotate around Z axis (pitch)
      const rotZ = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
      }
      // Project 3D to 2D (side view: Z->screen X, Y->screen Y)
      const proj = (p: V3): [number, number] => [p[2], p[1]]

      // Helicopter 3D model (scale factor)
      const S3 = 1.6
      const bodyFill = '#000000' // Occlude background
      const bodyStroke = heli.hitFlashMs > 0 ? '#ffffff' : '#00ff88'
      
      const renderables: Renderable[] = []
      const addFace = (pts: V3[], fill: string, stroke: string) => renderables.push({ type: 'poly', pts, fill, stroke })
      const addLine = (pts: V3[], stroke: string, width: number) => renderables.push({ type: 'line', pts, stroke, width })

      // --- Fuselage Geometry (Huey-style) ---
      // Define profile points (Left side)
      const wBody = 5
      const wNose = 3.5
      const wTailStart = 2.5
      
      // 0: Nose Tip, 1: Windshield Top, 2: Roof Front, 3: Roof Rear, 4: Tail Start Top
      // 5: Tail Start Bot, 6: Belly Rear, 7: Belly Front
      const nodesL: V3[] = [
        [24, 3, -wNose],      // 0
        [14, -4, -wBody],     // 1
        [6, -6, -wBody],      // 2
        [-8, -6, -wBody],     // 3
        [-12, -2, -wTailStart], // 4
        [-12, 4, -wTailStart],  // 5
        [-6, 8, -wBody],      // 6
        [14, 8, -wBody]       // 7
      ]
      const nodesR = nodesL.map(p => [p[0], p[1], -p[2]] as V3)

      // Side Faces
      addFace(nodesL, bodyFill, bodyStroke)
      addFace(nodesR.slice().reverse(), bodyFill, bodyStroke)

      // Windows and Doors
      const windowFill = '#1a3b5c'
      const doorStroke = bodyStroke
      const zSide = wBody + 0.1 // Slight offset to prevent z-fighting

      // Pilot Window (Sleek, following nose line)
      // Helper to interpolate Z for nose points
      const getZ = (x: number) => {
        if (x <= 14) return zSide
        const t = (x - 14) / (24 - 14)
        return wBody + t * (wNose - wBody) + 0.1
      }

      const winL: V3[] = [
        [6, -5, -getZ(6)],
        [14, -4, -getZ(14)],
        [20, 0, -getZ(20)],
        [14, 2, -getZ(14)],
        [6, 2, -getZ(6)]
      ]
      const winR: V3[] = winL.map(p => [p[0], p[1], -p[2]] as V3)
      
      addFace(winL, windowFill, bodyStroke)
      addFace(winR, windowFill, bodyStroke)

      // Cargo Door Outline (Large sliding door)
      const doorL: V3[] = [
        [6, -5, -zSide], [-6, -5, -zSide], [-6, 7, -zSide], [6, 7, -zSide], [6, -5, -zSide]
      ]
      const doorR: V3[] = [
        [6, -5, zSide], [-6, -5, zSide], [-6, 7, zSide], [6, 7, zSide], [6, -5, zSide]
      ]
      addLine(doorL, doorStroke, 1)
      addLine(doorR, doorStroke, 1)

      // Connecting Faces (Perimeter strip)
      for (let i = 0; i < nodesL.length; i++) {
        const next = (i + 1) % nodesL.length
        addFace([nodesL[i], nodesR[i], nodesR[next], nodesL[next]], bodyFill, bodyStroke)
      }

      // Engine Housing (Hump on roof)
      const engW = 2.5
      const engL: V3[] = [[4, -6, -engW], [4, -10, -engW], [-8, -10, -engW], [-8, -6, -engW]]
      const engR: V3[] = engL.map(p => [p[0], p[1], -p[2]] as V3)
      addFace(engL, bodyFill, bodyStroke)
      addFace(engR.slice().reverse(), bodyFill, bodyStroke)
      addFace([engL[1], engR[1], engR[2], engL[2]], bodyFill, bodyStroke) // Top
      addFace([engL[0], engR[0], engR[1], engL[1]], bodyFill, bodyStroke) // Front
      addFace([engL[2], engR[2], engR[3], engL[3]], bodyFill, bodyStroke) // Back

      // Tail Boom
      const tbStartW = wTailStart
      const tbEndW = 1
      const tbL: V3[] = [[-12, -2, -tbStartW], [-40, -2, -tbEndW], [-40, 1, -tbEndW], [-12, 4, -tbStartW]]
      const tbR: V3[] = [[-12, -2, tbStartW], [-40, -2, tbEndW], [-40, 1, tbEndW], [-12, 4, tbStartW]]
      addFace(tbL, bodyFill, bodyStroke)
      addFace(tbR.slice().reverse(), bodyFill, bodyStroke)
      addFace([tbL[0], tbR[0], tbR[1], tbL[1]], bodyFill, bodyStroke) // Top
      addFace([tbL[2], tbR[2], tbR[3], tbL[3]], bodyFill, bodyStroke) // Bottom
      addFace([tbL[1], tbR[1], tbR[2], tbL[2]], bodyFill, bodyStroke) // End cap

      // Tail Fin
      const fin: V3[] = [[-36, -2, 0], [-42, -12, 0], [-46, -12, 0], [-40, 1, 0]]
      addFace(fin, bodyFill, bodyStroke)

      // Skids
      const skidZ = 7
      const skidY = 14
      const skidL: V3[] = [[-10, skidY, -skidZ], [12, skidY, -skidZ], [16, skidY - 2, -skidZ]] // Curved front
      const skidR: V3[] = [[-10, skidY, skidZ], [12, skidY, skidZ], [16, skidY - 2, skidZ]]
      addLine(skidL, bodyStroke, 2)
      addLine(skidR, bodyStroke, 2)
      // Struts
      addLine([[-4, 8, -4], [-4, skidY, -skidZ]], bodyStroke, 1.5)
      addLine([[4, 8, -4], [4, skidY, -skidZ]], bodyStroke, 1.5)
      addLine([[-4, 8, 4], [-4, skidY, skidZ]], bodyStroke, 1.5)
      addLine([[4, 8, 4], [4, skidY, skidZ]], bodyStroke, 1.5)
      // Cross bars
      addLine([[-4, skidY, -skidZ], [-4, skidY, skidZ]], bodyStroke, 1.5)
      addLine([[4, skidY, -skidZ], [4, skidY, skidZ]], bodyStroke, 1.5)

      // Mast
      addLine([[0, -6, 0], [0, -14, 0]], bodyStroke, 2)

      // Main Rotor
      const rotorRadius = 32
      const rotorAngle = heli.rotor
      const rotorBlade1: V3[] = [
        [Math.cos(rotorAngle) * rotorRadius, -14, Math.sin(rotorAngle) * rotorRadius],
        [-Math.cos(rotorAngle) * rotorRadius, -14, -Math.sin(rotorAngle) * rotorRadius]
      ]
      const rotorBlade2: V3[] = [
        [Math.cos(rotorAngle + Math.PI/2) * rotorRadius, -14, Math.sin(rotorAngle + Math.PI/2) * rotorRadius],
        [-Math.cos(rotorAngle + Math.PI/2) * rotorRadius, -14, -Math.sin(rotorAngle + Math.PI/2) * rotorRadius]
      ]
      addLine(rotorBlade1, 'rgba(255,255,255,0.8)', 2)
      addLine(rotorBlade2, 'rgba(255,255,255,0.8)', 2)

      // Tail Rotor (XY plane, axis along Z - perpendicular to fuselage side)
      const trRadius = 8
      const trAngle = heli.rotor * 3
      const trOffset = 2 // Right side
      const trCenter: V3 = [-42, -12, trOffset] 
      const trBlade: V3[] = [
        [trCenter[0] + Math.cos(trAngle) * trRadius, trCenter[1] + Math.sin(trAngle) * trRadius, trCenter[2]],
        [trCenter[0] - Math.cos(trAngle) * trRadius, trCenter[1] - Math.sin(trAngle) * trRadius, trCenter[2]]
      ]
      addLine(trBlade, 'rgba(255,255,255,0.6)', 1.5)
      // Tail rotor hub
      addLine([[-42, -12, 0], [-42, -12, trOffset]], bodyStroke, 1)


      // --- Rendering ---
      ctx.save()
      ctx.translate(heli.pos.x, heli.pos.y)

      // Convert yaw/pitch
      const yawAngle = -heli.yaw * (Math.PI / 2)
      const pitchAngle = heli.pitch

      // Transform and Sort
      renderables.forEach(r => {
        // Transform points
        const tPts = r.pts.map(p => {
          let tp = rotZ(p, pitchAngle)
          tp = rotY(tp, yawAngle)
          return tp
        })
        // Store transformed points for drawing
        // We can't mutate r.pts because it's shared/const. 
        // But we can store the projected 2D points and the Z depth.
        
        // Compute average Z for sorting
        let zSum = 0
        tPts.forEach(p => zSum += p[0]) // In our projection, Z is mapped to X, but depth is...
        // Wait, our coordinate system: +X forward, +Y down, +Z right.
        // Viewer is looking from +Z side? No, side view.
        // proj = (p) => [p[2], p[1]] (Z -> Screen X, Y -> Screen Y)
        // So Screen X is Z (Right), Screen Y is Y (Down).
        // The depth axis (into the screen) is X (Forward/Backward of heli).
        // If we view from the side (Right side), then +Z is towards us.
        // Wait, if proj is [p[2], p[1]], then p[2] is horizontal screen pos.
        // p[0] (Forward) is the depth axis relative to the screen?
        // Let's check rotY (Yaw).
        // rotY rotates X and Z.
        // If yaw=0, X is depth?
        // Yes. If we look from the side, X is left-right on the heli, but depth in the view?
        // No, if proj is [p[2], p[1]], then p[2] (Right) is Screen X.
        // p[1] (Down) is Screen Y.
        // p[0] (Forward) is NOT drawn. So p[0] is the depth (Z-buffer value).
        // Positive X is Forward. If we view from the Right (+Z), then +X is to our Left?
        // Let's assume p[0] is depth.
        
        const depth = tPts.reduce((sum, p) => sum + p[0], 0) / tPts.length
        
        // Store for render
        // We'll attach a temporary property or return a new object
        r._tPts = tPts
        r._depth = depth
      })

      // Sort by depth (furthest first). 
      // If +X is depth, and we view from +Z? 
      // Actually, let's just try sorting by p[0].
      // If p[0] is large (Forward), is it close or far?
      // If we view from the side, X is perpendicular to view direction.
      // Wait, if proj uses p[2] and p[1], then p[0] is the axis perpendicular to the screen.
      // So yes, p[0] is depth.
      // We want to draw furthest X first? Or closest?
      // Standard painter's: draw furthest away first.
      // If +X is "into" the screen or "out of"?
      // Let's guess: Sort ascending or descending.
      // If we rotate 90 deg, X becomes Z.
      renderables.sort((a, b) => (a._depth || 0) - (b._depth || 0)) // Try ascending first

      // Draw
      renderables.forEach(r => {
        const tPts = r._tPts as V3[]
        const screenPts = tPts.map(p => proj(p))
        
        ctx.beginPath()
        if (screenPts.length > 0) {
          ctx.moveTo(screenPts[0][0] * S3, screenPts[0][1] * S3)
          for (let i = 1; i < screenPts.length; i++) {
            ctx.lineTo(screenPts[i][0] * S3, screenPts[i][1] * S3)
          }
        }
        
        if (r.type === 'poly') {
          ctx.closePath()
          ctx.fillStyle = r.fill
          ctx.fill()
          ctx.strokeStyle = r.stroke
          ctx.lineWidth = 1.5
          ctx.stroke()
        } else if (r.type === 'line') {
          ctx.strokeStyle = r.stroke
          ctx.lineWidth = r.width
          ctx.stroke()
        }
      })

      // Hook point (transformed)
      const groundUnderCrate = groundHeightAt(crate.pos.x)
      const crateOnGround = crate.attached && !crate.delivered && crate.pos.y + crate.radius >= groundUnderCrate - 0.5
      const isLoaded = crate.attached && !crate.delivered && !crateOnGround

      const hookLocal: V3 = [0, 8, 0] // Belly center
      let hp = rotZ(hookLocal, pitchAngle)
      hp = rotY(hp, yawAngle)
      const [hx, hy] = proj(hp)
      ctx.strokeStyle = isLoaded ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(hx * S3, hy * S3, 3, 0, Math.PI * 2)
      ctx.stroke()

      ctx.restore()

      ctx.restore() // world

      // HUD
      if (gameState === 'playing') {
        ctx.fillStyle = '#00ff88'
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 16, 28)
        ctx.fillText(`LIVES ${lives}`, 16, 48)
        ctx.fillText(`DELIVERED ${deliveries}`, 16, 68)

        // Minimal instructions
        ctx.fillStyle = 'rgba(0,255,136,0.65)'
        ctx.fillText('ARROWS/WASD: THRUST  •  SPACE: HOOK/RELEASE  •  SHIFT: STABILIZE  •  P: PAUSE', 16, height - 18)
      }

      // Pause overlay
      if (gameState === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2
        ctx.strokeRect(width / 2 - 180, height / 2 - 90, 360, 180)
        ctx.fillStyle = '#00ff88'
        ctx.font = '24px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText('PAUSED', width / 2 - 54, height / 2 - 30)
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText('Press P or Esc to resume', width / 2 - 96, height / 2 + 10)
      }
    }

    const animate = (t: number) => {
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = t
      update(dt, t)
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [gameState, groundHeightAt, score, lives, deliveries, getHookPoint])

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
            <h1 className="text-4xl text-[#00ff88] mb-8 text-center tracking-[0.3em] uppercase">Sling Load</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2"><span className="text-white">›</span> Arrows / WASD: Thrust</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Space: Hook / Release</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Shift: Stabilize (damping)</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> P: Pause</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start
              </button>
              <button
                onClick={onExit}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}

      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
            <h1 className="text-4xl text-[#00ff88] mb-4 text-center tracking-[0.3em] uppercase">Game Over</h1>
            <div className="text-[#00ff88] text-sm mb-8 tracking-wider text-center">
              <div>Score {score.toString().padStart(6, '0')}</div>
              <div>Delivered {deliveries}</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Retry
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Menu
              </button>
              <button
                onClick={onExit}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}
    </div>
  )
}
