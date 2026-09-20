import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlHint, controlText } from '../src/games/hardVacuum/controlHints.ts'
import { DEFAULT_CONTROLLER_LAYOUT } from '../src/games/hardVacuum/controllerLayouts.ts'

test('control prompts use connection state, not which input was last used', () => {
  assert.equal(controlHint(false, 'back', 'Esc'), 'Esc')
  assert.equal(controlHint(true, 'back', 'Esc'), 'B / ○')
  assert.equal(controlHint(true, 'tether', 'F'), 'RB / R1')
  assert.equal(controlHint(true, 'reverse', 'S'), 'LT / L2')
  assert.equal(controlHint(true, 'turnLeft', 'A'), 'LS ←')
})

test('tutorial, docking and equipment text changes only recognized control references', () => {
  const copy = 'Press F to grapple. F releases the cable; S brakes or reverses.'
  assert.equal(controlText(copy, false), copy)
  assert.equal(controlText(copy, true), 'Press RB / R1 to grapple. RB / R1 releases the cable; LT / L2 brakes or reverses.')
  assert.equal(controlText('Dock · E', true), 'Dock · Y / △')
  assert.equal(controlText('Call Haven · E', true), 'Call Haven · Y / △')
  assert.equal(controlText('B · Heavy red bolts', true), 'B / ○ · Heavy red bolts')
  assert.equal(controlText('T · Return to Haven', true), 'X / □ · Return to Haven')
  assert.equal(controlText('Grade B; sector F; SALVAGE AUTHORITY.', true), 'Grade B; sector F; SALVAGE AUTHORITY.')
})

test('hints consume the selected layout, including future button/axis presets', () => {
  const layout = { ...DEFAULT_CONTROLLER_LAYOUT, buttons: { ...DEFAULT_CONTROLLER_LAYOUT.buttons, tether: 4, back: 2 }, axes: { ...DEFAULT_CONTROLLER_LAYOUT.axes, turn: 2 } }
  assert.equal(controlHint(true, 'back', 'Esc', layout), 'X / □')
  assert.equal(controlHint(true, 'turnRight', 'D', layout), 'RS →')
  assert.equal(controlText('press F to connect', true, layout), 'press LB / L1 to connect')
})
