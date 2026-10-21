# Triple Scaffold

A scaffold course based on the supplied reference: three lower towers, two
upper ladders, a shallow V walkway, and a raised crown exit. Its 26 beams and
five ladders form a mirrored playfield around x = 1,000. The user's lower-left
entrance and upper-right Rbot placement are preserved.

Walking surfaces and authored placements use the 5-unit grid. Every beam is
25 units thick perpendicular to its surface. Sloped undersides use parallel
offsets and mitered joins; calculated underside vertices can lie between grid
lines. End ropes attach at their platforms' top corners. Moving those anchors
preserved free-end heights and regenerated their rest shapes.

The current objective is a 14-coin exit lock. A tall room, steel recovery floor,
six ropes, compact meter, and clock retain the user's studio edits. The earlier
broken-right-ladder description and original direct-to-exit route no longer
describe this version.

The shared Rbot controller now walks shallow slopes without repeated jumping,
finishes approaches beyond coarse graph samples, preserves lowering intent,
uses ladder openings, and can release a blocked rope descent. Regression tests
use a saved scaffold reproduction and ordinary player-controller contacts.
The hunter reaches the entrance and fires from terrain. Five separate navigation
probes also reach the lower center, crown, upper-left shoulder, center transfer,
and a recovery destination without positional correction.

The original course completed with keyboard controls in 12.95 seconds before
the coin objective and Rbot edits. That is historical evidence only. Current
deadlines remain A 16, B 30, C 50, D 100 seconds; the complete edited coin route
and those medals still require calibration. This is explicit in the built-in
medal audit. Independent human review of enjoyment remains unverified.
