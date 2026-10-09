import type { Player } from './model.ts'
import { ledgeLanding, loweringOption, verticalClimbOption } from './model.ts'
import { mirrorLadder, mirrorPlatform } from './gravityFrame.ts'
import { NO_CLIMBABLES } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'
import { platformLedges } from './terrainLedges.ts'

export type ActionFeedback = { kind: 'lower'; inverted: boolean }
  | { kind: 'hang'; jumpHeld: boolean; downLocked: boolean; upLocked: boolean; pullUp: boolean }
  | { kind: 'climb'; jumpHeld: boolean }
  | { kind: 'crouch' | 'lowering' | 'water' | 'water-bottom' }
  | { kind: 'water-prop'; grippable: boolean }

/** Describe the solved physical state without advancing input, pose or time. */
export function playerActionFeedback(player: Player, climbables: ClimbableWorld = NO_CLIMBABLES): ActionFeedback | null {
  const p = player.inverted ? {...player,y:-player.y,inverted:false,terrain:player.terrain?.map(mirrorPlatform),
    ropes:player.ropes?.map(rope=>({...rope,nodes:rope.nodes.map(node=>({...node,y:-node.y,oldY:-node.oldY})),
      bends:rope.bends.map(point=>point? [point[0],-point[1]] as [number,number]:null)}))??null,
    hang:player.hang && {...player.hang,edgeY:-player.hang.edgeY,slope:-(player.hang.slope??0)} } : player
  if (p.mantle?.descending) return {kind:'lowering'}
  if (p.hang) return {kind:'hang',jumpHeld:p.jumpHeld,downLocked:!!p.hang.dropLocked,
    upLocked:!!p.hang.upLocked,pullUp:!!ledgeLanding(p.terrain??[],p.hang,p.hang.braced)}
  if (p.climbing) return {kind:'climb',jumpHeld:p.jumpHeld}
  if (p.mantle) return null
  if (p.grounded && !p.jumpHeld) {
    if (loweringOption(p)) return {kind:'lower',inverted:!!player.inverted}
    const world = player.inverted ? {...climbables,ladders:climbables.ladders.map(mirrorLadder)} : climbables
    if (verticalClimbOption(p,world,p.terrain??[],-1,player.inverted?-1:1)) return {kind:'climb',jumpHeld:false}
  }
  if (p.waterMotion && !p.jumpLift && !p.waterJump) {
    if (p.grounded) return {kind:'water-bottom'}
    const contacted = p.contacts?.push?.collider
    // The collision world disables unsupported/unstable crate ledges and all
    // ball grips. Use that same published capability rather than promising a
    // grab merely because the swimmer is pressing an object.
    if (contacted?.prop) return {kind:'water-prop',grippable:platformLedges(contacted.platform).length>0}
    return {kind:'water'}
  }
  if (!p.grounded) return null
  return {kind:'crouch'}
}

export function actionFeedbackText(feedback: ActionFeedback | null, device: 'keyboard' | 'controller' | 'touch') {
  if (!feedback) return ''
  const touch = device === 'touch'
  const up = touch ? 'Drag up' : device === 'controller' ? '↑' : 'Up'
  const down = touch ? 'Drag down' : device === 'controller' ? '↓' : 'Down'
  const jump = touch ? 'Tap' : device === 'controller' ? 'A / ×' : 'Space'
  const detach = touch ? 'Flick down and lift' : device === 'controller' ? 'B / ○' : 'X'
  switch (feedback.kind) {
    case 'lower': return `${feedback.inverted?up:down} to lower to a safe hang`
    case 'crouch': return `${down} to crouch`
    case 'lowering': return 'Lowering to a safe hang'
    case 'water': return `${down} to dive · ${up} to turn upright and float`
    case 'water-bottom': return `${down} to crouch · ${up} to turn upright and float`
    case 'water-prop': return feedback.grippable ? `${up} to grip · ${jump} first if out of reach · Move to push`
      : `Move to push · ${up} to turn upright and float`
    case 'climb': return feedback.jumpHeld ? touch ? 'Lift, then tap again to jump off' : `Release ${jump}, then press again to jump off`
      : `${up} / ${down} to climb · ${jump} to jump off`
    case 'hang': {
      const departure = feedback.jumpHeld ? touch ? 'Lift, then tap again to jump away' : `Release ${jump}, then press again to jump away`
        : `${jump} to jump away`
      const drop = feedback.downLocked ? touch ? 'Lift, then drag down again to drop' : `Release Down, then ${down} again to drop`
        : `${detach} to let go`
      const pull = feedback.upLocked ? touch ? 'Lift, then drag up again to pull up' : `Release Up, then ${up} again to pull up` : `${up} to pull up`
      return [feedback.pullUp?pull:'',departure,drop].filter(Boolean).join(' · ')
    }
  }
}
