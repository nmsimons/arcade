/** Every night uses the original ambient-0 look. Keep the legacy argument for
 * older definitions; it no longer changes surface brightness or beam haze. */
export const ambientExposure: (ambient: number) => number = () => .35
export const ambientLightFraction: (ambient: number) => number = () => 0

/** Older experimental files encoded daytime as ambient 100. New saves are explicit. */
export const nightModeEnabled = (lighting?: { ambient: number; nightMode?: boolean }) => !!lighting && (lighting.nightMode ?? lighting.ambient < 100)
