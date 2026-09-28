import { staticCasters } from './lightingModel'
import type { JumpLevel } from './level'

self.onmessage = (event: MessageEvent<JumpLevel>) => {
  try { self.postMessage({ groups: staticCasters({ level: event.data }) }) }
  catch { self.postMessage({ error: 'Could not prepare lighting geometry.' }) }
}
