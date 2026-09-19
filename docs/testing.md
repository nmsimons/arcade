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
