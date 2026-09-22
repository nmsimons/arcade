# Hard Vacuum: The Last Shift

Orison, an asteroid mining station, went silent nine years ago. An independent
salvage pilot arrives to recover its ignition core. The official account says
the station was evacuated. The maintenance tender Haven is still keeping watch
at the breach.

Three people left the route the player discovers: freight dispatcher Mara Vale,
maintenance chief Ivo Sen, and refuge medic Ada Ren. Their records reveal that
the shutdown preserved twelve people in portable survival pods. Haven is their
lifeboat, with two pod berths in each of her six hull sections. The core must
restore the station’s escape bus so she can leave with everyone aboard.

## Progression and pacing

These are design targets for a first playthrough, not measured timings. Flight
time is tracked in the save and completion screen; menus and surveys pause it.
New-player sessions should inform subsequent adjustments to distances, debris,
reward amounts, and clarity of objectives. Do not add waiting periods to meet
the target.

| Region | Intended time | Main work | Haven and discoveries |
| --- | --- | --- | --- |
| The Breach | 8 min | Learn movement and hauling by recovering the impact shield from the rescue locker, then learn mining and bring the locker’s reserve to freight transit. | Haven begins here. An optional sealed baggage bay rewards a return with the blaster. |
| Freight Galleries | 11 min | Power the gallery receiver from western stores; install radiation shielding and enter Dispatch through the long radioactive tunnel. Carry a hold-six reserve to the receiver inside. | Gallery power opens the far tunnel door and Haven’s berth. Dispatch opens the safe lift shortcut back out and the Works exit. The first survivor pod is in hold six; there are none in the opening Breach. The evacuation ledger does not add up. |
| The Works | 12 min | Find the blaster in the main bay and tow it back to Freight Haven for installation. Breach the tool crib, recover its supply, restore maintenance, then feed the Ring from the capacitor store. | Maintenance power enables the berth. Welded bulkheads reveal deliberate damage containment. |
| The Broken Ring | Re-measure Foundry route | Blast into Wreckwater and power the Foundry entrance, waking its tug. Find the teleporter and restore the relay inside the Foundry to open the Archive return. Recover the teleporter and Archive survivor, then restore the reserve engine. | The first Foundry door earns equipment access; its far door earns the Archive rescue and a return shortcut. Relay power enables Haven’s nearby berth. The engine opens Refuge Approach south of the vault. |
| Refuge Approach | Re-measure with eight rescues | Restore medical transfer from the vault reserve; carry the Triage cell through the radioactive service bypass; power the ward and tow its eight released pods to Haven. | Transfer power opens the service bypass and Haven’s berth. Ward power opens the direct safe return. Twelve cradles have four empty slots for the earlier pods. Keep the central towing and service lanes clear. |
| The Heart | 10 min | Supply induction from the ward, ground the field, release the core and tow it through the lower return to the Ignition Cradle east of the Breach. | Ignition restores station escape power, not a rescue count. Haven leaves only when all twelve pods are aboard. |

### Ring exploration rewards

| Room | Challenge or work | Payoff |
| --- | --- | --- |
| Service hub | Bring the local reserve west and later restore the Foundry relay. | A staging point that becomes Haven's berth for the workshop and Archive recoveries. |
| Wreckwater | Breach the western rock barrier and haul the hub reserve to the entrance receiver. | Access to the teleporter workshop, plus salvage. Power also releases the Foundry maintenance tug. |
| Foundry | Enter from the south, work around the active tug, and bring the local reserve to the internal relay. | A permanent teleporter upgrade; the east exit, Archive shortcut, reactor access and nearby Haven berth. |
| Cold Archive | Continue through the newly opened Foundry exit. | A required survivor, a recording and salvage; its southern door returns directly to the hub. |
| Ember Lung | Recover the reactor cell through the radiation field. | The supply needed for containment and the route onward. |
| Reserve engine | Deliver the reactor cell. | Contained radiation, the safe engine return and Refuge access, plus salvage. |
| Smuggler's Rest | Breach the southern door or return through the powered engine passage. | Refuge's supply reserve and salvage on the onward route. |

Keep the teleporter and survivor in different rooms so both discoveries matter.
The two Foundry doors have different jobs: earned access on the approach, then a
return through a new reward room. Restore the relay locally before hauling the
teleporter home; requiring that haul back through Wreckwater first would waste
the shortcut's benefit. The player can still choose to recover the module early
or defer it; objective order adds no artificial equipment lock to the reactor.

The previous main-route target was approximately 70 minutes. Twelve required
pod recoveries change both pacing and upgrade income; re-measure with human
playtesting before quoting a revised duration. Optional cargo, recordings and
return visits remain. Navigation and recovery use the
existing ship, laser, blaster, grapple and shields. There are no inventory keys,
boost gates, ore hoppers, destructible background crags or additional checkpoints.

## Regional character

Each region has a near-black material tint and one distinct main-chamber
silhouette. The Breach has an uneven fractured edge; Freight uses a broad bay
with clipped corners; the Works has stepped machinery recesses; the Ring hub
has sixteen regular facets; Medical transfer has a symmetrical softened outline;
the Heart is octagonal. Their entrances and established towing lanes remain.

`regionRender.ts` gives Breach slate, Freight steel blue, Works iron brown,
Ring blue-violet, Refuge gray-green and Heart warm amber undertones. The tint is
fixed in world space and feathers through the connecting tunnels. Sparse cracks,
paired cuts, broken bands and corner seams stay clipped to solid surrounding
rock, including interior rock islands. Equipment, ore and hazard colors keep
their existing meanings. There are no extra formations to collide with, moving
ambient particles or repeated floor textures. Training keeps its existing look.

## One mobile Haven

The Access Tunnel's outer door has sealed behind the pilot. Haven begins dormant
at the Breach. The first lesson is to aim at her blue center socket and connect
the tether (F / X); entering the ring does not activate her. Her lights come up,
services start, and the pilot's recovery link is registered and saved.
Haven speaks through the same pinned message panel as a connected log terminal,
with data pulses along the cable. Her center connector stays deployed until the
pilot disconnects, then lowers into its hub and closes permanently. The message
remains in the flight recorder. Saving before disconnect permits reconnection;
saving after disconnect never brings the connector back.
Until that moment, ship loss ends the expedition and Start again resets everything
at the Access Tunnel. Afterward, Haven reconstructs the pilot. The story jumps
forward: station maintenance has rebuilt the bots and debris has drifted back,
while installed equipment, restored circuits, banked credits and rescued pods
persist. The player does not wait through that long reconstruction in real time.

Haven travels between six fixed service berths. A berth needs its power circuit
and discovery. The vessel also needs open bulkheads along the service route.
The folding, travel and deployment stages are visible. The pilot can ride aboard
from the outfitter or call Haven from an empty energized berth. Previously
restored locations stay available for backtracking.

All permanent services move with this vessel: credit banking, asteroid
processing, recharging, outfitting, cargo recovery, respawning and the teleporter
destination. Loose cargo is released before travel; rescued pods remain safely
aboard and keep their berth lights through folding, transit, reload and death.
Empty mounting shoes offer no
services. There is no relocation fee or fuel inventory. Travel cannot duplicate
the base; its path and position persist across reloads. The folded transport
shell deflects debris without processing it. Six rigid leaves fold on service
arms over 2.4 seconds. Rendering and collisions share their geometry; moving
leaves push loose cells, salvage, asteroids and the free ship. Body impacts and
red asteroid fuses continue during passenger travel. Authored service lanes
leave clearance for the whole folded hull, including its rear extrusion.

There are seven physical story recordings and Haven's tether-requested greeting.
Every log combines story exposition with a hint about a useful item's location
or purpose. Several also suggest mechanics through lived experience: connecting
to wake Haven, towing and installation, seating power cells, teleporter cargo
limits, radiation recovery and releasing pod clamps. The first contract points
to waking Haven; her reply points to the western rescue-locker shield. The crew's
remaining accounts connect discoveries through the campaign while revealing the
false evacuation. Keep the voices distinct and each entry within 85 words.
Sixteen former automatic walkthrough recordings remain retired. Their IDs stay
valid in existing saves, without fixtures or journal entries.
Floor text is limited to destination signs and a few industrial labels. Six matching
destination signs mark the main approaches: Breach Anchorage, Freight Galleries,
The Works, The Broken Ring, Refuge Approach and The Heart. They share the
anchorage sign's bold lettering and painted arrow. Room names remain on the map
and HUD, not repeated on the floor. These are wayfinding, not puzzle instructions. Logs and Haven's
tether link have no control hints; training covers them. Haven's center reads Dock once its link
socket is fully retracted; empty discovered berths carry Call Haven. Bindings
follow the connected input device. All logs use one recorder model and one
tethered information-card treatment, including training. There are no floating
control prompts, automatic status toasts, automatic tutorial cards or detached
instructional objective paragraphs in pause/the recorder. Item, route and mechanic
clues belong within the deliberately requested logs; hands-on instruction remains
in flight training. Haven holds its opening steady until shield installation.

## Flight training

The main menu offers a separate 2,400 × 2,400 practice area with a faint,
world-locked grid. Its four floor-marked sections cover inertia/thrust/reverse,
level-one laser mining and fragment colors, tether towing/release and two fixed
blue-ore hoppers, then a real cell/receiver/door and a tether-readable practice log.
The floor placards and instructor recording frame these exercises as a mining-pilot
induction simulator: flight handling, extraction, ore handling and auxiliary systems.
It has no Haven, shields, blaster, teleporter, bots, radiation or upgrade shop.
The circular hoppers have three wide openings and stationary mining guns. After
blue ore spends one second inside, the same small lasers used by Haven fire at it;
only a shot impact consumes the ore and awards the usual refinery credit value.
They cannot consume power cells. The practice door, its moving collision leaves,
power wiring and receiver current share the expedition's visuals and behavior.
All practice instructions and recordings refer only to exercises in this room.
White rocks split using the same
laser and physics as the expedition, with training-specific red/blue/white yields.
No red asteroids are placed at startup or dispensed; they appear only as volatile
inclusions exposed by breaking white rock. An automatic rock dispenser in the
extraction range replenishes white parent stock through a solid, open guide chute.
It visibly charges for 1.2 seconds, launches slowly, then waits six seconds between
feeds. It aims for five parent rocks or at least eight loose asteroids, with an
18-asteroid feed cutoff. The ship and cargo interlock the outlet, including during
charging; existing fragments are never removed to make room. Training debris stays
active across the whole bay so the dispenser clears even while the pilot is away.
Practice credits never enter the expedition economy. Death plays the explosion
and automatically resets the entire area. Pause offers reset and leave, via
keyboard or controller. Training uses an isolated session, cannot activate the
save writer, and is available even when an expedition save cannot be read.
Floor control labels follow the connected controller's selected layout live.

## Economy and equipment

The recovered blaster starts with a three-shot magazine, refilled at Haven.
After installation, five dock upgrades each add one shot, reaching eight.
They cost 750 / 1,500 / 3,000 / 6,000 / 10,000 credits and fill the new magazine;
shot damage and firing speed stay unchanged.
The opening is solvable without it. Mining regular asteroids provides small
field returns. Survival pods pay 1,000 banked credits at shutter seal, once per
pod (12,000 total). Four loose pods—Cargo hold 6, Works, Ring archive and Refuge Approach—
fund gradual upgrades before the ward rescue. Locked equipment still has to be
found and installed; money cannot skip that progression. Optional cargo pays 250 to 4,000
credits in later regions. Mining inside Haven retains its 10× banked payout.

Hull, capacitor, laser focus and blaster magazine have five stages. The tether has
fixed standard reach and no upgrade.
Radiation shielding has a fixed 100-point reserve, no upgrades, and eight seconds
of protection at peak exposure. It refills in one second outside radiation.
The Freight Stores radiation module remains a separate defensive reserve.
The blaster module is in the southeast of the Works main bay, outside the sealed
tool crib. It is unavailable in Freight; tow it back to Haven to install it before
breaching the crib and restoring the Works berth. The teleporter module is in
the Broken Ring's Foundry, behind the western rock barrier and powered workshop
entrance. The Foundry's internal relay opens a return through the Archive and
activates Haven's Ring berth before the recovery haul. Blaster and teleporter
discoveries occupy successive regions. Tow all four
to Haven to install them. The dock sells only upgrades, never new equipment or
remote recharge packs. New ships have no impact shield until the opening recovery;
old saves keep their existing shield, upgrades and remaining charges. Installed
hull shields and blaster ammo refill at Haven or respawn. The Heart
adds damaged containment housings whose visible fields match physical exposure.

## Presentation and ending

All archival transcripts require a grapple connection and line of sight; proximity,
entering rooms and powering systems never read them automatically. The final shift
recording is available only after its circuit is powered. Current story downloads
remain available; retired walkthrough IDs are preserved in saves but hidden.
G opens the flight recorder with downloaded records. M opens the saved survey, and O
switches local/overall scale. Flight retains a restrained resource HUD. Dialogs,
outfitter pages, berth commands and the recorder support keyboard navigation.

Pods use the same faceted pressure-shell aesthetic as the ship and other cargo,
with a single life-support window and a medical cross. Eight are anchored in
numbered ward cradles until ward power releases the clamps; four matching
cradles start empty. The first loose pod is in Freight, after the opening equipment
recovery. Pod recovery is left to discovery, without floor lessons or instructional
logs. Surveyed map contacts identify pods without an on-board counter. Haven lights one of
twelve physical lamps when custody commits, two per moving hull panel.

Departure needs both all twelve rescues and the installed ignition core. Either
can happen first. Power alone never claims the missing people are aboard; all
rescues without power still require the final core run. Neither completes the
game automatically. Bring Haven back to the Breach, dock, wait for any recovery
shutters to finish, then choose Launch Haven. Her folded hull follows the same
Access Tunnel where the pilot arrived. The outer door stays sealed even with
ignition power, opening only for the authorized launch. Victory follows the physical escape,
not the button press. Saved departures resume their fold or flight.

> “Everyone aboard. Outer lock clear. We’re going home.”

Optional free exploration returns to the moment before departure, with victory
retained. Pre-pod completed saves keep their core, equipment and credits but
reopen the rescue objective without inventing rescues or rewards. Prototype saves migrate into the
Broken Ring, retaining funds, equipment and survey coordinates. A new expedition
starts in the Access Tunnel, facing inward toward the Breach. Existing
in-progress saves retain their positions. Pre-departure rescue victories retain
every rescued pod and credit but reopen the final journey home.

## Validation

The campaign tests flood the actual circle-collision geometry to check cell and
receiver reachability in progression order. They also check all pairs of Haven
berths, door animation prerequisites, cargo recovery, moving-base rewards,
teleport destinations, transit reloads, death recovery, story discovery and save
migration. Browser checks cover launch through completion, including a real
grapple attachment, cell seating, docking, recall, purchases, transit/reload,
keyboard dialogs and mobile layouts. These checks establish functional coverage;
they do not substitute for a first-time human playthrough when assessing pacing.
