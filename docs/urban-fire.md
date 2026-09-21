# Urban Fire

The battlefield is fixed at 1,600 × 1,100 game units. The camera stays centered on the jeep, including at the perimeter. Displays above the 1,280 × 800 reference size zoom proportionally; smaller displays use 1×. Resizing only changes the view. A tactical map shows buildings, hostiles, repair kits, and the visible area.

Arrow keys or WASD steer, accelerate, and reverse. Space fires; two player shots may be in flight. P pauses and Escape exits. Standard controllers use the left stick to steer, RT/R2 to drive forward, LT/L2 to reverse, A/× to fire, and Menu/Options to pause. Menus use the same focus and controller navigation as Hard Vacuum. Inputs must be released after entering gameplay, and losing focus or disconnecting pauses combat.

The presentation uses restrained cyan, oxidized copper, and amber vector outlines over dark city blocks. Roof panels, vents, lane markings, animated treads, independent turrets, gun recoil, muzzle flashes, and a compact operations HUD add detail without changing collision footprints.

Tanks route around inflated building footprints that account for their hull width. They pivot at tight corners, reverse for nearby goals behind them, choose separate firing positions, yield to other tanks, and avoid friendly firing lanes. They share observed player contacts, investigate the last known position, and patrol after losing contact. Turrets turn at a limited rate, lead moving targets, require a reaction window, and check cover before firing. Helicopters orbit at standoff range and seek unobstructed strafing lanes. Damage, the two-hit tank armor, cooldowns, and the shared six-shell enemy cap remain bounded so the smarter enemies are still readable.

Run `node --test tests/urbanFireAi.test.mjs` for deterministic city navigation, aiming, cover, squad spacing, contact memory, and helicopter scenarios. `npm run test:browser -- tests/browser/urbanFire.spec.mjs` covers camera invariants, resizing, keyboard/controller driving, ammunition limits, pause, and focus loss.
