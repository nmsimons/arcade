# Save compatibility and reset policy

The browser slot remains `hard-vacuum-expedition-v1` so existing installations are
found. Its **payload schema is now version 7**. Campaign version 1 and finale
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

## What persists and resets

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
| Haven | Position, angle, berth, journey path/phase/speed retained | Existing journey settles at destination | Breach berth | Nearest unlocked service berth, journey canceled |
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
