import { useEffect, useRef, useState, useCallback } from 'react'

type Vector2 = { x: number; y: number }

type GameState = 'menu' | 'playing' | 'paused' | 'goal' | 'gameOver'

type Vehicle = {
  pos: Vector2
  vel: Vector2
  angle: number
  wheelAngle: number
  side: 'left' | 'right'
}

type Ball = {
  pos: Vector2
  vel: Vector2
  radius: number
}

type Bumper = {
  pos: Vector2
  radius: number
  hitTimer: number
}

type Goal = {
  pos: Vector2
  radius: number
  gravityRadius: number
  side: 'left' | 'right'
}

// Sound system
class SoundSystem {
  private ctx: AudioContext | null = null

  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
  }

  bump() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(200, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  kick() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(150, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  wallBounce() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 120
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.05)
  }

  goal() {
    if (!this.ctx) return
    // Epic triumphant fanfare with bass hit
    
    // Bass hit first
    const bass = this.ctx.createOscillator()
    const bassGain = this.ctx.createGain()
    bass.type = 'sine'
    bass.frequency.setValueAtTime(80, this.ctx.currentTime)
    bass.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3)
    bassGain.gain.setValueAtTime(0.4, this.ctx.currentTime)
    bassGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3)
    bass.connect(bassGain)
    bassGain.connect(this.ctx.destination)
    bass.start()
    bass.stop(this.ctx.currentTime + 0.3)
    
    // Rising triumphant chord
    const freqs = [523, 659, 784, 1047] // C5, E5, G5, C6
    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.08)
      gain.gain.linearRampToValueAtTime(0.2, this.ctx!.currentTime + i * 0.08 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 1.2)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(this.ctx!.currentTime + i * 0.1)
      osc.stop(this.ctx!.currentTime + 0.8)
    })
  }

  engine() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 35
    gain.gain.setValueAtTime(0.03, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }
}

interface KickballGameProps {
  onExit: () => void
}

export function KickballGame({ onExit }: KickballGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>('menu')
  const [gameMode, setGameMode] = useState<'1p' | '2p'>('2p')
  const [redScore, setRedScore] = useState(0)  // Left side (WASD player or AI)
  const [blueScore, setBlueScore] = useState(0) // Right side (Arrow player)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const vehicle1Ref = useRef<Vehicle>({
    pos: { x: 200, y: 300 },
    vel: { x: 0, y: 0 },
    angle: 0,
    wheelAngle: 0,
    side: 'left',
  })

  const vehicle2Ref = useRef<Vehicle>({
    pos: { x: 600, y: 300 },
    vel: { x: 0, y: 0 },
    angle: Math.PI,
    wheelAngle: 0,
    side: 'right',
  })

  const ballRef = useRef<Ball>({
    pos: { x: 400, y: 300 },
    vel: { x: 0, y: 0 },
    radius: 30,
  })

  const bumpersRef = useRef<Bumper[]>([])
  const goalsRef = useRef<Goal[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const soundsRef = useRef<SoundSystem>(new SoundSystem())
  const engineTimerRef = useRef(0)
  const goalCelebrationRef = useRef(0)
  const lastScorerRef = useRef<'red' | 'blue'>('red')
  const goalFlashRef = useRef(0)
  const ripplesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; color: string }[]>([])
  const ambientRipplesRef = useRef<{ goalSide: 'left' | 'right'; radius: number; maxRadius: number }[]>([])
  const drainAnimRef = useRef<{ goalPos: Vector2; startPos: Vector2; progress: number; spinAngle: number } | null>(null)

  const fieldRef = useRef({
    left: 50,
    right: 750,
    top: 50,
    bottom: 550,
  })

  const generateField = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const margin = 50
    const field = {
      left: margin,
      right: width - margin,
      top: margin,
      bottom: height - margin,
    }
    fieldRef.current = field

    const fieldWidth = field.right - field.left
    const fieldHeight = field.bottom - field.top
    const centerX = (field.left + field.right) / 2
    const centerY = (field.top + field.bottom) / 2

    // Generate bumpers in a pattern
    const bumpers: Bumper[] = []
    const bumperRadius = 20

    // Center circle bumper (just visual, the center is open)
    // Add bumpers in strategic positions
    
    // Top row
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    
    // Middle row (flanking center)
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })
    
    // Bottom row
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })

    // Side bumpers near goals
    bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })

    bumpersRef.current = bumpers

    // Goals - circles with gravity (ball radius is 30, so 60+ allows full containment)
    const goalRadius = 60
    const goalGravityRadius = 200
    const goalOffset = 100 // Offset from field edge

    goalsRef.current = [
      { pos: { x: field.left + goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'left' },
      { pos: { x: field.right - goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'right' },
    ]
  }, [])

  const resetPositions = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const centerX = width / 2
    const centerY = height / 2

    // Reset ball to center
    ballRef.current = {
      pos: { x: centerX, y: centerY },
      vel: { x: 0, y: 0 },
      radius: 30,
    }

    // Reset vehicle positions - each on their own side
    // Left vehicle (red) - controlled by WASD, tries to score on right goal (blue)
    vehicle1Ref.current = {
      pos: { x: centerX - 150, y: centerY },
      vel: { x: 0, y: 0 },
      angle: 0, // Facing right
      wheelAngle: 0,
      side: 'left',
    }
    
    // Right vehicle (blue) - controlled by arrows, tries to score on left goal (red)
    vehicle2Ref.current = {
      pos: { x: centerX + 150, y: centerY },
      vel: { x: 0, y: 0 },
      angle: Math.PI, // Facing left
      wheelAngle: 0,
      side: 'right',
    }
  }, [])

  const startGame = useCallback(() => {
    soundsRef.current.init()
    setRedScore(0)
    setBlueScore(0)
    generateField()
    resetPositions()
    setGameState('playing')
  }, [generateField, resetPositions])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }
      generateField()
    }
    resize()
    window.addEventListener('resize', resize)

    const sounds = soundsRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'playing') {
        setGameState('paused')
      } else if ((e.key === 'p' || e.key === 'Escape') && gameState === 'paused') {
        setGameState('playing')
      }

      // Menu navigation
      if (gameState === 'menu') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setMenuIndex((i) => (i > 0 ? i - 1 : 2))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setMenuIndex((i) => (i < 2 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (menuIndex === 0) { setGameMode('1p'); startGame() }
          else if (menuIndex === 1) { setGameMode('2p'); startGame() }
          else onExit()
        }
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
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    let lastTime = performance.now()
    let animationId: number

    const update = (dt: number) => {
      if (gameState !== 'playing' && gameState !== 'goal') return

      const field = fieldRef.current
      const vehicle1 = vehicle1Ref.current
      const vehicle2 = vehicle2Ref.current
      const ball = ballRef.current

      // Goal celebration pause
      if (gameState === 'goal') {
        goalCelebrationRef.current -= dt * 1000
        goalFlashRef.current = Math.max(0, goalFlashRef.current - dt * 2)
        
        // Update drain animation - ball spirals into center
        if (drainAnimRef.current) {
          const drain = drainAnimRef.current
          drain.progress = Math.min(1, drain.progress + dt * 2) // Complete in 0.5 seconds
          drain.spinAngle += dt * 15 // Fast spin
          
          // Spiral path - starts at ball position, spirals to goal center
          const t = drain.progress
          const easeT = 1 - Math.pow(1 - t, 3) // Ease out cubic - accelerates into drain
          const spiralRadius = (1 - easeT) * 40 // Spiral gets tighter
          
          // Update ball position to follow spiral
          ball.pos.x = drain.goalPos.x + Math.cos(drain.spinAngle) * spiralRadius
          ball.pos.y = drain.goalPos.y + Math.sin(drain.spinAngle) * spiralRadius
        }
        
        // Update ripples - shrink inward rapidly for goal celebration
        const rippleSpeed = 400
        ripplesRef.current = ripplesRef.current.filter(r => {
          r.radius -= rippleSpeed * dt
          return r.radius > r.maxRadius // maxRadius is now minimum (goal radius)
        })
        
        // Spawn new inward ripples rapidly during goal celebration
        if (drainAnimRef.current && ripplesRef.current.length < 8) {
          const lastRipple = ripplesRef.current[ripplesRef.current.length - 1]
          if (!lastRipple || lastRipple.radius < 350) {
            const goal = goalsRef.current.find(g => 
              g.pos.x === drainAnimRef.current!.goalPos.x
            )
            if (goal) {
              ripplesRef.current.push({
                x: goal.pos.x,
                y: goal.pos.y,
                radius: 400, // Start from far out
                maxRadius: goal.radius, // Shrink to goal radius
                color: goal.side === 'left' ? '#ff4444' : '#4444ff'
              })
            }
          }
        }
        
        if (goalCelebrationRef.current <= 0) {
          resetPositions()
          ripplesRef.current = []
          drainAnimRef.current = null
          setGameState('playing')
        }
        return
      }
      
      // Update ambient goal ripples (always active during play) - ripple inward
      const ambientRippleSpeed = 80
      ambientRipplesRef.current = ambientRipplesRef.current.filter(r => {
        r.radius -= ambientRippleSpeed * dt
        return r.radius > r.maxRadius // maxRadius is now the minimum (goal radius)
      })
      
      // Spawn ambient ripples for each goal - start at gravity radius, shrink to goal
      for (const goal of goalsRef.current) {
        const goalRipples = ambientRipplesRef.current.filter(r => r.goalSide === goal.side)
        const lastRipple = goalRipples[goalRipples.length - 1]
        if (!lastRipple || lastRipple.radius < goal.gravityRadius - 50) {
          ambientRipplesRef.current.push({
            goalSide: goal.side,
            radius: goal.gravityRadius,
            maxRadius: goal.radius // Now used as minimum radius
          })
        }
      }

      // Vehicle 1 controls - Red car
      // In 1 player mode: AI controls
      // In 2 player mode: WASD controls
      const accel = 350
      let isAccelerating = false
      
      if (gameMode === '1p') {
        // Advanced AI for red car with state machine
        const ball = ballRef.current
        const rightGoal = goalsRef.current.find(g => g.side === 'right')
        const leftGoal = goalsRef.current.find(g => g.side === 'left')
        const field = fieldRef.current
        const centerX = (field.left + field.right) / 2
        const centerY = (field.top + field.bottom) / 2
        const opponent = vehicle2Ref.current
        
        if (rightGoal && leftGoal) {
          // Predict where ball will be in the near future
          const predictionTime = 0.5 // seconds ahead
          const predictedBallX = ball.pos.x + ball.vel.x * predictionTime
          const predictedBallY = ball.pos.y + ball.vel.y * predictionTime
          
          // Determine AI state based on ball position and velocity
          const ballMovingTowardOwnGoal = ball.vel.x < -50 // Ball moving left toward red's goal
          const ballOnOwnSide = ball.pos.x < centerX
          const ballInDanger = predictedBallX < field.left + 200 // Ball predicted to be near red goal
          
          // Check if opponent is closer to ball than us
          const aiToBallDist = Math.hypot(ball.pos.x - vehicle1.pos.x, ball.pos.y - vehicle1.pos.y)
          const opponentToBallDist = Math.hypot(ball.pos.x - opponent.pos.x, ball.pos.y - opponent.pos.y)
          const opponentCloser = opponentToBallDist < aiToBallDist - 30
          
          // State machine: 'attack' | 'defend' | 'intercept' | 'block'
          let aiState: 'attack' | 'defend' | 'intercept' | 'block' = 'attack'
          
          if (ballInDanger || (ballMovingTowardOwnGoal && ballOnOwnSide)) {
            // Ball is threatening our goal - intercept it
            aiState = 'intercept'
          } else if (opponentCloser && ballOnOwnSide) {
            // Opponent has the ball on our side - block them
            aiState = 'block'
          } else if (ballOnOwnSide && !ballMovingTowardOwnGoal) {
            // Ball is on our side but not dangerous - clear it
            aiState = 'defend'
          } else {
            // Ball is on opponent's side or moving away - attack
            aiState = 'attack'
          }
          
          let targetX = ball.pos.x
          let targetY = ball.pos.y
          
          if (aiState === 'attack') {
            // Attack mode: Circle around to optimal approach angle
            const ballToGoalX = rightGoal.pos.x - predictedBallX
            const ballToGoalY = rightGoal.pos.y - predictedBallY
            const ballToGoalDist = Math.hypot(ballToGoalX, ballToGoalY)
            const ballToGoalAngle = Math.atan2(ballToGoalY, ballToGoalX)
            
            // Calculate car's current angle to ball
            const carToBallX = ball.pos.x - vehicle1.pos.x
            const carToBallY = ball.pos.y - vehicle1.pos.y
            const carToBallDist = Math.hypot(carToBallX, carToBallY)
            const carToBallAngle = Math.atan2(carToBallY, carToBallX)
            
            // Ideal approach: from opposite side of goal direction
            const idealApproachAngle = ballToGoalAngle + Math.PI // Come from behind
            
            // Check if we're approaching from a good angle
            let approachAngleDiff = carToBallAngle - idealApproachAngle
            while (approachAngleDiff > Math.PI) approachAngleDiff -= Math.PI * 2
            while (approachAngleDiff < -Math.PI) approachAngleDiff += Math.PI * 2
            
            if (carToBallDist < 80) {
              // Close to ball, aim at the goal to push
              targetX = rightGoal.pos.x
              targetY = rightGoal.pos.y
            } else if (Math.abs(approachAngleDiff) > Math.PI / 3 && carToBallDist > 120) {
              // Bad approach angle and far enough - circle around to better position
              // Offset perpendicular to ideal approach to arc around
              const circleDir = approachAngleDiff > 0 ? -1 : 1
              const perpAngle = idealApproachAngle + (Math.PI / 2) * circleDir
              const behindBallDist = 80
              targetX = predictedBallX - Math.cos(idealApproachAngle) * behindBallDist + Math.cos(perpAngle) * 60
              targetY = predictedBallY - Math.sin(idealApproachAngle) * behindBallDist + Math.sin(perpAngle) * 60
            } else {
              // Good approach angle - go behind ball
              const behindBallDist = 60
              targetX = predictedBallX - (ballToGoalX / ballToGoalDist) * behindBallDist
              targetY = predictedBallY - (ballToGoalY / ballToGoalDist) * behindBallDist
            }
          } else if (aiState === 'intercept') {
            // Intercept mode: Get between ball and our goal
            const goalToBallX = predictedBallX - leftGoal.pos.x
            const goalToBallY = predictedBallY - leftGoal.pos.y
            const goalToBallDist = Math.hypot(goalToBallX, goalToBallY)
            
            // Position between goal and ball's predicted position
            const interceptDist = Math.min(goalToBallDist * 0.5, 150)
            targetX = leftGoal.pos.x + (goalToBallX / goalToBallDist) * interceptDist
            targetY = leftGoal.pos.y + (goalToBallY / goalToBallDist) * interceptDist
            
            // If very close, aim to clear the ball to the side/right
            const carToBallDist = Math.hypot(ball.pos.x - vehicle1.pos.x, ball.pos.y - vehicle1.pos.y)
            if (carToBallDist < 80) {
              // Clear toward the right side of the field
              targetX = field.right
              targetY = ball.pos.y < centerY ? field.bottom : field.top
            }
          } else if (aiState === 'block') {
            // Block mode: Position between opponent and ball
            const oppToBallX = ball.pos.x - opponent.pos.x
            const oppToBallY = ball.pos.y - opponent.pos.y
            const oppToBallDist = Math.hypot(oppToBallX, oppToBallY)
            
            // Get between opponent and ball, closer to the ball
            const blockDist = Math.min(oppToBallDist * 0.4, 60)
            targetX = ball.pos.x - (oppToBallX / oppToBallDist) * blockDist
            targetY = ball.pos.y - (oppToBallY / oppToBallDist) * blockDist
            
            // If close to ball while blocking, clear it
            const carToBallDist = Math.hypot(ball.pos.x - vehicle1.pos.x, ball.pos.y - vehicle1.pos.y)
            if (carToBallDist < 70) {
              targetX = centerX + 150
              targetY = centerY
            }
          } else if (aiState === 'defend') {
            // Defend mode: Push ball away from our side toward center/right
            const ballToRightX = rightGoal.pos.x - ball.pos.x
            const ballToRightY = centerY - ball.pos.y
            const dist = Math.hypot(ballToRightX, ballToRightY)
            
            const behindBallDist = 50
            targetX = ball.pos.x - (ballToRightX / dist) * behindBallDist
            targetY = ball.pos.y - (ballToRightY / dist) * behindBallDist
            
            const carToBallDist = Math.hypot(ball.pos.x - vehicle1.pos.x, ball.pos.y - vehicle1.pos.y)
            if (carToBallDist < 80) {
              targetX = centerX + 100
              targetY = centerY
            }
          }
          
          // Bumper avoidance - check if path to target crosses any bumper
          const bumpers = bumpersRef.current
          const pathToTargetX = targetX - vehicle1.pos.x
          const pathToTargetY = targetY - vehicle1.pos.y
          const pathDist = Math.hypot(pathToTargetX, pathToTargetY)
          
          if (pathDist > 30) {
            const pathNormX = pathToTargetX / pathDist
            const pathNormY = pathToTargetY / pathDist
            
            for (const bumper of bumpers) {
              // Check distance from bumper to our path line
              const toBumperX = bumper.pos.x - vehicle1.pos.x
              const toBumperY = bumper.pos.y - vehicle1.pos.y
              const distAlongPath = toBumperX * pathNormX + toBumperY * pathNormY
              
              // Only consider bumpers ahead of us and within path distance
              if (distAlongPath > 20 && distAlongPath < pathDist) {
                const closestOnPathX = vehicle1.pos.x + pathNormX * distAlongPath
                const closestOnPathY = vehicle1.pos.y + pathNormY * distAlongPath
                const distToBumper = Math.hypot(bumper.pos.x - closestOnPathX, bumper.pos.y - closestOnPathY)
                
                const avoidRadius = bumper.radius + 35 // Vehicle radius + margin
                if (distToBumper < avoidRadius) {
                  // Bumper is in our way - steer around it
                  const perpX = -pathNormY
                  const perpY = pathNormX
                  // Determine which side to go around
                  const sideCheck = (bumper.pos.x - vehicle1.pos.x) * perpX + (bumper.pos.y - vehicle1.pos.y) * perpY
                  const avoidDir = sideCheck > 0 ? -1 : 1
                  
                  // Offset target to go around bumper
                  targetX = bumper.pos.x + perpX * avoidDir * (avoidRadius + 20)
                  targetY = bumper.pos.y + perpY * avoidDir * (avoidRadius + 20)
                  break // Handle one bumper at a time
                }
              }
            }
          }
          
          // Calculate angle to target
          const dx = targetX - vehicle1.pos.x
          const dy = targetY - vehicle1.pos.y
          const targetAngle = Math.atan2(dy, dx)
          
          // Smoothly turn toward target
          let angleDiff = targetAngle - vehicle1.angle
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
          
          const turnSpeed = 4.5
          if (angleDiff > 0.08) {
            vehicle1.angle += turnSpeed * dt
          } else if (angleDiff < -0.08) {
            vehicle1.angle -= turnSpeed * dt
          }
          
          // Accelerate if roughly facing the target
          const distToTarget = Math.hypot(dx, dy)
          if (Math.abs(angleDiff) < Math.PI / 2) {
            // Accelerate more when far, less when close for better control
            const accelMult = distToTarget > 150 ? 1.0 : 0.7
            vehicle1.vel.x += Math.cos(vehicle1.angle) * accel * accelMult * dt
            vehicle1.vel.y += Math.sin(vehicle1.angle) * accel * accelMult * dt
            isAccelerating = true
          } else if (distToTarget > 100) {
            // If facing wrong way but far from target, reverse briefly
            vehicle1.vel.x -= Math.cos(vehicle1.angle) * accel * 0.3 * dt
            vehicle1.vel.y -= Math.sin(vehicle1.angle) * accel * 0.3 * dt
          }
        }
      } else {
        // 2 player mode - WASD controls
        if (keysRef.current.has('a')) {
          vehicle1.angle -= 4 * dt
        }
        if (keysRef.current.has('d')) {
          vehicle1.angle += 4 * dt
        }
        if (keysRef.current.has('w')) {
          vehicle1.vel.x += Math.cos(vehicle1.angle) * accel * dt
          vehicle1.vel.y += Math.sin(vehicle1.angle) * accel * dt
          isAccelerating = true
        }
        if (keysRef.current.has('s')) {
          vehicle1.vel.x -= Math.cos(vehicle1.angle) * accel * 0.5 * dt
          vehicle1.vel.y -= Math.sin(vehicle1.angle) * accel * 0.5 * dt
          isAccelerating = true
        }
      }

      // Vehicle 2 controls (Arrow keys) - Right/Blue car
      if (keysRef.current.has('arrowleft')) {
        vehicle2.angle -= 4 * dt
      }
      if (keysRef.current.has('arrowright')) {
        vehicle2.angle += 4 * dt
      }
      if (keysRef.current.has('arrowup')) {
        vehicle2.vel.x += Math.cos(vehicle2.angle) * accel * dt
        vehicle2.vel.y += Math.sin(vehicle2.angle) * accel * dt
        isAccelerating = true
      }
      if (keysRef.current.has('arrowdown')) {
        vehicle2.vel.x -= Math.cos(vehicle2.angle) * accel * 0.5 * dt
        vehicle2.vel.y -= Math.sin(vehicle2.angle) * accel * 0.5 * dt
        isAccelerating = true
      }

      // Engine sound
      if (isAccelerating) {
        engineTimerRef.current -= dt * 1000
        if (engineTimerRef.current <= 0) {
          engineTimerRef.current = 100
          sounds.engine()
        }
      }

      // Vehicle physics helper function
      const vRadius = 15
      const updateVehiclePhysics = (vehicle: Vehicle) => {
        // Drift physics
        const speed = Math.hypot(vehicle.vel.x, vehicle.vel.y)
        const gripFactor = Math.max(0.02, 0.08 - speed * 0.0003)
        const facingX = Math.cos(vehicle.angle)
        const facingY = Math.sin(vehicle.angle)
        const dot = vehicle.vel.x * facingX + vehicle.vel.y * facingY
        vehicle.vel.x += (facingX * dot - vehicle.vel.x) * gripFactor
        vehicle.vel.y += (facingY * dot - vehicle.vel.y) * gripFactor

        // Friction
        vehicle.vel.x *= 0.97
        vehicle.vel.y *= 0.97

        // Animate wheels
        vehicle.wheelAngle += speed * dt * 0.3

        // Move vehicle
        vehicle.pos.x += vehicle.vel.x * dt
        vehicle.pos.y += vehicle.vel.y * dt

        // Wall collision
        if (vehicle.pos.x < field.left + vRadius) {
          vehicle.pos.x = field.left + vRadius
          vehicle.vel.x *= -0.5
        }
        if (vehicle.pos.x > field.right - vRadius) {
          vehicle.pos.x = field.right - vRadius
          vehicle.vel.x *= -0.5
        }
        if (vehicle.pos.y < field.top + vRadius) {
          vehicle.pos.y = field.top + vRadius
          vehicle.vel.y *= -0.5
        }
        if (vehicle.pos.y > field.bottom - vRadius) {
          vehicle.pos.y = field.bottom - vRadius
          vehicle.vel.y *= -0.5
        }

        // Bumper collision
        for (const bumper of bumpersRef.current) {
          const dx = vehicle.pos.x - bumper.pos.x
          const dy = vehicle.pos.y - bumper.pos.y
          const dist = Math.hypot(dx, dy)
          const minDist = vRadius + bumper.radius
          if (dist < minDist && dist > 0) {
            const nx = dx / dist
            const ny = dy / dist
            const push = minDist - dist
            vehicle.pos.x += nx * push
            vehicle.pos.y += ny * push
            const dotV = vehicle.vel.x * nx + vehicle.vel.y * ny
            vehicle.vel.x -= 2.2 * dotV * nx
            vehicle.vel.y -= 2.2 * dotV * ny
            const boostSpeed = 120
            vehicle.vel.x += nx * boostSpeed
            vehicle.vel.y += ny * boostSpeed
            bumper.hitTimer = 200
            sounds.bump()
          }
        }
      }

      // Update both vehicles
      updateVehiclePhysics(vehicle1)
      updateVehiclePhysics(vehicle2)

      // Vehicle-Vehicle collision
      const v1v2Dx = vehicle2.pos.x - vehicle1.pos.x
      const v1v2Dy = vehicle2.pos.y - vehicle1.pos.y
      const v1v2Dist = Math.hypot(v1v2Dx, v1v2Dy)
      const v1v2MinDist = vRadius * 2
      if (v1v2Dist < v1v2MinDist && v1v2Dist > 0) {
        const nx = v1v2Dx / v1v2Dist
        const ny = v1v2Dy / v1v2Dist
        const push = (v1v2MinDist - v1v2Dist) / 2
        vehicle1.pos.x -= nx * push
        vehicle1.pos.y -= ny * push
        vehicle2.pos.x += nx * push
        vehicle2.pos.y += ny * push
        
        // Exchange momentum
        const relVelX = vehicle1.vel.x - vehicle2.vel.x
        const relVelY = vehicle1.vel.y - vehicle2.vel.y
        const relVelDot = relVelX * nx + relVelY * ny
        if (relVelDot > 0) {
          vehicle1.vel.x -= relVelDot * nx * 0.8
          vehicle1.vel.y -= relVelDot * ny * 0.8
          vehicle2.vel.x += relVelDot * nx * 0.8
          vehicle2.vel.y += relVelDot * ny * 0.8
          sounds.bump()
        }
      }

      // Ball physics
      ball.vel.x *= 0.995 // Very low friction on ball
      ball.vel.y *= 0.995
      ball.pos.x += ball.vel.x * dt
      ball.pos.y += ball.vel.y * dt

      // Ball collision with walls
      // Goal gravity effect on ball
      for (const goal of goalsRef.current) {
        const dx = goal.pos.x - ball.pos.x
        const dy = goal.pos.y - ball.pos.y
        const dist = Math.hypot(dx, dy)
        
        // Check if ball is FULLY inside goal (ball edge must be within goal circle)
        if (dist + ball.radius < goal.radius) {
          // Start drain animation
          drainAnimRef.current = {
            goalPos: { x: goal.pos.x, y: goal.pos.y },
            startPos: { x: ball.pos.x, y: ball.pos.y },
            progress: 0,
            spinAngle: 0
          }
          
          // Start ripple emanation from goal
          const rippleColor = goal.side === 'left' ? '#ff4444' : '#4444ff'
          ripplesRef.current = []
          // Create initial ripple
          ripplesRef.current.push({
            x: goal.pos.x,
            y: goal.pos.y,
            radius: goal.radius,
            maxRadius: 300,
            color: rippleColor
          })
          goalFlashRef.current = 1.0
          
          if (goal.side === 'left') {
            // Ball went in left (red) goal - Blue team (arrows) scored!
            setBlueScore(s => {
              const newScore = s + 1
              if (newScore >= 5) {
                setTimeout(() => setGameState('gameOver'), 1500)
              }
              return newScore
            })
            lastScorerRef.current = 'blue'
          } else {
            // Ball went in right (blue) goal - Red team (WASD) scored!
            setRedScore(s => {
              const newScore = s + 1
              if (newScore >= 5) {
                setTimeout(() => setGameState('gameOver'), 1500)
              }
              return newScore
            })
            lastScorerRef.current = 'red'
          }
          sounds.goal()
          goalCelebrationRef.current = 1500
          setGameState('goal')
          return
        }
        
        // Apply gravity when ball is within gravity radius
        if (dist < goal.gravityRadius && dist > 0) {
          const gravityStrength = 400 * (1 - dist / goal.gravityRadius) // Stronger as it gets closer
          const nx = dx / dist
          const ny = dy / dist
          ball.vel.x += nx * gravityStrength * dt
          ball.vel.y += ny * gravityStrength * dt
        }
      }

      // Ball collision with walls (no more goal openings in walls)
      if (ball.pos.x < field.left + ball.radius) {
        ball.pos.x = field.left + ball.radius
        ball.vel.x *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.x > field.right - ball.radius) {
        ball.pos.x = field.right - ball.radius
        ball.vel.x *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.y < field.top + ball.radius) {
        ball.pos.y = field.top + ball.radius
        ball.vel.y *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.y > field.bottom - ball.radius) {
        ball.pos.y = field.bottom - ball.radius
        ball.vel.y *= -0.8
        sounds.wallBounce()
      }

      // Ball collision with bumpers
      for (const bumper of bumpersRef.current) {
        // Decay hit timer
        if (bumper.hitTimer > 0) {
          bumper.hitTimer -= dt * 1000
        }
        
        const dx = ball.pos.x - bumper.pos.x
        const dy = ball.pos.y - bumper.pos.y
        const dist = Math.hypot(dx, dy)
        const minDist = ball.radius + bumper.radius
        if (dist < minDist && dist > 0) {
          const nx = dx / dist
          const ny = dy / dist
          const push = minDist - dist
          ball.pos.x += nx * push
          ball.pos.y += ny * push
          // Bounce with energy boost (like pinball)
          const dot = ball.vel.x * nx + ball.vel.y * ny
          ball.vel.x -= 2.5 * dot * nx
          ball.vel.y -= 2.5 * dot * ny
          // Add acceleration boost in bounce direction
          const boostSpeed = 150
          ball.vel.x += nx * boostSpeed
          ball.vel.y += ny * boostSpeed
          // Trigger animation
          bumper.hitTimer = 200
          sounds.bump()
        }
      }

      // Vehicle-Ball collision helper (vRadius defined above)
      const handleVehicleBallCollision = (vehicle: Vehicle) => {
        const bvDx = ball.pos.x - vehicle.pos.x
        const bvDy = ball.pos.y - vehicle.pos.y
        const bvDist = Math.hypot(bvDx, bvDy)
        const bvMinDist = ball.radius + vRadius
        if (bvDist < bvMinDist && bvDist > 0) {
          const nx = bvDx / bvDist
          const ny = bvDy / bvDist
          const push = bvMinDist - bvDist
          ball.pos.x += nx * push
          ball.pos.y += ny * push

          const relVelX = vehicle.vel.x - ball.vel.x
          const relVelY = vehicle.vel.y - ball.vel.y
          const relVelDot = relVelX * nx + relVelY * ny

          if (relVelDot > 0) {
            const kickPower = 1.8
            ball.vel.x += relVelDot * nx * kickPower
            ball.vel.y += relVelDot * ny * kickPower
            vehicle.vel.x -= relVelDot * nx * 0.3
            vehicle.vel.y -= relVelDot * ny * 0.3
            sounds.kick()
          }
        }
      }

      handleVehicleBallCollision(vehicle1)
      handleVehicleBallCollision(vehicle2)

      // Limit ball speed
      const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
      const maxBallSpeed = 600
      if (ballSpeed > maxBallSpeed) {
        ball.vel.x = (ball.vel.x / ballSpeed) * maxBallSpeed
        ball.vel.y = (ball.vel.y / ballSpeed) * maxBallSpeed
      }
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current
      const field = fieldRef.current

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Subtle scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // Draw field
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3

      // Field outline with rounded corners
      const cornerRadius = 30
      ctx.beginPath()
      ctx.moveTo(field.left + cornerRadius, field.top)
      ctx.lineTo(field.right - cornerRadius, field.top)
      ctx.arcTo(field.right, field.top, field.right, field.top + cornerRadius, cornerRadius)
      ctx.lineTo(field.right, field.bottom - cornerRadius)
      ctx.arcTo(field.right, field.bottom, field.right - cornerRadius, field.bottom, cornerRadius)
      ctx.lineTo(field.left + cornerRadius, field.bottom)
      ctx.arcTo(field.left, field.bottom, field.left, field.bottom - cornerRadius, cornerRadius)
      ctx.lineTo(field.left, field.top + cornerRadius)
      ctx.arcTo(field.left, field.top, field.left + cornerRadius, field.top, cornerRadius)
      ctx.closePath()
      ctx.stroke()

      // Goals - circles with gravity wells
      for (const goal of goalsRef.current) {
        const isScoring = gameState === 'goal' && drainAnimRef.current && 
          drainAnimRef.current.goalPos.x === goal.pos.x
        
        // Pulsing effect during goal celebration
        const pulseScale = isScoring ? 1 + Math.sin(Date.now() * 0.02) * 0.15 : 1
        const glowIntensity = isScoring ? 0.5 + Math.sin(Date.now() * 0.015) * 0.3 : 0
        
        // Ambient ripples emanating inward toward goal
        const goalRipples = ambientRipplesRef.current.filter(r => r.goalSide === goal.side)
        for (const ripple of goalRipples) {
          // Progress goes from 0 (at gravity radius) to 1 (at goal radius)
          const progress = (goal.gravityRadius - ripple.radius) / (goal.gravityRadius - goal.radius)
          const alpha = 0.1 + progress * 0.4 // Start light, get darker toward center
          ctx.strokeStyle = goal.side === 'left' ? `rgba(255, 68, 68, ${alpha})` : `rgba(68, 68, 255, ${alpha})`
          ctx.lineWidth = 1.5 + progress * 1.5 // Also get thicker
          ctx.beginPath()
          ctx.arc(goal.pos.x, goal.pos.y, ripple.radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        
        // Gravity radius indicator (subtle)
        ctx.strokeStyle = goal.side === 'left' ? 'rgba(255, 68, 68, 0.2)' : 'rgba(68, 68, 255, 0.2)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.arc(goal.pos.x, goal.pos.y, goal.gravityRadius * pulseScale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Glow effect when scoring
        if (isScoring && glowIntensity > 0) {
          const gradient = ctx.createRadialGradient(
            goal.pos.x, goal.pos.y, 0,
            goal.pos.x, goal.pos.y, goal.radius * pulseScale * 1.5
          )
          gradient.addColorStop(0, goal.side === 'left' ? `rgba(255, 68, 68, ${glowIntensity})` : `rgba(68, 68, 255, ${glowIntensity})`)
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulseScale * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        
        // Goal circle
        ctx.strokeStyle = goal.side === 'left' ? '#ff4444' : '#4444ff'
        ctx.lineWidth = isScoring ? 4 : 3
        ctx.beginPath()
        ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulseScale, 0, Math.PI * 2)
        ctx.stroke()
        
        // Goal fill
        ctx.fillStyle = goal.side === 'left' ? 'rgba(255, 68, 68, 0.3)' : 'rgba(68, 68, 255, 0.3)'
        ctx.beginPath()
        ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulseScale, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw bumpers
      for (const bumper of bumpersRef.current) {
        const isHit = bumper.hitTimer > 0
        const hitProgress = isHit ? bumper.hitTimer / 200 : 0
        
        // Outer ring - expands when hit
        const outerExpand = isHit ? 1 + hitProgress * 0.4 : 1
        ctx.strokeStyle = isHit ? '#ffffff' : '#ffaa00'
        ctx.lineWidth = isHit ? 3 : 2
        ctx.beginPath()
        ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius * outerExpand, 0, Math.PI * 2)
        ctx.stroke()
        
        // Inner ring - stays fixed
        ctx.strokeStyle = '#ffaa00'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius * 0.6, 0, Math.PI * 2)
        ctx.stroke()
        
        // Cross hatching in center
        const innerR = bumper.radius * 0.5
        ctx.strokeStyle = isHit ? '#ffffff' : '#ffaa00'
        ctx.lineWidth = 1
        // Diagonal lines one direction
        for (let i = -2; i <= 2; i++) {
          const offset = i * 8
          const x1 = bumper.pos.x + offset - innerR
          const y1 = bumper.pos.y - innerR
          const x2 = bumper.pos.x + offset + innerR
          const y2 = bumper.pos.y + innerR
          ctx.beginPath()
          ctx.moveTo(Math.max(bumper.pos.x - innerR, x1), Math.max(bumper.pos.y - innerR, y1 + (Math.max(bumper.pos.x - innerR, x1) - x1)))
          ctx.lineTo(Math.min(bumper.pos.x + innerR, x2), Math.min(bumper.pos.y + innerR, y2 - (x2 - Math.min(bumper.pos.x + innerR, x2))))
          ctx.stroke()
        }
        // Diagonal lines other direction
        for (let i = -2; i <= 2; i++) {
          const offset = i * 8
          const x1 = bumper.pos.x + offset - innerR
          const y1 = bumper.pos.y + innerR
          const x2 = bumper.pos.x + offset + innerR
          const y2 = bumper.pos.y - innerR
          ctx.beginPath()
          ctx.moveTo(Math.max(bumper.pos.x - innerR, x1), Math.min(bumper.pos.y + innerR, y1 - (Math.max(bumper.pos.x - innerR, x1) - x1)))
          ctx.lineTo(Math.min(bumper.pos.x + innerR, x2), Math.max(bumper.pos.y - innerR, y2 + (x2 - Math.min(bumper.pos.x + innerR, x2))))
          ctx.stroke()
        }
      }

      // Draw ball
      const ball = ballRef.current
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2)
      ctx.stroke()

      // Draw vehicle helper function
      const drawVehicle = (vehicle: Vehicle) => {
        const color = vehicle.side === 'left' ? '#ff4444' : '#4444ff'
        ctx.save()
        ctx.translate(vehicle.pos.x, vehicle.pos.y)
        ctx.rotate(vehicle.angle)
        ctx.strokeStyle = color
        ctx.lineWidth = 2

        // Four tires
        const drawTire = (tx: number, ty: number) => {
          const tireWidth = 8
          const tireHeight = 4
          ctx.beginPath()
          ctx.rect(tx - tireWidth / 2, ty - tireHeight / 2, tireWidth, tireHeight)
          ctx.stroke()
          const treadSpacing = 3
          for (let i = -1; i <= 1; i++) {
            const xOff = ((i * treadSpacing + vehicle.wheelAngle * 3) % (treadSpacing * 3)) - treadSpacing * 1.5
            if (xOff > -tireWidth / 2 && xOff < tireWidth / 2) {
              ctx.beginPath()
              ctx.moveTo(tx + xOff, ty - tireHeight / 2)
              ctx.lineTo(tx + xOff, ty + tireHeight / 2)
              ctx.stroke()
            }
          }
        }

        drawTire(7, -8)
        drawTire(7, 8)
        drawTire(-7, -8)
        drawTire(-7, 8)

        // Body
        ctx.beginPath()
        ctx.moveTo(12, -6)
        ctx.lineTo(12, 6)
        ctx.lineTo(-10, 6)
        ctx.lineTo(-12, 4)
        ctx.lineTo(-12, -4)
        ctx.lineTo(-10, -6)
        ctx.closePath()
        ctx.stroke()

        // Front bumper (for pushing)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(12, -7)
        ctx.lineTo(15, -5)
        ctx.lineTo(15, 5)
        ctx.lineTo(12, 7)
        ctx.stroke()

        ctx.restore()
      }

      // Draw both vehicles
      drawVehicle(vehicle1Ref.current)
      drawVehicle(vehicle2Ref.current)

      // Score display - Red (WASD) on left, Blue (Arrows) on right
      ctx.font = '48px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ff4444'
      ctx.fillText(redScore.toString(), width * 0.25, 40)
      ctx.fillStyle = '#4444ff'
      ctx.fillText(blueScore.toString(), width * 0.75, 40)

      // Goal celebration effects
      if (gameState === 'goal') {
        // Screen flash effect
        if (goalFlashRef.current > 0) {
          ctx.fillStyle = lastScorerRef.current === 'blue' 
            ? `rgba(68, 68, 255, ${goalFlashRef.current * 0.3})` 
            : `rgba(255, 68, 68, ${goalFlashRef.current * 0.3})`
          ctx.fillRect(0, 0, width, height)
        }
        
        // Draw ripples - rushing inward with increasing intensity
        for (const ripple of ripplesRef.current) {
          const startRadius = 400
          const endRadius = ripple.maxRadius
          const progress = (startRadius - ripple.radius) / (startRadius - endRadius)
          const alpha = 0.3 + progress * 0.7 // Start light, get bright toward center
          ctx.strokeStyle = ripple.color
          ctx.globalAlpha = alpha
          ctx.lineWidth = 2 + progress * 4 // Get thicker as it rushes in
          ctx.beginPath()
          ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        
        // Pulsing GOAL text
        const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.15
        ctx.font = `${Math.floor(64 * pulse)}px monospace`
        ctx.fillStyle = lastScorerRef.current === 'blue' ? '#4444ff' : '#ff4444'
        ctx.textAlign = 'center'
        
        // Text glow effect
        ctx.shadowColor = lastScorerRef.current === 'blue' ? '#4444ff' : '#ff4444'
        ctx.shadowBlur = 20
        ctx.fillText('GOAL!', width / 2, height / 2)
        ctx.fillText('GOAL!', width / 2, height / 2) // Draw twice for stronger glow
        ctx.shadowBlur = 0
      }
    }

    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      update(dt)
      draw()

      animationId = requestAnimationFrame(gameLoop)
    }

    animationId = requestAnimationFrame(gameLoop)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, gameMode, startGame, generateField, resetPositions, onExit, menuIndex, gameOverIndex, redScore, blueScore])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] font-mono">KICKBALL</h1>
            <p className="text-[#00ff88]/60 text-sm mb-8 tracking-widest">PUSH THE BALL INTO THE GOAL</p>
            <div className="flex flex-col gap-3">
              {['1 Player', '2 Players', 'Exit'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) { setGameMode('1p'); startGame() }
                    else if (i === 1) { setGameMode('2p'); startGame() }
                    else onExit()
                  }}
                  className={`px-8 py-3 border-2 font-mono uppercase tracking-widest transition-colors ${
                    menuIndex === i
                      ? 'border-[#00ff88] bg-[#00ff88] text-black'
                      : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-8 text-[#00ff88]/50 text-xs tracking-widest">
              <p>Arrow Keys to move</p>
              <p className="mt-1">2P: WASD + Arrows</p>
              <p className="mt-1">First to 5 goals wins!</p>
            </div>
          </div>
        </div>
      )}

      {/* Paused */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] font-mono">PAUSED</h2>
            <p className="text-[#00ff88]/60 text-sm tracking-widest">Press P or ESC to resume</p>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h2 className="text-4xl text-[#00ff88] mb-2 tracking-[0.3em] font-mono">GAME OVER</h2>
            <p className={`text-2xl mb-6 font-mono ${redScore >= 5 ? 'text-[#ff4444]' : 'text-[#4444ff]'}`}>
              {redScore >= 5 ? 'RED WINS!' : 'BLUE WINS!'}
            </p>
            <p className="text-[#00ff88]/60 text-lg mb-6 font-mono">
              Final Score: <span className="text-[#ff4444]">{redScore}</span> - <span className="text-[#4444ff]">{blueScore}</span>
            </p>
            <div className="flex flex-col gap-3">
              {['Play Again', 'Main Menu', 'Exit'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) startGame()
                    else if (i === 1) setGameState('menu')
                    else onExit()
                  }}
                  className={`px-8 py-3 border-2 font-mono uppercase tracking-widest transition-colors ${
                    gameOverIndex === i
                      ? 'border-[#00ff88] bg-[#00ff88] text-black'
                      : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
