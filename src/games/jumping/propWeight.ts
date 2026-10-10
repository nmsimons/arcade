export type PropWeight = 'light' | 'normal' | 'heavy'

/** Weight changes inertia, water displacement and gravity-plate lift together.
 * Normal preserves existing props; light rests at quarter immersion, heavy sinks. */
export const propWeightScale = (prop: { weight?: PropWeight }) => prop.weight === 'light' ? .5 : prop.weight === 'heavy' ? 3 : 1
