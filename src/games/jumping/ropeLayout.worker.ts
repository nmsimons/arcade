import { nightModeEnabled } from './ambientLight.ts'
import { levelLightCount } from './lightingDefinition.ts'
import { isRunLevel, levelPlayer, parseLevel, prepareLevelRopes } from './level'
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
    // Empty pods are set as the robot arrives, not read from a level file, so parsing would drop them.
    const parsed = parseLevel(input), level = prepareLevelRopes(input.vacantPods ? { ...parsed, vacantPods: input.vacantPods } : parsed)
    const run = event.data.play && isRunLevel(level) ? createRun(level) : null
    reply = { result: { level, run, player: event.data.play ? run?.player ?? levelPlayer(level, true) : null,
      ...(!nightModeEnabled(level.lighting) || levelLightCount(level) ? { lighting: staticCasters({ level }) } : {}) } }
  } catch (error) { reply = { error: error instanceof Error ? error.message : 'This level could not be prepared.' } }
  self.postMessage(reply)
}

// Static imports have loaded and the request handler is installed. The caller
// starts the separate, bounded geometry deadline only after this handshake.
self.postMessage({ ready: true } satisfies PreparationReply)
