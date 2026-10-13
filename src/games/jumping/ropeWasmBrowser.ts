import { installRopeWasm, setRopeWasmEnabled, ropeWasmStatus } from './ropeWasm.ts'
import { setLabSolverEnabled, labSolverStatus } from './labSolver.ts'

declare global { interface Window { labRopeWasm?: { status: typeof ropeWasmStatus }; labSolverExperiment?: { status: typeof labSolverStatus } } }

/** Experimental backend, deliberately opt-in while loaded-body parity is pending.
 * Asset URLs respect browser deployments under a base path and arcade://game/.
 */
export async function initializeRopeWasm() {
  setLabSolverEnabled(new URLSearchParams(location.search).get('labSolver') === 'active')
  if (labSolverStatus().enabled) window.labSolverExperiment = { status: labSolverStatus }
  if (new URLSearchParams(location.search).get('labRopes') !== 'wasm') return
  window.labRopeWasm = { status: ropeWasmStatus }
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}wasm/lab-rope.wasm`)
    if (!response.ok) throw new Error(`Rope Wasm returned ${response.status}`)
    await installRopeWasm(await response.arrayBuffer())
    setRopeWasmEnabled(true)
  } catch (error) {
    console.warn('LAB rope Wasm unavailable; using TypeScript.', error)
  }
}
