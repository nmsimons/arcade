/** Night-mode ambient is a smooth 35–57% exposure range. */
export const ambientExposure = (ambient: number) => .35 + .22 * Math.max(0, Math.min(1, ambient / 100))
/** Preserve source/beam haze at equivalent exposure on the original art scale. */
export const ambientLightFraction = (ambient: number) => (ambientExposure(ambient) - .35) / .65
export const lightingPlayerInk = (nightMode: boolean) => nightMode ? 'rgb(244,242,233)' : 'rgb(48,60,54)'

/** Older experimental files encoded daytime as ambient 100. New saves are explicit. */
export const nightModeEnabled = (lighting?: { ambient: number; nightMode?: boolean }) => !!lighting && (lighting.nightMode ?? lighting.ambient < 100)
