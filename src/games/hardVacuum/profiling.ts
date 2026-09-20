export type ProfileSection = 'collisions' | 'geometry' | 'radiation-dose' | 'radiation-footprint'
type Profiler = { now: () => number; sample: (section: ProfileSection, milliseconds: number) => void }
let profiler: Profiler | undefined

/** Opt-in benchmark instrumentation. No browser/clock access or allocation when disabled. */
export const configureProfiling = (next?: Profiler) => { profiler = next }
export const profileStart = () => profiler?.now()
export const profileEnd = (section: ProfileSection, start?: number) => {
  if (start !== undefined && profiler) profiler.sample(section, profiler.now() - start)
}
