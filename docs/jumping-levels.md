# Jumping level handoff

Use **Level builder → Library** to copy a lesson or start a blank trial. Build,
playtest, then choose **Export**. The resulting `.jump-level.json` is the complete
source for the level; screenshots and descriptions are optional context.

To add a handed-off level to the game:

1. Read the JSON with `parseLevel` from `src/games/jumping/level.ts`. Check
   `isPuzzleLevel` and `levelProblems` before integration.
2. Store the approved data in `src/games/jumping/levels.ts` (or import a checked-in
   JSON file there), give it a stable, unique `id`, and append it to `CAMPAIGN` in
   the intended order. Keep that ID stable so personal bests remain attached.
3. Verify the intended route from spawn with normal inputs, pit recovery, medal
   thresholds, and any linked mechanisms. The shared renderer and `createRun`
   consume this data directly; no per-level code should be needed.

The version 1 file contains `id`, `name`, `description`, `width`, `height`,
`spawn`, `platforms`, `checkpoints`, and `climbables` (ladders and ropes). A timed
trial also includes `floor`, `flag`, `times`, `props`, `robots`, `mechanisms`, and
`triggers`. Empty arrays are explicit. Old playground files without trial fields
remain readable.

Coordinates use positive X to the right and positive Y downward. Player starts,
flags, props, and pushers use a **feet/bottom** Y coordinate. Platforms and
mechanisms use their **top-left** corner. Props use center X and a square `size`;
balls use half that size as their radius. Ropes use anchor X/Y and `length`.
Ladders reference their supporting platform's index and side.

- `floor` is a continuous structural floor across the map. It and the side walls
  are generated automatically; don't duplicate them in `platforms`.
- Medal `times` are increasing positive seconds: `gold < silver < bronze`.
- Props are `box` or `ball`; pushers have `x`, `y`, `left`, and `right` patrol
  limits and use the shared aggressive behavior.
- Each mechanism has a unique `id`, `kind` (`lift` or `gate`), `x`, `y`, `w`, `h`,
  and upward `travel`. A lift cycles between its lower position and `y - travel`;
  a gate retracts to `y - travel` and stays open.
- Triggers have `x`, `y`, `w`, a mechanism `target` ID, and `mode` (`weight` for
  crates/balls, `touch` to include the player). Activation latches until restart.
  Multiple independent mechanisms and plates are supported.

Editor exports preserve all of these fields and their connections. Importing in
Level studio creates a fresh level ID but preserves mechanism IDs and links
inside that map. Structural validation rejects malformed and unbounded data;
editor validation additionally flags missing supports and connections. Neither
replaces actually playing the route.
