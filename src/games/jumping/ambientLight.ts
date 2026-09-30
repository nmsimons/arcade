export const MIN_NIGHT_AMBIENT = 35
export const MAX_NIGHT_AMBIENT = 45
export const NIGHT_AMBIENT_KEY = 'arcade.jumping.night-ambient.v1'
export const clampNightAmbient = (value: number) => Number.isFinite(value)
  ? Math.max(MIN_NIGHT_AMBIENT, Math.min(MAX_NIGHT_AMBIENT, Math.round(value))) : MIN_NIGHT_AMBIENT

/** Ignore retired level-file ambient values. The optional player preference is
 * a brightness percentage, independent of the authored lighting definition. */
export const ambientExposure = (_ambient: number, nightAmbient = MIN_NIGHT_AMBIENT) => clampNightAmbient(nightAmbient) / 100
export const ambientLightFraction = (ambient: number, nightAmbient = MIN_NIGHT_AMBIENT) => (ambientExposure(ambient, nightAmbient) - .35) / .65

export function readNightAmbient() {
  try {
    const saved = localStorage.getItem(NIGHT_AMBIENT_KEY)
    return saved === null || !saved.trim() ? MIN_NIGHT_AMBIENT : clampNightAmbient(Number(saved))
  } catch { return MIN_NIGHT_AMBIENT }
}
export function saveNightAmbient(value: number) {
  try { localStorage.setItem(NIGHT_AMBIENT_KEY, String(clampNightAmbient(value))) }
  catch { /* Keep the preference for this visit when storage is unavailable. */ }
}

/** Older experimental files encoded daytime as ambient 100. New saves are explicit. */
export const nightModeEnabled = (lighting?: { ambient: number; nightMode?: boolean }) => !!lighting && (lighting.nightMode ?? lighting.ambient < 100)
