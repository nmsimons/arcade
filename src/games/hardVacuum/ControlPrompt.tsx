import { useControlHints } from './controlHints'
import type { HintAction } from './controlHints'

export function ControlPrompt({ action, keyboard }: { action: HintAction; keyboard: string }) {
  return <>{useControlHints().hint(action, keyboard)}</>
}

/** Keyboard mnemonics become explicit controller badges in the flight HUD. */
export function ControlLabel({ label, action, keyboard }: { label: string; action: HintAction; keyboard: string }) {
  const { connected, hint } = useControlHints()
  const index = connected ? -1 : label.toLowerCase().indexOf(keyboard.toLowerCase())
  return <>{index < 0 ? label : <>{label.slice(0, index)}<span className="underline underline-offset-2">{label[index]}</span>{label.slice(index + 1)}</>}
    {connected && <kbd className="hud-control-hint">{hint(action, keyboard)}</kbd>}
  </>
}
