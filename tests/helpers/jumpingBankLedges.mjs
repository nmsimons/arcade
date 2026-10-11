import { waterBindingLevel } from './jumpingWaterBindings.mjs'

/** An ordinary bank, with an outward side face and a gently uphill top. */
export function outwardBankLevel(direction = 1, lean = 10, uphill = .05) {
  const level = waterBindingLevel('bank', direction), bank = level.platforms[0]
  const rise = uphill * (bank.w - lean)
  bank.y -= rise; bank.h += rise
  const outline = [[lean, rise], [bank.w, 0], [bank.w, bank.h], [0, bank.h]]
  bank.polygon = outline.map(([x, y]) => [direction > 0 ? x : bank.w - x, y])
  level.id = `outward-bank-${direction}-${lean}-${uphill}`; level.name = 'Outward bank'
  return level
}
