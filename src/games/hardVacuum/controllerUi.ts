import { dialogButtons, isDialogControl, isVisibleControl, moveDialogSelection, restoreDialogSelection, scrollDialog } from './dialogNavigation'
import type { ControllerNavigation } from './controllerInput'
export { scrollDialog }

/** Only operate inside this game's visible modal; never click a background HUD control. */
export function controllerDialog(root: HTMLElement | null) {
  return root && [...root.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
    .filter(isVisibleControl).at(-1)
}
export function controlDialog(dialog: HTMLElement, action: ControllerNavigation | 'confirm' | 'back') {
  dialog.dataset.inputMethod = 'controller'
  if (action !== 'confirm' && action !== 'back') { moveDialogSelection(dialog, action); return }
  if (action === 'confirm') {
    const button = document.activeElement
    if (isDialogControl(button) && dialogButtons(dialog).includes(button)) button.click()
    else restoreDialogSelection(dialog)
    return
  }
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}
