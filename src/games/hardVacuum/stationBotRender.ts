import { drawStationBotModel } from './stationBotModels'
import { BOT_STATIONS, botGarageDoors, botGarageProgress, botGarageWalls } from './stationBots'
import type { BotRuntime } from './stationBots'
import type { Expedition } from './expedition'
import { expeditionMap } from './expedition'
import { raycastCavern } from './worldGeometry'

export function drawStationBots(ctx: CanvasRenderingContext2D, runtime: BotRuntime, state: Expedition, time: number) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0
  for (const spec of BOT_STATIONS) {
    const powered = !!state.power[spec.power]
    for (const shape of [...botGarageWalls(spec),...botGarageDoors(spec,botGarageProgress(state,spec))]) {
      ctx.beginPath(); shape.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath()
      ctx.fillStyle='#192921'; ctx.fill(); ctx.strokeStyle='#749382'; ctx.lineWidth=1.5; ctx.stroke()
    }
    ctx.save(); ctx.translate(spec.home.x, spec.home.y)
    ctx.strokeStyle = powered ? '#b4d99c' : '#67786b'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-30,-12); ctx.lineTo(-30,12); ctx.stroke()
    ctx.strokeStyle='#71887944'; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(47,-26); ctx.lineTo(78,-26); ctx.moveTo(47,26); ctx.lineTo(78,26); ctx.stroke()
    ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = state.power[spec.power] ? '#b7bb8a88' : '#63776e88'
    ctx.fillText(spec.kind === 'tug' ? 'SORT / RETURN' : 'SECURITY BUS', 0, 42)
    ctx.restore()
  }
  for (const bot of runtime.units) {
    if (bot.health <= 0) continue
    const rig=bot.maintenance,hook=rig?.hook
    if (bot.target || hook) {
      const end=bot.target?.pos ?? hook!.pos,dx=end.x-bot.pos.x,dy=end.y-bot.pos.y,d=Math.max(1,Math.hypot(dx,dy))
      const tip={x:end.x-dx/d*(bot.target?.radius ?? 0)*.8,y:end.y-dy/d*(bot.target?.radius ?? 0)*.8}
      const slack=Math.max(0,(rig?.cableLength ?? 92)-d)*.3
      ctx.strokeStyle=d>(rig?.cableLength ?? 92)+8 ? '#f1c386' : '#b89869';ctx.lineWidth=1.4
      ctx.beginPath();ctx.moveTo(bot.pos.x,bot.pos.y);ctx.quadraticCurveTo(bot.pos.x+dx*.5-dy/d*slack,bot.pos.y+dy*.5+dx/d*slack,tip.x,tip.y);ctx.stroke()
      ctx.save();ctx.translate(tip.x,tip.y);ctx.rotate(hook ? Math.atan2(hook.vel.y,hook.vel.x) : Math.atan2(dy,dx))
      ctx.strokeStyle='#ffe0a7';ctx.lineWidth=1.6
      ctx.beginPath();ctx.moveTo(-7,-5);ctx.lineTo(2,-5);ctx.lineTo(5,0);ctx.lineTo(2,5);ctx.lineTo(-7,5);ctx.stroke();ctx.restore()
    }
    if (rig?.windup!==undefined) {
      // The jaws charge at the actual launch socket, without a targeting HUD.
      ctx.save();ctx.translate(bot.pos.x,bot.pos.y);ctx.rotate(bot.angle)
      ctx.strokeStyle=`rgba(255,213,144,${.55+.4*Math.sin(time*32)**2})`;ctx.lineWidth=2
      ctx.beginPath();ctx.moveTo(17,-10);ctx.lineTo(28,-6);ctx.moveTo(17,10);ctx.lineTo(28,6);ctx.stroke();ctx.restore()
    }
    if (bot.phase === 'charge' || bot.phase === 'burst') {
      const direction = { x: Math.cos(bot.aim), y: Math.sin(bot.aim) }, length = raycastCavern(bot.pos,direction,490,expeditionMap(state))
      ctx.strokeStyle = bot.timer < .4 || bot.phase === 'burst' ? '#ff9878b0' : '#ff987840'; ctx.lineWidth = 1
      ctx.setLineDash(bot.timer > .4 && bot.phase === 'charge' ? [3,12] : [])
      ctx.beginPath(); ctx.moveTo(bot.pos.x+direction.x*22,bot.pos.y+direction.y*22); ctx.lineTo(bot.pos.x+direction.x*length,bot.pos.y+direction.y*length); ctx.stroke(); ctx.setLineDash([])
    }
    drawStationBotModel(ctx,bot,time)
  }
  for (const shot of runtime.shots) {
    ctx.strokeStyle = '#ffab89'; ctx.lineWidth = 2.2
    const speed = Math.hypot(shot.vel.x,shot.vel.y)
    ctx.beginPath(); ctx.moveTo(shot.pos.x-shot.vel.x/speed*11,shot.pos.y-shot.vel.y/speed*11); ctx.lineTo(shot.pos.x,shot.pos.y); ctx.stroke()
  }
  ctx.restore()
}
