/**
 * Level power is out during an EMP outage and, once a timed run passes its D
 * deadline, for the rest of that run. Restart restores it.
 */
export const powerOut = (run: { readonly empRemaining: number; readonly failed?: boolean }) => run.empRemaining > 0 || !!run.failed
