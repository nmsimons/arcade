import { prepareLevelRopes } from './level'
import type { JumpLevel } from './level'

self.onmessage = (event: MessageEvent<JumpLevel>) => {
  self.postMessage(prepareLevelRopes(event.data))
}
