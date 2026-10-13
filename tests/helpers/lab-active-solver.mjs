// Opt-in preload for running existing physics and replay regressions with the
// experimental scheduler. Each Node test process owns an independent module.
import { setLabSolverEnabled } from '../../src/games/jumping/labSolver.ts'
setLabSolverEnabled(true)
