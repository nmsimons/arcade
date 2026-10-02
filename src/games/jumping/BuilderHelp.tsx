import { useLayoutEffect, useRef, useState } from 'react'
import type { Tool } from './editor'
import { BuilderIcon } from './BuilderIcon'

const SECTIONS = ['Canvas', 'Inspector', 'Objects', 'Levels', 'Shortcuts', 'Controller'] as const
type Section = typeof SECTIONS[number]
const OBJECT_NOTES: Partial<Record<Tool, string>> = {
  platform: 'Square handles resize the whole shape. A terrain shape must keep at least three nodes.',
  rope: 'An attached anchor moves with its terrain. Use the inspector to attach or detach it.',
  ladder: 'During play, Up and Down climb; jump leaves the ladder.',
  pusher: 'Drag either square handle on the patrol line to set its range, or edit the limits in the inspector. Headlight adds a narrow beam aimed ahead and downward in night mode; EMP switches it off. Shovebots chase the player, wind up, then charge. Their body pushes through contact. You can stand on top, but a sudden charge can pull the bot out from under your feet.',
  lift: 'Choose Always on for continuous cycling, or Switched to follow connected plates and coin switches. Turning off pauses it in place; turning on resumes its trip. Obstructions limit its travel.',
  'moving-platform': 'Works like an elevator, traveling horizontally. It carries riders and objects, pauses at each end, and reverses at obstructions. Travel distance sets the range; Flip horizontally reverses the direction without moving its starting position.',
  gate: 'Gates are 20 units thick. Vertical gates rise by their own height while activated.',
  'horizontal-gate': 'Horizontal gates are 20 units thick. Releasing the plate closes either kind of gate. If closing catches the player or an object, the gate reopens and waits for the path to clear.',
  plate: 'Pressure is on while held. Switch stays on after the first press. Toggle reverses on each press after release, with a Starts off or Starts on option. One plate can activate several switched items, including the exit.',
  light: 'Night mode belongs to the Inspector’s Level tab. Night mode off is fully lit. When on, every level uses the same dark background, keeping spotlights distinct. Turning Night mode off preserves the lamps. Direction is clockwise: 0 right, 90 down. Always on lights work until an EMP; Switched lights use one or more pressure plates or coin switches. Flicker adds irregular dimming and brief dropouts, like a malfunctioning lamp, in the studio and during play. Spotlights stay fixed on the back wall. Hold to preview and the canvas Lighting toggle never change saved settings.',
  timer: 'A six-by-two-square digital clock shows minutes and seconds up to 59:59. Stopwatch effects change the digit color and left status LED. Entering the open exit locks the time; results retain full precision.',
  text: 'Official uses clean lettering; Graffiti uses red marker lettering. Rotation turns the text around the center of its area, in degrees. Resize handles follow the rotated area. Text wraps inside its area; resize it to show more lines.',
  stopwatch: 'Each watch adds 10 seconds to the remaining pause. Collected watches return on restart.',
  'time-bonus': 'Seconds off sets the number inside the arrow, from 1 to 9. Collection subtracts that many elapsed seconds, stopping at zero. Any unused seconds are lost. Restarting restores the item.',
  'time-penalty': 'Seconds added sets the number inside the clockwise arrow, from 1 to 9. Collection immediately adds that many seconds, even while the clock is frozen. Restarting restores the item.',
  'fast-stopwatch': 'The clock runs at double speed for 5 seconds of gameplay. Extra fast watches extend the duration, never the speed. A normal stopwatch freezes the clock while both effects count down. Pausing the game pauses both effects; restarting clears them.',
  emp: 'Cuts power for 5 seconds. Gates, elevators, moving platforms, and shovebots stop in place, then resume. Spotlights fade off while ambient light stays unchanged. Always-on exits stay usable; switched exits follow their inputs. Pressure plates turn off. Switch and Toggle retain their state, but new presses wait for power. Coins still fill their switches, but a full switch waits for power before activating. Activated coin switches stay latched. Extra EMPs add 5 seconds; pausing pauses the outage, and restarting clears it.',
}
const SHORTCUTS = [
  { group: 'Controls', items: [['Arrow keys', 'Focus the control in that direction'], ['Enter', 'Activate a control or start editing a field'], ['Tab / Shift + Tab', 'Move through controls, including the canvas']] },
  { group: 'Tools', items: [['V', 'Pointer'], ['N', 'Node'], ['P / R / L', 'Terrain / Rope / Ladder'], ['Esc', 'Clear selection and return to Pointer'], ['F1', 'Open Help']] },
  { group: 'Editing', items: [['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z', 'Redo (Ctrl/⌘ + Y also works)'], ['Ctrl/⌘ + D', 'Duplicate'], ['Ctrl/⌘ + S', 'Save'], ['Arrow keys', 'Move the selected object or node on the canvas'], ['Shift + Arrow keys', 'Move in one-unit steps'], ['Delete / Backspace', 'Remove the selected object or node on the canvas'], ['End', 'Place the selected object on the surface below'], ['Alt + drag', 'Bypass snapping']] },
  { group: 'View', items: [['Scroll wheel', 'Zoom in or out'], ['Space + drag', 'Pan'], ['Middle-button drag', 'Pan']] },
  { group: 'Number fields', items: [['Enter', 'Start editing / apply (leaving the field also applies)'], ['Esc', 'Cancel the current entry and resume navigation'], ['↑ / ↓ while editing', 'Step the value'], ['Shift + ↑ / ↓', 'Take larger steps'], ['Alt + ↑ / ↓', 'Step one unit']] },
]

function CanvasDiagram({ kind }: { kind: 'move' | 'resize' | 'node' }) {
  const shape = kind === 'node' ? '56,150 56,95 150,45 224,95 224,150' : '56,150 56,70 224,70 224,150'
  return <svg viewBox="0 0 280 190" className="builder-help-diagram" aria-hidden="true">
    <path className="help-grid" d="M0 30H280M0 70H280M0 110H280M0 150H280M20 0V190M60 0V190M100 0V190M140 0V190M180 0V190M220 0V190M260 0V190" />
    <polygon className="help-solid" points={shape} />
    {kind === 'move' ? <g className="help-ink-stroke"><path d="M105 109H175M140 84V134M105 109L114 100M105 109L114 118M175 109L166 100M175 109L166 118M140 84L131 93M140 84L149 93M140 134L131 125M140 134L149 125" /></g> : kind === 'resize' ? <>
      <path className="help-selection" d="M44 58H236V162H44Z" strokeDasharray="6 5" />
      {[[44, 58], [236, 58], [44, 162], [236, 162]].map(([x, y]) => <rect key={`${x}-${y}`} className="help-handle" x={x - 5} y={y - 5} width="10" height="10" />)}
      <path className="help-ink-stroke" d="M234 59L254 39M242 39H254V51" />
    </> : <>
      <polyline className="help-selection" points={shape + ' 56,150'} />
      {[[56, 150], [56, 95], [150, 45], [224, 95], [224, 150]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} className="help-node" cx={cx} cy={cy} r="5" />)}
      <path className="help-ink-stroke" d="M150 72V104M140 84L150 72L160 84" />
    </>}
  </svg>
}

function InspectorDiagram() {
  return <svg viewBox="0 0 640 200" className="builder-help-diagram builder-help-surface" aria-hidden="true">
    <path className="help-grid" d="M0 40H640M0 80H640M0 120H640M0 160H640M40 0V200M80 0V200M120 0V200M160 0V200M200 0V200M240 0V200M280 0V200M320 0V200M360 0V200M400 0V200M440 0V200M480 0V200M520 0V200M560 0V200M600 0V200" />
    <path className="help-solid" d="M0 164H180V144H280V184H360V164H640V200H0Z" />
    <rect className="help-object" x="192" y="40" width="64" height="64" />
    <path className="help-selection" strokeDasharray="6 5" d="M192 80H256V144H192Z" />
    <path className="help-ink-stroke" d="M304 58V130M294 118L304 130L314 118" />
    <rect className="help-object" x="456" y="100" width="64" height="64" />
    <path className="help-ink-stroke" d="M480 135L488 143L502 125" />
  </svg>
}

export function BuilderHelp({ tools, onClose }: {
  tools: readonly { id: Tool; group: string; label: string; help: string }[]
  onClose: () => void
}) {
  const [section, setSection] = useState<Section>('Canvas')
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement, node = dialog.current!
    node.showModal(); close.current?.focus()
    return () => {
      node.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="builder-help-dialog jumping-ui" aria-label="Level builder help" aria-modal="true"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }}>
    <header className="jumping-ui-heading builder-help-heading">
      <h2>Help.</h2>
      <button ref={close} aria-label="Close help" title="Close help" onClick={onClose}>Close</button>
    </header>
    <div className="builder-help-tabs" role="tablist" aria-label="Help topics" onKeyDown={event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : -1
      if (next < 0) return
      event.preventDefault(); setSection(SECTIONS[next])
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus()
    }}>
      {SECTIONS.map(name => <button key={name} role="tab" id={`builder-help-tab-${name}`} aria-controls={`builder-help-panel-${name}`} aria-selected={name === section} tabIndex={name === section ? 0 : -1} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    {SECTIONS.map(name => <div key={name} id={`builder-help-panel-${name}`} role="tabpanel" aria-labelledby={`builder-help-tab-${name}`} hidden={section !== name} className="builder-help-content" tabIndex={0}>
      {name === 'Canvas' && <>
        <div className="builder-help-guides">
          <figure><CanvasDiagram kind="move" /><figcaption><h3>Move</h3><p>Choose Pointer and drag an object to move it.</p></figcaption></figure>
          <figure><CanvasDiagram kind="resize" /><figcaption><h3>Resize</h3><p>Select an object, then drag a square handle to change its size.</p></figcaption></figure>
          <figure><CanvasDiagram kind="node" /><figcaption><h3>Reshape</h3><p>Choose Node to drag terrain points. Click an edge to add a point.</p></figcaption></figure>
        </div>
        <dl className="builder-help-copy">
          <div><dt>Place objects</dt><dd>Choose a tool to preview its default size under the mouse or controller cursor on the canvas. Every tool follows the cursor horizontally and vertically. Snap aligns placement to the grid and catches nearby surfaces; Alt bypasses it. Click to place it or drag to set its size. Use Place on surface (End) to move a selected object onto a surface farther below. Keep placing leaves that tool active for the next object. Pointer and Node stay active until you switch tools.</dd></div>
          <div><dt>Terrain templates</dt><dd>Steps narrow and Steps wide in Terrain place five one-square rises, with one-square or two-square treads. Both have a stepped underside with a one-square overlap between steps. The top landing is two squares wide for narrow steps and three for wide steps. Click to place, then resize or reshape like any terrain.</dd></div>
          <div><dt>Rotate &amp; flip terrain</dt><dd>Select terrain to enable Rotate left, Rotate right, Flip horizontal, and Flip vertical in the top toolbar. Rotations turn 90° around the center, shifting inward if needed to fit the level. Rope anchors follow the shape. Other objects stay in place; attached ladders become independent when terrain rotates. Undo reverses each action.</dd></div>
          <div><dt>Snap to fit</dt><dd>Snap aligns objects to the 20-unit grid and nearby surfaces. Turn it off for free placement.</dd></div>
          <div><dt>Find your way</dt><dd>Fit level shows the whole map. Find start returns to the player. The overview in the corner also fits the level.</dd></div>
        </dl>
      </>}
      {name === 'Inspector' && <>
        <figure className="builder-help-feature"><InspectorDiagram /><figcaption><h3>Place on surface</h3><p>Drop an object onto the next clear surface below. The inspector shows whether it is supported, above a surface, or overlapping one.</p></figcaption></figure>
        <dl className="builder-help-copy">
          <div><dt>Level &amp; Object tabs</dt><dd>Level holds the name, filename, dimensions, night mode, floor material, and medal times. Selecting or placing an object opens Object. Switching tabs preserves the selection. Use Left and Right arrow keys to switch tabs when a tab has focus.</dd></div>
          <div><dt>Object names</dt><dd>Give any object, including spotlights, a name. Press Enter or leave the field to apply it. Names appear in the inspector, object picker, connections and validation errors, and are saved with the level. Leave the name blank to restore its default label.</dd></div>
          <div><dt>Switch connections</dt><dd>Select a gate or a switched elevator, moving platform, exit, or spotlight and choose its pressure plates or coin switches in Switched by. You can also select a switch and choose its targets in Activates. Both views edit the same connections; any active connected switch activates the object. Elevators, platforms, exits, and spotlights also support Always on.</dd></div>
          <div><dt>Coins and coin switches</dt><dd>Place coins from Collectibles and a coin switch from Mechanisms. Set Coins required and choose its connections. Numeric shows collected / required coins on a six-by-two-square digital face. Progress bar uses glowing LED cells and supports Horizontal or Vertical. Existing bars keep their size and orientation. Every collected coin counts toward every switch; a full switch stays active until restart. Coins and switches never block movement.</dd></div>
          <div><dt>Position &amp; size</dt><dd>Coordinates start at the bottom left of the map. Top measures the object’s top edge from the floor. Arrow keys navigate between fields; press Enter to edit, or click a field directly. Whole-number values preview as you type. Press Enter or leave the field to apply one undoable edit; Esc cancels it and returns to navigation. Fixed dimensions, such as a gate’s thickness, cannot be changed.</dd></div>
          <div><dt>Terrain &amp; materials</dt><dd>Square handles resize the whole shape; round nodes change its outline. A terrain shape must keep at least three nodes. Terrain and floor materials change appearance only.</dd></div>
          <div><dt>Object actions</dt><dd>Duplicate creates another copy. Delete removes the selection. Use Undo to reverse an edit. Start and goal are part of every time trial and cannot be deleted.</dd></div>
        </dl>
      </>}
      {name === 'Objects' && <dl className="builder-help-objects">
        {tools.filter(tool => tool.group !== 'Editing').map(tool => <div key={tool.id}>
          <dt><BuilderIcon kind={tool.id} />{tool.label}</dt><dd>{tool.help}{OBJECT_NOTES[tool.id] && ` ${OBJECT_NOTES[tool.id]}`}</dd>
        </div>)}
        <div><dt><BuilderIcon kind="goal" />Start &amp; exit</dt><dd>Select them on the canvas or in the inspector to move them. The exit has no built-in plate. It defaults to Always on; choose Switched to connect plates or coin switches. Flip horizontally mirrors the door and indicator. The clock stops when the player enters the open door.</dd></div>
      </dl>}
      {name === 'Levels' && <dl className="builder-help-copy">
        <div><dt>Name &amp; filename</dt><dd>Edit these in the Inspector’s Level tab. The level name suggests its filename unless you enter one yourself. A file is created on the first save. Changing a saved filename renames that file on the next save.</dd></div>
        <div><dt>Save &amp; test</dt><dd>Save level writes to the selected folder. Save and Test saves first, then starts the game. Return to builder brings you back to your draft.</dd></div>
        <div><dt>Library</dt><dd>Choose the save folder, open a level, create a new one, or use a level as a template. In development, built-in levels can be edited too. Opening another level prompts you to save unsaved changes.</dd></div>
        <div><dt>Recycle bin</dt><dd>Deleted levels can be recovered from the library’s recycle bin. Permanent deletion and emptying the bin require confirmation.</dd></div>
        <div><dt>Map dimensions</dt><dd>Changing the height adds or removes space at the top; the floor stays at Y = 0. The width and height must leave room for your objects.</dd></div>
        <div><dt>Medal times</dt><dd>Set gold, silver, and bronze times in seconds.</dd></div>
      </dl>}
      {name === 'Shortcuts' && <div className="builder-help-shortcuts">
        {SHORTCUTS.map(group => <section key={group.group}><h3>{group.group}</h3><dl>{group.items.map(([keys, action]) => <div key={keys}><dt>{keys}</dt><dd>{action}</dd></div>)}</dl></section>)}
      </div>}
      {name === 'Controller' && <div className="builder-help-shortcuts">
        <p>Use a standard Xbox, PlayStation, or compatible controller. Release held buttons and sticks after changing screens.</p>
        <dl>
          <div><dt>Y / △</dt><dd>Switch between the canvas cursor and the editor controls. Return to the last control you used.</dd></div>
          <div><dt>Left stick</dt><dd>Move the canvas cursor, or focus the control in that direction in the editor, Help, and Library. Navigation follows the visible layout and stops at an edge.</dd></div>
          <div><dt>A / ×</dt><dd>Activate a control or start editing a field. Press again to finish a number field; names and wall text open an on-screen keyboard. On the canvas, press to select or place; hold while moving to drag, resize, draw terrain, or edit a node. Release to apply one undoable edit.</dd></div>
          <div><dt>B / ○</dt><dd>Cancel a field entry and resume navigation, cancel a drag, close a list or dialog, or return from the canvas to the controls.</dd></div>
          <div><dt>D-pad</dt><dd>Focus the control in that direction. While editing a number, Up/Right increases it and Down/Left decreases it. On the canvas, nudge the selected object or node; during a drag, move the cursor precisely.</dd></div>
          <div><dt>Right stick</dt><dd>Pan the canvas. In the controls, scroll the focused panel.</dd></div>
          <div><dt>LT / L2 · RT / R2</dt><dd>Zoom out / in on the canvas.</dd></div>
          <div><dt>Left-stick click</dt><dd>Slow the cursor and bypass snapping while dragging. Use one-unit nudges and number-field steps.</dd></div>
          <div><dt>LB / L1 · RB / R1</dt><dd>Undo / redo outside dialogs.</dd></div>
          <div><dt>X / □</dt><dd>Duplicate the selected object on the canvas.</dd></div>
          <div><dt>View / Share · Menu / Options</dt><dd>Open Library / Save and Test. During a canvas drag, Menu first cancels the drag; press again to test.</dd></div>
          <div><dt>Inspector fields</dt><dd>Left / right changes a number; up / down moves to another control. A opens lists and an on-screen keyboard for names and wall text. B cancels; A confirms the selected list item or text-keyboard action.</dd></div>
        </dl>
        <p>Disconnecting the controller or leaving the window cancels an unfinished drag. A browser folder chooser may need the keyboard or mouse once; connected folders remain usable from Library.</p>
      </div>}
    </div>)}
  </dialog>
}
