# Triple Scaffold

A scaffold course based on the supplied reference: three lower towers, two
upper ladders, a shallow V walkway, and a raised crown exit. Its 16 beams and
five ladders form a mirrored playfield around x = 1,000. The current studio
version starts at the lower-left entrance, with Rbot on the raised center foot.

Walking surfaces and authored placements use the 5-unit grid. Every beam is
25 units thick perpendicular to its surface. Sloped undersides use parallel
offsets and mitered joins; calculated underside vertices can lie between grid
lines. End ropes attach at their platforms' top corners. Moving those anchors
preserved free-end heights and regenerated their rest shapes.

The ten narrow ladder slots are now continuous beams. The five ladders retain
their authored positions and lengths, pass through intermediate floors, and
finish with the shared rear-facing mantle. Sideways departure is available at
intermediate decks; Down deliberately boards through a floor. Rope hosts were
remapped while preserving their attachment points and free-end heights.

The current objective is a 14-coin exit lock. A tall room, recovery floor,
eight ropes, compact meter, and clock retain the user's studio edits. The earlier
broken-right-ladder description and original direct-to-exit route no longer
describe this version.

The shared Rbot controller now walks shallow slopes without repeated jumping,
finishes approaches beyond coarse graph samples, preserves lowering intent,
uses foreground ladder crossings, and can release a blocked rope descent.
Regression tests use a saved scaffold reproduction and ordinary player-controller
contacts. In that reproduction the hunter reaches the entrance and fires from
terrain; five navigation probes also reach the lower center, crown, upper-left
shoulder, center transfer, and a recovery destination without positional correction.
The current map's intermediate deck exit was checked from a fresh entrance with
keyboard controls in the browser, isolating the hunter for the precise foot-overlap
check.

The original 12.95-second direct-to-exit route predates the coin lock and Rbot.
The current layout completed from a fresh entrance with all 14 coins and its
authored Rbot in **225.38 seconds**, using ordinary tap/hold controls, including
several falls, return trips and recoveries. The input recording is
`tests/fixtures/jumping-triple-scaffold-completion.json`; it never places actors
or bypasses the coin switch.

Initial deadlines are **A 120 / B 180 / C 240 / D 300 seconds**. The recorded
recovery-heavy completion earns C, leaving about 75 seconds under D for additional
discovery or recovery. A is an initial fast-route target; a fluent A recording
and independent deadline balance still need an audit. The built-in medal audit
keeps this distinction explicit. Independent human review of enjoyment remains
unverified.
