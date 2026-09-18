# Hard Vacuum (React + TypeScript + Vite)

A small retro-style browser arcade: a full-screen game selector that launches several canvas-based mini-games (each with its own keyboard controls and Web Audio sound effects).

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- ESLint

## Included Games

- **Hard Vacuum: The Last Shift** — a six-region exploration campaign with power circuits, ship upgrades, and the mobile tender Haven
- **Final Approach** — land gently on the pad (difficulty selectable)
- **No Exit** — arena shooter with force-field bounces
- **Urban Fire** — top-down combat with tanks + helicopters
- **Bumper Ball** — physics soccer-ish bumper cars (1P/2P)
- **Sling Load** — helicopter sling-load delivery / survival
- **Hello World** — vector display “HELLO WORLD” screen

## Controls

**Arcade menu**

- Up/Down (or W/S): select a game
- Enter/Space: launch

**Hard Vacuum**

- A/D or Left/Right arrows: rotate; W / Up: thrust; S / Down: nose thruster.
  Turning fires a tiny lateral jet near the nose and a fainter jet on the opposite
  rear corner, with a quiet hiss at one quarter of the main engine's audio gain.
  Steering responds quickly; on release, the jets stop and the ship coasts through
  a little rotation before settling (about 14 degrees from full turn speed).
- Space: fire the laser (hold to mine or cut)
- B: fire the red blaster after buying it under Haven's Ship upgrades for 750 banked credits.
  Installation is permanent, survives death, and includes three shots.
  Three shots per charge; dock or recharge at Haven
  to refill. Impacts pulverize asteroids of every color into dust and award credits,
  leaving no fragments. Rock barriers and blast doors can only be cleared with B.
- R: use a remote recharge pack. Carry up to three; buy each at Haven for 500 credits.
  Physical shields and blaster refill after the
  same one-second cycle, green hull ripples and repair sound used at Haven.
  Radiation shielding recharges only at Haven. Remote recharging does not bank credits. Packs are consumed on activation;
  an active recharge resumes after saving, and pausing also pauses the cycle.
- T: return to Haven and bank all carried credits after installing its teleporter
  for 3,000 credits. Teleporting is then free and unlimited. Grappled cargo stays
  where it was released. Haven recharges the arrived ship normally.
  Teleporting is unavailable during Haven's relocation or when already at Haven.
- F: fire tether / release and reel in
- Down / S: fire the nose thruster to brake forward motion or reverse. Its force
  is opposite the ship's heading, with a visible forward exhaust jet.
- E: dock at Haven, or call it to an energized empty service berth
- Brake inside Haven to recharge and bank carried credits automatically. Press E to dock and upgrade.
- Point the ship's nose at an object and press F to grapple it. Fly to tow;
  press F again to release. Contextual guidance explains the first connection,
  then fades; the opening recording and Controls retain these instructions.
  The single Longline winch upgrade doubles the hook's reach.
  Once attached, the cable retracts at 130 pixels per second to its original
  130-pixel towing length: one second at maximum reach, less for closer attachments.
  It then stays at towing length and never reels cargo into the ship;
  modules, salvage and the core must be towed to Haven for recovery.
  Touching the ship never collects cargo. F releases the cable.
  Loose cells, modules, salvage and the core start with gentle drift. Power cells
  float on their own; their former dispenser markers and solid housings are gone.
  Lasers, explosions, and collisions push loose blue objects. Blasters destroy blue
  asteroids, while shaped mission cells survive and are pushed. Guide a cell
  between a receiver's plates to connect it; nearby cells are not pulled in.
  Connected cells stay anchored. Modules, salvage, and the core still need the grapple for recovery.
  Ships, all asteroid types, cells, modules, salvage and the core collide and
  transfer momentum everywhere. Receiver plates, installed cells, recording
  terminals, doors, walls and Haven's hull are solid too.
  Cargo cannot be recalled remotely. Tow the ignition core
  back to Haven, then dock to connect the refuge’s awakening bus.
- M: survey map (pauses the simulation). Records nearby visible terrain as you
  explore; walls and sealed doors block scanning. Discovered terrain is saved.
  O switches between the local survey and the station overview. Z toggles 2× zoom;
  while zoomed, pan with arrows, WASD or dragging. The map uses the available screen.
- L: log / flight recorder. Read discovered station records and the current objective.
  Available in flight, while paused, or docked at Haven.
- Fixed recording terminals have live data displays and blue cable sockets that
  stay active after reading. Aim and grapple with F to
  download their recordings; flying nearby does not read them. The terminal stays
  bolted down while the ship tethers to it, and the connection pulses with data.
  A contextual hint retires after the first download. F disconnects; downloaded
  records remain in the flight recorder, and reconnecting replays them.
- The laser needs 400 ms of uninterrupted contact on one asteroid before impact.
  The asteroid itself brightens during contact and its glow fades if interrupted.
  Losing the target or releasing SPACE resets contact. Buy staged Laser focus upgrades
  at Haven: 300, 250, 200, 150, then 100 ms. Boost has been removed.
- P / Escape: pause

All menus support Arrow keys or Tab / Shift+Tab to move focus, Enter or Space
to activate, and Escape to go back. Home / End jump to the first / last action.
The flight HUD groups location and credits on the left. A compact ship panel
aligns shield, radiation and blaster meters, with equipment controls and warnings
in the same panel. On narrow screens the meters sit side by side. Map, log and
pause remain keyboard-accessible; nearby docking actions stay beside the flight view.
Actions underline their shortcut letter when it appears in the label; other keys
are shown beside the action. Map, Log, Pause, Recharge, Teleport and Blaster use
M, L, P, R, T and B respectively.
Persistent control hints, objective walkthroughs and object instructions are removed;
open Controls from the menu or pause screen for key bindings. Area labels remain.
The scanline overlay has been removed from the game.
Hull, beam capacitor and laser focus each have five upgrade stages.
Each stage costs 750, 1,500, 3,000, 6,000, then 10,000 credits. Each track occupies
one shop row that advances after purchase and shows its next effect and cost.
Longline winch is a single 750-credit upgrade that doubles tether reach. The
750-credit blaster is also a permanent ship upgrade. Existing staged tether
purchases become the double-length winch, and existing blasters stay installed.
Teleporter installations become unlimited; unused legacy charges are refunded
their 750-credit purchase price once when the save is migrated.

The checkpoint shop skips unavailable upgrades and keeps focus on an available
action after a purchase. Escape closes the survey map and returns to flight.

During local development (`npm run dev`), press backtick / tilde to open the
developer panel. Jump to any of the six campaign regions or add 100,000 banked
credits per press. Jumps complete earlier prerequisites, supply the blaster from
the Works onward, also supply radiation shielding from the Works onward, and recharge
the ship. Existing upgrades, credits, completed puzzles and cargo are preserved;
Haven stays at the latest powered berth. These changes use the normal save.
Show whole map immediately opens the station overview with all terrain, labels
and berths revealed. It works from flight, pause, the outfitter and the main menu;
M or Escape closes the map and returns to the previous screen. M reopens it and O
switches views. Reveal lasts for the session and does not change exploration progress.
The panel pauses simulation and supports arrows, Tab, Enter and Space; tilde or
Escape closes it. The panel is unavailable in production builds.

The campaign’s 26 chambers use asymmetric outlines joined by bent passages;
their continuous contours define rendering, collision, laser paths and the map.
Faint circuit traces connect every receiver to its powered doors, berths and
equipment through the station passages using horizontal, vertical and 45-degree
runs. They turn green with traveling current
when powered; loose cells and blast barriers have no wiring. Scattered background marks, decorative wall facets and structural
sketches have been removed; environmental details communicate working systems
or meaningful damage.
Packed rubble and torn blast-door seams replace red X markers. The scattered
destructible formations have been removed; barriers still seal passages. Volatile
asteroids have red mineral fissures while idle. Once armed, the whole asteroid
pulses bright red with an intensifying glow before detonation. The map shows
surveyed terrain rather than a room graph.

Explore the Breach, Freight Galleries, the Works, the Broken Ring, Refuge Approach,
and the Heart. The original seven rooms form the fourth region. The new regions
add reserve-cell circuits, powered return passages, optional recordings and cargo,
and a final ignition-core recovery. Mine with the laser and tow asteroid fragments
to Haven for credits, or clear a path with the blaster. In the Broken Ring,
power cells are interchangeable: tow one from Haven to the Wreckwater
receiver to open the Foundry. Bring another from the Foundry to the Haven relay
to power the Archive, Reactor and shortcut doors. The cell in Ember Lung powers
the engine receiver, restoring containment around the reactor and fuel unit and
opening the western return door. This exposed towing run requires radiation shielding
and prompt traversal; containment creates a permanent safe route afterward.
Doors slide open over 1.2 seconds, and collision follows the
moving panels. Connected cells stay installed; there are no inventory keys. Passage
rubble and blast doors require the blaster; lasers and asteroid
explosions do not open them. Ore comes from asteroids, with no ore hoppers.
Destroying a small regular or red asteroid awards 10 carried credits; blue
asteroids pay 100. Larger rocks add a size bonus before the blue multiplier.
Laser, blaster and explosion kills all pay when an asteroid is destroyed.
Destruction inside Haven pays exactly 10× the field reward directly into the
bank, including kills from ship weapons. Base guns process blue asteroids too;
mission power cells remain intact and never pay credits. Docking is not required.

Restoring power opens armored robot garages and wakes the station's machinery.
Their walls and animated doors physically protect dormant bots; each unit leaves
its garage before patrolling. Maintenance tugs pursue at 185 units/second and
alternate between grappling the ship, hauling asteroids into its projected path,
and stealing towed cargo. Their jaws signal a launch before a physical hook flies;
dodging, cover, distance or damaging the tug breaks the attack. Ship tows last at
most three seconds, and Haven's repair area is safe. Away from the pilot, tugs
continue sorting loose cargo. The Works, Reactor and Heart have security units that charge a visible
targeting beam before firing three-round bursts. Walls, debris and Haven's hull
block their shots. Both types collide, can be grappled, and take damage from focused
laser fire, blasters, explosions and hard impacts. Destroyed units stay destroyed.
Debris density, speed and the share of red and blue asteroids rise in deeper regions;
Refuge deliberately provides a quieter interval. Mining white asteroids also exposes
more volatile red fragments: each small fragment has a 0/10/20/28/5/42% red chance
across Breach, Freight, Works, Ring, Refuge and Heart respectively. Blue chances are
0/6/10/15/12/20%. Rocks and their fragments retain their origin's mineral odds when
towed elsewhere. The opening Breach has no red or blue asteroids.
Oxygen reserves, evacuation records and shared power buses connect
the encounters to the station's abandoned evacuation.

Tow the violet module from Freight Stores back to Haven to install a separate
radiation shield bar. A breached reactor and damaged fuel unit emit violet,
radial fields that weaken with distance and are blocked by solid cavern walls.
Their visible footprints match the actual exposure. At peak exposure the
100-point reserve drains at 12.5 points per second; recharge at Haven. Violet
arcs pulse around the ship and Geiger clicks sound while exposed, growing more
urgent near a source or with a low reserve. The HUD shows the current drain rate
and warns when protection fails. Long transfer tunnels after the first Breach-to-Freight
crossing contain fractured isotope conduits. Their weaker overlapping fields create
traversal pressure while keeping the central route clear for towing and Haven.
The first departure stays radiation-free; the module is reachable before the first
required irradiated crossing. The original shield only absorbs physical
impacts. Without radiation protection, two seconds at peak exposure destroys
the ship; leaving the field lets that exposure recover.

Haven is the only checkpoint and permanent service location. Its docking ring
folds for transit along physical service routes. Restoring power and discovering
a berth makes it available; the route must also be physically clear. In the
outfitter’s Service berths panel, relocate while riding aboard, or press E at an
empty energized berth to call the tender. Earlier berths remain accessible.
There is no fuel or relocation fee. Empty berths cannot repair, bank or recover
cargo; those services and the teleporter destination follow the one vessel.
Services pause during travel, and transit progress survives saving. A recovery
after a crash waits for Haven at its destination. Six rigid hull leaves hinge
inward over 2.4 seconds and unfold on arrival; the tender accelerates, turns,
and brakes along its route. These same leaves collide with asteroids, cells,
loose cargo and the free-flying ship, including during folding and deployment.
Impacts transfer momentum and produce a hull flash and low thud. Riding aboard
keeps debris, cargo and red asteroid fuses active. Impacts cannot collect cargo
or grant the refinery bonus while Haven is moving.

Carried credits bank
automatically under the same conditions as shield and blaster recharge: slow down
inside the base for one second. Press **E** to dock and buy ship upgrades. Crashing loses **all carried credits**; banked credits, upgrades, explored
sectors, and opened routes survive. Progress saves locally in the browser;
continuing restores your location, both shields, radiation exposure, remaining blaster shots, and moved cargo. Crashes return you to
Haven. Prototype saves join the campaign at the Broken Ring with their money,
equipment and explored terrain preserved; choose a new expedition to experience
the opening. Existing saves retain progress: recovered access keys become a powered
Haven relay, thermal
shielding becomes radiation shielding, and the retired drive becomes Laser focus I. A new expedition can be started
from the game menu. The campaign targets 60–90 minutes for a new player; this is
a pacing target pending fresh-player testing, not a measured completion time.
The region plan and narrative are documented in [the campaign notes](docs/hard-vacuum-campaign.md). Touch controls are available on smaller screens.

**Final Approach**

- Arrows / WASD: rotate + thrust
- P: pause
- Menu: Left/Right changes difficulty

**No Exit**

- Arrows / WASD: rotate + thrust
- Space: fire (max 3 shots)
- P: pause

**Urban Fire**

- Arrows / WASD: move
- Space: fire (max 2 shots)

**Bumper Ball**

- 1P: Arrow Keys to move
- 2P: WASD + Arrows
- P or Esc: pause/resume

**Sling Load**

- Arrows / WASD: thrust
- Space: hook / release
- X: rotor on/off
- Shift: stabilize (damping)
- P: pause

**Hello World**

- Escape / Enter / Space: exit

Note: browsers often require a user gesture (key press/click) before audio can start.

## Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Vite will print the local URL (typically http://localhost:5173).

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Type-check + production build to dist/
npm run preview  # Preview the production build locally
npm run lint     # Run ESLint
npm test         # Geometry, progression, checkpoint, and save tests
```

## Project Structure

```text
src/
  App.tsx        # Arcade menu + game launcher
  main.tsx       # Application entry point
  index.css      # Tailwind directives + global styles
  components/    # Reusable UI components
  games/         # Canvas games (one component per game)
public/          # Static assets
```

## Adding a Game

1. Create a new component in `src/games/` that accepts `{ onExit: () => void }`.
2. Import it in `src/App.tsx` and add it to:
   - the `GameId` union
   - the `GAMES` list (for menu order)
   - the render switch that returns the game component

## Deployment (Azure Static Web Apps)

This repo includes a GitHub Actions workflow for Azure Static Web Apps deployment.

- Workflow: [.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml](.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml)
- Build output: `dist/`
- Required secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_STONE_04A8A9C10`

Pushes to `main` deploy automatically; pull requests create preview environments.
