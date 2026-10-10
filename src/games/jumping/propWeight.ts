export type PropWeight = 'normal' | 'heavy'

/** Weight changes inertia, water displacement and gravity-plate lift together.
 * Normal preserves existing props; heavy sinks. */
export const propWeightScale = (prop: { weight?: PropWeight }) => prop.weight === 'heavy' ? 3 : 1
