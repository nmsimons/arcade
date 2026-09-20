# Reproducible acceptance checks

Use Node from `.nvmrc`: `npm ci`, `npm test`, `npm run lint`, `npm run build`,
`npx playwright install chromium`, `npm run test:browser`. CI installs Chromium
with OS dependencies and runs the same commands before deployment.

Node imports the same `createGameSession` used by React. `sessionReplay.mjs`
records seed and tick-indexed commands; assertion diagnostics include those
inputs, ship, mode, campaign and tether. Its pilot turns/thrusts through the real
controls. Flight scenarios never overwrite ship positions during traversal.
Saved-position fixtures define the start of an encounter; controlled scenes remove
unrelated ore but retain production collision, towing, bot, radiation and
progression systems. A separate schedule test uses the complete authored field.

Scenarios cover a grapple/receiver/door at 30/60/120/144 Hz; docking and recovery
banking across reload; physical radiation traversal; blaster combat, defeat
persistence and death/respawn; actual tether release on teleport; core towing,
Ignition Cradle completion, reload and continued exploration. Cosmetic variation
is checked against real mined-fragment outcomes. Clock tests bound hitches to
six ticks and assert no pause/survey catch-up. Existing focused mechanics and
geometry tests remain in the suite.

Playwright owns both servers and isolated browser contexts. Production tests
cover all routes, download isolation/failure recovery, saves, menus, keyboard
flight, survey/log/pause and HUD synchronization. A separate development project
exercises developer credits, map reveal and level jumps; production verifies the
developer shortcut is unavailable. Tests use public UI and browser storage,
never React internals or dependencies from another checkout. Failures retain
screenshots and traces under the ignored `test-results` directory.
CI uploads those diagnostics, including save/visibility state, for seven days.

Long recovery and departure checks pause the browser clock between actions and
advance it in 100 ms batches. This draws at 10 Hz while retaining all 60 Hz
physics steps within the six-step catch-up limit, instead of spending the test
timeout drawing thousands of intermediate frames. Short input/animation checks
still use normal frame pacing. A browser check verifies elapsed gameplay, and
unit replays compare 10 Hz with the existing 30/60/120/144 Hz schedules. No test
timeouts, assertions, or gameplay durations are relaxed. To reproduce slow-machine
conditions locally, prefix the browser command with `HV_TEST_CPU_RATE=6`.

Bot-model checks validate mesh winding, mirrored grabber poses, garage clearance,
powered/damaged states, and presentation-only rendering without physics writes.
Healthy models are limited to four functional parts and 52 vertices; damage and
exhaust attachment checks keep the simplified silhouettes intact.
Combat checks require four blaster hits or fifty completed laser contacts, verify
five seconds of effective contact at maximum focus (twenty seconds stock), and
cover fractional-damage rounding, stock-capacitor bursts and mixed-weapon finishes.
Damage checks verify accumulating breaches and increasing
spark count, frequency, reach and lifetime at 30/60/120 Hz, including paused,
powered-off and destroyed craft.
A development-only canvas comparison draws the actual ship and bot renderers at
native and enlarged scales, including powered rest, saving `bot-models.png` under `test-results` for visual
inspection. The `bot-towing` benchmark exercises the same models in live gameplay.

Controller checks sample the same standard-layout input reader and production
flight session, including turn-only stick steering, proportional RT thrust and
LT reverse, LB/RB strafing, X tether, contextual Y dock/call/teleport, right-stick
click for the recorder, dead zones, held-action safety,
keyboard overlap, 30/60/120/144 Hz simulation, and neutral
input after screen/focus/device changes. Browser tests inject a virtual Gamepad
through `navigator.getGamepads` and exercise launch, flight, weapons, tether,
docking, menu navigation, map/log, disconnect/reconnect and save confirmations.
Menu acceptance checks cover the arcade selector, focus styling after mouse
input, restoring selection after sub-dialogs, safe confirmation defaults,
disabled purchases, visual grid columns, topmost-dialog routing, small-screen
scrolling and map selection versus panning. Keyboard checks cover Tab/Shift+Tab
reading order versus arrow-key grid navigation, Home/End, Page Up/Down, modal
focus containment, held keys across screens, upgrade focus after purchases,
failed-save cancellation, completion and nested-shortcut isolation. Responsive
checks exercise 360×640, 620×360 and 1280×800 layouts. Successful menu screenshots are
written under `test-results` for visual inspection. A custom-layout unit fixture
checks that alternate button and turn-axis assignments use the same reader.
The browser clock controls button holds and frame polling deterministically.
Hint checks cover live connect/disconnect, unsupported-pad fallback, selection
preservation, HUD/map/tutorial labels, and keyboard use while a pad is connected.
These checks do not replace testing real USB/Bluetooth hardware: verify stick
feel, layout detection and audio activation on the target controller/browser.

## Survival-pod evacuation

`survivalPods.test.mjs` checks the twelve-pod manifest, eight locked ward pods,
four matching empty cradles, physical extraction paths, seal-time rescue and
payment, interrupted recovery, reload/death/travel persistence, moving panel
markers, real-command pod towing, both prerequisite orders and docked recovery. Cargo rendering and live
laser tests include every pod. Schema-eight migration preserves old earnings
and installed escape power while reopening the rescue objective.
`departure.test.mjs` checks the Access Tunnel spawn, the sealed outer lock,
launch-only clearance, every missing pod, missing power, wrong berth, an undocked pilot,
physical flight, interrupted-departure reloads and schema-nine migration.
Browser checks cover bank/manifest persistence without counters, ungrappled
fly-bys, the final docked rescue, disabled departures, keyboard/controller launch,
and the Access Tunnel. `havenActivation.test.mjs` checks the anchored socket,
actual hook flight, immediate persistence, dormant services, both death policies,
bot/debris restoration, schema-eleven migration and developer staging. Browser
checks exercise keyboard/controller activation and restart, recovery copy and reload.
They also cover the persistent first conversation and deliberate tether release;
the center-link model study checks its retracting hatch and fully hidden endpoint.
The development model study renders native/enlarged pods,
twelve numbered medical cradles and Haven’s lamps throughout folding.
The pod-animation study checks glass and cross pixels over four minutes of
rocking at minimum zoom, native size and enlarged scale. Unit coverage also
checks visible surface ordering and the one-time relocation of the old Breach
pod, preserving towed cargo, completed rescues, rewards and finished departures.

Flight training has headless coverage for its restricted loadout, square geometry,
real laser fragmentation, tether control, all three circular hopper openings,
simultaneous processing by both hoppers, visible mining shots before impact,
one-time credit awards, cell rejection by hoppers, shared moving-door collision,
receiver/door/log interaction, room-only recording text, automatic death reset,
pause and rejection of expedition-only commands. No persistence events are emitted.
Dispenser tests cover a red-free starting range, real white-rock cuts exposing red
fragments, replacement feed, physical chute clearance, ship/cargo interlocks during
charging, cooldown/capacity limits and pause/death/restart resets.
Browser tests exercise keyboard/controller entry, reset, recorder, leave, live
floor bindings, disconnect safety, and byte-for-byte preservation of both valid
and unreadable expedition saves. The development study renders mining, hoppers
and power practice at flight scale, including active hopper lasers and the powered
receiver/open door. It also guards against outside-world references in floor text.
It verifies all four induction exercises remain labeled and captures the dispenser
charging, launching and clearing its outlet through the real session/renderer.
Terminal tests cover powered-memory gating,
explicit connection, replay, saved downloads and the absence of unsolicited help.
Campaign presentation tests cap story length and density, exclude walkthrough
copy, preserve retired recording IDs across save loads, and check Haven's floor
stencil timing and relocation. Terminal physics tests retain line-of-sight and
power gating checks. Browser coverage checks live keyboard/controller floor
bindings, socket retraction before Dock appears, tap-to-dock on small screens,
the absence of floating prompts/status toasts, and hidden retired downloads.
Recorder rendering tests compare all eight models pixel-for-pixel in unread,
downloaded and connected states at three scales, with a visual contact sheet.
Log models, Haven's tether link and tethered information cards must not repeat
keyboard/controller training hints; docking and training floor bindings remain.
Wayfinding tests cover one sign per region, arrow direction toward the entry
gate, and the complete printed footprint inside walkable floor with doors closed.
Browser studies render every approach with closed/open gates and powered wiring
at desktop and narrow flight scales, preserving the original anchorage treatment.
They also reject small room-name labels on the floor while preserving explored
room labels on the local survey, region names on the overview, and HUD location text.
