# Scaffold course review

## Selection and reworks — October 21, 2026

Later Studio edits narrowed Walls' center landing, changed its coin requirement,
and revised Hellstones, Spellbound, and Blackout. Their old completion
traces are retained as superseded evidence, with explicit pending audits. Current
completions remain verified for Hatchlings, Here There Everywhere, and Hurricane,
including the latter two courses' recorded alternatives and the quarantine test.
The earlier times and route descriptions below describe the reviewed layouts;
they do not certify those four edited layouts. The revised Spelunk exit wiring
also awaits a new completion and timing audit.

The selection is implemented. Spellbound, Hatchlings, Hellstones, Blackout, and
Triple Scaffold retain their layouts. Nothing to It, Fire! Fire!, Sreddal, and
Zig-Zag were deleted from the built-in collection and removed from its catalog,
route recordings, and audit inventory. The remaining prototypes were shortened
around the useful sections identified below. Subsequent Studio edits removed
Figurit's Revenge and Cross Purposes and added Company; the Figurit's Revenge
account below records the earlier rework, not a currently available course.
Company and the revised Spire II await fresh completion and timing audits.
Uninvited Company's existing route now completes at B with the stronger Rbot;
its completed route remains covered while the A audit is pending.

| Reworked course | Central idea and routes | Completed routes | A / B / C / D deadlines |
| --- | --- | --- | --- |
| Walls | Start directly on the five crown islands and make four short hops. A nearby lower walk, a recovery coin, and three rejoining ladders replace the long opening ascent and collection descent. Four of six coins open the exit; the direct line collects five. No Rbot competes with the precision exercise. | Direct 2.88 s; deliberate fall and middle rejoin 6.58 s. | 6 / 12 / 22 / 40 s |
| Here There Everywhere | Two long running jumps lead to a lower arrival ramp and a far-side exit. The upper line preserves momentum. A lower service walk and ladders offer slower ordinary access or recovery at each landing. No coin gate or Rbot interrupts the jumping. | Direct 4.22 s; lower ladder route 11.55 s. | 6 / 12 / 22 / 40 s |
| Figurit's Revenge | Keep the rolling lower beam, add a short flat final takeoff, and finish across a gap. Three upper islands offer alternate coins and a more exposed encounter with the hunter. Three of seven coins suffice, so either lower crests or upper landings can open the exit. The old long bridge and distant upper tier are gone. | Lower line 3.63 s; upper-coin route, vaulting the bot and recovering from a hit, 8.88 s. | 8 / 16 / 28 / 50 s |
| Hurricane | A two-bay quarantine room replaces repeated storeys. Cover breaks the first firing line. Climb the west deck and jump across, or take the lower service route and east ladder. The main ladders connect through the service floor, so recovery can continue directly to the upper decks. The lower passage has headroom for jumping around the hunter. The arrival toggle opens the exit and raises a red field; a hunter lured west stays behind it. The player can reopen the field if it closed with the hunter on the wrong side. | Roof route and seal 7.57 s; lower service route 15.43 s; contested east ascent followed by retreat and the west roof route 33.21 s. | 12 / 22 / 35 / 60 s |

These are intentionally brief movement courses and an introductory trap, rather
than four smaller copies of Triple Scaffold. The five retained larger courses
provide the longer journeys. Recovery walks have short ladders instead of the
former deep-floor rope return.

Fresh normal-input recordings for the seven surviving prototypes, plus four
alternate/recovery completions, are in
`tests/fixtures/jumping-course-playtests.json`. The reworked main routes earn A.
The fixture also records a ten-second quarantine observation with a live hunter;
the regression checks that it stays on the other side and that stepping off and
back onto the control can reopen and reclose the field. The bot traversal check
now observes pursuit after an opening shot as well, since a compact room can
offer a firing line before the hunter needs to change elevation.

Live browser keyboard checks also completed Walls in 28.70 seconds at D and
Here There Everywhere in 11.25 seconds at B, including missed jumps and recovery.
Live pursuit in Hurricane exposed the interrupted basement ladders and low
passage clearance. Those were revised, then its main, service, and contested
recovery routes were completed again with normal inputs in the rendered engine.
The shorter simulation completions above exclude inspection pauses and establish
fluent routes, not blind human first-run balance. Independent human timing and
every possible optional coin combination remain unverified; the audit inventory
keeps that distinction explicit.

## Pre-rework fresh play review — October 21, 2026

This was the basis for the selection and reworks above. Its descriptions and
times concern the former layouts, including the four files since deleted.
It superseded the earlier selection advice. I played all twelve scaffold
prototypes and Triple Scaffold again with the current foreground ladders. All
thirteen have a fresh-start completion with their authored Rbot active. No maps,
coin requirements, grade times, or game code changed for this review.

**Keep Spellbound, Hatchlings, Hellstones, Blackout, and Triple Scaffold.**
Blackout deserves promotion from the earlier “revise” verdict. Walls, Here There
Everywhere, and Figurit's Revenge have enjoyable sections worth rebuilding
around. Hurricane is a reserve for a shorter introductory chase. Retire the
complete layouts of Nothing to It, Fire! Fire!, Sreddal, and Zig-Zag from this
selection. Keeping their files as references is different from adding them to
the campaign.

### Method and limits

I began with live browser play in Spellbound, then used a pauseable session
running the game's actual simulation and canvas renderer. I chose routes,
inspected the resulting play, and submitted normal movement, jump, climb,
descent, and release inputs. There were no position changes, disabled bots,
altered physics, or bypassed coin gates. I tried alternatives after failed
approaches and replayed parts of this session's learned routes when retrying.
I did not use the old committed completion recordings to choose or execute
these routes.

The times below are the level clock at the end of each successful fresh run.
They include mistakes and recovery within that run, but exclude pauses to
inspect and deliberate. They are **not blind human first-run times, deadline
recommendations, or a ranking of fun**. Scratch traces and rendered snapshots
are in the ignored `.local/review-20261021/` directory; they are review evidence,
not new regression fixtures. Alternatives and recovery were sampled, not every
optional branch exhaustively tested.

### Individual assessment

| Course / save file | Fresh completion | Verdict | What the play established |
| --- | ---: | --- | --- |
| Spellbound / `Spellbound.jump-level.json` | 31.4 s; 9/9 required coins | **Keep** | The ropes and suspended center offer genuinely different approaches. A repulsor hit changed my route into a central rope recovery, from which I could improvise a return instead of repeating the same ascent. Ladder, rope, jump, and release movements each contribute something. |
| Hatchlings / `Hatchlings.jump-level.json` | 43.7 s; 10/10 | **Keep** | The lower gap, rising middle ramp, and connected roof form one asymmetric journey toward the far-side exit. I could omit upper branches and still finish, so the coin threshold supports a real route decision. Its sections feel connected rather than like shelves to visit. |
| Hellstones / `Hellstones.jump-level.json` | 36.8 s; 11/11 | **Keep** | Staggered landings, short climbs, changes of jump direction, and the sloping center repeatedly change the movement. When the bot contested my left approach, switching to the right ladder gave me a useful alternative. |
| Blackout / `Blackout.jump-level.json` | 22.5 s; 10/10 | **Keep; upgrade the earlier verdict** | Its central route is excellent: leave a ladder into a ledge jump, reverse onto the sloping middle, then make short hops under cover before crossing to the isolated roof and exit. Unequal heights reward reading the geometry. The exposed outer climb is a different, riskier approach, not the whole experience. |
| Triple Scaffold / `Triple Scaffold.jump-level.json` | 84.0 s; all 14 coins | **Keep as the large mastery course** | Traversing connected bays, crossing the roofs, returning at another height, and finally reaching the raised central exit give it an arc. I jumped over the hunter on the roof and later took the left return because it approached from the right. Those decisions justify the size. Requiring every coin still produces cleanup worth trimming. |
| Walls / `Walls.jump-level.json` | 49.9 s; 12/12 | **Rework around the crown jumps** | The short-hop chain across the top islands has a satisfying landing rhythm. It is much stronger than the opening long climb and subsequent tier-by-tier descent and collection. Preserve that sequence as the main event of a smaller course. |
| Here There Everywhere / `Here There Everywhere.jump-level.json` | 31.2 s; 9/9 | **Rework around the running jumps** | The two long roof jumps and lower gap sequence are fun. An overrun was recoverable without restarting the whole course. The long perimeter ascent and unrelated fragments dilute those sequences; Hatchlings is the more coherent complete journey. |
| Figurit's Revenge / `Figurits Revenge.jump-level.json` | 43.1 s; 11 coins, 10 required | **Rework around the lower zigzag** | Dependable ladder access improves it substantially. The lower zigzag has memorable slope rhythm and a good running return. The long flat middle bridge and upper fragments contribute less. A useful level idea is buried under additional traversal. |
| Hurricane / `Hurricane.jump-level.json` | 38.3 s; 12 coins, 11 required | **Reserve; shorten into a clear chase** | Jumping onto ladders while moving made the pursuit much better than climbing from every ladder bottom. The broad floors are legible and the crown gaps add a real jump. Repeated deck, ladder, and coin laps still dominate. Keep only if a simpler introductory Rbot chase has a specific campaign role. |
| Nothing to It / `Nothing to It.jump-level.json` | 50.7 s; 10/10 | **Retire this full layout** | The central climb occupied about eleven uninterrupted seconds and collected only two coins. Outer excursions largely repeat climb, traverse, collect, and return. It overlaps Triple Scaffold without that course's stronger ending and route decisions. |
| Fire! Fire! / `Fire Fire.jump-level.json` | 62.2 s; 11/11 | **Retire this full layout** | My central ascent took about twelve seconds before the first coin. Some short-jump distances are worthwhile, but disconnected shelves and collection excursions interrupt the flow. It feels like servicing several columns rather than moving through one developing idea. |
| Sreddal / `Sreddal.jump-level.json` | 42.2 s; 10/10 | **Retire; most repetitive** | Climb the side rope, board another similar shelf, and repeat dominates the route. The top crossing provides a change, but arrives after too many similar storeys. The new ladder mechanic improves only a small part of the map. |
| Zig-Zag / `Zig Zag.jump-level.json` | 31.4 s; 10/10 | **Retire this full layout** | A viable route is a long outer climb, mostly continuous roof walk, and opposite descent. It bypassed all four lower interior-island coins. The silhouette promises more zigzag movement than the route asks for. Quick completion does not make it distinct enough for another campaign slot. |

### What the new ladders reveal

The change removes accidental friction: routes can pass through a structure
instead of repeatedly routing around ladder slots. That improves the good maps
substantially. It also exposes repetition. An uninterrupted ten-second ascent
is now plainly a long ascent, rather than several awkward interactions that
merely kept the player busy.

The keepers change the decision as the player moves: rope transfers and
improvised recovery in Spellbound; a connected journey in Hatchlings;
alternating approaches in Hellstones; jump heights and cover in Blackout; and
revisiting space under different pressure in Triple Scaffold. The weaker maps
repeatedly ask “which corner coin next?” Symmetry, extra storeys, and an Rbot
do not by themselves turn that into a new question. I would not retain the
four retired layouts simply to raise the campaign's level count.

### Revisions worth making later

- **Protect route choice.** Partial coin requirements let me abandon a contested
  branch and still finish. Triple Scaffold's all-fourteen requirement sometimes
  turns the return into cleanup; several isolated coins require a small jump
  simply to collect them. Preserve its final ascent while reducing errands.
- **Make recovery another route.** Nearby ropes and ledges sometimes let a hit
  feed into a new approach. The deep common floor can instead create a long
  return climb that the hunter contests again. Improve return connections,
  cover, or placement where needed; the bot being dangerous is part of the point.
- **Use the hunter spatially.** Blackout's cover and Triple Scaffold's ability
  to switch sides made the bot affect a decision. Exposing another long ladder
  to another repulsor shot adds less. These are not thirteen distinct Rbot
  puzzles merely because each map contains one.
- **Focus the useful fragments.** Walls supplies short-hop precision, Here
  There Everywhere supplies running gap jumps, and Figurit's Revenge supplies
  slope rhythm. Each would gain more from removing unrelated sections than
  from adding another mechanism to its present full layout.
- **Space the survivors through the campaign.** Even the five keepers share
  scaffold vocabulary. Treat them as selected movement courses and one large
  test, separated by levels with other central ideas, not five consecutive
  chapters.

The art remains readable but sparse. These judgments concern movement,
readability, routes, recovery, and pursuit. Names and background decoration
would not rescue the repetitive routes. Campaign placement and human first-run
timing remain separate work. No grade deadlines were changed.

## Previously established revisions and checks

The following implementation and regression checks are retained from the
earlier review as context. They were not rerun for this design-only review.
The earlier completion recordings remain in
`tests/fixtures/jumping-course-playtests.json`; the fresh traces do not replace
them or imply they were regenerated.

- Walking surfaces and authored placements use a 5-unit grid. All 135 beams are
  25 units thick perpendicular to their surfaces, including slopes and joins.
  Calculated underside vertices are allowed between grid lines.
- Each room has 650 units below the lowest beam and a continuous nonlethal floor.
  Fresh-start fall-and-return checks succeeded on all twelve courses. The basic
  recovery recording takes approximately 14.17 seconds, so a fall has a real cost.
- Every end-mounted rope now meets its host's top corner, with the free-end
  height preserved. Rest shapes were regenerated. The corner audit covers 36
  end ropes in this collection, plus the relevant Triple Scaffold ropes.
- Foreground ladders now pass through continuous walkways. The narrow ladder
  slots have been joined into single beams, with parallel undersides and mitered
  slope joins. Nothing to It's manually closed crossings were preserved.
  Hellstones' two upper end decks and Here There Everywhere's shortened lower
  ramp now extend across their ladders. The 52 authored ladders retain their
  positions and lengths; ordinary jumps, wide gaps and recovery ropes remain.
- Intermediate floors allow a deliberate sideways exit, including settling
  feet up to 18 units out of a terrain lip when the standing body fits above it.
  Continuing Up stays attached through intervening floors. The upper landing
  retains the rear-facing mantle. Down boards through a solid floor.
- Each course has one Rbot. A normal-controller test requires it to travel more
  than 250 units, descend at least one storey, and fire from physical footing
  within 60 simulated seconds. All twelve pass. This proves these pursuit routes,
  rather than every possible chase through every branch.
- Shared navigation fixes cover shallow crests, final waypoint approaches,
  deliberate lowering, ladder crossings, unwanted thin-beam catches,
  blocked rope descents, and stepping off the player's head at the room center.
  A patrol investigating the entrance must finish leaving its ladder and
  approach the actual doorway before considering that floor checked.
- Coin meters now require roughly two thirds of the available coins. This
  creates route choice and avoids making every last corner compulsory. The
  remaining coins supply alternatives rather than a cleanup requirement.
- Save files use the individual course names. The index, audit entries, and
  recorded routes use those names too.
