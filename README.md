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
  O/K/L/; also work: O thrusts, K turns left, L fires the nose thruster, and ; turns right.
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
  Radiation shielding recharges automatically outside radiation, without a pack or a base visit.
  Remote recharging does not bank credits. Packs are consumed on activation;
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
  modules and salvage must be towed to Haven for recovery.
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
  Cargo cannot be recalled remotely. Tow the ignition core through the irradiated
  commissioning tube from the Ignition Well back to the Breach, then east to the
  Ignition Cradle.
  Releasing the core powers the tube's door from the Heart side. Seat the core
  between the cradle's contacts to start the independent awakening bus.
- M: survey map (pauses the simulation). Records nearby visible terrain as you
  explore; walls and sealed doors block scanning. Discovered terrain is saved.
  O switches between the local survey and the station overview. Z toggles 2× zoom;
  while zoomed, pan with arrows, WASD or dragging. The map uses the available screen.
- G: log / flight recorder. Read discovered station records and the current objective.
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
M, G, P, R, T and B respectively.
Persistent control hints, objective walkthroughs and object instructions are removed;
open Controls from the menu or pause screen for key bindings. Area labels remain.
The scanline overlay has been removed from the game.
Hull, beam capacitor and laser focus each have five upgrade stages.
Each stage costs 750, 1,500, 3,000, 6,000, then 10,000 credits. Each track occupies
one shop row that advances after purchase and shows its next effect and cost.
After recovering the radiation shield, Radiation reserve offers three expensive
stages: 1.5×, 2× and 2.5× capacity for 6,000, 12,000 and 24,000 credits.
That gives 12, 16 and 20 seconds at peak exposure, compared with the original eight.
The full upgraded reserve recharges automatically in one second outside radiation;
Haven still restores it as part of normal servicing. The HUD shows its remaining percentage.
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
laser fire, blasters, explosions and hard impacts. Both types take two blaster hits
or five asteroid-length laser contacts (2 seconds of effective contact with the
starting laser, 0.5 seconds at full focus). Damaged armor cracks, sensors flicker
at half health, and electrical sparks shed from the breach. Destroyed units stay
down through docking and save reloads; all enemies return at full health when the
pilot respawns, with powered bots leaving their garages and unpowered bots dormant.
Debris density, speed and the share of blue asteroids rise in deeper regions;
Refuge deliberately provides a quieter interval. Red asteroids never spawn loose:
they only emerge when white asteroids break apart. Mining deeper white asteroids exposes
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
100-point reserve drains at 12.5 points per second. Whenever exposure is zero,
including behind radiation-blocking cover, it refills gradually at one full reserve
per second. No docking, braking or recharge pack is needed. Any radiation stops
the refill immediately; pausing also pauses recharge. Hull shields and blaster ammo
still require Haven or a remote recharge pack. Violet
arcs pulse around the ship and Geiger clicks sound while exposed, growing more
urgent near a source or with a low reserve. The HUD shows the current drain rate
and warns when protection fails. Long transfer tunnels after the first Breach-to-Freight
crossing contain fractured isotope conduits. Their weaker overlapping fields create
traversal pressure while keeping the central route clear for towing and Haven.
The first departure stays radiation-free; the module is reachable before the first
required irradiated crossing. In Medical Transfer, restoring approach power opens the lower
service tube while the ward isolation door stays shut. Tow the Triage reserve
through the irradiated bypass to the receiver inside the Suspension Ward; powering
it opens the short, safe return to Haven. Previously opened doors remain open in saves.
The original shield only absorbs physical
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

Use Node.js 24 (see `.nvmrc`) so Node can run the TypeScript gameplay modules
directly in the regression tests. Install the locked dependencies:

```bash
npm ci
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
npm test         # Mechanics, full sessions, geometry, progression, and save tests
npm run test:browser # Production routes/recovery/controls + development panel
npm run benchmark # Isolated browser performance fixtures; JSON report in /tmp
```

For browser tests, run `npx playwright install chromium` once, then
`npm run build && npm run test:browser`. Playwright starts its own production
preview on port 4175 and a development server on 4176, with isolated storage; it never touches your
normal browser's expedition. On Linux CI, install Chromium with
`npx playwright install --with-deps chromium`.

### Save recovery

Opening Hard Vacuum's title menu and leaving without starting never writes a save. Missing,
valid, malformed, newer-version, and inaccessible saves are distinct outcomes.
An unreadable save blocks Continue; the menu offers a working backup when one
exists and a confirmed New expedition action. Canceling New or leaving the
menu preserves the original bytes. If the active slot is missing but a working
backup exists, the menu defaults to recovery and requires confirmation to start fresh.

The active slot remains `hard-vacuum-expedition-v1`. Each successful save keeps
the previous validated slot in `hard-vacuum-expedition-v1-backup` (the first
save initializes both). Recovering or deliberately replacing an unreadable
slot first preserves its bytes in `hard-vacuum-expedition-v1-unreadable`.
Invalid runtime data never replaces a good save or backup. Existing migrations
run through explicit ordered migrations to schema 2. The storage key stays stable;
gameplay reset rules are documented in [the save format](docs/save-format.md).
If backup/archive writes fail, the primary slot is not replaced.

Storage errors appear during flight and in menus. A failed Save & exit stays
in the game, with Retry save & exit and an explicit Exit without saving action.
If another tab changes the save, autosaving stops and asks you to reload.
Backups share the browser's storage and cannot protect against clearing site
data or browser eviction.

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
2. Add a lazy import and route in `src/App.tsx`, wrapped in `GameRoute`.
3. Add an entry to `GameSelector.tsx` if it should appear in the selector.
4. Extend the direct-route, exit and compatibility tests in `tests/browser/routes.spec.mjs`.

### Architecture and regression guides

- [Authoritative game session and timing](docs/game-session.md)
- [Save versions, migrations and persistence matrix](docs/save-format.md)
- [Station authoring and reference validation](docs/station-authoring.md)
- [Deterministic sessions and browser testing](docs/testing.md)
- [Route bundle measurements](docs/bundle-sizes.md)
- [Runtime performance fixtures and results](docs/performance.md)

## Deployment (Azure Static Web Apps)

This repo includes a GitHub Actions workflow for Azure Static Web Apps deployment.

- Workflow: [.github/workflows/azure-static-web-apps-agreeable-glacier-048815c10.yml](.github/workflows/azure-static-web-apps-agreeable-glacier-048815c10.yml)
- Build output: `dist/`
- Required secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_AGREEABLE_GLACIER_048815C10`

Pushes to `main` and pull requests targeting `main` run the **Validate and deploy**
check: Node 24, `npm ci`, `npm test`, `npm run lint`, `npm run build`, and browser
route, save-recovery and control tests. Every validation step must succeed before deployment.
Azure uploads that same `dist/` using
[`skip_app_build`](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration#skip-building-front-end-app)
instead of rebuilding. Pushes to `main` deploy to production; same-repository
pull requests deploy previews, which are removed when the PR closes. Fork and
Dependabot PRs run validation without using deployment secrets.

To prevent merging failed checks, configure a `main` branch rule requiring a
pull request and the **Validate and deploy** status check (and require the branch
to be up to date). Adding the workflow does not enable branch protection.
As checked on September 19, 2026, GitHub rejects branch-protection and ruleset
access for this private repository with “Upgrade to GitHub Pro or make this
repository public to enable this feature.” Until the repository has a plan
that supports this setting, enforce green checks during review; the workflow
still blocks its own deployments after validation failures.
