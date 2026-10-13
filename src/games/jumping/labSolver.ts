let enabled = false
const metrics = { propQueries: 0, propSkipped: 0, propMutations: 0 }
export function setLabSolverEnabled(value: boolean) {
  enabled = value
  metrics.propQueries = 0; metrics.propSkipped = 0; metrics.propMutations = 0
}
export function labSolverEnabled() { return enabled }
export function labSolverStatus() { return { enabled, ...metrics } }
export function countLabSolver(metric: keyof typeof metrics) { metrics[metric]++ }
