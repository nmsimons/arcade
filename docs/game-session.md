# Hard Vacuum session

`createGameSession` is the production simulation, with no runtime React, Canvas,
Web Audio, or browser storage dependency. It owns the expedition, mutable world,
input, timers and transitions. The React adapter sends `GameCommand`s, displays
detached snapshots, drains typed audio/notification/UI/persistence events, and
renders the existing Canvas renderer. Mutable cells are an adapter to existing
mechanic APIs, not React refs or duplicate owners. Shields alias expedition state.

## Time and ordering

Every simulation tick is 1/60 second. Render timestamps feed `SimulationClock`;
it admits at most 100 ms (six ticks) per frame and records discarded time. Pausing,
survey/developer suspension, and mode transitions reset the clock accumulator.
Hidden time is never applied on resume. There is no radiation catch-up.

The retained update order is Haven recovery/journey and docking, death animation,
world effects, weapons/red chains, ship controls, tether, collision/bot/radiation
damage, base processing, projectiles, progression/cargo and final snapshots.
Presentation attitude, sparks and drawing remain independently scheduled.
Forward/lateral friction and deployed grapple drag use their 60 Hz reference
values; rope constraints run only on fixed ticks. Nose thrust remains 25%.

HUD requests occur every 150 ms. Periodic save requests occur every three seconds;
explicit transitions/actions may request a save. Combat notifications do not
force a synchronous save. The adapter coalesces requests per rendered frame.

## Transitions

- Start/reload rebuild runtime bodies and enemies from persisted state, clear
  input/weapons/tether, reset RNG, and launch (or show the completed expedition).
- Pause/resume and survey/developer suspension clear held input and reset timing.
- Docking interpolates into Haven; resume from dock starts the exit animation.
- Death snapshots cargo, applies the existing crash policy and enters dying,
  then game-over. A new launch respawns the runtime at the saved checkpoint.
- Teleport releases the tether, clears weapon/input/radiation feedback, preserves
  loose cargo and moves only the ship under the existing banking rules.
- Developer jumps use the same launch reset after applying progression helpers.
- The menu owns a separate demonstration scene and never advances campaign state.

Gameplay randomness uses a resettable seeded stream. Cosmetic meshes, debris and
sparks use a separate source. `tests/gameSession.test.mjs` exercises the actual
production path at 30/60/120/144 Hz, with identical gameplay state at equal ticks,
and checks hitches, suspension, snapshots, audio isolation and publication cadence.
