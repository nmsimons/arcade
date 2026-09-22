# Save compatibility and reset policy

The browser slot remains `hard-vacuum-expedition-v1` so existing installations are
found. Its **payload schema is now version 14**. Campaign version 1 and finale
version 2 are retained as historical content markers. Physical door IDs live in
`gates`; abstract `heart`, `ignition-ready`, and retired `thermal` milestones live
in `flags`. Flags never create collision geometry.

`expeditionSave.ts` owns storage, error outcomes, activation, backup and recovery.
`saveMigrations.ts` owns parsing, compatibility and validation. Gameplay has no
storage dependency. Merely opening/leaving a menu cannot overwrite a save.
Unsupported schemas retain their raw bytes. Explicit New or backup recovery
archives unreadable primary bytes before attempting replacement. Storage failures
are visible; exit without saving is a separate deliberate choice.

## Ordered schema 1 → 2 migration

1. Normalize removed/renamed equipment and retired crag IDs; validate inventory.
2. Add the campaign to prototype Ring saves; validate Haven, journeys and records.
   Retired walkthrough IDs remain accepted and stored, but are not shown in the
   journal or counted among the current story recordings. Unknown IDs still fail
   validation; retiring a recording does not reset the expedition.
3. Supply defaults and equipment validation; collapse old winch tiers and refund
   the unused teleport charge, deleting that field so it cannot pay twice.
4. Validate power/cell uniqueness and doors; restore old relay/medical/return access.
5. Validate cargo; rename legacy cargo and relocate only untouched historical
   cells/modules. Preserve towed/moved cargo and velocities.
6. Migrate old banked cores to a loose core beside Haven unless already complete.
7. Separate abstract flags from physical doors and set schema 2; validate the
   current output. Future versions must add a migration, never masquerade as v1.

## Ordered schema 2 → 3 migration

Keep installed blasters and teleporters (including their existing ammunition),
so old purchases never spawn a duplicate module. Refund each unused remote recharge
pack at its original 500-credit price, cancel any active recharge without repairing
the ship or refunding that consumed pack, and delete both retired fields. Set schema 3.
New expeditions have no recharge inventory or timer. Current saves reject retired
fields, and repeated loads cannot grant another refund.

Version 2 runs the validation boundaries and this retirement step, but **not**
historical schema-1 reward, cargo or topology migrations. Six checked-in historical fixtures plus focused save tests
cover supported eras. Every fixture is parsed repeatedly, serialized and reloaded
to verify idempotence, money, equipment, cargo, journey and completion.

## Ordered schema 3 → 4 migration

Remove the radiation-reserve track and refund its purchased stages once at the
historical prices (6,000 / 12,000 / 24,000 credits; cumulative refunds of 6,000 /
18,000 / 42,000). Preserve the recovered shield, clamp charge to 100, and never
refill a depleted reserve as part of migration. Validate historical levels and
charge limits before calculating refunds. Current saves reject the retired track.

Reconnect the two Freight circuits to their new door outputs: gallery power opens
the distant radioactive service-tunnel door; Dispatch power opens the lift shortcut
and Works exit. Already-open doors, animation progress, cell assignments, cargo
and player positions are preserved, so old expeditions cannot be stranded. New
expeditions require the long approach before opening the shortcut. Set schema 4.

## Ordered schema 4 → 5 migration

Impact shielding is now recovered equipment. New expeditions start with
`impactShieldInstalled: false` and zero charges; the nearby Breach module teaches
grappling and Haven installation. The dock cannot upgrade an uninstalled shield,
and servicing or respawning cannot grant one. Installation supplies the original
two charges and unlocks hull upgrades.

Every earlier save retains its built-in impact shield: set ownership to true,
preserve remaining charges (including zero) and hull upgrades, and suppress the
new pickup. Migration never refills charges. Current saves require explicit
boolean ownership and reject charges or hull upgrades without installation.
Set schema 5; repeated reloads leave equipment and progress unchanged.

## Ordered schema 5 → 6 migration

Move an uninstalled, never-towed blaster still in the old Freight region to the
Works main bay by discarding its historical cargo position. Already-installed
equipment, ammunition, towed modules and modules moved outside Freight remain
unchanged. Other cargo and progress are untouched. Set schema 6 so current saves
never repeat this relocation, including if the player later takes it to Freight.

## Ordered schema 6 → 7 migration

The impact-shield module now starts in the rescue locker. Relocate only an
uninstalled, never-towed module still in its old Breach spawn area. Installed
shields retain their charges, and towed modules or modules moved outside that
area keep their saved position and velocity. All other cargo and progress stay
unchanged. Set schema 7 so this relocation never repeats on current saves.

## Ordered schema 7 → 8 migration

Add an empty `rescuedPods` manifest. Keep equipment, credits, powered circuits,
installed cores and exploration. Reopen an old completed expedition for the new
rescue objective; an installed core still supplies escape power, but no survivor
or rescue credit is fabricated. Relocate only the untouched, never-towed ward
reserve from its former position into the central service lane.

Current saves require unique known pod IDs. A rescued pod cannot also exist as
loose cargo, and completion requires an installed core plus all twelve IDs.
Locked medical pods ignore saved motion until ward power releases them. Rescues
and their 1,000-credit payments commit together at recovery-shutter seal. Reload,
death, teleport, berth travel and developer jumps preserve that manifest. No
operation other than a new expedition resets it.
The reduced reward applies to future rescues; previously banked credits are retained.

## Ordered schema 8 → 9 migration

Preserve every rescued pod, credit, installed core, cargo position and berth.
Reopen automatic rescue victories for the physical departure from the Breach.
New expeditions begin in the Access Tunnel; this migration does not move the pilot.

An optional `campaign.journey.departure` identifies the final crewed flight along
the authored escape route. Validation requires all pods, core power, the Breach
berth, the exact route, and a riding pilot. Departure folds and transits but never
deploys at another berth. `complete` is set when Haven clears the outer lock.
The terminal journey retains the folded pose for the ending and reload. Optional
free exploration settles Haven back at the Breach while retaining victory.

## Ordered schema 9 → 10 migration

Move the former Breach pod to Refuge Approach, so Freight hold six is the first
survivor encounter. Delete only its never-towed saved body still in the Breach
region; the next cargo load uses its new authored position. Towed or already
rescued pods stay put, rewards are unchanged, and a completed departure remains
complete. Current saves do not repeat this relocation.

## Ordered schema 10 → 11 migration

Add the persistent boolean `campaign.havenActivated`. Existing expeditions keep
recovery; only untouched Access Tunnel starts enter the new tether lesson.
New games begin with Haven dormant. Her anchored center socket must actually
catch the tether to activate services and register the pilot; proximity, docking
attempts and weapons cannot substitute. The connection is saved immediately.
Invalid activation values or dormant Haven journeys are rejected.

The optional `campaign.havenLinkPending` flag retains the commissioning socket
after activation until the pilot disconnects. While attached, Haven's recording
stays pinned like a log-terminal message. Disconnect commits retirement immediately
and plays a 1.2-second retract-and-close animation; reload and respawn cannot
restore the socket. Reload before disconnect keeps it available for reconnecting.
Older active saves without this optional flag keep their connector retired.

The outer lock is now fully sealed until an authorized Haven departure. Old
pilots saved inside its leaves or in the exterior pocket move just inside it;
all other saved positions, progress and completed departures are preserved.

## Ordered schema 11 → 12 migration

Move the teleporter from the Works to the Broken Ring's service hub. Delete only
an uninstalled, never-towed module's saved position while it remains in the Works
region; the next cargo load uses the new authored position. Installed teleporters,
previously towed modules and modules moved outside the Works retain their progress.
All other cargo and progress stay intact. Current saves never repeat the relocation.

## Ordered schema 12 → 13 migration

Remove the retired Longline winch from both upgrade ownership and saved levels.
Refund its 750-credit purchase price once if installed, including older purchases
that migrate through the historical single-stage conversion. All ships use the
standard 130-pixel tether reach. Preserve other upgrades, cargo and progress.
Current saves reject retired winch fields and never repeat the refund.

## Ordered schema 13 → 14 migration

Move an uninstalled, never-towed teleporter still around its former Ring hub spawn
to the Foundry by discarding that saved body position. Installed teleporters,
handled modules and modules moved outside the hub retain their progress; current
saves never repeat the move. Older Works-spawn migrations now use the same latest
authored Foundry position.

The relay receiver moves from the hub into the Foundry, keeping its circuit and
door IDs. Preserve earned power, source-cell assignments, open doors, animation
progress, rescued pods and completion. No new survivor is added or rescue undone.

## What persists and resets

Before Haven activation, death resets **all** expedition state and Start again
returns to the Access Tunnel. After activation, the policies below apply:
reconstruction takes a long time in the story, allowing station bots to be
rebuilt and loose debris to drift back. No long real-time wait is imposed.
Developer jumps activate Haven explicitly; ordinary save/reload retains its state.

Blaster capacity uses the optional `upgradeLevels.magazine` track (0–5), for
three through eight shots. No migration is needed: existing saves without this
track retain their original three-shot capacity and remaining ammunition.
Magazine upgrades require an installed blaster; saves reject upgrades without
ownership or ammunition above the purchased capacity. Haven and respawn refill
that capacity, while reload preserves spent ammunition.

| State | Reload/continue | Death and respawn | New expedition | Developer jump |
|---|---|---|---|---|
| Cargo/cells | Saved positions, velocity, tethered history; invalid physical positions fall back to authored spawn | Loose positions retained; cable released | Authored spawns | Existing cargo retained, prerequisite cells consumed |
| Enemies | Defeated IDs retained; surviving enemies regain health and spawn at garages | All enemies respawn with full health | Fresh | Defeats retained; surviving enemies rebuilt |
| Asteroids/debris/projectiles | Field regenerated; effects/projectiles discarded | Regenerated at launch | Fresh | Regenerated |
| Carried/banked credits | Both retained | Carried lost; bank retained | Zero | Retained; debug grant is explicit |
| Upgrades/ammunition | Installation and remaining charges retained | Installed impact shield and blaster refilled | No recovered modules or upgrades | Existing upgrades retained, impact shield granted from Freight onward, other required equipment granted, systems restored |
| Power/doors/exploration | Retained, including opening-door progress | Retained | Unpowered/unexplored | Prior-region prerequisites added, doors settled |
| Haven | Activation, position, angle, berth, journey path/phase/speed retained | Existing journey settles at destination; recovery link retained | Dormant at Breach berth | Active at nearest unlocked service berth, journey canceled |
| Survivors | Rescued IDs and berth lights retained; no repeat payment | Safe aboard Haven | Four loose pods, eight locked in Medical | Manifest retained; medical clamps follow ward power |
| Finale | Released/moved core and completion retained; unsealed latch animation restarts | Core/world progress retained | Unreleased | Existing finale progress retained |

Docking and teleport bank carried credits. Teleport moves only the ship, not
cargo. Retrieval awards are committed when shutters seal; before that, reload
restarts recovery from the saved cargo position. New game requires confirmation
when replacing progress. These are the existing gameplay policies, not new
difficulty changes. Historical live hot-reload repair hacks have been retired;
load an old save through the migration service instead.

Follow-up gameplay change: an installed radiation shield now refills gradually
whenever exposure is zero during active flight (one full reserve per second).
Its current charge still saves normally; reload and paused/offline time do not
grant a refill. Haven servicing still restores hull shields and blaster ammo; remote recharge is removed.
