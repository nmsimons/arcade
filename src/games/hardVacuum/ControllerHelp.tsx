import { controllerMenuHelp, DEFAULT_CONTROLLER_LAYOUT } from './controllerLayouts'
import type { ControllerLayout } from './controllerLayouts'

export function ControllerHelp({ layout = DEFAULT_CONTROLLER_LAYOUT, map = false }: { layout?: ControllerLayout; map?: boolean }) {
  return <p className="dialog-controller-help">{controllerMenuHelp(layout, map)}</p>
}
