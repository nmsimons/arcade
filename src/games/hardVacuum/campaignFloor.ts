import type { Expedition, ExpeditionRuntime } from './expedition'
import { havenPosition, havenReady } from './campaign.ts'
import { BERTHS } from './campaignWorld.ts'
import { havenLinkDeployment } from './havenActivation.ts'
import type { FloorHint } from './trainingRender'

type FloorRuntime=Pick<ExpeditionRuntime,'havenLinkRetraction'>
export const havenDockStencilVisible=(state:Expedition,runtime:FloorRuntime)=>havenReady(state) && havenLinkDeployment(state,runtime)===0

/** Controls are fixed world markings, not proximity-triggered HUD prompts. */
export function drawCampaignFloor(ctx: CanvasRenderingContext2D, state: Expedition, hint: FloorHint, runtime:FloorRuntime) {
  const haven=havenPosition(state)
  ctx.save();ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#7b9eab'
  if(havenDockStencilVisible(state,runtime)) {
    ctx.textBaseline='middle';ctx.fillStyle='#86aa98'
    ctx.fillText(`Dock · ${hint('interact','E')}`,haven.x,haven.y)
  }
  for(const berth of BERTHS) {
    if(berth.id===state.campaign.berth || !state.campaign.berths.includes(berth.id)) continue
    ctx.fillText(havenReady(state) ? `Call Haven · ${hint('interact','E')}` : 'HAVEN IN TRANSIT',berth.pos.x,berth.pos.y)
  }
  ctx.restore()
}
