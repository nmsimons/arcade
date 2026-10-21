# Scaffold course review

All twelve prototypes have completed fresh-start runs with their authored Rbot,
using ordinary tap/hold movement controls. The recordings are in
`tests/fixtures/jumping-course-playtests.json`; their replay test uses the current
level files and current NPC controller. No run places the player at a destination,
changes movement rules, or opens the exit without its coin requirement.

My strongest candidates are **Spellbound, Hatchlings, and Hellstones**.
**Blackout** is worth another design pass. I would retain **Walls** or
**Hurricane** only if a simpler, more symmetrical course is wanted. The others
add less to this group than their repetition, recovery time, or collection
detours cost. All files remain available for selection.

## Individual assessment

The times below establish completion, including attempts and recovery. They
are not optimized speed runs or a ranking of the courses' intended duration.
The route recordings were refreshed for foreground ladder crossings. The
recommendations retain the earlier design review; the clean continuous-beam
layouts have also been checked in the renderer.

| Course / save file | Verified run | Appearance and play | Recommendation |
| --- | ---: | --- | --- |
| Nothing to It / `Nothing to It.jump-level.json` | 46.00 s | Clear central spine and V-shaped silhouette. The outer loop supplies an alternative to the long ladder, but the idea overlaps Triple Scaffold and can turn into returning for missed coins. | Drop from this selection; useful as a reference course. |
| Fire! Fire! / `Fire Fire.jump-level.json` | 81.20 s | The three columns are legible, but short disconnected shelves and exposed outer climbs interrupt the run. The last collection and exit crossing needed deliberate recovery and a running jump. | Drop; too much interruption for the payoff. |
| Sreddal / `Sreddal.jump-level.json` | 43.65 s | Very readable, but repeated horizontal shelves and long outer-rope access make the journey feel similar from storey to storey. | Drop unless a deliberately simple collection exercise is needed. |
| Hellstones / `Hellstones.jump-level.json` | 43.49 s | Staggered landings and the off-center sloping bridge create distinct choices. Short climbs and jumps alternate rather than repeating one long ascent. The two blocked upper ladders have been cleared. | **Keep for the next round.** |
| Figurit's Revenge / `Figurits Revenge.jump-level.json` | 128.20 s | The lower zigzag is memorable, but the long middle bridge dominates and the upper fragments feel disconnected. An end-rope recovery works, but late collection and return cost more than the central idea earns. | Drop or rebuild around the zigzag alone. |
| Walls / `Walls.jump-level.json` | 115.08 s | Strong mirrored negative spaces and a readable pair of inner ladders. Many small islands divide the movement into similar short trips. | Reserve; reduce the number of minor islands if retained. |
| Zig-Zag / `Zig Zag.jump-level.json` | 53.67 s | The roof is attractive and the symmetry is clean. The actual journey relies heavily on straight ladders; the roof's zigzag does not organize enough of the route. The deep fall and rope return work. | Drop; stronger as a silhouette than as a complete course. |
| Spellbound / `Spellbound.jump-level.json` | 60.52 s | The suspended center and long ropes give it a clear identity. Outside ladder access and an inner rope route offer materially different approaches, with deliberate releases and recoverable transfers. | **Keep for the next round.** |
| Blackout / `Blackout.jump-level.json` | 101.63 s | The asymmetric ramps and isolated exit create a more exploratory route. It has good changes of direction, but can become a long search. One free rope anchor also needs a more convincing visual mounting if retained. | Revise; promising harder course. |
| Here There Everywhere / `Here There Everywhere.jump-level.json` | 36.62 s | The off-center ramps are readable, but the upper fragments and return journey feel less coherent than Hatchlings. The Rbot can contest the exit; a timed medium jump successfully bypassed it. Its blocked lower-ramp ladder has been cleared. | Drop in favor of Hatchlings, or reuse the final encounter. |
| Hatchlings / `Hatchlings.jump-level.json` | 56.28 s | The stepped lower run, long middle ramp, and roof form a coherent asymmetric journey. Its slope changes and side connections give it more variety than the repeated shelf courses. | **Keep for the next round.** |
| Hurricane / `Hurricane.jump-level.json` | 76.03 s | Broad decks and staggered ladder openings are exceptionally clear. They support an understandable Rbot pursuit, but the repeated storeys need a stronger twist to justify another full course. | Reserve; good foundation for a shorter chase level. |

## Shared revisions and checks

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

## Remaining review

The common visual language is clean but sparse: most distinction comes from
the silhouette, slope rhythm, and negative spaces. Adding background detail
would not rescue a repetitive movement route. The most worthwhile next work is
editing the three keeper candidates and trying them with a new human player.

The grade thresholds remain provisional. Fluent A routes and balanced deadlines
need a separate timing pass. The recordings prove completion; they do not replace an
independent human assessment of enjoyment or broad playtesting of every optional
route. The built-in medal audit states that distinction explicitly.
