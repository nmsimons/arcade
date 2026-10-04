import { nightModeEnabled } from './ambientLight.ts'
import { levelLightCount } from './lightingDefinition.ts'
import { isPuzzleLevel, levelPlayer, parseLevel, prepareLevelRopes } from './level'
import type { JumpLevel } from './level'
import { createRun } from './challenge'
import type { PreparationReply } from './levelPreparation'
import { staticCasters } from './lightingModel'

self.onmessage = (event: MessageEvent<{ level: JumpLevel; play: boolean }>) => {
  let reply: PreparationReply
  try {
    // Editor sketches are derived geometry, not saved rest states.
    const input = event.data.level
    for (const rope of input.climbables.ropes) if (rope.rest?.key.startsWith('preview:')) delete rope.rest
    const level = prepareLevelRopes(parseLevel(input))
    const run = event.data.play && isPuzzleLevel(level) ? createRun(level) : null
    reply = { result: { level, run, player: event.data.play ? run?.player ?? levelPlayer(level, true) : null,
      ...(!nightModeEnabled(level.lighting) || levelLightCount(level) ? { lighting: staticCasters({ level }) } : {}) } }
  } catch (error) { reply = { error: error instanceof Error ? error.message : 'This level could not be prepared.' } }
  self.postMessage(reply)
}
