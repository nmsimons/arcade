import { controllerMenuHelp } from './controllerLayouts'
import type { ControllerLayout } from './controllerLayouts'
import { useControlHints } from './controlHints'

export function ControllerHelp({ layout: override, map = false }: { layout?: ControllerLayout; map?: boolean }) {
  const { connected, layout: activeLayout } = useControlHints()
  const layout = override ?? activeLayout
  return <div className="menu-help">
    {connected ? <p className="dialog-controller-help">{controllerMenuHelp(layout, map)}</p>
      : <p className="dialog-keyboard-help">{map ? '↑ ↓ ← → / Tab' : 'Arrows / Tab'} <span>Move</span> · Enter / Space <span>Select</span> · Esc <span>Back</span>{!map && <> · PgUp / PgDn <span>Scroll</span></>}</p>}
  </div>
}
