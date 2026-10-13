/** Benchmark-only delegation. The production app never imports the probe. */
export function propProbePlugin() {
  return { name: 'lab-prop-probe', enforce: 'pre', transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/games/jumping/climbables.ts')) {
      const start=source.indexOf('export function stepRope('), at=source.indexOf('  const { nodes, definition } = rope',start)
      if(start<0 || at<0)throw new Error('Review rope probe boundary after source changes')
      return "import { stepRopeProbe } from '/tests/bench/labPropProbe.ts'\n" + source.slice(0,at)
        + '  if (stepRopeProbe(rope, dt, load)) return\n' + source.slice(at)
    }
    if (!id.replaceAll('\\', '/').endsWith('/src/games/jumping/propPhysics.ts')) return
    const marker = 'export function stepPropPhysics(run: Run, playerContact: PlayerContacts, dt: number, powered = run.empRemaining === 0) {'
    if (!source.includes(marker)) throw new Error('Review prop probe boundary after physics source changes')
    return "import { stepPropProbe } from '/tests/bench/labPropProbe.ts'\n" + source.replace(marker,
      marker + '\n  if (stepPropProbe(run, playerContact, dt, powered)) return')
  } }
}
