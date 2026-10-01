/** Night brightness is shared by gameplay, previews and thumbnails.
 * Retired level-file ambient values do not alter it. */
export const ambientExposure = (ambient: number) => { void ambient; return .35 }
export const ambientLightFraction = (ambient: number) => (ambientExposure(ambient) - .35) / .65

/** Older experimental files encoded daytime as ambient 100. New saves are explicit. */
export const nightModeEnabled = (lighting?: { ambient: number; nightMode?: boolean }) => !!lighting && (lighting.nightMode ?? lighting.ambient < 100)
