# Ice: curling with a crate

Slick (`frictionless: true`) terrain is ice for every body on it: one friction coefficient
(`SLICK` in `src/games/jumping/friction.ts`) and one sliding rule (`slideOn`) for the
player's feet and for loose props alike. The physics contract is in
[jumping-physics.md](jumping-physics.md#frictionless-terrain). This note is about how a
player and a crate should feel together on it, and how that is graded.

## The experience

Moving a crate across ice should feel like curling. The player runs the crate off grippy
footing (the hack), glides out onto the ice with both hands on it, steadies it, and lets
it go so it slides on to where it was aimed. Then the player watches it run, gliding to a
stop a little behind it.

- **Delivery.** Pushing a crate from grippy footing onto ice keeps the hands on it. The
  pair carries the speed the push gave them; nothing about crossing onto the ice breaks
  the contact or jolts either body.
- **Gliding together.** With the direction still held, the player stays with the crate:
  palms on its face, body leaning into it, no gap opening and closing. Feet on ice can
  push only as hard as the ice grips them, so on the ice the pair speeds up slowly and
  never faster than a pusher on ice could manage.
- **Release.** Letting go lifts the hands without a snap. Crate and player then slow by
  the same friction, so they drift apart only as much as their speeds differ, as a
  curler and stone do.
- **Aim.** How long and how hard the player pushes decides where the crate stops, and
  the same inputs give the same result. A player can learn to stop a crate on a plate.
- **Braking and steering.** Holding against the glide brakes the player by the ice's
  friction, not instantly, and the hands come off the crate rather than pulling it.
- **No special cases.** The same contacts, friction and poses as everywhere else, with
  ice only changing how much grip there is.

## What is being judged

The goal is great slippery-surface physics and animation, for every level that uses ice. It is not
getting any one level to work. Polishing Bay is a test bed for trying ice out, not a target: problems
with its layout (where crates start, how far the plate is, what blocks the push lane) are reported as
advice to the level's author and never scored against the physics, and no change should be made
only to make that level work.

Crates tipping and rolling is ordinary crate behaviour and is wanted: a crate shoved hard on grippy
ground may tumble, and a crate sliding off ice onto grippy ground catches and tips. Neither is a
defect. Judge how the ice behaves and how the player looks on it.

## Rubric

Out of 100. Each line names what earns its points; caps follow.

| Criterion | Points | Full marks when |
| --- | --- | --- |
| Delivery | 15 | Pushing off grippy footing onto ice keeps a working push contact and both speeds carry over without a jolt. |
| Gliding together | 15 | Held on the ice, player and crate stay together with no gap opening and closing, and the pair's acceleration is limited by the feet's grip. |
| Release | 10 | Letting go lifts the hands smoothly; both then slow by the same friction and part gently. |
| Aim and repeatability | 15 | On the ice, how long and how hard the player pushes maps smoothly onto where the crate stops, and identical inputs give identical results. Scatter caused by a crate tumbling on grippy ground before it reaches the ice is not counted. |
| Braking and steering | 10 | Braking on ice is friction-limited, hands come off rather than pulling, and turning round on ice has no snap. |
| Visible contact and pose | 15 | Palms meet the crate face while pushing on ice; legs read as pushing or gliding as the input says; no pops on crossing onto the ice or releasing. |
| Smoothness | 10 | No joint jump or turn faster than the zero g rule (anticipated turns under about 200 degrees per second); no frame-to-frame snaps. |
| Generality and performance | 10 | No ice-only branches beyond the friction value; step cost unchanged; existing tests and medal routes still pass. |

Caps: a crate that cannot be delivered onto the ice with hands on it caps the total at
50. Any regression in a medal route or an existing test caps it at 70. A visible snap
(a joint moving more than 8 units in one frame without a cause) caps Visible contact at 7.

## Tools

- `node scripts/ice-lab.mjs [--only name] [--json out.json]`: scripted scenes on an ice
  rink and on Polishing Bay as committed, with contact, separation, speed, aim and
  smoothness numbers.
- `node scripts/ice-filmstrip.mjs --out <dir> --url <dev server> [--only name] [--zoom]`:
  the same scenes drawn by the model review renderer.
- The `ice-reviewer` agent (`.claude/agents/ice-reviewer.md`) runs both and grades
  against this rubric.
