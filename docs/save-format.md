# Save compatibility and reset policy

The browser slot remains `hard-vacuum-expedition-v1` so existing installations are
found. Its **payload schema is now version 2**. Campaign version 1 and finale
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

Version 2 runs the validation boundaries but **not** historical reward, cargo or
topology migrations. Six checked-in historical fixtures plus focused save tests
cover supported eras. Every fixture is parsed repeatedly, serialized and reloaded
to verify idempotence, money, equipment, cargo, journey and completion.

## What persists and resets

| State | Reload/continue | Death and respawn | New expedition | Developer jump |
|---|---|---|---|---|
| Cargo/cells | Saved positions, velocity, tethered history; invalid physical positions fall back to authored spawn | Loose positions retained; cable released | Authored spawns | Existing cargo retained, prerequisite cells consumed |
| Enemies | Defeated IDs retained; surviving enemies regain health and spawn at garages | All enemies respawn with full health | Fresh | Defeats retained; surviving enemies rebuilt |
| Asteroids/debris/projectiles | Field regenerated; effects/projectiles discarded | Regenerated at launch | Fresh | Regenerated |
| Carried/banked credits | Both retained | Carried lost; bank retained | Zero | Retained; debug grant is explicit |
| Upgrades/ammunition | Installation and remaining charges retained | Installed blaster refilled | No purchases | Existing upgrades retained, required equipment granted, systems restored |
| Recharge | Packs and remaining active recharge retained | Packs retained, active consumed recharge canceled | Empty | Active recharge canceled, systems restored |
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
grant a refill. Haven servicing and remote hull/blaster recharge are unchanged.
