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
- **Bumper Ball** — single-player physics soccer-ish bumper cars against a computer opponent
- **Sling Load** — helicopter sling-load delivery / survival
- **Hello World** — vector display “HELLO WORLD” screen
- **Untitled Jumping Game** — a timed, nonlethal puzzle platformer with local JSON levels and a level builder

## Controls

**Arcade menu**

The three featured entries carry their game's visual identity: Hard Vacuum's
vector console, Bumper Ball's lacquered toys and cream score panels, and Urban
Fire's masonry-and-olive field orders. Start, pause, results, loading and recovery
screens use the same game-specific treatment. Keyboard and controller selection
share one restrained focus ring; secondary actions retain their own material.
Decorative covers render stills using the real ship, Haven, court, vehicles and
city drawing code. They redraw only on resize, stay sharp on high-density
displays, and never start a game loop, audio or save session.

- Arrows / WASD or Tab / Shift+Tab: select a game; Home / End: first / last
- Enter/Space: launch
- Controller: stick or D-pad selects a game; A launches it.

**Hard Vacuum**

The ship stays centered as the camera follows it. Flight view gently zooms in on
larger windows and out on smaller ones, using a 900×620 reference, a 0.58×
readability floor and a 2× ceiling. Above 1×, zoom grows at 40% of viewport growth
so larger displays also show more surroundings. World geometry and flight physics
stay fixed; HUD and menus do not scale with the camera. The same framing applies
in flight training.

- A/D or Left/Right arrows: rotate; W / Up: thrust; S / Down: nose thruster.
  O/K/L/; also work: O thrusts, K turns left, L fires the nose thruster, and ; turns right.
  Turning fires a tiny lateral jet near the nose and a fainter jet on the opposite
  rear corner, with a quiet hiss at one quarter of the main engine's audio gain.
  Steering responds quickly; on release, the jets stop and the ship coasts through
  a little rotation before settling (about 14 degrees from full turn speed).
- Space: fire the laser (hold to mine or cut)
- B: fire the red blaster after finding its module in the southeast of the Works main bay
  and towing it to Haven for installation.
  Installation is permanent, survives death, and includes three shots.
  Upgrade its magazine at Haven from three to eight shots; dock or recharge there
  to refill. Impacts pulverize asteroids of every color into dust and award credits,
  leaving no fragments. Rock barriers and blast doors can only be cleared with B.
- T: return to Haven and bank all carried credits after finding the teleporter module
  in the Broken Ring's Foundry and towing it to Haven for installation.
  Teleporting is free and unlimited. Grappled cargo stays
  where it was released. Haven recharges the arrived ship normally.
  Teleporting is unavailable during Haven's relocation or when already at Haven.
- F: fire tether / release and reel in. The opening lesson recovers the green
  impact-shield module in the rescue locker, through the passage west of Haven. New ships have no impact protection;
  tow it home and wait for Haven's shutters to seal to install two shield charges.
  Installation unlocks hull upgrades and persists through saves and death.
- Down / S: fire the nose thruster to brake forward motion or reverse. Its force
  is opposite the ship's heading, with a visible forward exhaust jet.
- E: dock at Haven, or call it to an energized empty service berth
- Brake inside Haven to recharge and bank carried credits automatically. Press E to dock and upgrade.
- Point the ship's nose at an object and press F to grapple it. Fly to tow;
  press F again to release. Flight training teaches the controls with floor
  markings and hands-on practice; the expedition has no automatic tutorial cards.
  Open **Flight training · Help** from the pause menu at any time. Your expedition
  stays frozen, and **Return to expedition** takes you back to its pause menu
  without losing your position, tether or progress, even if saving is unavailable.
  The training bay is a mining-pilot induction simulator with an automatic white-rock
  dispenser. It replenishes used stock through a visible chute, waits for a clear
  outlet, and limits the amount of loose debris. Red material is never placed or
  dispensed directly: it appears only inside fragments cut from white asteroids.
  The tether has a fixed 130-pixel reach and towing length.
  It never reels cargo into the ship;
  modules and salvage must be towed to Haven for recovery.
  Touching the ship never collects cargo. F releases the cable.
  Loose cells, modules, salvage and the core start with gentle drift. Power cells
  float on their own; their former dispenser markers and solid housings are gone.
  The laser also repels loose equipment modules, salvage and the ignition core,
  using the same contact time and push as blue asteroids. Contact glow shows the
  hit building up; laser hits do not collect, install or award credits for cargo.
  Installed cells, fixed fixtures and cargo secured by Haven remain anchored.
  Lasers, explosions, and collisions push loose blue objects. Blasters destroy blue
  asteroids, while shaped mission cells survive and are pushed. Guide a cell
  between a receiver's plates to connect it; nearby cells are not pulled in.
  Connected cells stay anchored. Modules, salvage, and the core still need the grapple for recovery.
  Ships, all asteroid types, cells, modules, salvage and the core collide and
  transfer momentum everywhere. Receiver plates, installed cells, doors, walls
  and Haven's hull are solid too. Log ports are flush with the floor and can be flown over.
  Haven's armor also blocks lasers, projectiles and blast damage, including while folding
  or moving. Shots can still pass through its open docking gaps.
  Cargo cannot be recalled remotely. Tow the ignition core through the irradiated
  commissioning tube from the Ignition Well back to the Breach, then east to the
  Ignition Cradle.
  Releasing the core powers the tube's door from the Heart side. Seat the core
  between the cradle's contacts to power the station’s escape bus. Victory also
  requires all twelve survival pods safely aboard Haven, the station’s lifeboat.
  Bring Haven back to the Breach, dock and choose Launch Haven. She folds and
  leaves through the same outer tunnel where a new expedition begins.
- M: survey map (pauses the simulation). Records nearby visible terrain as you
  explore; walls and sealed doors block scanning. Discovered terrain is saved.
  O switches between the local survey and the station overview. Z toggles 2× zoom;
  while zoomed, pan with WASD or dragging. Arrows select map buttons at any zoom.
  The map uses the available screen.
- G: log / flight recorder. Re-read recordings downloaded through tether connections.
  Available in flight, while paused, or docked at Haven.
- Recessed log ports have live data displays and blue cable sockets that
  stay active after reading. Aim and grapple with F to
  download their recordings; flying nearby does not read them. Seven short story
  recordings remain, alongside Haven's commissioning greeting. Each combines
  Orison's people and history with a clue to an item's location or purpose;
  mechanics emerge through the speakers' experiences and unfinished work. The
  opening contract hints at waking Haven, whose reply points to the shield. Each port stays
  fixed in the floor while the ship tethers to it, and the connection pulses with data.
  Their faint, broken panel seams mark passable floor in both the station and training bay.
  Only the nearest reachable reader shows a brief button/action hint. F disconnects; downloaded
  records remain in the flight recorder, and reconnecting replays them.
- The laser needs 400 ms of uninterrupted contact on one asteroid before impact.
  The asteroid itself brightens during contact and its glow fades if interrupted.
  Losing the target or releasing SPACE resets contact. Buy staged Laser focus upgrades
  at Haven: 300, 250, 200, 150, then 100 ms. Boost has been removed.
- P / Escape: pause

Hard Vacuum also supports standard-layout game controllers (Xbox names below;
PlayStation equivalents are shown in Controls). Connect by USB or Bluetooth,
then press a button while the game is focused.

- Left stick left/right: rotate only; up/down does not thrust or reverse.
  Turning is proportional, with a small dead zone to prevent drift.
- RT: proportional thrust; LT: proportional nose thrust to brake or reverse.
- LB / RB: strafe left / right relative to the ship, without turning.
  Side thrusters provide half the acceleration of the main engine.
- X: grapple / release; A: hold laser; B: blaster, one shot per press.
- Y: dock at Haven, call it from an available berth, or teleport when neither
  nearby action applies (after installing the teleporter).
- Right-stick click: log; View/Back: map; Menu/Start: pause.
- Menus: stick or D-pad navigates, A confirms, B goes back; these menu actions
  never fire the laser or blaster. Right stick scrolls long dialogs.
- Map: D-pad selects buttons and A activates the highlighted button. X is a
  zoom shortcut, Y switches overview/local, left stick pans while zoomed,
  and B or View closes. Menu closes the map and pauses flight.

Disconnecting the active controller pauses flight. Center the stick and release
held buttons after connecting, resuming or closing a menu before using them again.
Keyboard controls remain available, including for controllers without a standard
browser mapping. If controller-only launch is silent, click the game or press a
keyboard key once to enable audio.

All menus support Arrow keys or Tab / Shift+Tab to move focus, Enter or Space
to activate, and Escape to go back. Home / End jump to the first / last action.
Focused dialog buttons use a restrained green tint, crisp border and small leading
marker for mouse, keyboard and controller alike, without recolouring descriptions
or prices. Disabled or hidden choices are skipped; selected actions scroll into
view. Arrows follow grid columns while Tab follows reading order. Focus stays
inside the active dialog, and closing a sub-dialog restores the previous selection.
Destructive confirmations always open on Cancel. Page Up / Page Down scroll long
dialogs and recorder text; the controller's right stick does the same. On-screen
hints show controller bindings while a supported pad is connected, and keyboard
bindings otherwise. This switches live in menus, buttons, the HUD, map, Controls
guide and tutorial copy without changing focus or disabling keyboard input.
Unsupported controllers keep keyboard hints. Prompt labels use the selected
controller layout, so future presets share the same hint system.
On the map, arrows always navigate buttons, even when zoomed; WASD or dragging
pans the zoomed survey. Held keys must be released after changing screens, just
like held controller buttons. Shortcuts cannot act through a nested dialog.
The arcade selector and loading/error screens share the same navigation and style.
Menu presentation lives in `src/menu.css`; `KeyboardDialog` owns focus and keyboard
behavior, with `dialogNavigation.ts` shared by keyboard and controller navigation.

Controller layouts live in `src/games/hardVacuum/controllerLayouts.ts`. The single
shipped preset, Trigger flight, defines button assignments and stick axes; both
the input reader and displayed bindings consume that definition. Future presets
can be passed to `createControllerReader(layout)` without changing flight or menu
code. There is no preset-selection UI or change to saved expeditions yet.

The flight HUD groups location and credits on the left. A compact ship panel
aligns shield, radiation and blaster meters, with equipment controls and warnings
in the same panel. On narrow screens the meters sit side by side. Map, log and
pause remain keyboard-accessible. Dock is stenciled in Haven's center after its
commissioning socket retracts; the stencil also accepts mouse/touch input.
Actions underline their shortcut letter when it appears in the label; other keys
are shown beside the action. Map, Log, Pause, Teleport and Blaster use
M, G, P, T and B respectively.
Floating control hints, automatic status toasts and objective walkthroughs are removed;
open Controls from the menu or pause screen for key bindings. Large entrance signs and
sparse industrial stencils remain, with floor bindings for docking and calling
Haven, not logs or tether links; the main map has no floor lessons. Tethered logs and Haven share one
information-card treatment. Small room-name labels appear only on the map and HUD,
not on the floor, and every log has the same recorder model. Training
keeps its full instructions. Retired walkthrough downloads remain valid in saves,
but are hidden from the journal and excluded from the recording count.
The scanline overlay has been removed from the game.
Hull, beam capacitor, laser focus and blaster magazine each have five upgrade stages.
Each stage costs 750, 1,500, 3,000, 6,000, then 10,000 credits. Each track occupies
one shop row that advances after purchase and shows its next effect and cost.
The recovered radiation shield has a fixed 100-point reserve: eight seconds at
peak exposure, with no capacity upgrades. It recharges automatically in one second
outside radiation; Haven also restores it during servicing. The HUD shows its
remaining percentage. Removed capacity upgrades refund their original cumulative
purchase costs once on migration; existing charge is capped at 100, never refilled.
The tether uses its standard reach throughout the expedition, with no upgrade.
Older saves remove the Longline winch and refund its 750-credit price once.
Blaster magazine upgrades unlock after recovering and installing the blaster.
Each adds one shot (3 → 4 → 5 → 6 → 7 → 8) and fills the new magazine;
damage and firing speed are unchanged. Haven servicing and respawn refill the
purchased capacity; saving preserves both the upgrade and remaining ammunition.
The dock shop only improves existing systems; new equipment must be found and
recovered. Impact shielding, radiation shielding, the blaster and the teleporter use the same
physical tow-and-install handoff at Haven, at no credit cost. The blaster becomes
reachable upon entering the Works, outside its sealed tool crib; tow it back to
Freight Haven before breaching the crib. The teleporter rewards reaching the Foundry
in the next region, the Broken Ring: blast into Wreckwater, tow in the entrance cell,
and contend with the powered maintenance tug. The relay receiver is inside the Foundry;
restoring it opens the far exit and Archive shortcut, exposes the Archive survivor,
and enables Haven's nearby berth for both recoveries. Each door earns a distinct benefit.
Older saves relocate unclaimed Works or hub teleporters once, preserving installed
or towed modules, rescued survivors and earned power.
Older saves relocate an unclaimed Freight blaster once, preserving installed or towed modules.
The impact shield's first installation plays the normal one-second recharge rings,
hum and finishing flash, including while docked. This feedback never grants an
extra refill or replays when loading an already-installed shield.
Remote recharge and its R binding have been removed. Hull shields and blaster ammo
require Haven servicing after installation. Older saves retain their existing
impact shield and hull upgrades without refilling charges or spawning a duplicate
module; start a new expedition to see the opening lesson. Old unused
recharge packs refund 500 credits each once; an in-progress recharge is canceled
without repair or refund. Legacy teleport charges still refund 750 credits once.

The checkpoint shop skips unavailable upgrades and keeps focus on an available
action after a purchase. Escape closes the survey map and returns to flight.

During local development (`npm run dev`), press backtick / tilde to open the
developer panel. Jump to any of the six campaign regions or add 100,000 banked
credits per press. Jumps complete earlier prerequisites, supply impact shielding
from Freight onward, radiation shielding from the Works onward, and the blaster
from the Broken Ring onward, then recharge the ship. A Works jump still requires
recovering its blaster. Existing upgrades, credits, completed puzzles and cargo are preserved;
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

The introductory Breach receiver still opens the first nearby transit door.
In Freight, the gallery receiver instead opens the far end of the radioactive
Stores-to-Dispatch tunnel and powers Haven's berth. Recover and install radiation
shielding first, then cross the long route. The receiver inside Dispatch opens
the direct lift shortcut back to Freight and the exit toward the Works. Existing
saves keep previously opened doors; new expeditions enforce the full route.

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
its garage before patrolling.
Bot models share the pilot ship's restrained bevels and clean outlines: a compact
fork-jawed tug and a broad arrowhead security craft, each with one sensor and an
unbroken main hull. Thrusters are inset into the shell rather than separate pods.
Maintenance tugs pursue at 185 units/second and
alternate between grappling the ship, hauling asteroids into its projected path,
and stealing towed cargo. Their jaws signal a launch before a physical hook flies;
dodging, cover, distance or a heavy hit breaks the attack. Ship tows last at
most three seconds, and Haven's repair area is safe. Away from the pilot, tugs
continue sorting loose cargo. The Works, Reactor and Heart have security units that charge a visible
targeting beam before firing three-round bursts. Walls, debris and Haven's hull
block their shots. Security units back away when crowded. Laser damage never stuns
either enemy type or interrupts their attacks, movement or maintenance grapples.
Blaster and other physical impacts still stagger them and break tug cables;
destroying a tug also releases its cable. Both types collide, can be grappled, and take damage from focused
laser fire, blasters, explosions and hard impacts. Both types take four blaster hits
or fifty asteroid-length laser contacts. Laser focus stages require 20, 15, 12.5,
10, 7.5 and 5 seconds of effective on-target contact respectively (stock through
maximum focus); capacitor recharge pauses and incomplete contacts add time.
This armor resistance only reduces laser damage to bots, not mining speed or
blaster damage. Armor progressively darkens and develops
up to four breaches as health falls. Sensors increasingly flicker, and each hit
vents sparks; ongoing spark showers grow more frequent, numerous and energetic
as damage mounts. A stock three-shot blaster needs mixed weapons or a reload
against a full-health bot; magazine upgrades provide up to eight shots. Destroyed units stay
down through docking and save reloads; all enemies return at full health when the
pilot respawns, with powered bots leaving their garages and unpowered bots dormant.
Recovery first requires activating Haven: aim at her blue center socket and
connect the tether. Before that, death starts the entire expedition again in the
Access Tunnel. After activation, Haven reconstructs the pilot over a long interval;
station maintenance rebuilds bots and debris drifts back while the pilot is gone.
Banked credits, rescued passengers, equipment and restored circuits remain safe.
Stay tethered to hear Haven's first message, just like a log terminal. Disconnect
when ready: the center socket retracts permanently, and the message stays in the log.
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
per second. No docking or braking is needed. Any radiation stops
the refill immediately; pausing also pauses recharge. Hull shields and blaster ammo
still require Haven. Violet
arcs pulse around the ship and Geiger clicks sound while exposed, growing more
urgent near a source or with a low reserve. The HUD shows the current drain rate
and warns when protection fails. Long transfer tunnels after the first Breach-to-Freight
crossing contain fractured isotope conduits. Their weaker overlapping fields create
traversal pressure while keeping the central route clear for towing and Haven.
The first departure stays radiation-free; the module is reachable before the first
required irradiated crossing. In Medical Transfer, restoring approach power opens the lower
service tube while the ward isolation door stays shut. Tow the Triage reserve
through the irradiated bypass to the receiver inside the Suspension Ward; powering
it opens the short, safe return to Haven and releases eight survival pods.
The ward has twelve numbered cradles, with four empty: those pods are loose in
Cargo hold 6, the Works, the Ring archive and Refuge Approach. The first survivor
encounter is in Freight, after the opening equipment recovery. Tow each pod to Haven.
When her recovery shutters seal, its occupant is rescued and 1,000 credits are
banked exactly once. Pods cannot be destroyed; lasers repel released pods like
other durable cargo. Two lights on each of Haven’s six hull sections show the
twelve rescues and remain attached as she folds. Rescued survivors stay aboard
through travel, reload and ship loss. There is no survivor counter in the HUD,
outfitter, objectives or rescue messages; Haven’s physical lights are the manifest.
Surveyed pods appear on the map. Restore the ignition core **and** recover all
twelve pods, in either order, then bring Haven to the Breach anchorage. Dock and
choose Launch Haven to fly out through the Access Tunnel. Its outer door remains
sealed until that authorized departure. The last rescue alone
never launches her, and departure is unavailable while anyone is missing or cargo
is still being secured. Older completed saves retain their restored power and
earnings but reopen the missing rescue/departure step without inventing rewards.
Previously opened doors remain open in saves.
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

- Arrows / WASD: steer, accelerate, and reverse the jeep
- Space: fire (max 2 shots); P: pause/resume; Esc: exit during play
- Controller: left stick turns, RT / R2 drives forward, LT / L2 reverses,
  A / × fires, and Menu / Options pauses. Release held controls after deploying
  or resuming. Losing focus or disconnecting pauses combat.
- Fixed 1,600 × 1,100 battlefield with a centered camera, proportional zoom on
  larger displays, and a tactical map. Resizing never moves buildings or units.
- Tanks establish firing lanes, coordinate attack positions, route around cover,
  and lead moving targets. Helicopters make passes at standoff range.

See [the battlefield and enemy behavior notes](docs/urban-fire.md) for details and validation scenarios.

**Bumper Ball**

- Arrow keys / WASD: steer, accelerate and reverse the blue car against the red computer opponent
- Space or controller A / ×: a half-second forward boost, followed by a three-second
  cooldown. The bottom meter shows readiness; release and press again for each burst.
  Boost time and recharge freeze while paused, and each kickoff restores a full charge.
- P: pause/resume; Esc: exit
- Standard controllers use Hard Vacuum's controls: left stick left/right turns
  proportionally, RT / R2 drives forward, and LT / L2 brakes or reverses with
  proportional trigger pressure. Stick up/down does not accelerate.
- Stick / D-pad navigates menus; A / × selects; B / ○ goes back (resumes when
  paused); Menu / Options pauses or resumes. Disconnecting the active controller
  or switching away pauses the match. Release held controls after connecting,
  starting or resuming before driving again. Keyboard controls remain available.
- The arena is fixed at 1,600 × 1,000 game units. The camera keeps the blue car
  centered, including near walls. Windows larger than the 1,280 × 800 baseline
  zoom in proportionally, so the game fills large displays without stretching.
  Smaller windows stay at 1×. Resizing never moves the goals, bumpers or match objects.

The computer challenges possession, lines up shots around bumpers, predicts ball
rebounds and makes safer defensive clearances. It uses the player's maximum turn
rate, acceleration, boost strength and cooldown. It boosts into lined-up shots
and along clear repositioning routes, while saving gentle touches near the goal.
Run `npm run benchmark:bumper-ai` for repeatable opponent
trials; [the AI evaluation](docs/bumper-ball-ai.md) records the findings and limits.

**Sling Load**

- Arrows / WASD: thrust
- Space: hook / release
- X: rotor on/off
- Shift: stabilize (damping)
- P: pause

**Hello World**

- Escape / Enter / Space: exit

**Untitled Jumping Game** (`/untitled-jumping-game`)

**First Leap** and **Second Leap** are included as built-in levels. Open a local
folder to play your own levels, ordered by its manifest or filename. **JSON Test Lab** lives in the automated test
fixtures and is not offered in the game or builder.

There is no death or automatic reset. Depress the goal's floor plate to switch on
its pole light for a gold, silver, bronze, or unmedalled completion. The player,
a crate, or a ball can activate it. The timer stops as soon as the light turns on;
movement and physics continue for 1.5 seconds before the result dialog appears.
The clock starts on your first movement action; pauses
and menus do not consume time. Personal bests are saved separately for each map.
Timers are displays on the back wall, placed with the builder's **Wall timer**
tool. A level may have several; they show the same time and never block movement.
The result screen advances to the next file or lets you retry immediately.

Levels are rectangular rooms with a light grid back wall. Medium-grey solid terrain
surrounds the room on all four sides. Internal terrain uses the same fill: static
rectangles or simple polygons, including concave shapes and floating blocks.
Slopes up to 45 degrees are walkable. Steeper slopes make the player slide, with
a balancing pose and small contact particles. Sides and undersides are solid.

R or Y/Triangle restarts the current trial and its ropes and clock, including a
custom level during a builder playtest.

During play, only compact restart and pause controls overlay the map (plus a
return button during builder playtests). The player's pose provides jump-charge
feedback. The pause menu contains the keyboard or controller reference; the play
area has no title, movement readout, charge meter, or instruction strip.

- Left stick: proportional walk/run speed; D-pad also moves. Keyboard: A/D or
  Left/Right, with Shift to walk.
- Hold A/Cross or Space to charge; release to jump. Tap for a short hop.
  Charging preserves your movement speed and running stride for running jumps.
- Jumping into a wall braces the hands and feet against its surface while gravity
  carries the player down. Press Space or A/Cross again to jump up and away from
  the wall. The initial push briefly carries you outward, then air steering resumes.
  Each wall jump needs a fresh press; holding jump does not automatically bounce.
  Air steering makes gradual adjustments to the trajectory while preserving takeoff momentum.
- Face a nearby ledge in the air to grab automatically. Up/W or jump climbs;
  B/Circle or Down/S drops; away + jump pushes off.
- Down/S near an exposed platform edge lowers into a hang. Holding Down keeps
  the grip; release and press Down again to drop, or use B/Circle / X.
- Jump into a rope to catch it automatically. Up/Down or W/S climbs and descends
  ladders and ropes; left/right pumps a rope swing. Jump releases with momentum;
  B/Circle or X drops without jumping. Steering away starts an outward swing
  while keeping the grip. Feet brace when rope tension or movement
  presses the player against a wall; they release as the rope swings away. Down controls
  the rappel and climbs off the rope's end or onto the ground. Stopping settles both
  feet against the wall. Jump is the manual release, launching away from a wall;
  climbing onto a clear ledge still completes the transfer.
- Y/Triangle or R: restart the trial; in the playground, return to the most recent reset point.
- Menu/Start or Escape/P: pause. The pause menu returns to the arcade.

Feet follow the ground, and connected terrain pieces have no solid internal
seams. Controller disconnect and focus loss pause the game; release buttons and
center the stick after resuming. Keyboard stays available. Movement constants
live in `src/games/jumping/model.ts`; the simulation advances at 120 Hz
independently of rendering and viewport size. Built-in maps are runtime JSON
assets in `public/levels/jumping/`.

Open **Level builder** to enter the **Level studio**. Its **Library** button opens
a centered dialog with **New level**, local files, and published built-in templates.
Replacing an unsaved draft offers **Save and continue**, **Discard changes**, or **Cancel**. **Use as template**
under a local file starts a new level with the same contents, a new ID, and an
filename based on its new name. Save the new level to create its file; the source stays unchanged.

- **Rectangle** draws static terrain anywhere in the room. Drag both width and height.
- **Polygon** places one corner per click. Click the first corner or press Enter
  to close it. Select terrain to drag its white corners; **Add corner** adds a vertex.
  Crossing edges are rejected. Concave outlines support cavities and overhangs.
- Place **Ladders** and **Ropes** freely. A rope started near a terrain edge snaps
  its anchor to that edge; moving or reshaping the terrain carries the anchor.
  The inspector can attach or detach a nearby anchor. Moving a rope detaches it.
- **Back wall → Wall text** adds a non-solid text area. Edit its content, font size,
  and alignment in the inspector; drag or resize it like other objects. Multiple
  lines wrap within the area, and text is included in saved levels and templates.
- Start and finish markers set the route. Legacy object maps remain importable,
  but new levels use only terrain, ladders and ropes.
- Drag selected elements, resize with the corner handle or numeric inspector,
  and duplicate with Ctrl/Cmd+D. Undo/redo covers edits to the current level; opening another level starts fresh.
- Set room width and height, medal times and the player hint. All four outer
  boundaries are structural and cannot be erased.
- Turn on **Jump guide** to compare short and charged running jumps. Selecting a
  platform moves the guide to its edge. Guides are advisory; grip and momentum
  affect actual landings.
- V selects, H or held Space pans, scrolling pans, and Ctrl/Cmd+scroll zooms.
  **Fit level** or the overview fits the map; **Find start** returns to the player.

**Save and Test** saves the level to its folder before running the authored trial.
**Return to builder** preserves the draft and undo history. The inspector flags
invalid starts, flags, medals, unsupported pushers, and missing mechanism links.
**Local folder → Choose folder** in the level menu loads
JSON files from disk using the folder’s `index.json` order, with filename order as the default.
**Edit selected level** opens a file in the builder. With a writable folder open,
**Save level** writes directly to it. Without writable access, the Library opens
so you can choose a folder or enable saving.
The selected folder is remembered in browser storage and reopened automatically
on reload, reading its current files from disk. If permission expires, use
**Reconnect folder**; **Enable saving** renews write access when only read access
remains. Browser storage holds only the folder reference, not copies of levels.
There are no browser copies or autosaved drafts. Save to a file before leaving
or reloading the game; edits remain in memory during playtests and menu visits.
**Refresh** picks up edits made in a text editor or by Codex. Browsers that only
read folders show **Reselect folder** instead; they remember the folder name but
require reselection after reload. Editing and saving requires writable folder access.

The header exposes both **Level name** and **File name**. New drafts create no
level file until the first save, using the level name unless you specify a filename.
Changing a saved filename renames that file on Save and keeps the level ID.
Connecting a writable folder creates a missing `index.json` automatically in
filename mode. Read-only folders prompt you to enable saving; existing manifests
are left unchanged. Drag tiles directly in **Library**, or focus one and use
**Alt + Arrow keys**, to rearrange levels. Each move saves the specified sequence
to `index.json` automatically. **Sort by filename** restores filename ordering.
Reordering never rewrites level files or changes the current draft.
**Delete** immediately moves a local file into the folder's recycle bin.
**Library → Recycle bin** shows level cards with **Recover** and **Delete permanently**;
permanent deletion and **Empty recycle bin** both require confirmation.
Recovery copies are stored in a `Deleted levels` subfolder, separate from the OS
trash. Externally deleted files remain as **Missing file** cards until you confirm
removing their index entries. Deleting a saved file keeps any open editor draft.
Files contain the full
level, including terrain, mechanisms, goals, medal thresholds and rope attachments.
To open an existing file, put it in the selected level folder and refresh, or
change folders in Library. There is no separate file import or export flow.
Save failures and filename conflicts leave the draft intact.
Local and built-in collections share the same manifest format, so a folder of
levels and its manifest can be shared or promoted to built-in assets unchanged.
Built-in files are fetched at runtime and use the manifest’s ordering. Reload the page
to pick up changes. Run `npm run levels:index` after adding, removing or renaming
assets; the command preserves any custom sequence. Existing-file edits need no index change. `npm run levels:sync` copies the
JSON assets into an existing `dist` without recompiling the app. `npm run levels:check`
validates them without a build. See `docs/jumping-levels.md` for the full workflow.

Level validation lives in `src/games/jumping/level.ts`, asset loading in
`levelAssets.ts`, puzzle simulation in `challenge.ts`, and editing operations in
`editor.ts` and `puzzleEditor.ts`.

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
npm run generate:power # Regenerate fixed cable paths after changing station geometry
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
in the game, in a separate dialog with Go back selected by default, Retry save &
exit and an explicit Exit without saving action. Escape / controller B dismisses
that dialog and restores the previous selection without leaving the game.
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
