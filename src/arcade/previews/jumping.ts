import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../../games/jumping/model'
import type { RobotState } from '../../games/jumping/challenge'
import { drawRepulsorBot } from '../../games/jumping/repulsorBotRender'
import { REPULSOR_BOT_SIZE } from '../../games/jumping/repulsorBotRig'
import { drawAthlete, drawLevelBackdrop, drawTerrain } from '../../games/jumping/render'
import { blankTrial } from '../../games/jumping/level'
import type { Platform } from '../../games/jumping/model'
import { NIGHT_PLAYER_COLOR } from '../../games/jumping/athlete'
import { drawAthleteLights } from '../../games/jumping/athleteDraw'
import { ambientExposure } from '../../games/jumping/ambientLight'
import { beamHazeStrength, drawLightFixtures, drawLightHaze } from '../../games/jumping/lightFixture'
import { drawProp } from '../../games/jumping/challengeRender'
import { presentedAthletePose } from '../../games/jumping/athletePose'
import { glancePose } from '../../games/jumping/idleGlance'

/** The ledges: the lower one, hazard-trimmed, under Rbot; the robot's, steel, with the crate on it. */
const LEDGES: Platform[] = [{ x: 0, y: 185, w: 120, h: 45, trim: 'hazard' }, { x: 175, y: 135, w: 185, h: 95, material: 'steel' }]
/**
 * The cover's room, lived in as the facility is (docs/jumping-wall-wear.md): a tiled wall, heavily stained, two
 * pipe runs along the top and down beside the crate weeping rust, and worn terrain. A fixed ID keeps its stains
 * the same on every draw.
 */
const ROOM = { ...blankTrial(), id: 'lab-cover', name: 'Cover', width: 360, height: 230, floor: 230, lighting: { nightMode: true, ambient: 0, lights: [] },
  wallFinish: 'tile' as const, platforms: LEDGES,
  pipes: [{ points: [[150, 18], [334, 18], [334, 135]] as [number, number][], size: 'small' as const },
    { points: [[196, 30], [320, 30], [320, 135]] as [number, number][], size: 'small' as const }] }

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // A still night scene: the pale figure stays legible at card size against the dark wall. Scale
  // uniformly and crop the surroundings instead of stretching the athlete.
  ctx.fillStyle = '#545452'; ctx.fillRect(0, 0, width, height)
  // Framed on the robot: the lamp and crate stay in a 316 by 202 view of the 360 by 230 scene.
  const scale = Math.max(width / 316, height / 202)
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-196, -112)
  // The wall at night: the room's backdrop at the game's ambient exposure.
  ctx.save(); ctx.filter = `brightness(${ambientExposure(0)})`
  drawLevelBackdrop(ctx, ROOM, { x: 0, y: 0, w: ROOM.width, h: ROOM.height }, scale)
  ctx.restore()
  // The lamp's upper edge crosses the robot at the waist: it lights the ledge, the robot's legs and the crate's
  // lower corner, and leaves the robot's face in the dark. Standing in the whole beam washed the robot out.
  const lamp = { id: 'cover', x: 86, y: 32, direction: 39, spread: 30, intensity: 100, power: 'always' as const, fade: 1 }
  const half = lamp.spread * Math.PI / 360
  const cone = (target: CanvasRenderingContext2D) => {
    target.translate(lamp.x, lamp.y); target.rotate(lamp.direction * Math.PI / 180)
    target.beginPath(); target.moveTo(0, 0)
    target.lineTo(500 * Math.cos(half), -500 * Math.sin(half)); target.lineTo(500 * Math.cos(half), 500 * Math.sin(half)); target.closePath()
  }
  ctx.save(); cone(ctx); ctx.fillStyle = '#f4f2e9'; ctx.globalAlpha = beamHazeStrength(0); ctx.fill(); ctx.restore()
  drawLightHaze(ctx, lamp, 0); drawLightFixtures(ctx, [lamp])
  ctx.save(); ctx.filter = `brightness(${ambientExposure(0)})`
  drawTerrain(ctx, LEDGES, LEDGES, ROOM)
  const crate = { kind: 'box' as const, x: 286, y: 135, size: 40, branded: true, angle: 0, angularVelocity: 0, vx: 0, vy: 0, grounded: true }
  drawProp(ctx, crate)
  ctx.restore()
  // The beam's edge catches the crate's lower corner.
  ctx.save(); ctx.save(); cone(ctx); ctx.restore(); ctx.clip(); drawProp(ctx, crate); ctx.restore()
  // Rbot creeps in on the lower floor from the left, out of the beam: lit as the game lights an unlit actor
  // at night, its body takes only the ambient and its visor glows.
  ctx.save(); ctx.beginPath(); ctx.rect(-200, -200, 760, 630); ctx.clip()
  drawRepulsorBot(ctx, rbotWalking(52, 185), true, (target, exposure, draw) => {
    target.save(); if (!exposure) target.filter = `brightness(${ambientExposure(0)})`; draw(); target.restore()
  })
  ctx.restore()
  // The robot stands on the ledge and looks out at the viewer, its head cocked, as it does in play when left
  // standing (idleGlance.ts). It is drawn as the game draws it at night: the body at the 65% readability floor,
  // and fully lit where the beam reaches it; its eyes, lights of their own, at full strength over it.
  const player = createPlayer({ x: 228, y: 135 }), pose = glancePose(presentedAthletePose(player), { face: 1, tilt: -.21 })
  ctx.save(); ctx.filter = 'brightness(.65)'; drawAthlete(ctx, player, NIGHT_PLAYER_COLOR, pose); ctx.restore()
  ctx.save(); ctx.save(); cone(ctx); ctx.restore(); ctx.clip(); drawAthlete(ctx, player, NIGHT_PLAYER_COLOR, pose); ctx.restore()
  drawAthleteLights(ctx, player, NIGHT_PLAYER_COLOR, pose)
  ctx.restore()
}

/** Rbot mid-stride, its feet at (x, y): walked there by the game's own controller, so its gait and planted feet
 * are real. Deterministic, so every draw of the cover is the same. */
function rbotWalking(x: number, y: number): RobotState {
  const walk = (from: number) => {
    const actor = createPlayer({ x: from, y }); actor.size = REPULSOR_BOT_SIZE; actor.facing = 1
    const floor = [{ x: from - 400, y, w: 800, h: 60 }]
    for (let i = 0; i < 160; i++) stepPlayer(actor, { ...NEUTRAL_INPUT, move: i < 30 ? 0 : .32 }, STEP, floor)
    return actor
  }
  // A first walk measures how far it goes; the second starts that far back so it ends where it is wanted.
  const actor = walk(x - (walk(0).x))
  return { actor, x: actor.x, y: actor.y, vx: actor.vx, angle: 0, facing: 1, phase: 'patrol', time: 0, seesPlayer: false } as unknown as RobotState
}
