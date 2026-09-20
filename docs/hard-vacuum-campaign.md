# Hard Vacuum: The Last Shift

Orison, an asteroid mining station, went silent nine years ago. An independent
salvage pilot arrives to recover its ignition core. The official account says
the station was evacuated. The maintenance tender Haven is still keeping watch
at the breach.

Three people left the route the player discovers: freight dispatcher Mara Vale,
maintenance chief Ivo Sen, and refuge medic Ada Ren. Their records reveal that
the shutdown isolated damage and preserved 312 people in medical suspension.
The core is needed to wake them without draining their remaining reserves.

## Progression and pacing

These are design targets for a first playthrough, not measured timings. Flight
time is tracked in the save and completion screen; menus and surveys pause it.
New-player sessions should inform subsequent adjustments to distances, debris,
reward amounts, and clarity of objectives. Do not add waiting periods to meet
the target.

| Region | Intended time | Main work | Haven and discoveries |
| --- | --- | --- | --- |
| The Breach | 8 min | Learn movement and hauling by recovering the impact shield from the rescue locker, then learn mining and bring the locker’s reserve to freight transit. | Haven begins here. An optional sealed baggage bay rewards a return with the blaster. |
| Freight Galleries | 11 min | Power the gallery receiver from western stores; install radiation shielding and enter Dispatch through the long radioactive tunnel. Carry a hold-six reserve to the receiver inside. | Gallery power opens the far tunnel door and Haven’s berth. Dispatch opens the safe lift shortcut back out and the Works exit. The evacuation ledger does not add up. |
| The Works | 12 min | Find the blaster in the main bay and tow it back to Freight Haven for installation. Breach the tool crib, recover its supply, restore maintenance, then feed the Ring from the capacitor store. | Maintenance power enables the berth. Welded bulkheads reveal deliberate damage containment. |
| The Broken Ring | 17 min | Clear the west passage, power the Foundry and relay, recover radiation shielding, then restore the reserve engine. | The original seven-room map. The relay enables Haven’s berth. The engine opens Refuge Approach south of the vault. |
| Refuge Approach | 12 min | Restore medical transfer from the vault reserve; connect the ward from Triage; restore ignition access. | Medical transfer enables Haven’s berth. Ward power opens the southern return passage. Four 78-circuit medical banks confirm the survivors. |
| The Heart | 10 min | Supply induction from the ward, ground the field, release the core and tow it into Haven. | Induction power enables the final berth. Grounding opens a second route to the well. Dock to connect the awakening bus. |

Main route target: approximately 70 minutes, with 10–15 minutes of optional
cargo recovery, recordings and return visits. Navigation and recovery use the
existing ship, laser, blaster, grapple and shields. There are no inventory keys,
boost gates, ore hoppers, destructible background crags or additional checkpoints.

## One mobile Haven

Haven travels between six fixed service berths. A berth needs its power circuit
and discovery. The vessel also needs open bulkheads along the service route.
The folding, travel and deployment stages are visible. The pilot can ride aboard
from the outfitter or call Haven from an empty energized berth. Previously
restored locations stay available for backtracking.

All permanent services move with this vessel: credit banking, asteroid
processing, recharging, outfitting, cargo recovery, respawning and the teleporter
destination. Cargo is released before departure. Empty mounting shoes offer no
services. There is no relocation fee or fuel inventory. Travel cannot duplicate
the base; its path and position persist across reloads. The folded transport
shell deflects debris without processing it. Six rigid leaves fold on service
arms over 2.4 seconds. Rendering and collisions share their geometry; moving
leaves push loose cells, salvage, asteroids and the free ship. Body impacts and
red asteroid fuses continue during passenger travel. Authored service lanes
leave clearance for the whole folded hull, including its rear extrusion.

Haven's opening recording introduces the green impact-shield module in the rescue
locker, through the passage west of Haven. The first objective and contextual
prompts teach flying to the locker, nose aiming, F to grapple, S to brake/reverse, towing home, and waiting
for the recovery shutters to seal. Prompts persist through misses, release and
reload until installation. The installed shield supplies two charges and unlocks
hull upgrades; the next objective is the rescue-locker cell and first door.
Haven holds its opening steady until installation, allowing time to read and aim.
The lesson takes temporary priority over recordings without skipping their text.

## Economy and equipment

The recovered blaster has a three-shot magazine, refilled at Haven.
The opening is solvable without it. Mining regular asteroids provides small
field returns; bringing blue asteroids to Haven provides the strongest early
purchase opportunity. Optional recovered cargo increases from 250 to 4,000
credits in later regions. Mining inside Haven retains its 10× banked payout.

Hull, capacitor and laser focus retain five stages; the winch has one upgrade.
Radiation shielding has a fixed 100-point reserve, no upgrades, and eight seconds
of protection at peak exposure. It refills in one second outside radiation.
The Freight Stores radiation module remains a separate defensive reserve.
The blaster module is in the southeast of the Works main bay, outside the sealed
tool crib. It is unavailable in Freight; tow it back to Haven to install it before
breaching the crib and restoring the Works berth. The teleporter module is in
the Capacitor store, behind a blast door. Tow all four
to Haven to install them. The dock sells only upgrades, never new equipment or
remote recharge packs. New ships have no impact shield until the opening recovery;
old saves keep their existing shield, upgrades and remaining charges. Installed
hull shields and blaster ammo refill at Haven or respawn. The Heart
adds damaged containment housings whose visible fields match physical exposure.

## Presentation and ending

Short archival transcripts play as regions and systems are discovered. Optional
recorders require proximity and line of sight. J opens the flight recorder with
discovered records and the current objective. M opens the saved survey, and O
switches local/overall scale. Flight retains a restrained resource HUD. Dialogs,
outfitter pages, berth commands and the recorder support keyboard navigation.

After delivering the released ignition core and docking, Haven bridges the
awakening bus. The last message is live:

> “Haven? We’ve got your lights. Is the route clear?”

The player can continue exploring afterward. Prototype saves migrate into the
Broken Ring, retaining funds, equipment and survey coordinates. A new expedition
starts at the Breach.

## Validation

The campaign tests flood the actual circle-collision geometry to check cell and
receiver reachability in progression order. They also check all pairs of Haven
berths, door animation prerequisites, cargo recovery, moving-base rewards,
teleport destinations, transit reloads, death recovery, story discovery and save
migration. Browser checks cover launch through completion, including a real
grapple attachment, cell seating, docking, recall, purchases, transit/reload,
keyboard dialogs and mobile layouts. These checks establish functional coverage;
they do not substitute for a first-time human playthrough when assessing pacing.
