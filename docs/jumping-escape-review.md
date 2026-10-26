# The final cave sequence

October 26, 2026. The closing order is Ascent I, Ascent II, Spelunk I, Spelunk II,
Spelunk III. The collection includes the author's current Ascent I and Spelunk Ib
revisions. Spelunk Ib retains Spelunk I's campaign ID and places daylight above
its editable cave back wall.

Spelunk II is an abandoned survey gallery. Send its ballast down the chute into
a bounded receiver, then board the lift. The receiver continues loading its
plate after departure, while a mounted plate starts the lift only when boarded.
The upper ledges and manual release provide an alternative that leaves the
ballast untouched. The continuous lower gallery and return ladders recover
missed jumps and allow another approach to the receiver.

Spelunk III begins deep below the surface and reverses Spelunk I's journey.
Irregular rock footholds and surviving maintenance ladders lead upward. A
latching switch on the last service shelf opens the nearby exterior gate.
The cave roof ends at a real sill, then soil, sage cover, shallow water, a worn
footbridge and weathered rock lead to an overlook. Walking remains available
across the whole exterior; the rock-to-rock jump skips the dip across the bridge.
The robot stays at its ordinary gameplay scale. There are no required coins,
cargo deliveries or time limits in III. Hold Up at the small viewpoint marker
to finish, or linger and turn back first.

The final level is wholly untimed. This deliberately avoids introducing a timed
approach/coda split before that separate scoring feature exists. It records
completion at the overlook and retains the panorama. Static outdoor footing
and latching Switch state resume after reload; Restart returns to the cave.

## Recorded route evidence

`tests/fixtures/jumping-escape-runs.json` captures the reviewed layouts and
ordinary tap/hold control traces, including the entrance and actual finish.
`tests/jumping-outdoors.test.mjs` replays those snapshots independently of later
Studio changes and also checks the two current shipped layouts.

| Level and route | Entrance-to-finish duration | Scored time |
| --- | ---: | ---: |
| II: ballast, boarding plate and lift | 17.31 s | 15.11 s (B) |
| II: upper ledges and manual release | 8.79 s | 6.59 s (A) |
| III: maintenance ladders, running exterior | 27.57 s | Untimed |
| III: natural rock alternative | 27.59 s | Untimed |
| III: optional outdoor rock jump | 27.07 s | Untimed |
| III: descend back into the cave, then recover | 40.28 s | Untimed |
| III: walk the exterior | 50.22 s | Untimed |
| III: miss the first jump, recover by the lower ladder | 32.00 s | Untimed |

The walking exterior itself takes 33.27 seconds from the surface ladder to the
overlook. The running exterior takes 10.61 seconds. The cave's rock alternative
is another solution rather than an established time saving. II's A/B/C/D
deadlines are 10/22/45/100 seconds: A rewards the upper route, B accommodates
the dependable machinery route, and C/D leave time for learning and recovery.
The upper A route is also registered in the built-in medal recordings.

## Review boundaries

File validation and normal-input completion do not establish enjoyment.
Browser regressions cover mixed cave/daylight composition in Canvas and GPU,
Studio undo/save/reopen, the editor grid, explicit finish, checkpoint reload,
and the ending's retained view. A fresh normal-speed keyboard browser run climbs
Spelunk III's cave, uses the recovery ladder when needed, crosses the exterior
and explicitly finishes at the overlook. Spelunk I supplies the browser fixture
for direct back-wall point dragging, insertion/deletion, keyboard nudging,
Undo/Redo, and save/reopen; its terrain and climbables are checked unchanged.
Sky is compared to unlit artwork under an
overhead blocker; cave brightness and exterior terrain exposure are checked
separately. Existing indoor files retain their original defaults.

The October 26 in-game art review simplified outdoors to flat blue sky and
sparse clouds. Caverns retain the standard course back wall. Terrain lighting
follows exposed surfaces around the cave mouth; a sunlit roof does not give
the deep wall a daylight baseline. The robot retains its normal material palette.

A headless software-Canvas check before the frame-lighting refinement, at
1280 × 800, retained 36,864,000 buffer
bytes around the mouth (below 64 MiB). Twelve-frame render medians were about
205 ms inside, 288 ms at the threshold and 281 ms just outside, against 205 ms
for the same outside camera with the environment disabled. This software path
shows remaining composition cost; it does not establish hardware frame rate.

The frame-lighting regression covers Canvas and GPU at integral and fractional
overview scales: the enclosing terrain mirrors environmental exposure while
retaining its own material. The scene is not copied into the border. The
small ambient field is resolved at the room boundary to prevent a glowing
rectangle; its retained buffers are included in the 64 MiB accounting.

Independent normal-speed first-run review, physical-controller/phone feel,
the emotional effect of the entire campaign, and a full fresh-save traversal
through every earlier level remain unverified. No new ambient audio is supplied.
The repository already had unrelated catalog/audit differences for the locally
added hsj/hsj2 and removed Walls/Here There Everywhere files when this work began;
the final-level route evidence does not certify those edits.
