# September 2026 review resolution

Implementation for issues #1–#11 and tracker #12 is collected in
[PR #13](https://github.com/nmsimons/arcade/pull/13). Issues remain open until merge.
The accepted map, story, equipment balance, renderer and 60 Hz controls are retained.

| Issue | Resolution and evidence |
|---|---|
| #1 · timing | Fixed 60 Hz production session, six-tick hitch bound, time-scaled drag; identical recorded flight/towing outcomes at 30/60/120/144 Hz, paused radiation and winch regressions. |
| #2 · save loss | Distinct load outcomes, explicit activation, validated backup, unreadable-byte archive, confirmation, visible storage failures and safe exit/retry; Node and browser recovery tests. |
| #3 · migrations | Schema 2 with ordered legacy stages, six historical fixtures, one-time refunds, cargo/journey/completion round trips; [persistence matrix](save-format.md). |
| #4 · CI | Locked install on Node 24, all tests/lint/build/browser checks before deploying the same `dist`; PR cleanup preserved. Branch-protection plan limitation and required check documented in README. |
| #5 · ownership | Headless authoritative session, typed commands/events, isolated browser adapter, explicit transitions, independent HUD/save cadence; [session guide](game-session.md). |
| #6 · coverage | Seeded real-session scenarios for flight, towing, doors, banking, radiation, combat, death, teleport, reload and finale; committed production/development browser suites; [test guide](testing.md). |
| #7 · authoring | Typed IDs, shared progression/objectives/dev prerequisites/wiring, separate abstract flags, named exceptions, reference/placement validators with negative tests. Existing reachability and finale tests retained. |
| #8 · bodies | Shared effective cargo physics, validated body constructors, shared mass/capabilities and actual collision/player/bot towing tests. Small-asteroid winch inertia remains unchanged. |
| #9 · cleanup | Removed obsolete tracked controller backup/minimap, unreachable wave/quota state and identity wrapping. Menu demo maps retained and named; historical compatibility runs only during migration. Deleted files remain recoverable in Git history. |
| #10 · measurement | Six seeded browser fixtures at authored and 3× debris density, CPU/frame/allocation report, opt-in section timing, measured local radiation-outline cache improvement with exact outline regressions; [results](performance.md). |
| #11 · route loading | Seven lazy routes, accessible loading/error recovery, compatible URLs/exits/history/focus; network assertions and all-route production smoke checks; [bundle sizes](bundle-sizes.md). |
| #12 · tracker | All implementation items covered above; closing references in PR #13 close the tracker and follow-ups together on merge. |

Validation: 222 Node tests, 21 Chromium browser checks, ESLint, TypeScript and the
production build passed on Node 24.21.0. The deployment workflow also passes
`actionlint`. Performance measurements are advisory, not hardware-sensitive CI gates.

Limitations: this is automated encounter coverage, not a timed fresh-player
campaign playthrough. The performance report identifies its hardware and excludes
React layout/audio; it is not a guarantee for mobile GPUs. GitHub currently requires
a plan upgrade to enforce branch protection on this private repository; deployment
validation is enforced regardless. No repository-plan or production-merge changes
are made by this work.

## Requested follow-up: automatic radiation recharge

After the review fixes, the user requested a gameplay change: installed radiation
shielding now refills gradually whenever local radiation exposure is zero, including
while moving or behind cover, without returning to Haven. Full refill takes one
second at every reserve upgrade level. Exposure stops the refill immediately;
pause/survey and offline time do not recharge it. Current charge still saves normally.
Passengers can also refill in clear areas while Haven's services are offline.
Hull shields, blaster ammunition, recharge packs and banking rules are unchanged.
Follow-up validation: 225 Node tests, 22 browser checks, lint and production build
passed on Node 24.21.0, including frame schedules, hitches, pause/survey, saved
partial charge, capacity upgrades, cover and the visible radiation meter.
