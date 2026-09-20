export type ShopUpgrade = 'hull' | 'capacitor' | 'winch' | 'focus'
export type ShipUpgrade = ShopUpgrade
export type UpgradeLevels = Partial<Record<ShopUpgrade, number>>
export interface UpgradeState { upgrades: readonly string[]; upgradeLevels?: UpgradeLevels; impactShieldInstalled?: boolean }

export const UPGRADE_COSTS = [750, 1500, 3000, 6000, 10000] as const
export const SHOP: readonly { id: ShopUpgrade; name: string; values: readonly number[] }[] = [
  { id: 'hull', name: 'Reinforced hull', values: [2, 3, 4, 5, 6, 8] },
  { id: 'capacitor', name: 'Beam capacitor', values: [500, 750, 1000, 1250, 1500, 2000] },
  { id: 'winch', name: 'Longline winch', values: [1, 2] },
  { id: 'focus', name: 'Laser focus', values: [400, 300, 250, 200, 150, 100] },
]
export const SHIP_UPGRADES: readonly ShipUpgrade[] = SHOP.map(item=>item.id)

export function upgradeLevel(state: UpgradeState, id: ShopUpgrade): number {
  const saved = state.upgradeLevels?.[id]
  if (id === 'winch') return (saved ?? (state.upgrades.includes(id) ? 1 : 0)) > 0 ? 1 : 0
  if (saved !== undefined) return saved
  // Older purchases keep their exact effects when moved onto staged tracks.
  if (id === 'focus' && state.upgrades.includes('focus2')) return 5
  if (!state.upgrades.includes(id)) return 0
  return 2
}

export const upgradeValue = (state: UpgradeState, id: ShopUpgrade) => SHOP.find(item => item.id === id)!.values[upgradeLevel(state, id)]
export const impactShieldCapacity = (state: UpgradeState) => state.impactShieldInstalled ? upgradeValue(state, 'hull') : 0
export const laserCapacityMs = (state: UpgradeState) => upgradeValue(state, 'capacitor')
export const tetherReachMultiplier = (state: UpgradeState) => upgradeValue(state, 'winch')

const displayValue = (id: ShopUpgrade, value: number) => {
  if (id === 'hull') return `${value} shields`
  if (id === 'capacitor') return `${value / 1000} s firing time`
  if (id === 'winch') return `${value}× tether reach`
  return `${value} ms contact`
}

export function upgradeOffer(state: UpgradeState, id: ShipUpgrade) {
  const item = SHOP.find(item => item.id === id)!
  const level = upgradeLevel(state, id), maxLevel = item.values.length - 1
  const maxed = level >= maxLevel, stage = Math.min(level + 1, maxLevel)
  const name = maxLevel === 1 ? item.name : `${item.name} ${['I', 'II', 'III', 'IV', 'V'][stage - 1]}`
  const current = displayValue(id, item.values[level])
  const locked = id === 'hull' && !state.impactShieldInstalled
  return {
    id, name, stage, level, maxLevel, maxed, locked, cost: maxed ? 0 : UPGRADE_COSTS[level],
    detail: locked ? 'Recover and install the impact shield first.' : maxed ? `${current} · ${maxLevel === 1 ? 'Installed.' : `All ${maxLevel} stages installed.`}` : `${current} → ${displayValue(id, item.values[stage])}`,
  }
}
