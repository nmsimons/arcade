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
LT reverse, RB tether, face-button weapons/teleport, dead zones, held-action safety,
keyboard overlap, 30/60/120/144 Hz simulation, and neutral
input after screen/focus/device changes. Browser tests inject a virtual Gamepad
through `navigator.getGamepads` and exercise launch, flight, weapons, tether,
docking, menu navigation, map/log, disconnect/reconnect and save confirmations.
Menu acceptance checks cover the arcade selector, focus styling after mouse
input, restoring selection after sub-dialogs, safe confirmation defaults,
disabled purchases, visual grid columns, topmost-dialog routing, small-screen
scrolling and map selection versus panning. Successful menu screenshots are
written under `test-results` for visual inspection. A custom-layout unit fixture
checks that alternate button and turn-axis assignments use the same reader.
The browser clock controls button holds and frame polling deterministically.
These checks do not replace testing real USB/Bluetooth hardware: verify stick
feel, layout detection and audio activation on the target controller/browser.
