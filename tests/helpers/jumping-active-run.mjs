import { createRun, stepRun } from '../../src/games/jumping/challenge.ts'
import { entranceDuration } from '../../src/games/jumping/goal.ts'
import { NEUTRAL_INPUT } from '../../src/games/jumping/model.ts'

export * from '../../src/games/jumping/challenge.ts'
/** Physics recordings begin exactly when the entrance finishes, before a gameplay tick. */
export function createActiveRun(level) {
  const run = createRun(level)
  stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
  return run
}
export { createActiveRun as createRun }
